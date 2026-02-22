"""
Orquestador de búsqueda completa de piezas.

Flujo:
  Fase 1: Buscar OEM equivalentes (tarostrade + distri-auto)
  Fase 2 (paralelo):
    - Buscar en stock propio     (BD de la empresa del usuario)
    - Buscar en stock de otros   (excl. admin)
    - Buscar piezas nuevas IAM   (para TODAS las refs: original + equiv)
    - Buscar en desguaces        (delfincar, logroño, valdizarbe, azor…)

Cada paso de Fase 2 recibe todas las refs (original + equivalentes).
"""

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional
from dataclasses import dataclass, field

from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from app.models.busqueda import BaseDesguace, PiezaDesguace, PiezaVendida, EntornoTrabajo
from app.services.oem_equivalentes import buscar_oem_equivalentes
from app.services.desguaces import DesguaceFactory
from app.scrapers.referencias import obtener_items_iam_por_proveedor

logger = logging.getLogger(__name__)

# Entornos que NUNCA se incluyen en búsqueda cruzada
ENTORNOS_EXCLUIDOS = {"entornoadmin", "admin"}


@dataclass
class ResultadoBusquedaCompleta:
    """Resultado unificado de la búsqueda completa."""
    referencia_original: str
    oem_equivalentes: List[str] = field(default_factory=list)
    stock_propio: List[Dict] = field(default_factory=list)
    stock_otros_entornos: List[Dict] = field(default_factory=list)
    piezas_nuevas_iam: List[Dict] = field(default_factory=list)
    resultados_desguaces: List[Dict] = field(default_factory=list)
    errores: Dict[str, str] = field(default_factory=dict)
    # Resumen
    total_stock: int = 0
    total_otros_entornos: int = 0
    total_desguaces: int = 0
    total_oem: int = 0
    total_iam: int = 0


def _refs_lower_set(referencias: List[str]) -> set:
    """Genera set de refs en minúsculas para comparaciones exactas."""
    return {r.lower().strip() for r in referencias if r}


def _es_coincidencia_exacta(campo: Optional[str], refs_set: set) -> bool:
    """Verifica si campo coincide EXACTAMENTE con alguna ref del set."""
    if not campo:
        return False
    return campo.lower().strip() in refs_set


def _buscar_stock_propio(
    db: Session,
    entorno_trabajo_id: int,
    referencias: List[str],
) -> List[Dict]:
    """Busca piezas en el inventario propio para todas las referencias."""
    base = db.query(BaseDesguace).filter(
        BaseDesguace.entorno_trabajo_id == entorno_trabajo_id
    ).first()
    if not base:
        return []

    refs_set = _refs_lower_set(referencias)
    if not refs_set:
        return []

    # Coincidencia EXACTA en oem, oe, iam o refid
    filtros = [
        func.lower(PiezaDesguace.oem).in_(refs_set),
        func.lower(PiezaDesguace.oe).in_(refs_set),
        func.lower(PiezaDesguace.iam).in_(refs_set),
        func.lower(PiezaDesguace.refid).in_(refs_set),
    ]

    piezas = db.query(PiezaDesguace).filter(
        PiezaDesguace.base_desguace_id == base.id,
        or_(*filtros)
    ).limit(50).all()

    resultados = []
    ids_vistos: set = set()
    for p in piezas:
        if p.id in ids_vistos:
            continue
        ids_vistos.add(p.id)
        resultados.append({
            "id": p.id,
            "refid": p.refid,
            "oem": p.oem,
            "articulo": p.articulo,
            "marca": p.marca,
            "modelo": p.modelo,
            "precio": float(p.precio) if p.precio else None,
            "precio_texto": f"{p.precio} €" if p.precio else "",
            "ubicacion": p.ubicacion,
            "imagen": p.imagen or "",
            "fuente": "motocoche",
            "fuente_nombre": "Tu Stock",
        })
    return resultados


