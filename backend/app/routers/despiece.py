"""
Router para sistema de despiece de piezas
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date, timedelta

from app.database import get_db
from app.dependencies import get_current_user
from app.models.busqueda import (
    DespiececPieza, Usuario, EntornoTrabajo, PiezaDesguace, BaseDesguace, PiezaVendida
)

import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["despiece"])


# ============== SCHEMAS ==============
class DespieceCreate(BaseModel):
    id_pieza: str
    descripcion: Optional[str] = None
    comentario: Optional[str] = None


class DespieceResponse(BaseModel):
    id: int
    id_pieza: str
    descripcion: Optional[str]
    comentario: Optional[str] = None
    fecha_registro: datetime
    usuario_email: str
    en_stock: bool

    class Config:
        from_attributes = True


class DespieceDetalle(BaseModel):
    id: int
    id_pieza: str
    descripcion: Optional[str]
    comentario: Optional[str] = None
    hora: str
    minutos_desde_anterior: Optional[int]
    color: str
    en_stock: bool
    imagen: Optional[str] = None
    articulo: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None


class ResumenEquipoItem(BaseModel):
    usuario_nombre: Optional[str]
    usuario_email: str
    total_despiece: int


class ResumenEquipoResponse(BaseModel):
    fecha: str
    usuarios: List[ResumenEquipoItem]
    total_general: int


class ResumenUsuarioDia(BaseModel):
    usuario_id: int
    usuario_email: str
    usuario_nombre: Optional[str]
    total_despiece: int
    primera: Optional[str]
    ultima: Optional[str]


class ResumenDiaResponse(BaseModel):
    fecha: str
    usuarios: List[ResumenUsuarioDia]
    total_general: int


class DetalleUsuarioResponse(BaseModel):
    usuario_email: str
    fecha: str
    registros: List[DespieceDetalle]
    total: int


class DatoPeriodo(BaseModel):
    periodo: str
    label: str
    total: int
    dias_trabajados: int
    promedio_diario: float
    mejor_dia: int
    peor_dia: int
    tiempo_promedio_entre_piezas: Optional[float]


class InformeRendimiento(BaseModel):
    usuario_id: int
    usuario_email: str
    usuario_nombre: Optional[str]
    tipo_periodo: str
    periodos: List[DatoPeriodo]
    total: int
    promedio_general: float


class DatoDia(BaseModel):
    fecha: str
    dia_semana: str
    total: int
    primera_hora: Optional[str]
    ultima_hora: Optional[str]
    tiempo_promedio_entre_piezas: Optional[float]


class DetalleSemana(BaseModel):
    usuario_id: int
    usuario_email: str
    usuario_nombre: Optional[str]
    semana: str
    label: str
    fecha_inicio: str
    fecha_fin: str
    dias: List[DatoDia]
    total_semana: int
    promedio_diario: float


class SemanasDisponibles(BaseModel):
    semanas: List[dict]


class DeleteResponse(BaseModel):
    success: bool
    message: str
    id: int


class ActualizarComentarioRequest(BaseModel):
    comentario: Optional[str] = None


class ActualizarComentarioResponse(BaseModel):
    success: bool
    message: str
    id: int
    comentario: Optional[str]


class ActualizarDescripcionRequest(BaseModel):
    descripcion: Optional[str] = None


class ActualizarDescripcionResponse(BaseModel):
    success: bool
    message: str
    id: int
    descripcion: Optional[str]


# ============== HELPERS ==============
def _check_despiece_modulo(usuario: Usuario, db: Session):
    """Verificar que el módulo de despiece está activo para el entorno del usuario"""
    if usuario.rol == "sysowner":
        return
    if not usuario.entorno_trabajo_id:
        raise HTTPException(status_code=403, detail="No tienes entorno asignado")
    entorno = db.query(EntornoTrabajo).filter(EntornoTrabajo.id == usuario.entorno_trabajo_id).first()
    if not entorno:
        raise HTTPException(status_code=403, detail="Entorno no encontrado")
    if hasattr(entorno, 'modulo_despiece') and not entorno.modulo_despiece:
        raise HTTPException(status_code=403, detail="Módulo de despiece no activo para tu empresa")


def _calcular_color_tiempo(minutos: Optional[int]) -> str:
    if minutos is None:
        return "gray"
    if minutos <= 8:
        return "green"
    elif minutos <= 15:
        return "yellow"
    elif minutos <= 30:
        return "orange"
    return "red"


def _verificar_pieza_en_bd(db: Session, entorno_id: int, id_pieza: str) -> bool:
    """Verificar si una pieza existe en stock o fue vendida"""
    base = db.query(BaseDesguace).filter(BaseDesguace.entorno_trabajo_id == entorno_id).first()
    if not base:
        return False
    # En stock actual
    existe = db.query(PiezaDesguace).filter(
        PiezaDesguace.base_desguace_id == base.id,
        func.upper(PiezaDesguace.refid) == id_pieza.strip().upper()
    ).first()
    if existe:
        return True
    # En piezas vendidas
    vendida = db.query(PiezaVendida).filter(
        PiezaVendida.entorno_trabajo_id == entorno_id,
        func.upper(PiezaVendida.refid) == id_pieza.strip().upper()
    ).first()
    return vendida is not None


def _get_datos_pieza(db: Session, entorno_id: int, id_pieza: str) -> dict:
    """Obtener datos de una pieza (imagen, artículo, marca, modelo)"""
    base = db.query(BaseDesguace).filter(BaseDesguace.entorno_trabajo_id == entorno_id).first()
    if not base:
        return {}
    refid_upper = id_pieza.strip().upper()
    pieza = db.query(
        PiezaDesguace.imagen, PiezaDesguace.articulo, PiezaDesguace.marca, PiezaDesguace.modelo
    ).filter(
        PiezaDesguace.base_desguace_id == base.id,
        func.upper(PiezaDesguace.refid) == refid_upper
    ).first()
    if pieza:
        return {'imagen': pieza.imagen, 'articulo': pieza.articulo, 'marca': pieza.marca, 'modelo': pieza.modelo}
    vendida = db.query(
        PiezaVendida.imagen, PiezaVendida.articulo, PiezaVendida.marca, PiezaVendida.modelo
    ).filter(
        PiezaVendida.entorno_trabajo_id == entorno_id,
        func.upper(PiezaVendida.refid) == refid_upper
    ).first()
    if vendida:
        return {'imagen': vendida.imagen, 'articulo': vendida.articulo, 'marca': vendida.marca, 'modelo': vendida.modelo}
    return {}


# ============== ENDPOINTS ==============

@router.get("/resumen-equipo", response_model=ResumenEquipoResponse)
async def obtener_resumen_equipo(
    fecha: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Resumen de despiece del equipo para una fecha"""
    _check_despiece_modulo(current_user, db)

    fecha_filtro = date.today()
    if fecha:
        try:
            fecha_filtro = datetime.strptime(fecha, "%Y-%m-%d").date()
        except ValueError:
            pass

    usuarios_entorno = db.query(Usuario).filter(
        Usuario.entorno_trabajo_id == current_user.entorno_trabajo_id,
        Usuario.activo == True
    ).all()

    resultados = []
    total_general = 0
    for u in usuarios_entorno:
        total = db.query(DespiececPieza).filter(
            DespiececPieza.usuario_id == u.id,
            func.date(DespiececPieza.fecha_registro) == fecha_filtro.strftime("%Y-%m-%d")
        ).count()
        if total > 0:
            resultados.append(ResumenEquipoItem(
                usuario_nombre=u.nombre,
                usuario_email=u.email,
                total_despiece=total
            ))
            total_general += total

    resultados.sort(key=lambda x: x.total_despiece, reverse=True)
    return ResumenEquipoResponse(
        fecha=fecha_filtro.strftime("%Y-%m-%d"),
        usuarios=resultados,
        total_general=total_general
    )


