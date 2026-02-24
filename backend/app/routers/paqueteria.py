"""
Router para gestión de paquetería (tipo fichaje: escanear caja + pieza)
Con soporte de sucursales/puestos por entorno de trabajo.
Accesible para todos los usuarios del entorno
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, String
from typing import Optional
from datetime import datetime, date, timedelta
import logging

from app.database import get_db
from app.models.busqueda import (
    RegistroPaquete, Usuario, EntornoTrabajo, TipoCaja, MovimientoCaja,
    SucursalPaqueteria, StockCajaSucursal,
)
from app.schemas.paqueteria import (
    RegistroPaqueteCreate, RegistroPaqueteLoteCreate, RegistroPaqueteUpdate, RegistroPaqueteResponse,
    RankingUsuario, RankingResponse, MisRegistrosResponse,
    TipoCajaCreate, TipoCajaUpdate, TipoCajaResponse,
    MovimientoCajaCreate, MovimientoCajaResponse, ResumenTipoCaja,
    EstadisticasPaqueteriaResponse, EstadisticasDia, EstadisticasUsuario, EstadisticasCaja,
    SucursalPaqueteriaCreate, SucursalPaqueteriaUpdate, SucursalPaqueteriaResponse,
    EstadisticasSucursal, StockSucursalInfo,
)
from app.dependencies import get_current_user
from utils.timezone import now_spain_naive

logger = logging.getLogger(__name__)

router = APIRouter()


def _check_paqueteria_modulo(usuario: Usuario, db: Session):
    """Verificar que el módulo de paquetería está activo para el entorno"""
    if usuario.rol == "sysowner":
        return
    if not usuario.entorno_trabajo_id:
        raise HTTPException(status_code=400, detail="Usuario sin entorno de trabajo asignado")
    entorno = db.query(EntornoTrabajo).filter(EntornoTrabajo.id == usuario.entorno_trabajo_id).first()
    if not entorno:
        raise HTTPException(status_code=404, detail="Entorno de trabajo no encontrado")
    if hasattr(entorno, 'modulo_paqueteria') and entorno.modulo_paqueteria is False:
        raise HTTPException(status_code=403, detail="El módulo de Paquetería no está activo para tu empresa")


def _get_entorno_id(usuario: Usuario, entorno_id_param: Optional[int] = None) -> int:
    """Obtener el entorno_id correcto según el usuario"""
    if usuario.rol == "sysowner" and entorno_id_param:
        return entorno_id_param
    return usuario.entorno_trabajo_id


def _sucursal_nombre(db: Session, sucursal_id: Optional[int]) -> Optional[str]:
    """Obtener nombre de sucursal por ID (con cache ligero)"""
    if not sucursal_id:
        return None
    suc = db.query(SucursalPaqueteria.nombre).filter(SucursalPaqueteria.id == sucursal_id).first()
    return suc[0] if suc else None


def _get_or_create_stock_sucursal(db: Session, tipo_caja_id: int, sucursal_id: int) -> StockCajaSucursal:
    """Obtener o crear el registro de stock por sucursal para un tipo de caja"""
    stock = db.query(StockCajaSucursal).filter(
        StockCajaSucursal.tipo_caja_id == tipo_caja_id,
        StockCajaSucursal.sucursal_paqueteria_id == sucursal_id,
    ).first()
    if not stock:
        stock = StockCajaSucursal(
            tipo_caja_id=tipo_caja_id,
            sucursal_paqueteria_id=sucursal_id,
            stock_actual=0,
        )
        db.add(stock)
        db.flush()
    return stock


# ============== SUCURSALES CRUD ==============

@router.get("/sucursales", response_model=list[SucursalPaqueteriaResponse])
async def listar_sucursales(
    entorno_id: Optional[int] = Query(None),
    incluir_legacy: bool = Query(False, description="Incluir sucursal Legacy"),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Listar sucursales del entorno (oculta Legacy por defecto)"""
    _check_paqueteria_modulo(usuario, db)
    ent_id = _get_entorno_id(usuario, entorno_id)

    query = db.query(SucursalPaqueteria).filter(
        SucursalPaqueteria.entorno_trabajo_id == ent_id,
        SucursalPaqueteria.activa == True,
    )
    if not incluir_legacy:
        query = query.filter(SucursalPaqueteria.es_legacy == False)

    return query.order_by(SucursalPaqueteria.nombre).all()