def _buscar_vendidas(
    db: Session,
    entorno_trabajo_id: int,
    referencias: List[str],
) -> List[Dict]:
    """Busca piezas vendidas para referencia de precios."""
    refs_set = _refs_lower_set(referencias)
    if not refs_set:
        return []

    filtros = [
        func.lower(PiezaVendida.oem).in_(refs_set),
        func.lower(PiezaVendida.oe).in_(refs_set),
        func.lower(PiezaVendida.iam).in_(refs_set),
        func.lower(PiezaVendida.refid).in_(refs_set),
    ]

    vendidas = db.query(PiezaVendida).filter(
        PiezaVendida.entorno_trabajo_id == entorno_trabajo_id,
        or_(*filtros)
    ).limit(20).all()

    resultados = []
    for p in vendidas:
        dias_rot = None
        if p.fecha_venta and p.fecha_fichaje:
            dias_rot = (p.fecha_venta - p.fecha_fichaje).days
        resultados.append({
            "id": p.id,
            "refid": p.refid,
            "oem": p.oem,
            "articulo": p.articulo,
            "precio": float(p.precio) if p.precio else None,
            "fecha_venta": p.fecha_venta.isoformat() if p.fecha_venta else None,
            "dias_rotacion": dias_rot,
        })
    return resultados


def _buscar_en_desguaces(referencias: List[str]) -> List[Dict]:
    """Busca en todos los desguaces registrados, en paralelo."""
    scrapers = DesguaceFactory.crear_todos()
    resultados: List[Dict] = []

    def _buscar_uno(scraper, ref):
        try:
            return scraper.buscar(ref)
        except Exception as e:
            logger.warning(f"[{scraper.nombre}] Error con {ref}: {e}")
            return []

    tareas = [(s, ref) for s in scrapers for ref in referencias]
    if not tareas:
        return []

    with ThreadPoolExecutor(max_workers=min(12, len(tareas))) as ex:
        futures = {ex.submit(_buscar_uno, s, ref): (s.id, ref) for s, ref in tareas}
        ids_vistos: set = set()
        for f in as_completed(futures):
            for pieza in f.result():
                key = (pieza.get("desguace_id"), pieza.get("id"))
                if key not in ids_vistos:
                    ids_vistos.add(key)
                    resultados.append(pieza)

    # Post-filtrar: OEM del resultado debe coincidir EXACTAMENTE con alguna ref
    refs_set = _refs_lower_set(referencias)
    resultados_filtrados = []
    for pieza in resultados:
        if _es_coincidencia_exacta(pieza.get("oem", ""), refs_set):
            resultados_filtrados.append(pieza)
        if len(resultados_filtrados) >= 150:
            break

    return resultados_filtrados


def _buscar_stock_otros_entornos(
    db: Session,
    entorno_propio_id: int,
    referencias: List[str],
) -> List[Dict]:
    """
    Busca piezas en los stocks de OTROS entornos de trabajo (excl. admin).
    Si soy Motocoche → busca en DOCU. Si soy DOCU → busca en Motocoche. Etc.
    """
    # Obtener todos los entornos activos que no sean el mío ni admin
    entornos = db.query(EntornoTrabajo).filter(
        EntornoTrabajo.id != entorno_propio_id,
        EntornoTrabajo.activo == True,
    ).all()

    # Filtrar los excluidos (admin)
    entornos = [e for e in entornos if e.nombre.lower().replace(" ", "") not in ENTORNOS_EXCLUIDOS]
    if not entornos:
        return []

    resultados: List[Dict] = []
    ids_vistos: set = set()

    for entorno in entornos:
        base = db.query(BaseDesguace).filter(
            BaseDesguace.entorno_trabajo_id == entorno.id
        ).first()
        if not base:
            continue

        refs_set = _refs_lower_set(referencias)
        if not refs_set:
            continue

        filtros = [
            func.lower(PiezaDesguace.oem).in_(refs_set),
            func.lower(PiezaDesguace.oe).in_(refs_set),
            func.lower(PiezaDesguace.iam).in_(refs_set),
            func.lower(PiezaDesguace.refid).in_(refs_set),
        ]

        piezas = db.query(PiezaDesguace).filter(
            PiezaDesguace.base_desguace_id == base.id,
            or_(*filtros)
        ).limit(100).all()

        for p in piezas:
            if p.id in ids_vistos:
                continue
            ids_vistos.add(p.id)
            resultados.append({
                "id": p.id,
                "refid": p.refid,
                "oem": p.oem,
                "articulo": p.articulo,
                "marca": p.marca,
                "modelo": p.modelo,
                "precio": float(p.precio) if p.precio else None,
                "precio_texto": f"{p.precio} €" if p.precio else "",
                "ubicacion": p.ubicacion,
                "imagen": p.imagen or "",
                "fuente": f"entorno_{entorno.id}",
                "fuente_nombre": entorno.nombre,
            })

    return resultados