@router.post("/registrar", response_model=DespieceResponse)
async def registrar_despiece(
    datos: DespieceCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Registrar una pieza despiezada"""
    _check_despiece_modulo(current_user, db)

    if not datos.id_pieza.strip():
        raise HTTPException(status_code=400, detail="El ID de pieza no puede estar vacío")

    id_pieza_upper = datos.id_pieza.strip().upper()
    entorno_id = current_user.entorno_trabajo_id

    # Verificar si la pieza ya está en la BD
    en_stock = _verificar_pieza_en_bd(db, entorno_id, id_pieza_upper) if entorno_id else False

    nuevo = DespiececPieza(
        usuario_id=current_user.id,
        entorno_trabajo_id=entorno_id,
        id_pieza=id_pieza_upper,
        descripcion=datos.descripcion,
        comentario=datos.comentario,
        en_stock=en_stock,
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)

    logger.info(f"Despiece: {id_pieza_upper} registrado por {current_user.email} (en_stock={en_stock})")

    return DespieceResponse(
        id=nuevo.id,
        id_pieza=nuevo.id_pieza,
        descripcion=nuevo.descripcion,
        comentario=nuevo.comentario,
        fecha_registro=nuevo.fecha_registro,
        usuario_email=current_user.email,
        en_stock=en_stock,
    )


@router.get("/resumen-dia", response_model=ResumenDiaResponse)
async def obtener_resumen_dia(
    fecha: Optional[str] = None,
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Resumen de despiece por usuario para un día (admin+)"""
    _check_despiece_modulo(current_user, db)

    if current_user.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver esta información")

    target_entorno_id = entorno_id if (entorno_id and current_user.rol == 'sysowner') else current_user.entorno_trabajo_id

    fecha_filtro = date.today()
    if fecha:
        try:
            fecha_filtro = datetime.strptime(fecha, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")

    usuarios_entorno = db.query(Usuario).filter(
        Usuario.entorno_trabajo_id == target_entorno_id,
        Usuario.activo == True
    ).all()

    resultados = []
    total_general = 0
    for u in usuarios_entorno:
        registros = db.query(DespiececPieza).filter(
            DespiececPieza.usuario_id == u.id,
            func.date(DespiececPieza.fecha_registro) == fecha_filtro.strftime("%Y-%m-%d")
        ).order_by(DespiececPieza.fecha_registro).all()

        total = len(registros)
        primera = registros[0].fecha_registro.strftime("%H:%M") if registros else None
        ultima = registros[-1].fecha_registro.strftime("%H:%M") if registros else None

        resultados.append(ResumenUsuarioDia(
            usuario_id=u.id,
            usuario_email=u.email,
            usuario_nombre=u.nombre,
            total_despiece=total,
            primera=primera,
            ultima=ultima
        ))
        total_general += total

    resultados.sort(key=lambda x: x.total_despiece, reverse=True)
    return ResumenDiaResponse(
        fecha=fecha_filtro.strftime("%Y-%m-%d"),
        usuarios=resultados,
        total_general=total_general
    )


@router.get("/detalle-usuario/{usuario_id}", response_model=DetalleUsuarioResponse)
async def obtener_detalle_usuario(
    usuario_id: int,
    fecha: Optional[str] = None,
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Detalle de despiece de un usuario en un día (admin+)"""
    _check_despiece_modulo(current_user, db)

    if current_user.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="No tienes permisos")

    target_entorno_id = entorno_id if (entorno_id and current_user.rol == 'sysowner') else current_user.entorno_trabajo_id

    fecha_filtro = date.today()
    if fecha:
        try:
            fecha_filtro = datetime.strptime(fecha, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha inválido")

    usuario = db.query(Usuario).filter(
        Usuario.id == usuario_id,
        Usuario.entorno_trabajo_id == target_entorno_id
    ).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    registros = db.query(DespiececPieza).filter(
        DespiececPieza.usuario_id == usuario_id,
        func.date(DespiececPieza.fecha_registro) == fecha_filtro.strftime("%Y-%m-%d")
    ).order_by(DespiececPieza.fecha_registro).all()

    if not registros:
        return DetalleUsuarioResponse(
            usuario_email=usuario.email, fecha=fecha_filtro.strftime("%Y-%m-%d"),
            registros=[], total=0
        )

    # Verificar en tiempo real qué piezas están en BD
    refids = set(r.id_pieza.strip().upper() for r in registros)
    piezas_en_bd = set()
    datos_piezas = {}

    base = db.query(BaseDesguace).filter(BaseDesguace.entorno_trabajo_id == target_entorno_id).first()
    if base:
        piezas = db.query(PiezaDesguace.refid, PiezaDesguace.imagen, PiezaDesguace.articulo, PiezaDesguace.marca, PiezaDesguace.modelo).filter(
            PiezaDesguace.base_desguace_id == base.id,
            func.upper(PiezaDesguace.refid).in_(refids)
        ).all()
        for p in piezas:
            if p.refid:
                r = p.refid.strip().upper()
                piezas_en_bd.add(r)
                datos_piezas[r] = {'imagen': p.imagen, 'articulo': p.articulo, 'marca': p.marca, 'modelo': p.modelo}

        vendidas = db.query(PiezaVendida.refid, PiezaVendida.imagen, PiezaVendida.articulo, PiezaVendida.marca, PiezaVendida.modelo).filter(
            PiezaVendida.entorno_trabajo_id == target_entorno_id,
            func.upper(PiezaVendida.refid).in_(refids)
        ).all()
        for p in vendidas:
            if p.refid:
                r = p.refid.strip().upper()
                piezas_en_bd.add(r)
                if r not in datos_piezas:
                    datos_piezas[r] = {'imagen': p.imagen, 'articulo': p.articulo, 'marca': p.marca, 'modelo': p.modelo}

    detalles = []
    anterior = None
    for reg in registros:
        minutos = None
        if anterior:
            minutos = int((reg.fecha_registro - anterior).total_seconds() / 60)
        color = _calcular_color_tiempo(minutos)
        refid_upper = reg.id_pieza.strip().upper()
        en_stock = refid_upper in piezas_en_bd
        datos = datos_piezas.get(refid_upper, {})

        detalles.append(DespieceDetalle(
            id=reg.id, id_pieza=reg.id_pieza,
            descripcion=reg.descripcion, comentario=reg.comentario,
            hora=reg.fecha_registro.strftime("%H:%M:%S"),
            minutos_desde_anterior=minutos, color=color,
            en_stock=en_stock,
            imagen=datos.get('imagen'), articulo=datos.get('articulo'),
            marca=datos.get('marca'), modelo=datos.get('modelo')
        ))
        anterior = reg.fecha_registro

    return DetalleUsuarioResponse(
        usuario_email=usuario.email,
        fecha=fecha_filtro.strftime("%Y-%m-%d"),
        registros=detalles, total=len(detalles)
    )


@router.get("/mis-registros", response_model=List[DespieceResponse])
async def obtener_mis_registros(
    fecha: Optional[str] = None,
    limite: int = 5000,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener mis piezas despiezadas"""
    _check_despiece_modulo(current_user, db)

    query = db.query(DespiececPieza).filter(DespiececPieza.usuario_id == current_user.id)
    if fecha:
        try:
            fecha_filtro = datetime.strptime(fecha, "%Y-%m-%d").date()
            query = query.filter(func.date(DespiececPieza.fecha_registro) == fecha_filtro.strftime("%Y-%m-%d"))
        except ValueError:
            pass

    registros = query.order_by(DespiececPieza.fecha_registro.desc()).limit(limite).all()
    if not registros:
        return []

    # Verificar en tiempo real
    piezas_en_bd = set()
    base = db.query(BaseDesguace).filter(BaseDesguace.entorno_trabajo_id == current_user.entorno_trabajo_id).first()
    if base:
        refids = set(r.id_pieza.strip().upper() for r in registros)
        existentes = db.query(PiezaDesguace.refid).filter(
            PiezaDesguace.base_desguace_id == base.id,
            func.upper(PiezaDesguace.refid).in_(refids)
        ).all()
        piezas_en_bd = set(p.refid.strip().upper() for p in existentes if p.refid)
        vendidas = db.query(PiezaVendida.refid).filter(
            PiezaVendida.entorno_trabajo_id == current_user.entorno_trabajo_id,
            func.upper(PiezaVendida.refid).in_(refids)
        ).all()
        piezas_en_bd.update(p.refid.strip().upper() for p in vendidas if p.refid)

    return [
        DespieceResponse(
            id=r.id, id_pieza=r.id_pieza,
            descripcion=r.descripcion, comentario=r.comentario,
            fecha_registro=r.fecha_registro, usuario_email=current_user.email,
            en_stock=r.id_pieza.strip().upper() in piezas_en_bd
        )
        for r in registros
    ]


@router.delete("/borrar/{registro_id}", response_model=DeleteResponse)
async def borrar_registro(
    registro_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Borrar un registro de despiece"""
    _check_despiece_modulo(current_user, db)

    if current_user.rol == 'sysowner':
        registro = db.query(DespiececPieza).filter(DespiececPieza.id == registro_id).first()
    else:
        registro = db.query(DespiececPieza).filter(
            DespiececPieza.id == registro_id,
            DespiececPieza.entorno_trabajo_id == current_user.entorno_trabajo_id
        ).first()

    if not registro:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    es_admin = current_user.rol in ['admin', 'owner', 'sysowner']
    es_propia = registro.usuario_id == current_user.id
    es_de_hoy = registro.fecha_registro.date() == date.today()

    if not es_admin:
        if not es_propia:
            raise HTTPException(status_code=403, detail="Solo puedes borrar tus propios registros")
        if not es_de_hoy:
            raise HTTPException(status_code=403, detail="Solo puedes borrar registros del día actual")

    db.delete(registro)
    db.commit()

    return DeleteResponse(success=True, message="Registro eliminado", id=registro_id)


@router.patch("/comentario/{registro_id}", response_model=ActualizarComentarioResponse)
async def actualizar_comentario(
    registro_id: int,
    datos: ActualizarComentarioRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Actualizar comentario de un registro de despiece"""
    _check_despiece_modulo(current_user, db)

    if current_user.rol == 'sysowner':
        registro = db.query(DespiececPieza).filter(DespiececPieza.id == registro_id).first()
    else:
        registro = db.query(DespiececPieza).filter(
            DespiececPieza.id == registro_id,
            DespiececPieza.entorno_trabajo_id == current_user.entorno_trabajo_id
        ).first()

    if not registro:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    es_admin = current_user.rol in ['admin', 'owner', 'sysowner']
    if not es_admin and registro.usuario_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permisos")

    registro.comentario = datos.comentario.strip() if datos.comentario else None
    db.commit()

    return ActualizarComentarioResponse(
        success=True, message="Comentario actualizado",
        id=registro_id, comentario=registro.comentario
    )


@router.patch("/descripcion/{registro_id}", response_model=ActualizarDescripcionResponse)
async def actualizar_descripcion(
    registro_id: int,
    datos: ActualizarDescripcionRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Actualizar descripción de un registro de despiece"""
    _check_despiece_modulo(current_user, db)

    if current_user.rol == 'sysowner':
        registro = db.query(DespiececPieza).filter(DespiececPieza.id == registro_id).first()
    else:
        registro = db.query(DespiececPieza).filter(
            DespiececPieza.id == registro_id,
            DespiececPieza.entorno_trabajo_id == current_user.entorno_trabajo_id
        ).first()

    if not registro:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    es_admin = current_user.rol in ['admin', 'owner', 'sysowner']
    if not es_admin and registro.usuario_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permisos")

    registro.descripcion = datos.descripcion.strip() if datos.descripcion else None
    db.commit()

    return ActualizarDescripcionResponse(
        success=True, message="Descripción actualizada",
        id=registro_id, descripcion=registro.descripcion
    )


@router.get("/informe-rendimiento/{usuario_id}", response_model=InformeRendimiento)
async def obtener_informe_rendimiento(
    usuario_id: int,
    tipo: str = "semana",
    cantidad: int = 8,
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Informe de rendimiento de despiece por semanas o meses (admin+)"""
    _check_despiece_modulo(current_user, db)

    if current_user.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="No tienes permisos")

    target_entorno_id = entorno_id if (entorno_id and current_user.rol == 'sysowner') else current_user.entorno_trabajo_id

    usuario = db.query(Usuario).filter(
        Usuario.id == usuario_id,
        Usuario.entorno_trabajo_id == target_entorno_id
    ).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    hoy = date.today()
    periodos = []
    total_general = 0

    if tipo == "semana":
        for i in range(cantidad - 1, -1, -1):
            dias_desde_lunes = hoy.weekday()
            inicio = hoy - timedelta(days=dias_desde_lunes + 7 * i)
            fin = inicio + timedelta(days=6)

            registros = db.query(DespiececPieza).filter(
                DespiececPieza.usuario_id == usuario_id,
                func.date(DespiececPieza.fecha_registro) >= inicio.strftime("%Y-%m-%d"),
                func.date(DespiececPieza.fecha_registro) <= fin.strftime("%Y-%m-%d"),
            ).order_by(DespiececPieza.fecha_registro).all()

            total = len(registros)
            total_general += total

            por_dia = {}
            for r in registros:
                d = r.fecha_registro.date()
                por_dia.setdefault(d, []).append(r)

            dias_trabajados = len(por_dia)
            promedio = total / dias_trabajados if dias_trabajados > 0 else 0
            mejor = max(len(v) for v in por_dia.values()) if por_dia else 0
            peor = min(len(v) for v in por_dia.values()) if por_dia else 0

            tiempos = []
            for dia_regs in por_dia.values():
                for j in range(1, len(dia_regs)):
                    diff = (dia_regs[j].fecha_registro - dia_regs[j-1].fecha_registro).total_seconds() / 60
                    if diff < 120:
                        tiempos.append(diff)
            tiempo_prom = sum(tiempos) / len(tiempos) if tiempos else None

            num_semana = inicio.isocalendar()[1]
            meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
            label = f"Sem {num_semana} ({inicio.day}-{fin.day} {meses[inicio.month-1]})"

            periodos.append(DatoPeriodo(
                periodo=f"{inicio.year}-W{num_semana:02d}", label=label,
                total=total, dias_trabajados=dias_trabajados,
                promedio_diario=round(promedio, 1), mejor_dia=mejor, peor_dia=peor,
                tiempo_promedio_entre_piezas=round(tiempo_prom, 1) if tiempo_prom else None
            ))
    else:
        for i in range(cantidad - 1, -1, -1):
            mes_actual = hoy.month - i
            anio = hoy.year
            while mes_actual <= 0:
                mes_actual += 12
                anio -= 1

            inicio_mes = date(anio, mes_actual, 1)
            fin_mes = date(anio, mes_actual + 1, 1) - timedelta(days=1) if mes_actual < 12 else date(anio + 1, 1, 1) - timedelta(days=1)

            registros = db.query(DespiececPieza).filter(
                DespiececPieza.usuario_id == usuario_id,
                func.date(DespiececPieza.fecha_registro) >= inicio_mes.strftime("%Y-%m-%d"),
                func.date(DespiececPieza.fecha_registro) <= fin_mes.strftime("%Y-%m-%d"),
            ).order_by(DespiececPieza.fecha_registro).all()

            total = len(registros)
            total_general += total

            por_dia = {}
            for r in registros:
                d = r.fecha_registro.date()
                por_dia.setdefault(d, []).append(r)

            dias_trabajados = len(por_dia)
            promedio = total / dias_trabajados if dias_trabajados > 0 else 0
            mejor = max(len(v) for v in por_dia.values()) if por_dia else 0
            peor = min(len(v) for v in por_dia.values()) if por_dia else 0

            tiempos = []
            for dia_regs in por_dia.values():
                for j in range(1, len(dia_regs)):
                    diff = (dia_regs[j].fecha_registro - dia_regs[j-1].fecha_registro).total_seconds() / 60
                    if diff < 120:
                        tiempos.append(diff)
            tiempo_prom = sum(tiempos) / len(tiempos) if tiempos else None

            meses_nombre = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                           'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

            periodos.append(DatoPeriodo(
                periodo=f"{anio}-{mes_actual:02d}", label=f"{meses_nombre[mes_actual-1]} {anio}",
                total=total, dias_trabajados=dias_trabajados,
                promedio_diario=round(promedio, 1), mejor_dia=mejor, peor_dia=peor,
                tiempo_promedio_entre_piezas=round(tiempo_prom, 1) if tiempo_prom else None
            ))

    promedio_general = total_general / len(periodos) if periodos else 0

    return InformeRendimiento(
        usuario_id=usuario.id, usuario_email=usuario.email,
        usuario_nombre=usuario.nombre, tipo_periodo=tipo,
        periodos=periodos, total=total_general,
        promedio_general=round(promedio_general, 1)
    )


@router.get("/semanas-disponibles/{usuario_id}", response_model=SemanasDisponibles)
async def obtener_semanas_disponibles(
    usuario_id: int,
    cantidad: int = 12,
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Semanas disponibles para el selector de informes"""
    _check_despiece_modulo(current_user, db)

    if current_user.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="No tienes permisos")

    hoy = date.today()
    semanas = []
    meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

    for i in range(cantidad):
        dias_desde_lunes = hoy.weekday()
        inicio = hoy - timedelta(days=dias_desde_lunes + 7 * i)
        fin = inicio + timedelta(days=6)
        num_semana = inicio.isocalendar()[1]
        semanas.append({
            "semana": f"{inicio.year}-W{num_semana:02d}",
            "label": f"Sem {num_semana} ({inicio.day}-{fin.day} {meses[inicio.month-1]})",
            "fecha_inicio": inicio.strftime("%Y-%m-%d"),
            "fecha_fin": fin.strftime("%Y-%m-%d")
        })

    return SemanasDisponibles(semanas=semanas)


@router.get("/detalle-semana/{usuario_id}", response_model=DetalleSemana)
async def obtener_detalle_semana(
    usuario_id: int,
    semana: str,
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Detalle de despiece por día para una semana"""
    _check_despiece_modulo(current_user, db)

    if current_user.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="No tienes permisos")

    target_entorno_id = entorno_id if (entorno_id and current_user.rol == 'sysowner') else current_user.entorno_trabajo_id

    usuario = db.query(Usuario).filter(
        Usuario.id == usuario_id,
        Usuario.entorno_trabajo_id == target_entorno_id
    ).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    try:
        if semana.startswith("20") and "-W" in semana:
            año, semana_num = semana.split("-W")
            primer_dia = date(int(año), 1, 1)
            dias_hasta_lunes = (7 - primer_dia.weekday()) % 7
            if primer_dia.weekday() <= 3:
                dias_hasta_lunes = -primer_dia.weekday()
            inicio_semana = primer_dia + timedelta(days=dias_hasta_lunes + (int(semana_num) - 1) * 7)
        else:
            f = datetime.strptime(semana, "%Y-%m-%d").date()
            inicio_semana = f - timedelta(days=f.weekday())
    except:
        hoy = date.today()
        inicio_semana = hoy - timedelta(days=hoy.weekday())

    fin_semana = inicio_semana + timedelta(days=6)

    registros = db.query(DespiececPieza).filter(
        DespiececPieza.usuario_id == usuario_id,
        func.date(DespiececPieza.fecha_registro) >= inicio_semana.strftime("%Y-%m-%d"),
        func.date(DespiececPieza.fecha_registro) <= fin_semana.strftime("%Y-%m-%d"),
    ).order_by(DespiececPieza.fecha_registro).all()

    por_dia = {}
    for r in registros:
        d = r.fecha_registro.date()
        por_dia.setdefault(d, []).append(r)

    dias_semana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
    meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

    dias = []
    for i in range(7):
        dia_fecha = inicio_semana + timedelta(days=i)
        dia_regs = por_dia.get(dia_fecha, [])

        tiempos = []
        for j in range(1, len(dia_regs)):
            diff = (dia_regs[j].fecha_registro - dia_regs[j-1].fecha_registro).total_seconds() / 60
            if diff < 120:
                tiempos.append(diff)
        tiempo_prom = sum(tiempos) / len(tiempos) if tiempos else None

        dias.append(DatoDia(
            fecha=dia_fecha.strftime("%Y-%m-%d"),
            dia_semana=dias_semana[i],
            total=len(dia_regs),
            primera_hora=dia_regs[0].fecha_registro.strftime("%H:%M") if dia_regs else None,
            ultima_hora=dia_regs[-1].fecha_registro.strftime("%H:%M") if dia_regs else None,
            tiempo_promedio_entre_piezas=round(tiempo_prom, 1) if tiempo_prom else None
        ))

    total = len(registros)
    dias_trabajados = len([d for d in dias if d.total > 0])
    promedio = total / dias_trabajados if dias_trabajados > 0 else 0

    num_semana = inicio_semana.isocalendar()[1]
    label = f"Semana {num_semana} ({inicio_semana.day}-{fin_semana.day} {meses[inicio_semana.month-1]} {inicio_semana.year})"

    return DetalleSemana(
        usuario_id=usuario.id, usuario_email=usuario.email,
        usuario_nombre=usuario.nombre,
        semana=f"{inicio_semana.year}-W{num_semana:02d}", label=label,
        fecha_inicio=inicio_semana.strftime("%Y-%m-%d"),
        fecha_fin=fin_semana.strftime("%Y-%m-%d"),
        dias=dias, total_semana=total,
        promedio_diario=round(promedio, 1)
    )
