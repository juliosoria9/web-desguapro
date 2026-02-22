"""
Router para catálogo de vehículos de referencia.
- Lectura: cualquier usuario autenticado
- Escritura (crear/editar/eliminar): solo admin, owner, sysowner
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.dependencies import get_current_user, get_current_admin
from app.models.busqueda import VehiculoReferencia, Usuario

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────
class VehiculoCreate(BaseModel):
    marca: str
    modelo: str
    anios_produccion: Optional[str] = None
    rango_anios: Optional[str] = None
    tiene_serie: bool = False
    tiene_deportiva: bool = False
    observaciones_facelift: Optional[str] = None
    serie_1g: Optional[str] = None
    serie_2g: Optional[str] = None
    serie_3g: Optional[str] = None
    precio_fatal_10: Optional[float] = None
    precio_mal_13: Optional[float] = None
    precio_regular_17: Optional[float] = None
    precio_bien_23: Optional[float] = None
    precio_vida_deportiva: Optional[float] = None
    valor_minimo_usado: Optional[float] = None
    porcentaje_15: Optional[float] = None
    porcentaje_20: Optional[float] = None
    porcentaje_23: Optional[float] = None
    compatibilidad: Optional[str] = None


class VehiculoUpdate(VehiculoCreate):
    marca: Optional[str] = None  # type: ignore[assignment]
    modelo: Optional[str] = None  # type: ignore[assignment]


# ─── Endpoints lectura (cualquier usuario) ────────────────
@router.get("/marcas")
def listar_marcas(
    q: str = Query("", description="Filtro por primeras letras"),
    db: Session = Depends(get_db),
):
    """Marcas únicas, opcionalmente filtradas por texto."""
    query = db.query(distinct(VehiculoReferencia.marca)).order_by(VehiculoReferencia.marca)
    if q.strip():
        query = query.filter(VehiculoReferencia.marca.ilike(f"%{q.strip()}%"))
    return [row[0] for row in query.all()]


@router.get("/modelos")
def listar_modelos(
    marca: str = Query(...),
    q: str = Query("", description="Filtro por primeras letras"),
    db: Session = Depends(get_db),
):
    """Modelos de una marca, opcionalmente filtrados."""
    query = db.query(distinct(VehiculoReferencia.modelo)).filter(
        func.upper(VehiculoReferencia.marca) == marca.upper()
    ).order_by(VehiculoReferencia.modelo)
    if q.strip():
        query = query.filter(VehiculoReferencia.modelo.ilike(f"%{q.strip()}%"))
    return [row[0] for row in query.all()]


@router.get("/anios")
def listar_anios(
    marca: str = Query(...),
    modelo: str = Query(...),
    db: Session = Depends(get_db),
):
    """Rangos de años para marca+modelo."""
    rows = db.query(VehiculoReferencia).filter(
        func.upper(VehiculoReferencia.marca) == marca.upper(),
        func.upper(VehiculoReferencia.modelo) == modelo.upper(),
    ).all()
    return [
        {
            "rango_anios": r.rango_anios,
            "anios_produccion": r.anios_produccion,
            "observaciones_facelift": r.observaciones_facelift,
        }
        for r in rows
    ]


@router.get("/todos")
def listar_todos(
    buscar: str = Query("", description="Buscar por marca o modelo"),
    marca: str = Query("", description="Filtrar por marca exacta"),
    limit: int = Query(100, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Lista paginada de todos los vehículos (para panel admin)."""
    query = db.query(VehiculoReferencia)
    if marca.strip():
        query = query.filter(func.upper(VehiculoReferencia.marca) == marca.strip().upper())
    if buscar.strip():
        filtro = f"%{buscar.strip()}%"
        query = query.filter(
            (VehiculoReferencia.marca.ilike(filtro)) |
            (VehiculoReferencia.modelo.ilike(filtro))
        )
    total = query.count()
    items = query.order_by(VehiculoReferencia.marca, VehiculoReferencia.modelo, VehiculoReferencia.rango_anios)\
                 .offset(offset).limit(limit).all()
    return {
        "total": total,
        "items": [_to_dict(v) for v in items],
    }


# ─── Endpoints escritura (solo admin+) ───────────────────
@router.post("")
def crear_vehiculo(
    data: VehiculoCreate,
    admin: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    v = VehiculoReferencia(**data.model_dump())
    v.marca = v.marca.upper()
    v.modelo = v.modelo.upper()
    db.add(v)
    db.commit()
    db.refresh(v)
    return _to_dict(v)


@router.put("/{vehiculo_id}")
def editar_vehiculo(
    vehiculo_id: int,
    data: VehiculoUpdate,
    admin: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    v = db.query(VehiculoReferencia).filter(VehiculoReferencia.id == vehiculo_id).first()
    if not v:
        raise HTTPException(404, "Vehículo no encontrado")
    updates = data.model_dump(exclude_unset=True)
    if "marca" in updates and updates["marca"]:
        updates["marca"] = updates["marca"].upper()
    if "modelo" in updates and updates["modelo"]:
        updates["modelo"] = updates["modelo"].upper()
    for k, val in updates.items():
        setattr(v, k, val)
    db.commit()
    db.refresh(v)
    return _to_dict(v)


@router.delete("/{vehiculo_id}")
def eliminar_vehiculo(
    vehiculo_id: int,
    admin: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    v = db.query(VehiculoReferencia).filter(VehiculoReferencia.id == vehiculo_id).first()
    if not v:
        raise HTTPException(404, "Vehículo no encontrado")
    db.delete(v)
    db.commit()
    return {"ok": True}


# ─── Helper ──────────────────────────────────────────────
def _to_dict(v: VehiculoReferencia) -> dict:
    return {
        "id": v.id,
        "marca": v.marca,
        "modelo": v.modelo,
        "anios_produccion": v.anios_produccion,
        "rango_anios": v.rango_anios,
        "tiene_serie": v.tiene_serie,
        "tiene_deportiva": v.tiene_deportiva,
        "observaciones_facelift": v.observaciones_facelift,
        "serie_1g": v.serie_1g,
        "serie_2g": v.serie_2g,
        "serie_3g": v.serie_3g,
        "precio_fatal_10": v.precio_fatal_10,
        "precio_mal_13": v.precio_mal_13,
        "precio_regular_17": v.precio_regular_17,
        "precio_bien_23": v.precio_bien_23,
        "precio_vida_deportiva": v.precio_vida_deportiva,
        "valor_minimo_usado": v.valor_minimo_usado,
        "porcentaje_15": v.porcentaje_15,
        "porcentaje_20": v.porcentaje_20,
        "porcentaje_23": v.porcentaje_23,
        "compatibilidad": v.compatibilidad,
    }