@router.post("/sucursales", response_model=SucursalPaqueteriaResponse)
async def crear_sucursal(
    datos: SucursalPaqueteriaCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Crear una nueva sucursal (solo admin/owner/sysowner)"""
    _check_paqueteria_modulo(usuario, db)
    if usuario.rol not in ["admin", "owner", "sysowner"]:
        raise HTTPException(status_code=403, detail="Solo administradores pueden crear sucursales")

    ent_id = _get_entorno_id(usuario, datos.entorno_id)
    if not ent_id:
        raise HTTPException(status_code=400, detail="Selecciona una empresa")

    # Verificar duplicado
    existente = db.query(SucursalPaqueteria).filter(
        SucursalPaqueteria.entorno_trabajo_id == ent_id,
        func.upper(SucursalPaqueteria.nombre) == datos.nombre.strip().upper(),
    ).first()
    if existente:
        raise HTTPException(status_code=409, detail=f"Ya existe una sucursal '{datos.nombre}'")

    sucursal = SucursalPaqueteria(
        entorno_trabajo_id=ent_id,
        nombre=datos.nombre.strip(),
        color_hex=datos.color_hex or "#3B82F6",
    )
    db.add(sucursal)
    db.commit()
    db.refresh(sucursal)

    logger.info(f"Sucursal paquetería '{sucursal.nombre}' creada por {usuario.email}")
    return sucursal


@router.put("/sucursales/{sucursal_id}", response_model=SucursalPaqueteriaResponse)
async def editar_sucursal(
    sucursal_id: int,
    datos: SucursalPaqueteriaUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Editar una sucursal"""
    _check_paqueteria_modulo(usuario, db)
    if usuario.rol not in ["admin", "owner", "sysowner"]:
        raise HTTPException(status_code=403, detail="Solo administradores pueden editar sucursales")

    query = db.query(SucursalPaqueteria).filter(SucursalPaqueteria.id == sucursal_id)
    if usuario.rol != "sysowner":
        query = query.filter(SucursalPaqueteria.entorno_trabajo_id == usuario.entorno_trabajo_id)
    sucursal = query.first()
    if not sucursal:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
    if sucursal.es_legacy:
        raise HTTPException(status_code=400, detail="No se puede editar la sucursal Legacy")

    if datos.nombre is not None:
        sucursal.nombre = datos.nombre.strip()
    if datos.color_hex is not None:
        sucursal.color_hex = datos.color_hex
    if datos.activa is not None:
        sucursal.activa = datos.activa

    db.commit()
    db.refresh(sucursal)
    logger.info(f"Sucursal paquetería {sucursal_id} editada por {usuario.email}")
    return sucursal


@router.delete("/sucursales/{sucursal_id}")
async def borrar_sucursal(
    sucursal_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Borrar una sucursal (solo si no tiene registros)"""
    _check_paqueteria_modulo(usuario, db)
    if usuario.rol not in ["admin", "owner", "sysowner"]:
        raise HTTPException(status_code=403, detail="Solo administradores pueden borrar sucursales")

    query = db.query(SucursalPaqueteria).filter(SucursalPaqueteria.id == sucursal_id)
    if usuario.rol != "sysowner":
        query = query.filter(SucursalPaqueteria.entorno_trabajo_id == usuario.entorno_trabajo_id)
    sucursal = query.first()
    if not sucursal:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
    if sucursal.es_legacy:
        raise HTTPException(status_code=400, detail="No se puede borrar la sucursal Legacy")

    # Verificar si tiene registros
    tiene_registros = db.query(RegistroPaquete).filter(
        RegistroPaquete.sucursal_paqueteria_id == sucursal_id
    ).first()
    if tiene_registros:
        raise HTTPException(status_code=409, detail="No se puede borrar: la sucursal tiene registros. Desactívala en su lugar.")

    db.delete(sucursal)
    db.commit()
    logger.info(f"Sucursal paquetería {sucursal_id} borrada por {usuario.email}")
    return {"message": "Sucursal eliminada"}


# ============== REGISTRAR (como fichaje) ==============

@router.post("/registrar", response_model=RegistroPaqueteResponse)
async def registrar_paquete(
    datos: RegistroPaqueteCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Registrar una pieza en una caja (escaneo rápido)"""
    _check_paqueteria_modulo(usuario, db)

    id_caja = datos.id_caja.strip().upper()
    id_pieza = datos.id_pieza.strip().upper()

    if not id_caja:
        raise HTTPException(status_code=400, detail="El ID de caja no puede estar vacío")
    if not id_pieza:
        raise HTTPException(status_code=400, detail="El ID de pieza no puede estar vacío")

    entorno_id = _get_entorno_id(usuario, datos.entorno_id)
    if not entorno_id:
        raise HTTPException(status_code=400, detail="Selecciona una empresa antes de registrar")

    # Comprobar duplicados de piezas en el mismo día
    piezas_entrantes = [p.strip() for p in id_pieza.split(',') if p.strip()]

    # Duplicados internos (misma pieza repetida en la petición)
    vistos = set()
    duplicados_internos = set()
    for p in piezas_entrantes:
        if p in vistos:
            duplicados_internos.add(p)
        vistos.add(p)
    if duplicados_internos:
        raise HTTPException(
            status_code=409,
            detail=f"Piezas duplicadas en la misma petición: {', '.join(sorted(duplicados_internos))}",
        )

    # Duplicados contra registros del mismo día y entorno
    hoy = now_spain_naive().date()
    registros_hoy = (
        db.query(RegistroPaquete.id_pieza)
        .filter(
            RegistroPaquete.entorno_trabajo_id == entorno_id,
            func.date(RegistroPaquete.fecha_registro) == hoy,
        )
        .all()
    )
    ids_empaquetados_hoy: set[str] = set()
    for (campo_pieza,) in registros_hoy:
        if campo_pieza:
            for p in campo_pieza.split(','):
                p_clean = p.strip().upper()
                if p_clean:
                    ids_empaquetados_hoy.add(p_clean)

    duplicados_dia = [p for p in piezas_entrantes if p in ids_empaquetados_hoy]
    if duplicados_dia:
        raise HTTPException(
            status_code=409,
            detail=f"Piezas ya empaquetadas hoy: {', '.join(duplicados_dia)}",
        )

    # Validar sucursal_id si se proporciona
    suc_id = datos.sucursal_id
    if suc_id:
        suc = db.query(SucursalPaqueteria).filter(
            SucursalPaqueteria.id == suc_id,
            SucursalPaqueteria.entorno_trabajo_id == entorno_id,
            SucursalPaqueteria.activa == True,
        ).first()
        if not suc:
            raise HTTPException(status_code=404, detail="Sucursal no encontrada o inactiva")

    registro = RegistroPaquete(
        usuario_id=usuario.id,
        entorno_trabajo_id=entorno_id,
        id_caja=id_caja,
        id_pieza=id_pieza,
        sucursal_paqueteria_id=suc_id,
        grupo_paquete=datos.grupo_paquete,
    )
    db.add(registro)

    # Auto-descontar stock de caja si existe un TipoCaja con esa referencia
    tipo_caja = (
        db.query(TipoCaja)
        .filter(
            func.upper(TipoCaja.referencia_caja) == id_caja,
            TipoCaja.entorno_trabajo_id == entorno_id,
        )
        .first()
    )
    if tipo_caja:
        stock_antes = tipo_caja.stock_actual or 0
        if stock_antes > 0:
            tipo_caja.stock_actual = stock_antes - 1
            mov = MovimientoCaja(
                tipo_caja_id=tipo_caja.id,
                entorno_trabajo_id=entorno_id,
                usuario_id=usuario.id,
                cantidad=-1,
                tipo_movimiento="consumo",
                notas=f"Auto: pieza {id_pieza} empaquetada",
                sucursal_paqueteria_id=suc_id,
            )
            db.add(mov)
            # También descontar del stock por sucursal
            if suc_id:
                stock_suc = _get_or_create_stock_sucursal(db, tipo_caja.id, suc_id)
                if stock_suc.stock_actual > 0:
                    stock_suc.stock_actual -= 1
            logger.info(f"Stock caja '{tipo_caja.referencia_caja}' auto-restado: {stock_antes} → {stock_antes - 1}")

    db.commit()
    db.refresh(registro)

    logger.info(f"Paquetería: {usuario.email} metió pieza {id_pieza} en caja {id_caja} (sucursal={suc_id})")

    return RegistroPaqueteResponse(
        id=registro.id,
        usuario_id=usuario.id,
        usuario_email=usuario.email,
        entorno_trabajo_id=registro.entorno_trabajo_id,
        id_caja=registro.id_caja,
        id_pieza=registro.id_pieza,
        fecha_registro=registro.fecha_registro,
        sucursal_id=registro.sucursal_paqueteria_id,
        sucursal_nombre=_sucursal_nombre(db, registro.sucursal_paqueteria_id),
        grupo_paquete=registro.grupo_paquete,
    )


@router.post("/registrar-lote", response_model=list[RegistroPaqueteResponse])
async def registrar_paquete_lote(
    datos: RegistroPaqueteLoteCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Registrar múltiples piezas asociadas a una caja de una vez"""
    _check_paqueteria_modulo(usuario, db)

    id_caja = datos.id_caja.strip().upper()
    if not id_caja:
        raise HTTPException(status_code=400, detail="El ID de caja no puede estar vacío")

    piezas = [p.strip().upper() for p in datos.id_piezas if p.strip()]
    if not piezas:
        raise HTTPException(status_code=400, detail="Debe incluir al menos una pieza")

    entorno_id = _get_entorno_id(usuario, datos.entorno_id)
    if not entorno_id:
        raise HTTPException(status_code=400, detail="Selecciona una empresa antes de registrar")

    suc_id = datos.sucursal_id
    if suc_id:
        suc = db.query(SucursalPaqueteria).filter(
            SucursalPaqueteria.id == suc_id,
            SucursalPaqueteria.entorno_trabajo_id == entorno_id,
            SucursalPaqueteria.activa == True,
        ).first()
        if not suc:
            raise HTTPException(status_code=404, detail="Sucursal no encontrada o inactiva")

    registros = []
    for id_pieza in piezas:
        registro = RegistroPaquete(
            usuario_id=usuario.id,
            entorno_trabajo_id=entorno_id,
            id_caja=id_caja,
            id_pieza=id_pieza,
            sucursal_paqueteria_id=suc_id,
            grupo_paquete=datos.grupo_paquete,
        )
        db.add(registro)
        registros.append(registro)

    # Auto-descontar stock de caja solo UNA vez (es una sola caja física)
    tipo_caja = (
        db.query(TipoCaja)
        .filter(
            func.upper(TipoCaja.referencia_caja) == id_caja,
            TipoCaja.entorno_trabajo_id == entorno_id,
        )
        .first()
    )
    if tipo_caja:
        stock_antes = tipo_caja.stock_actual or 0
        if stock_antes > 0:
            tipo_caja.stock_actual = stock_antes - 1
            mov = MovimientoCaja(
                tipo_caja_id=tipo_caja.id,
                entorno_trabajo_id=entorno_id,
                usuario_id=usuario.id,
                cantidad=-1,
                tipo_movimiento="consumo",
                notas=f"Auto: {len(piezas)} pieza(s) empaquetadas en caja",
                sucursal_paqueteria_id=suc_id,
            )
            db.add(mov)
            if suc_id:
                stock_suc = _get_or_create_stock_sucursal(db, tipo_caja.id, suc_id)
                if stock_suc.stock_actual > 0:
                    stock_suc.stock_actual -= 1
            logger.info(f"Stock caja '{tipo_caja.referencia_caja}' auto-restado: {stock_antes} → {stock_antes - 1}")

    db.commit()
    for reg in registros:
        db.refresh(reg)

    suc_nombre = _sucursal_nombre(db, suc_id)
    logger.info(f"Paquetería lote: {usuario.email} metió {len(piezas)} piezas en caja {id_caja} (sucursal={suc_id})")

    return [
        RegistroPaqueteResponse(
            id=reg.id,
            usuario_id=usuario.id,
            usuario_email=usuario.email,
            entorno_trabajo_id=reg.entorno_trabajo_id,
            id_caja=reg.id_caja,
            id_pieza=reg.id_pieza,
            fecha_registro=reg.fecha_registro,
            sucursal_id=reg.sucursal_paqueteria_id,
            sucursal_nombre=suc_nombre,
            grupo_paquete=reg.grupo_paquete,
        )
        for reg in registros
    ]


# ============== RANKING DEL DÍA ==============

@router.get("/ranking", response_model=RankingResponse)
async def ranking_paqueteria(
    fecha: Optional[str] = Query(None, description="Fecha YYYY-MM-DD (default hoy)"),
    entorno_id: Optional[int] = Query(None, description="ID entorno (solo sysowner)"),
    sucursal_id: Optional[int] = Query(None, description="Filtrar por sucursal"),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Ranking de paquetería: cuántos registros hizo cada usuario en el día"""
    _check_paqueteria_modulo(usuario, db)

    # Determinar fecha
    if fecha:
        try:
            fecha_filtro = date.fromisoformat(fecha)
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha inválido (YYYY-MM-DD)")
    else:
        fecha_filtro = date.today()

    # Determinar entorno
    ent_id = entorno_id if (usuario.rol == "sysowner" and entorno_id) else usuario.entorno_trabajo_id

    # Query agrupado por usuario
    # COALESCE(grupo_paquete, CAST(id, TEXT)) para que registros sin grupo cuenten como individuales
    grupo_expr = func.coalesce(RegistroPaquete.grupo_paquete, func.cast(RegistroPaquete.id, String))
    resultados_raw = (
        db.query(
            RegistroPaquete.usuario_id,
            func.count(RegistroPaquete.id).label("total"),
            func.count(func.distinct(grupo_expr)).label("paquetes"),
            func.min(RegistroPaquete.fecha_registro).label("primera"),
            func.max(RegistroPaquete.fecha_registro).label("ultima"),
        )
        .filter(func.date(RegistroPaquete.fecha_registro) == fecha_filtro.strftime("%Y-%m-%d"))
    )

    if ent_id:
        resultados_raw = resultados_raw.filter(RegistroPaquete.entorno_trabajo_id == ent_id)
    if sucursal_id:
        resultados_raw = resultados_raw.filter(RegistroPaquete.sucursal_paqueteria_id == sucursal_id)

    resultados_raw = resultados_raw.group_by(RegistroPaquete.usuario_id).all()

    # Construir ranking
    ranking = []
    total_general = 0
    total_paquetes_general = 0
    for row in resultados_raw:
        usr = db.query(Usuario).filter(Usuario.id == row.usuario_id).first()
        if not usr:
            continue
        ranking.append(RankingUsuario(
            usuario_id=row.usuario_id,
            usuario_email=usr.email,
            usuario_nombre=usr.nombre,
            total_registros=row.total,
            total_paquetes=row.paquetes,
            primera=row.primera,
            ultima=row.ultima,
        ))
        total_general += row.total
        total_paquetes_general += row.paquetes

    # Ordenar por paquetes descendente
    ranking.sort(key=lambda x: x.total_paquetes, reverse=True)

    return RankingResponse(
        fecha=fecha_filtro.isoformat(),
        usuarios=ranking,
        total_general=total_general,
        total_paquetes=total_paquetes_general,
    )


# ============== MIS REGISTROS DEL DÍA ==============

@router.get("/mis-registros", response_model=list[MisRegistrosResponse])
async def mis_registros(
    fecha: Optional[str] = Query(None, description="Fecha YYYY-MM-DD (default hoy)"),
    sucursal_id: Optional[int] = Query(None, description="Filtrar por sucursal"),
    limite: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Obtener mis registros de paquetería del día"""
    _check_paqueteria_modulo(usuario, db)

    if fecha:
        try:
            fecha_filtro = date.fromisoformat(fecha)
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha inválido")
    else:
        fecha_filtro = date.today()

    query = (
        db.query(RegistroPaquete)
        .filter(
            RegistroPaquete.usuario_id == usuario.id,
            func.date(RegistroPaquete.fecha_registro) == fecha_filtro.strftime("%Y-%m-%d"),
        )
    )
    if sucursal_id:
        query = query.filter(RegistroPaquete.sucursal_paqueteria_id == sucursal_id)

    registros = query.order_by(desc(RegistroPaquete.fecha_registro)).limit(limite).all()

    return [
        MisRegistrosResponse(
            id=r.id,
            id_caja=r.id_caja,
            id_pieza=r.id_pieza,
            fecha_registro=r.fecha_registro,
            usuario_email=usuario.email,
            usuario_nombre=usuario.nombre,
            sucursal_id=r.sucursal_paqueteria_id,
            sucursal_nombre=_sucursal_nombre(db, r.sucursal_paqueteria_id),
            grupo_paquete=r.grupo_paquete,
        )
        for r in registros
    ]


# ============== DETALLE POR USUARIO (admin) ==============

@router.get("/detalle-usuario/{usuario_id}", response_model=list[MisRegistrosResponse])
async def detalle_usuario(
    usuario_id: int,
    fecha: Optional[str] = Query(None),
    entorno_id: Optional[int] = Query(None),
    sucursal_id: Optional[int] = Query(None, description="Filtrar por sucursal"),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Ver registros de un usuario (solo admin/owner/sysowner)"""
    _check_paqueteria_modulo(usuario, db)

    if usuario.rol not in ["admin", "owner", "sysowner"]:
        raise HTTPException(status_code=403, detail="Solo administradores pueden ver detalle de otros usuarios")

    if fecha:
        try:
            fecha_filtro = date.fromisoformat(fecha)
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha inválido")
    else:
        fecha_filtro = date.today()

    usr_target = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usr_target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    ent_id = entorno_id if (usuario.rol == "sysowner" and entorno_id) else usuario.entorno_trabajo_id

    query = (
        db.query(RegistroPaquete)
        .filter(
            RegistroPaquete.usuario_id == usuario_id,
            func.date(RegistroPaquete.fecha_registro) == fecha_filtro.strftime("%Y-%m-%d"),
        )
    )
    if ent_id:
        query = query.filter(RegistroPaquete.entorno_trabajo_id == ent_id)
    if sucursal_id:
        query = query.filter(RegistroPaquete.sucursal_paqueteria_id == sucursal_id)

    registros = query.order_by(desc(RegistroPaquete.fecha_registro)).all()

    return [
        MisRegistrosResponse(
            id=r.id,
            id_caja=r.id_caja,
            id_pieza=r.id_pieza,
            fecha_registro=r.fecha_registro,
            usuario_email=usr_target.email,
            usuario_nombre=usr_target.nombre,
            sucursal_id=r.sucursal_paqueteria_id,
            sucursal_nombre=_sucursal_nombre(db, r.sucursal_paqueteria_id),
            grupo_paquete=r.grupo_paquete,
        )
        for r in registros
    ]


# ============== TODOS LOS REGISTROS DEL DÍA (admin) ==============

@router.get("/todos-registros", response_model=list[MisRegistrosResponse])
async def todos_registros(
    fecha: Optional[str] = Query(None, description="Fecha YYYY-MM-DD (default hoy)"),
    entorno_id: Optional[int] = Query(None, description="ID entorno (solo sysowner)"),
    sucursal_id: Optional[int] = Query(None, description="Filtrar por sucursal"),
    limite: int = Query(5000, ge=1, le=10000),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Ver todos los registros de paquetería del día con operario (solo admin)"""
    _check_paqueteria_modulo(usuario, db)

    if usuario.rol not in ["admin", "owner", "sysowner"]:
        raise HTTPException(status_code=403, detail="Solo administradores pueden ver todos los registros")

    if fecha:
        try:
            fecha_filtro = date.fromisoformat(fecha)
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha inválido")
    else:
        fecha_filtro = date.today()

    ent_id = entorno_id if (usuario.rol == "sysowner" and entorno_id) else usuario.entorno_trabajo_id

    query = (
        db.query(RegistroPaquete)
        .filter(func.date(RegistroPaquete.fecha_registro) == fecha_filtro.strftime("%Y-%m-%d"))
    )
    if ent_id:
        query = query.filter(RegistroPaquete.entorno_trabajo_id == ent_id)
    if sucursal_id:
        query = query.filter(RegistroPaquete.sucursal_paqueteria_id == sucursal_id)

    registros = query.order_by(desc(RegistroPaquete.fecha_registro)).limit(limite).all()

    resultado = []
    # Caches para no repetir queries
    cache_usuarios: dict[int, Usuario] = {}
    cache_sucursales: dict[int, str] = {}
    for r in registros:
        if r.usuario_id not in cache_usuarios:
            usr = db.query(Usuario).filter(Usuario.id == r.usuario_id).first()
            if usr:
                cache_usuarios[r.usuario_id] = usr
        usr = cache_usuarios.get(r.usuario_id)

        suc_nombre = None
        if r.sucursal_paqueteria_id:
            if r.sucursal_paqueteria_id not in cache_sucursales:
                cache_sucursales[r.sucursal_paqueteria_id] = _sucursal_nombre(db, r.sucursal_paqueteria_id) or ""
            suc_nombre = cache_sucursales.get(r.sucursal_paqueteria_id)

        resultado.append(MisRegistrosResponse(
            id=r.id,
            id_caja=r.id_caja,
            id_pieza=r.id_pieza,
            fecha_registro=r.fecha_registro,
            usuario_email=usr.email if usr else "desconocido",
            usuario_nombre=usr.nombre if usr else None,
            sucursal_id=r.sucursal_paqueteria_id,
            sucursal_nombre=suc_nombre,
            grupo_paquete=r.grupo_paquete,
        ))

    return resultado


# ============== BORRAR REGISTRO ==============

@router.delete("/borrar/{registro_id}")
async def borrar_registro(
    registro_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Borrar un registro de paquetería (propio del día, o admin puede borrar cualquiera)"""
    _check_paqueteria_modulo(usuario, db)

    registro = db.query(RegistroPaquete).filter(RegistroPaquete.id == registro_id).first()
    if not registro:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    es_admin = usuario.rol in ["admin", "owner", "sysowner"]
    es_propio = registro.usuario_id == usuario.id
    es_de_hoy = registro.fecha_registro.date() == now_spain_naive().date() if registro.fecha_registro else False

    if not es_admin and not (es_propio and es_de_hoy):
        raise HTTPException(status_code=403, detail="Solo puedes borrar tus registros del día actual")

    if usuario.rol != "sysowner" and registro.entorno_trabajo_id != usuario.entorno_trabajo_id:
        raise HTTPException(status_code=403, detail="No tienes acceso a este registro")

    # Auto-devolver stock de caja si existe un TipoCaja con esa referencia
    id_caja_borrada = registro.id_caja.upper() if registro.id_caja else None
    ent_borrada = registro.entorno_trabajo_id
    suc_borrada = registro.sucursal_paqueteria_id
    if id_caja_borrada and ent_borrada:
        tipo_caja = (
            db.query(TipoCaja)
            .filter(
                func.upper(TipoCaja.referencia_caja) == id_caja_borrada,
                TipoCaja.entorno_trabajo_id == ent_borrada,
            )
            .first()
        )
        if tipo_caja:
            tipo_caja.stock_actual = (tipo_caja.stock_actual or 0) + 1
            # Devolver al stock por sucursal
            if suc_borrada:
                stock_suc = _get_or_create_stock_sucursal(db, tipo_caja.id, suc_borrada)
                stock_suc.stock_actual += 1
            mov = MovimientoCaja(
                tipo_caja_id=tipo_caja.id,
                entorno_trabajo_id=ent_borrada,
                usuario_id=usuario.id,
                cantidad=1,
                tipo_movimiento="ajuste",
                notas=f"Auto: registro borrado (pieza {registro.id_pieza})",
                sucursal_paqueteria_id=suc_borrada,
            )
            db.add(mov)
            logger.info(f"Stock caja '{tipo_caja.referencia_caja}' auto-devuelto +1 por borrado")

    db.delete(registro)
    db.commit()

    logger.info(f"Paquetería: registro {registro_id} borrado por {usuario.email}")
    return {"message": "Registro eliminado correctamente"}


# ============== EDITAR REGISTRO ==============

@router.put("/editar/{registro_id}", response_model=RegistroPaqueteResponse)
async def editar_registro(
    registro_id: int,
    datos: RegistroPaqueteUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Editar un registro de paquetería (propio del día, o admin puede editar cualquiera)"""
    _check_paqueteria_modulo(usuario, db)

    registro = db.query(RegistroPaquete).filter(RegistroPaquete.id == registro_id).first()
    if not registro:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    es_admin = usuario.rol in ["admin", "owner", "sysowner"]
    es_propio = registro.usuario_id == usuario.id
    es_de_hoy = registro.fecha_registro.date() == now_spain_naive().date() if registro.fecha_registro else False

    if not es_admin and not (es_propio and es_de_hoy):
        raise HTTPException(status_code=403, detail="Solo puedes editar tus registros del día actual")

    if not es_admin and registro.entorno_trabajo_id != usuario.entorno_trabajo_id:
        raise HTTPException(status_code=403, detail="No tienes acceso a este registro")

    caja_anterior = registro.id_caja.upper() if registro.id_caja else None
    caja_nueva = datos.id_caja.strip().upper() if datos.id_caja is not None else None
    ent_reg = registro.entorno_trabajo_id

    if datos.id_caja is not None:
        registro.id_caja = caja_nueva
    if datos.id_pieza is not None:
        registro.id_pieza = datos.id_pieza.strip().upper()

    # Si cambió la caja, ajustar stock: devolver a la vieja, restar a la nueva
    if caja_nueva and caja_anterior and caja_nueva != caja_anterior and ent_reg:
        suc_reg = registro.sucursal_paqueteria_id
        # Devolver 1 a la caja anterior
        tipo_ant = (
            db.query(TipoCaja)
            .filter(func.upper(TipoCaja.referencia_caja) == caja_anterior, TipoCaja.entorno_trabajo_id == ent_reg)
            .first()
        )
        if tipo_ant:
            tipo_ant.stock_actual = (tipo_ant.stock_actual or 0) + 1
            if suc_reg:
                stock_suc_ant = _get_or_create_stock_sucursal(db, tipo_ant.id, suc_reg)
                stock_suc_ant.stock_actual += 1
            db.add(MovimientoCaja(
                tipo_caja_id=tipo_ant.id, entorno_trabajo_id=ent_reg, usuario_id=usuario.id,
                cantidad=1, tipo_movimiento="ajuste", notas=f"Auto: edición, caja cambiada de {caja_anterior}",
                sucursal_paqueteria_id=suc_reg,
            ))
        # Restar 1 a la caja nueva
        tipo_nue = (
            db.query(TipoCaja)
            .filter(func.upper(TipoCaja.referencia_caja) == caja_nueva, TipoCaja.entorno_trabajo_id == ent_reg)
            .first()
        )
        if tipo_nue and (tipo_nue.stock_actual or 0) > 0:
            tipo_nue.stock_actual = (tipo_nue.stock_actual or 0) - 1
            if suc_reg:
                stock_suc_nue = _get_or_create_stock_sucursal(db, tipo_nue.id, suc_reg)
                if stock_suc_nue.stock_actual > 0:
                    stock_suc_nue.stock_actual -= 1
            db.add(MovimientoCaja(
                tipo_caja_id=tipo_nue.id, entorno_trabajo_id=ent_reg, usuario_id=usuario.id,
                cantidad=-1, tipo_movimiento="consumo", notas=f"Auto: edición, caja cambiada a {caja_nueva}",
                sucursal_paqueteria_id=suc_reg,
            ))

    db.commit()
    db.refresh(registro)

    usr = db.query(Usuario).filter(Usuario.id == registro.usuario_id).first()
    logger.info(f"Paquetería: registro {registro_id} editado por {usuario.email}")

    return RegistroPaqueteResponse(
        id=registro.id,
        usuario_id=registro.usuario_id,
        usuario_email=usr.email if usr else "",
        entorno_trabajo_id=registro.entorno_trabajo_id,
        id_caja=registro.id_caja,
        id_pieza=registro.id_pieza,
        fecha_registro=registro.fecha_registro,
        sucursal_id=registro.sucursal_paqueteria_id,
        sucursal_nombre=_sucursal_nombre(db, registro.sucursal_paqueteria_id),
        grupo_paquete=registro.grupo_paquete,
    )


# ============== TIPOS DE CAJA ==============

@router.get("/tipos-caja", response_model=list[TipoCajaResponse])
async def listar_tipos_caja(
    entorno_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Listar todos los tipos de caja del entorno"""
    _check_paqueteria_modulo(usuario, db)

    if usuario.rol not in ["admin", "owner", "sysowner"]:
        raise HTTPException(status_code=403, detail="Solo administradores pueden ver tipos de caja")

    ent_id = entorno_id if (usuario.rol == "sysowner" and entorno_id) else usuario.entorno_trabajo_id

    query = db.query(TipoCaja)
    if ent_id:
        query = query.filter(TipoCaja.entorno_trabajo_id == ent_id)

    return query.order_by(TipoCaja.referencia_caja).all()


@router.post("/tipos-caja", response_model=TipoCajaResponse)
async def crear_tipo_caja(
    datos: TipoCajaCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Crear un nuevo tipo de caja"""
    _check_paqueteria_modulo(usuario, db)

    if usuario.rol not in ["admin", "owner", "sysowner"]:
        raise HTTPException(status_code=403, detail="Solo administradores pueden gestionar tipos de caja")

    entorno_id = _get_entorno_id(usuario, datos.entorno_id)
    if not entorno_id:
        raise HTTPException(status_code=400, detail="Selecciona una empresa")

    ref = datos.referencia_caja.strip().upper()

    # Verificar duplicado
    existente = db.query(TipoCaja).filter(
        TipoCaja.entorno_trabajo_id == entorno_id,
        TipoCaja.referencia_caja == ref,
    ).first()
    if existente:
        raise HTTPException(status_code=409, detail=f"Ya existe un tipo para la referencia '{ref}'")

    tipo = TipoCaja(
        entorno_trabajo_id=entorno_id,
        referencia_caja=ref,
        tipo_nombre=datos.tipo_nombre.strip(),
        descripcion=datos.descripcion.strip() if datos.descripcion else None,
        dias_aviso=datos.dias_aviso,
    )
    db.add(tipo)
    db.commit()
    db.refresh(tipo)

    logger.info(f"TipoCaja: '{ref}' → '{tipo.tipo_nombre}' creado por {usuario.email}")
    return tipo


@router.put("/tipos-caja/{tipo_id}", response_model=TipoCajaResponse)
async def editar_tipo_caja(
    tipo_id: int,
    datos: TipoCajaUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Editar un tipo de caja"""
    _check_paqueteria_modulo(usuario, db)

    if usuario.rol not in ["admin", "owner", "sysowner"]:
        raise HTTPException(status_code=403, detail="Solo administradores pueden gestionar tipos de caja")

    query = db.query(TipoCaja).filter(TipoCaja.id == tipo_id)
    if usuario.rol != "sysowner":
        query = query.filter(TipoCaja.entorno_trabajo_id == usuario.entorno_trabajo_id)
    tipo = query.first()
    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo de caja no encontrado")

    if datos.referencia_caja is not None:
        tipo.referencia_caja = datos.referencia_caja.strip().upper()
    if datos.tipo_nombre is not None:
        tipo.tipo_nombre = datos.tipo_nombre.strip()
    if datos.descripcion is not None:
        tipo.descripcion = datos.descripcion.strip() if datos.descripcion else None
    if 'dias_aviso' in datos.model_fields_set:
        tipo.dias_aviso = datos.dias_aviso
        # Si cambian los días de aviso, resetear para que se evalúe de nuevo
        tipo.aviso_enviado = False

    db.commit()
    db.refresh(tipo)

    logger.info(f"TipoCaja {tipo_id} editado por {usuario.email}")
    return tipo


@router.delete("/tipos-caja/{tipo_id}")
async def borrar_tipo_caja(
    tipo_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Borrar un tipo de caja"""
    _check_paqueteria_modulo(usuario, db)

    if usuario.rol not in ["admin", "owner", "sysowner"]:
        raise HTTPException(status_code=403, detail="Solo administradores pueden gestionar tipos de caja")

    query = db.query(TipoCaja).filter(TipoCaja.id == tipo_id)
    if usuario.rol != "sysowner":
        query = query.filter(TipoCaja.entorno_trabajo_id == usuario.entorno_trabajo_id)
    tipo = query.first()
    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo de caja no encontrado")

    db.delete(tipo)
    db.commit()

    logger.info(f"TipoCaja {tipo_id} borrado por {usuario.email}")
    return {"message": "Tipo de caja eliminado"}


# ============== STOCK / INVENTARIO DE CAJAS ==============

@router.post("/tipos-caja/{tipo_id}/movimiento", response_model=MovimientoCajaResponse)
async def registrar_movimiento_caja(
    tipo_id: int,
    datos: MovimientoCajaCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Registrar un movimiento de stock (entrada, consumo o ajuste manual)"""
    _check_paqueteria_modulo(usuario, db)

    if usuario.rol not in ["admin", "owner", "sysowner"]:
        raise HTTPException(status_code=403, detail="Solo administradores pueden gestionar stock de cajas")

    query = db.query(TipoCaja).filter(TipoCaja.id == tipo_id)
    if usuario.rol != "sysowner":
        query = query.filter(TipoCaja.entorno_trabajo_id == usuario.entorno_trabajo_id)
    tipo = query.first()
    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo de caja no encontrado")

    # Validar sucursal si se proporcionó
    suc_id = datos.sucursal_id
    if suc_id:
        suc = db.query(SucursalPaqueteria).filter(
            SucursalPaqueteria.id == suc_id,
            SucursalPaqueteria.entorno_trabajo_id == tipo.entorno_trabajo_id,
            SucursalPaqueteria.activa == True,
        ).first()
        if not suc:
            raise HTTPException(status_code=404, detail="Sucursal no encontrada o inactiva")

    # Aplicar cantidad según tipo
    cantidad = abs(datos.cantidad)
    if datos.tipo_movimiento == "consumo":
        cantidad = -cantidad
    elif datos.tipo_movimiento == "ajuste":
        cantidad = datos.cantidad  # Puede ser positivo o negativo

    # Si es entrada, resetear aviso para que pueda volver a avisar
    if datos.tipo_movimiento == "entrada" and tipo.aviso_enviado:
        tipo.aviso_enviado = False
        logger.info(f"Aviso reseteado para caja '{tipo.referencia_caja}' tras nueva entrada")

    # Actualizar stock global
    nuevo_stock = (tipo.stock_actual or 0) + cantidad
    if nuevo_stock < 0:
        raise HTTPException(status_code=400, detail=f"Stock insuficiente. Stock actual: {tipo.stock_actual or 0}")
    tipo.stock_actual = nuevo_stock

    # Actualizar stock por sucursal
    if suc_id:
        stock_suc = _get_or_create_stock_sucursal(db, tipo_id, suc_id)
        nuevo_stock_suc = stock_suc.stock_actual + cantidad
        if nuevo_stock_suc < 0:
            raise HTTPException(status_code=400, detail=f"Stock insuficiente en sucursal. Stock: {stock_suc.stock_actual}")
        stock_suc.stock_actual = nuevo_stock_suc

    # Crear registro de movimiento
    movimiento = MovimientoCaja(
        tipo_caja_id=tipo_id,
        entorno_trabajo_id=tipo.entorno_trabajo_id,
        usuario_id=usuario.id,
        cantidad=cantidad,
        tipo_movimiento=datos.tipo_movimiento,
        notas=datos.notas,
        sucursal_paqueteria_id=suc_id,
    )
    db.add(movimiento)
    db.commit()
    db.refresh(movimiento)

    logger.info(f"Movimiento caja tipo {tipo_id}: {datos.tipo_movimiento} x{cantidad} por {usuario.email} (sucursal={suc_id}). Stock: {nuevo_stock}")

    return MovimientoCajaResponse(
        id=movimiento.id,
        tipo_caja_id=movimiento.tipo_caja_id,
        cantidad=movimiento.cantidad,
        tipo_movimiento=movimiento.tipo_movimiento,
        notas=movimiento.notas,
        usuario_email=usuario.email,
        sucursal_id=suc_id,
        sucursal_nombre=_sucursal_nombre(db, suc_id),
        fecha=movimiento.fecha,
    )


@router.get("/tipos-caja/{tipo_id}/movimientos")
async def listar_movimientos_caja(
    tipo_id: int,
    desde: Optional[str] = Query(None, description="Fecha inicio YYYY-MM-DD"),
    hasta: Optional[str] = Query(None, description="Fecha fin YYYY-MM-DD"),
    sucursal_id: Optional[int] = Query(None, description="Filtrar por sucursal"),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Listar historial de movimientos de un tipo de caja, con filtro de fechas y sucursal"""
    _check_paqueteria_modulo(usuario, db)

    tipo = db.query(TipoCaja).filter(TipoCaja.id == tipo_id).first()
    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo de caja no encontrado")

    query = db.query(MovimientoCaja).filter(MovimientoCaja.tipo_caja_id == tipo_id)

    if sucursal_id:
        query = query.filter(MovimientoCaja.sucursal_paqueteria_id == sucursal_id)
    if desde:
        query = query.filter(func.date(MovimientoCaja.fecha) >= desde)
    if hasta:
        query = query.filter(func.date(MovimientoCaja.fecha) <= hasta)

    movimientos = query.order_by(desc(MovimientoCaja.fecha)).all()

    resultado = []
    for m in movimientos:
        usr = db.query(Usuario).filter(Usuario.id == m.usuario_id).first() if m.usuario_id else None
        resultado.append(MovimientoCajaResponse(
            id=m.id,
            tipo_caja_id=m.tipo_caja_id,
            cantidad=m.cantidad,
            tipo_movimiento=m.tipo_movimiento,
            notas=m.notas,
            usuario_email=usr.email if usr else None,
            sucursal_id=m.sucursal_paqueteria_id,
            sucursal_nombre=_sucursal_nombre(db, m.sucursal_paqueteria_id),
            fecha=m.fecha,
        ))

    return resultado


@router.get("/tipos-caja/resumen")
async def resumen_stock_cajas(
    desde: Optional[str] = Query(None, description="Fecha inicio YYYY-MM-DD para cálculo consumo"),
    hasta: Optional[str] = Query(None, description="Fecha fin YYYY-MM-DD para cálculo consumo"),
    entorno_id: Optional[int] = Query(None, description="ID del entorno (sysowner)"),
    sucursal_id: Optional[int] = Query(None, description="Filtrar por sucursal"),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """
    Resumen completo del stock de cajas:
    - Stock actual de cada tipo (global o por sucursal si se filtra)
    - Total entradas históricas
    - Total consumidas históricas
    - Consumo en el período seleccionado
    - Media diaria de consumo en el período
    - Desglose de stock por sucursal
    """
    _check_paqueteria_modulo(usuario, db)

    ent_id = entorno_id if (usuario.rol == "sysowner" and entorno_id) else usuario.entorno_trabajo_id
    if not ent_id:
        ent_id = 1

    tipos = db.query(TipoCaja).filter(
        TipoCaja.entorno_trabajo_id == ent_id
    ).all()

    # Precargar sucursales para el desglose
    sucursales_entorno = db.query(SucursalPaqueteria).filter(
        SucursalPaqueteria.entorno_trabajo_id == ent_id,
        SucursalPaqueteria.activa == True,
        SucursalPaqueteria.es_legacy == False,
    ).all()

    resultado = []
    for tipo in tipos:
        # Base query for movements, filtered by sucursal if requested
        mov_filter = [MovimientoCaja.tipo_caja_id == tipo.id]
        if sucursal_id:
            mov_filter.append(MovimientoCaja.sucursal_paqueteria_id == sucursal_id)

        # Total entradas históricas
        total_entradas = db.query(func.coalesce(func.sum(MovimientoCaja.cantidad), 0)).filter(
            *mov_filter,
            MovimientoCaja.cantidad > 0,
        ).scalar()

        # Total consumidas históricas (valor absoluto)
        total_consumidas = db.query(func.coalesce(func.sum(func.abs(MovimientoCaja.cantidad)), 0)).filter(
            *mov_filter,
            MovimientoCaja.cantidad < 0,
        ).scalar()

        # Consumo en período (si hay filtro)
        consumo_periodo = 0
        media_diaria = 0.0
        if desde or hasta:
            q = db.query(func.coalesce(func.sum(func.abs(MovimientoCaja.cantidad)), 0)).filter(
                *mov_filter,
                MovimientoCaja.cantidad < 0,
            )
            if desde:
                q = q.filter(func.date(MovimientoCaja.fecha) >= desde)
            if hasta:
                q = q.filter(func.date(MovimientoCaja.fecha) <= hasta)
            consumo_periodo = q.scalar()

            # Calcular media diaria
            try:
                fecha_desde = datetime.strptime(desde, "%Y-%m-%d") if desde else None
                fecha_hasta = datetime.strptime(hasta, "%Y-%m-%d") if hasta else datetime.now()
                if fecha_desde:
                    dias = max((fecha_hasta - fecha_desde).days, 1)
                    media_diaria = round(consumo_periodo / dias, 2)
            except (ValueError, TypeError):
                media_diaria = 0.0
        else:
            # Sin filtro: calcular media desde el primer movimiento
            primer_mov = db.query(func.min(MovimientoCaja.fecha)).filter(
                *mov_filter,
                MovimientoCaja.cantidad < 0,
            ).scalar()
            if primer_mov and total_consumidas > 0:
                dias = max((datetime.now() - primer_mov).days, 1)
                media_diaria = round(total_consumidas / dias, 2)
            consumo_periodo = total_consumidas

        # Determinar stock a mostrar
        if sucursal_id:
            # Mostrar stock de esa sucursal específica
            stock_suc = db.query(StockCajaSucursal).filter(
                StockCajaSucursal.tipo_caja_id == tipo.id,
                StockCajaSucursal.sucursal_paqueteria_id == sucursal_id,
            ).first()
            stock_mostrar = stock_suc.stock_actual if stock_suc else 0
        else:
            stock_mostrar = tipo.stock_actual or 0

        # Desglose de stock por sucursal
        stock_por_sucursal = []
        if not sucursal_id and sucursales_entorno:
            for suc in sucursales_entorno:
                stock_suc = db.query(StockCajaSucursal).filter(
                    StockCajaSucursal.tipo_caja_id == tipo.id,
                    StockCajaSucursal.sucursal_paqueteria_id == suc.id,
                ).first()
                stock_por_sucursal.append(StockSucursalInfo(
                    sucursal_id=suc.id,
                    sucursal_nombre=suc.nombre,
                    color_hex=suc.color_hex or "#3B82F6",
                    stock_actual=stock_suc.stock_actual if stock_suc else 0,
                ))

        resultado.append(ResumenTipoCaja(
            id=tipo.id,
            referencia_caja=tipo.referencia_caja,
            tipo_nombre=tipo.tipo_nombre,
            descripcion=tipo.descripcion,
            stock_actual=stock_mostrar,
            total_entradas=total_entradas,
            total_consumidas=total_consumidas,
            consumo_periodo=consumo_periodo,
            media_diaria=media_diaria,
            dias_restantes=int(stock_mostrar / media_diaria) if media_diaria > 0 else None,
            dias_aviso=tipo.dias_aviso,
            alerta_stock=False,  # se calcula abajo
            stock_por_sucursal=stock_por_sucursal,
        ))

    # Verificar alertas de stock bajo y marcar aviso_enviado
    for res in resultado:
        if res.dias_aviso is not None and res.dias_restantes is not None:
            if res.dias_restantes <= res.dias_aviso:
                # Buscar el tipo en BD para ver si ya se envió
                tipo_db = db.query(TipoCaja).filter(TipoCaja.id == res.id).first()
                if tipo_db and not tipo_db.aviso_enviado:
                    res.alerta_stock = True
                    tipo_db.aviso_enviado = True
                    db.commit()
                    logger.warning(f"ALERTA STOCK: '{res.tipo_nombre}' tiene {res.dias_restantes} días restantes (aviso configurado a {res.dias_aviso} días)")

    return resultado


@router.put("/tipos-caja/{tipo_id}/stock")
async def establecer_stock(
    tipo_id: int,
    stock: int = Query(..., description="Nuevo stock actual"),
    sucursal_id: Optional[int] = Query(None, description="Sucursal (si aplica)"),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Establecer el stock actual directamente (ajuste completo). Si sucursal_id, ajusta esa sucursal."""
    _check_paqueteria_modulo(usuario, db)

    if usuario.rol not in ["admin", "owner", "sysowner"]:
        raise HTTPException(status_code=403, detail="Solo administradores pueden gestionar stock de cajas")

    tipo = db.query(TipoCaja).filter(TipoCaja.id == tipo_id).first()
    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo de caja no encontrado")

    if sucursal_id:
        # Ajustar stock de sucursal específica
        stock_suc = _get_or_create_stock_sucursal(db, tipo_id, sucursal_id)
        diferencia_suc = stock - stock_suc.stock_actual
        stock_suc.stock_actual = stock
        # También ajustar el global
        tipo.stock_actual = (tipo.stock_actual or 0) + diferencia_suc
        diferencia = diferencia_suc
    else:
        diferencia = stock - (tipo.stock_actual or 0)
        tipo.stock_actual = stock

    # Registrar el ajuste como movimiento
    if diferencia != 0:
        movimiento = MovimientoCaja(
            tipo_caja_id=tipo_id,
            entorno_trabajo_id=tipo.entorno_trabajo_id,
            usuario_id=usuario.id,
            cantidad=diferencia,
            tipo_movimiento="ajuste",
            notas=f"Stock ajustado a {stock}" + (f" (sucursal {sucursal_id})" if sucursal_id else ""),
            sucursal_paqueteria_id=sucursal_id,
        )
        db.add(movimiento)

    db.commit()
    db.refresh(tipo)

    logger.info(f"Stock de caja {tipo_id} ajustado a {stock} por {usuario.email} (sucursal={sucursal_id})")
    return {"message": f"Stock actualizado a {stock}", "stock_actual": tipo.stock_actual}


# ============== ESTADÍSTICAS ==============

DIAS_SEMANA_ES = {
    0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves",
    4: "Viernes", 5: "Sábado", 6: "Domingo"
}

@router.get("/estadisticas", response_model=EstadisticasPaqueteriaResponse)
async def estadisticas_paqueteria(
    entorno_id: Optional[int] = Query(None, description="ID entorno (solo sysowner)"),
    sucursal_id: Optional[int] = Query(None, description="Filtrar por sucursal (None = General)"),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Estadísticas generales de paquetería: totales, promedios, gráfica, rankings.
    Si sucursal_id=None, devuelve estadísticas globales + desglose por sucursal."""
    _check_paqueteria_modulo(usuario, db)

    ent_id = entorno_id if (usuario.rol == "sysowner" and entorno_id) else usuario.entorno_trabajo_id

    hoy = now_spain_naive().date()
    inicio_semana = hoy - timedelta(days=hoy.weekday())
    inicio_mes = hoy.replace(day=1)

    # Expresión para contar piezas (paquetes distintos), no materiales individuales
    grupo_expr_est = func.coalesce(RegistroPaquete.grupo_paquete, func.cast(RegistroPaquete.id, String))

    def _count_piezas(*extra_filters):
        q = db.query(func.count(func.distinct(grupo_expr_est)))
        if ent_id:
            q = q.filter(RegistroPaquete.entorno_trabajo_id == ent_id)
        if sucursal_id:
            q = q.filter(RegistroPaquete.sucursal_paqueteria_id == sucursal_id)
        for f in extra_filters:
            q = q.filter(f)
        return q.scalar() or 0

    total_hoy = _count_piezas(func.date(RegistroPaquete.fecha_registro) == hoy.strftime("%Y-%m-%d"))
    total_semana = _count_piezas(func.date(RegistroPaquete.fecha_registro) >= inicio_semana.strftime("%Y-%m-%d"))
    total_mes = _count_piezas(func.date(RegistroPaquete.fecha_registro) >= inicio_mes.strftime("%Y-%m-%d"))
    total_historico = _count_piezas()

    # Días trabajados y promedio diario (últimos 30 días)
    hace_30 = hoy - timedelta(days=30)
    dias_con_registros_q = (
        db.query(func.date(RegistroPaquete.fecha_registro))
        .filter(func.date(RegistroPaquete.fecha_registro) >= hace_30.strftime("%Y-%m-%d"))
    )
    if ent_id:
        dias_con_registros_q = dias_con_registros_q.filter(RegistroPaquete.entorno_trabajo_id == ent_id)
    if sucursal_id:
        dias_con_registros_q = dias_con_registros_q.filter(RegistroPaquete.sucursal_paqueteria_id == sucursal_id)
    dias_con_registros = dias_con_registros_q.group_by(func.date(RegistroPaquete.fecha_registro)).all()
    dias_trabajados = len(dias_con_registros)
    
    total_30_dias = _count_piezas(func.date(RegistroPaquete.fecha_registro) >= hace_30.strftime("%Y-%m-%d"))
    promedio_diario = round(total_30_dias / dias_trabajados, 1) if dias_trabajados > 0 else 0.0

    # Mejor día (de todos los tiempos) - contar piezas, no materiales
    mejor_dia_q = (
        db.query(
            func.date(RegistroPaquete.fecha_registro).label("fecha"),
            func.count(func.distinct(grupo_expr_est)).label("total"),
        )
    )
    if ent_id:
        mejor_dia_q = mejor_dia_q.filter(RegistroPaquete.entorno_trabajo_id == ent_id)
    if sucursal_id:
        mejor_dia_q = mejor_dia_q.filter(RegistroPaquete.sucursal_paqueteria_id == sucursal_id)
    mejor_dia_q = (
        mejor_dia_q.group_by(func.date(RegistroPaquete.fecha_registro))
        .order_by(desc("total"))
        .first()
    )
    mejor_dia_fecha = mejor_dia_q.fecha if mejor_dia_q else None
    mejor_dia_total = mejor_dia_q.total if mejor_dia_q else 0

    # Gráfica últimos 7 días
    ultimos_dias = []
    for i in range(6, -1, -1):
        dia = hoy - timedelta(days=i)
        total_dia_q = (
            db.query(func.count(func.distinct(grupo_expr_est)))
            .filter(func.date(RegistroPaquete.fecha_registro) == dia.strftime("%Y-%m-%d"))
        )
        if ent_id:
            total_dia_q = total_dia_q.filter(RegistroPaquete.entorno_trabajo_id == ent_id)
        if sucursal_id:
            total_dia_q = total_dia_q.filter(RegistroPaquete.sucursal_paqueteria_id == sucursal_id)
        total_dia = total_dia_q.scalar() or 0
        ultimos_dias.append(EstadisticasDia(
            fecha=dia.strftime("%Y-%m-%d"),
            dia_semana=DIAS_SEMANA_ES.get(dia.weekday(), ""),
            total=total_dia,
        ))

    # Ranking usuarios del mes (contar piezas = paquetes, no materiales individuales)
    usuarios_mes_q = (
        db.query(
            RegistroPaquete.usuario_id,
            func.count(func.distinct(grupo_expr_est)).label("total"),
        )
        .filter(func.date(RegistroPaquete.fecha_registro) >= inicio_mes.strftime("%Y-%m-%d"))
    )
    if ent_id:
        usuarios_mes_q = usuarios_mes_q.filter(RegistroPaquete.entorno_trabajo_id == ent_id)
    if sucursal_id:
        usuarios_mes_q = usuarios_mes_q.filter(RegistroPaquete.sucursal_paqueteria_id == sucursal_id)
    usuarios_mes = usuarios_mes_q.group_by(RegistroPaquete.usuario_id).order_by(desc("total")).all()

    usuarios_stats = []
    for row in usuarios_mes:
        usr = db.query(Usuario).filter(Usuario.id == row.usuario_id).first()
        if not usr:
            continue
        usuarios_stats.append(EstadisticasUsuario(
            usuario_id=row.usuario_id,
            usuario_email=usr.email,
            usuario_nombre=usr.nombre,
            total=row.total,
            porcentaje=round((row.total / total_mes) * 100, 1) if total_mes > 0 else 0.0,
        ))

    # Cajas más usadas del mes (contar piezas/paquetes distintos)
    cajas_mes_q = (
        db.query(
            func.upper(RegistroPaquete.id_caja).label("id_caja"),
            func.count(func.distinct(grupo_expr_est)).label("total"),
        )
        .filter(func.date(RegistroPaquete.fecha_registro) >= inicio_mes.strftime("%Y-%m-%d"))
    )
    if ent_id:
        cajas_mes_q = cajas_mes_q.filter(RegistroPaquete.entorno_trabajo_id == ent_id)
    if sucursal_id:
        cajas_mes_q = cajas_mes_q.filter(RegistroPaquete.sucursal_paqueteria_id == sucursal_id)
    cajas_mes = cajas_mes_q.group_by(func.upper(RegistroPaquete.id_caja)).order_by(desc("total")).limit(10).all()

    cajas_stats = []
    for row in cajas_mes:
        tipo = db.query(TipoCaja).filter(
            func.upper(TipoCaja.referencia_caja) == row.id_caja
        )
        if ent_id:
            tipo = tipo.filter(TipoCaja.entorno_trabajo_id == ent_id)
        tipo = tipo.first()

        cajas_stats.append(EstadisticasCaja(
            id_caja=row.id_caja,
            tipo_nombre=tipo.tipo_nombre if tipo else None,
            total_piezas=row.total,
            porcentaje=round((row.total / total_mes) * 100, 1) if total_mes > 0 else 0.0,
        ))

    # Desglose por sucursal (solo en vista General, sin filtro de sucursal)
    por_sucursal: list[EstadisticasSucursal] = []
    if not sucursal_id and ent_id:
        sucursales = db.query(SucursalPaqueteria).filter(
            SucursalPaqueteria.entorno_trabajo_id == ent_id,
            SucursalPaqueteria.activa == True,
        ).all()
        for suc in sucursales:
            suc_total_hoy = (
                db.query(func.count(func.distinct(grupo_expr_est)))
                .filter(
                    RegistroPaquete.entorno_trabajo_id == ent_id,
                    RegistroPaquete.sucursal_paqueteria_id == suc.id,
                    func.date(RegistroPaquete.fecha_registro) == hoy.strftime("%Y-%m-%d"),
                ).scalar() or 0
            )
            suc_total_mes = (
                db.query(func.count(func.distinct(grupo_expr_est)))
                .filter(
                    RegistroPaquete.entorno_trabajo_id == ent_id,
                    RegistroPaquete.sucursal_paqueteria_id == suc.id,
                    func.date(RegistroPaquete.fecha_registro) >= inicio_mes.strftime("%Y-%m-%d"),
                ).scalar() or 0
            )
            suc_total_semana = (
                db.query(func.count(func.distinct(grupo_expr_est)))
                .filter(
                    RegistroPaquete.entorno_trabajo_id == ent_id,
                    RegistroPaquete.sucursal_paqueteria_id == suc.id,
                    func.date(RegistroPaquete.fecha_registro) >= inicio_semana.strftime("%Y-%m-%d"),
                ).scalar() or 0
            )
            por_sucursal.append(EstadisticasSucursal(
                sucursal_id=suc.id,
                sucursal_nombre=suc.nombre,
                color_hex=suc.color_hex or "#3B82F6",
                total_hoy=suc_total_hoy,
                total_semana=suc_total_semana,
                total_mes=suc_total_mes,
            ))

    return EstadisticasPaqueteriaResponse(
        total_hoy=total_hoy,
        total_semana=total_semana,
        total_mes=total_mes,
        total_historico=total_historico,
        promedio_diario=promedio_diario,
        dias_trabajados=dias_trabajados,
        mejor_dia_fecha=mejor_dia_fecha,
        mejor_dia_total=mejor_dia_total,
        ultimos_dias=ultimos_dias,
        usuarios=usuarios_stats,
        cajas_top=cajas_stats,
        por_sucursal=por_sucursal,
    )