def _buscar_iam_todas_refs(referencias: List[str]) -> List[Dict]:
    """
    Busca IAM cross-ref para TODAS las referencias (original + equivalentes).
    Retorna items completos con source, image_url, price, brand, etc.
    Combina los resultados eliminando duplicados por iam_ref.
    """
    todos_items: List[Dict] = []
    seen: set = set()

    def _buscar_una(ref):
        try:
            return obtener_items_iam_por_proveedor(ref)
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=min(6, len(referencias))) as ex:
        futures = {ex.submit(_buscar_una, ref): ref for ref in referencias}
        for f in as_completed(futures):
            for item in f.result():
                iam_ref = item.get("iam_ref", "")
                if iam_ref and iam_ref not in seen:
                    seen.add(iam_ref)
                    todos_items.append(item)

    return todos_items


def busqueda_completa(
    referencia: str,
    db: Session,
    entorno_trabajo_id: int,
) -> ResultadoBusquedaCompleta:
    """
    Ejecuta la búsqueda completa en 2 fases:
      Fase 1: OEM equivalentes (secuencial, necesario antes del resto)
      Fase 2: En paralelo →
        - Stock propio (ref original + equivalentes)
        - Stock de otros entornos (excl. admin)
        - IAM cross-ref (ref original + equivalentes)
        - Desguaces competidores (ref original + equivalentes)
    """
    resultado = ResultadoBusquedaCompleta(referencia_original=referencia)

    # ── Fase 1: OEM equivalentes ─────────────────────────
    try:
        oem_eq = buscar_oem_equivalentes(referencia)
        resultado.oem_equivalentes = oem_eq
        resultado.total_oem = len(oem_eq)
        logger.info(f"[BúsquedaCompleta] {len(oem_eq)} OEM equivalentes encontrados")
    except Exception as e:
        logger.error(f"[BúsquedaCompleta] Error OEM equiv: {e}")
        resultado.errores["oem_equivalentes"] = str(e)

    # Todas las refs = original + equivalentes
    todas_refs = [referencia] + resultado.oem_equivalentes

    # Desguaces: solo refs ≥6 chars, máx 30 para no saturar scrapers
    refs_desguaces = [r for r in todas_refs if len(r) >= 6][:30]

    logger.info(
        f"[BúsquedaCompleta] Refs: {len(todas_refs)} total, "
        f"{len(refs_desguaces)} para desguaces (match exacto en BD)"
    )

    # ── Fase 2: Todo en paralelo ────
    # BD usa TODAS las refs con match exacto (seguro incluso con refs cortas)
    # Desguaces usa refs filtradas para evitar HTTP requests inútiles
    with ThreadPoolExecutor(max_workers=4) as ex:
        f_stock = ex.submit(_buscar_stock_propio, db, entorno_trabajo_id, todas_refs)
        f_otros = ex.submit(_buscar_stock_otros_entornos, db, entorno_trabajo_id, todas_refs)
        f_iam = ex.submit(_buscar_iam_todas_refs, todas_refs)
        f_desg = ex.submit(_buscar_en_desguaces, refs_desguaces)

        # Stock propio
        try:
            resultado.stock_propio = f_stock.result()
            resultado.total_stock = len(resultado.stock_propio)
            logger.info(f"[BúsquedaCompleta] {resultado.total_stock} en stock propio")
        except Exception as e:
            logger.error(f"[BúsquedaCompleta] Error stock: {e}")
            resultado.errores["stock_propio"] = str(e)

        # Stock de otros entornos
        try:
            resultado.stock_otros_entornos = f_otros.result()
            resultado.total_otros_entornos = len(resultado.stock_otros_entornos)
            logger.info(f"[BúsquedaCompleta] {resultado.total_otros_entornos} en otros entornos")
        except Exception as e:
            logger.error(f"[BúsquedaCompleta] Error otros entornos: {e}")
            resultado.errores["otros_entornos"] = str(e)

        # IAM
        try:
            resultado.piezas_nuevas_iam = f_iam.result()
            resultado.total_iam = len(resultado.piezas_nuevas_iam)
            logger.info(f"[BúsquedaCompleta] {resultado.total_iam} refs IAM")
        except Exception as e:
            logger.error(f"[BúsquedaCompleta] Error IAM: {e}")
            resultado.errores["iam"] = str(e)

        # Desguaces competidores
        try:
            resultado.resultados_desguaces = f_desg.result()
            resultado.total_desguaces = len(resultado.resultados_desguaces)
            logger.info(f"[BúsquedaCompleta] {resultado.total_desguaces} en desguaces")
        except Exception as e:
            logger.error(f"[BúsquedaCompleta] Error desguaces: {e}")
            resultado.errores["desguaces"] = str(e)

    return resultado
