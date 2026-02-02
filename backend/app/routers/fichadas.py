"""
Router para sistema de fichadas de piezas
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Date, desc
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date, timedelta

from app.database import get_db
from app.dependencies import get_current_user
from app.models.busqueda import FichadaPieza, Usuario, EntornoTrabajo, VerificacionFichada, PiezaDesguace, BaseDesguace
from services.audit import AuditService

router = APIRouter(tags=["fichadas"])


# ============== SCHEMAS ==============
class FichadaCreate(BaseModel):
    id_pieza: str
    descripcion: Optional[str] = None
    comentario: Optional[str] = None


class FichadaResponse(BaseModel):
    id: int
    id_pieza: str
    descripcion: Optional[str]
    comentario: Optional[str] = None
    fecha_fichada: datetime
    usuario_email: str
    
    class Config:
        from_attributes = True


class FichadaDetalle(BaseModel):
    id: int
    id_pieza: str
    descripcion: Optional[str]
    comentario: Optional[str] = None
    hora: str
    minutos_desde_anterior: Optional[int]
    color: str  # green, yellow, orange, red según tiempo
    en_stock: Optional[bool] = None  # None=no verificado, True=entró, False=no entró
    imagen: Optional[str] = None  # URL de imagen de la pieza si está en stock
    articulo: Optional[str] = None  # Tipo de pieza (ej: "Motor", "Faro")
    marca: Optional[str] = None  # Marca del vehículo
    modelo: Optional[str] = None  # Modelo del vehículo


class ResumenUsuarioDia(BaseModel):
    usuario_id: int
    usuario_email: str
    usuario_nombre: Optional[str]
    total_fichadas: int
    primera_fichada: Optional[str]
    ultima_fichada: Optional[str]


class ResumenDiaResponse(BaseModel):
    fecha: str
    usuarios: List[ResumenUsuarioDia]
    total_general: int


class DetalleFichadasUsuario(BaseModel):
    usuario_email: str
    fecha: str
    fichadas: List[FichadaDetalle]
    total: int


class ResumenEquipoItem(BaseModel):
    usuario_nombre: Optional[str]
    usuario_email: str
    total_fichadas: int


class ResumenEquipoResponse(BaseModel):
    fecha: str
    usuarios: List[ResumenEquipoItem]
    total_general: int


# ============== ENDPOINTS ==============
@router.get("/resumen-equipo", response_model=ResumenEquipoResponse)
async def obtener_resumen_equipo(
    fecha: Optional[str] = None,  # Formato: YYYY-MM-DD
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener resumen de fichadas del equipo para una fecha (accesible para todos)"""
    # Parsear fecha o usar hoy
    if fecha:
        try:
            fecha_filtro = datetime.strptime(fecha, "%Y-%m-%d").date()
        except ValueError:
            fecha_filtro = date.today()
    else:
        fecha_filtro = date.today()
    
    # Obtener usuarios del mismo entorno
    usuarios_entorno = db.query(Usuario).filter(
        Usuario.entorno_trabajo_id == current_user.entorno_trabajo_id,
        Usuario.activo == True
    ).all()
    
    resultados = []
    total_general = 0
    
    for usuario in usuarios_entorno:
        # Contar fichadas del usuario en esa fecha
        total = db.query(FichadaPieza).filter(
            FichadaPieza.usuario_id == usuario.id,
            func.date(FichadaPieza.fecha_fichada) == fecha_filtro.strftime("%Y-%m-%d")
        ).count()
        
        # Solo incluir si tiene fichadas
        if total > 0:
            resultados.append(ResumenEquipoItem(
                usuario_nombre=usuario.nombre,
                usuario_email=usuario.email,
                total_fichadas=total
            ))
            total_general += total
    
    # Ordenar por total de fichadas descendente
    resultados.sort(key=lambda x: x.total_fichadas, reverse=True)
    
    return ResumenEquipoResponse(
        fecha=fecha_filtro.strftime("%Y-%m-%d"),
        usuarios=resultados,
        total_general=total_general
    )


@router.post("/registrar", response_model=FichadaResponse)
async def registrar_fichada(
    fichada: FichadaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Registrar una nueva fichada de pieza"""
    if not fichada.id_pieza.strip():
        raise HTTPException(status_code=400, detail="El ID de pieza no puede estar vacío")
    
    nueva_fichada = FichadaPieza(
        usuario_id=current_user.id,
        entorno_trabajo_id=current_user.entorno_trabajo_id,
        id_pieza=fichada.id_pieza.strip().upper(),
        descripcion=fichada.descripcion,
        comentario=fichada.comentario
    )
    
    db.add(nueva_fichada)
    db.commit()
    db.refresh(nueva_fichada)
    
    # Log de auditoría
    AuditService.log_fichada(db, current_user, nueva_fichada.id, nueva_fichada.id_pieza, "CREATE")
    
    return FichadaResponse(
        id=nueva_fichada.id,
        id_pieza=nueva_fichada.id_pieza,
        descripcion=nueva_fichada.descripcion,
        fecha_fichada=nueva_fichada.fecha_fichada,
        usuario_email=current_user.email
    )


@router.get("/resumen-dia", response_model=ResumenDiaResponse)
async def obtener_resumen_dia(
    fecha: Optional[str] = None,  # Formato: YYYY-MM-DD
    entorno_id: Optional[int] = None,  # Solo sysowner puede usar otro entorno
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener resumen de fichadas por usuario para un día (solo admin+)"""
    # Verificar permisos - solo admin, owner o sysowner
    if current_user.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver esta información")
    
    # Determinar el entorno a usar
    if entorno_id and current_user.rol == 'sysowner':
        target_entorno_id = entorno_id
    else:
        target_entorno_id = current_user.entorno_trabajo_id
    
    # Parsear fecha o usar hoy
    if fecha:
        try:
            fecha_filtro = datetime.strptime(fecha, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    else:
        fecha_filtro = date.today()
    
    # Obtener usuarios del entorno objetivo
    usuarios_entorno = db.query(Usuario).filter(
        Usuario.entorno_trabajo_id == target_entorno_id,
        Usuario.activo == True
    ).all()
    
    resultados = []
    total_general = 0
    
    for usuario in usuarios_entorno:
        # Contar fichadas del usuario en esa fecha
        fichadas_query = db.query(FichadaPieza).filter(
            FichadaPieza.usuario_id == usuario.id,
            func.date(FichadaPieza.fecha_fichada) == fecha_filtro.strftime("%Y-%m-%d")
        )
        
        fichadas = fichadas_query.order_by(FichadaPieza.fecha_fichada).all()
        total = len(fichadas)
        
        if total > 0:
            primera = fichadas[0].fecha_fichada.strftime("%H:%M")
            ultima = fichadas[-1].fecha_fichada.strftime("%H:%M")
        else:
            primera = None
            ultima = None
        
        resultados.append(ResumenUsuarioDia(
            usuario_id=usuario.id,
            usuario_email=usuario.email,
            usuario_nombre=usuario.nombre,
            total_fichadas=total,
            primera_fichada=primera,
            ultima_fichada=ultima
        ))
        total_general += total
    
    # Ordenar por total de fichadas descendente
    resultados.sort(key=lambda x: x.total_fichadas, reverse=True)
    
    return ResumenDiaResponse(
        fecha=fecha_filtro.strftime("%Y-%m-%d"),
        usuarios=resultados,
        total_general=total_general
    )


def calcular_color_tiempo(minutos: Optional[int]) -> str:
    """Calcula el color según los minutos transcurridos"""
    if minutos is None:
        return "gray"
    if minutos <= 5:
        return "green"
    elif minutos <= 15:
        return "yellow"
    elif minutos <= 30:
        return "orange"
    else:
        return "red"


@router.get("/detalle-usuario/{usuario_id}", response_model=DetalleFichadasUsuario)
async def obtener_detalle_usuario(
    usuario_id: int,
    fecha: Optional[str] = None,
    entorno_id: Optional[int] = None,  # Solo sysowner puede usar otro entorno
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener detalle de fichadas de un usuario en un día (solo admin+)"""
    # Verificar permisos - solo admin, owner o sysowner
    if current_user.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver esta información")
    
    # Determinar el entorno a usar
    if entorno_id and current_user.rol == 'sysowner':
        target_entorno_id = entorno_id
    else:
        target_entorno_id = current_user.entorno_trabajo_id
    
    # Parsear fecha o usar hoy
    if fecha:
        try:
            fecha_filtro = datetime.strptime(fecha, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    else:
        fecha_filtro = date.today()
    
    # Verificar que el usuario pertenece al entorno objetivo
    usuario = db.query(Usuario).filter(
        Usuario.id == usuario_id,
        Usuario.entorno_trabajo_id == target_entorno_id
    ).first()
    
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado en el entorno seleccionado")
    
    # Obtener fichadas ordenadas por hora
    fichadas = db.query(FichadaPieza).filter(
        FichadaPieza.usuario_id == usuario_id,
        func.date(FichadaPieza.fecha_fichada) == fecha_filtro.strftime("%Y-%m-%d")
    ).order_by(FichadaPieza.fecha_fichada).all()
    
    # Obtener base de datos del entorno para buscar imágenes
    base = db.query(BaseDesguace).filter(
        BaseDesguace.entorno_trabajo_id == target_entorno_id
    ).first()
    
    # Crear diccionario de datos de piezas por refid para búsqueda rápida
    datos_piezas_por_refid = {}
    if base:
        piezas = db.query(PiezaDesguace).filter(
            PiezaDesguace.base_desguace_id == base.id
        ).all()
        for pieza in piezas:
            if pieza.refid:
                datos_piezas_por_refid[pieza.refid.strip().upper()] = {
                    'imagen': pieza.imagen,
                    'articulo': pieza.articulo,
                    'marca': pieza.marca,
                    'modelo': pieza.modelo
                }
    
    detalles = []
    anterior = None
    
    for fichada in fichadas:
        minutos_desde_anterior = None
        if anterior:
            diferencia = fichada.fecha_fichada - anterior
            minutos_desde_anterior = int(diferencia.total_seconds() / 60)
        
        color = calcular_color_tiempo(minutos_desde_anterior)
        
        # Buscar la última verificación de esta fichada
        ultima_verificacion = db.query(VerificacionFichada).filter(
            VerificacionFichada.fichada_id == fichada.id
        ).order_by(desc(VerificacionFichada.fecha_verificacion)).first()
        
        en_stock = ultima_verificacion.en_stock if ultima_verificacion else None
        
        # Buscar datos de la pieza
        imagen_pieza = None
        articulo_pieza = None
        marca_pieza = None
        modelo_pieza = None
        if en_stock:
            refid_upper = fichada.id_pieza.strip().upper()
            datos_pieza = datos_piezas_por_refid.get(refid_upper)
            if datos_pieza:
                imagen_pieza = datos_pieza.get('imagen')
                articulo_pieza = datos_pieza.get('articulo')
                marca_pieza = datos_pieza.get('marca')
                modelo_pieza = datos_pieza.get('modelo')
        
        detalles.append(FichadaDetalle(
            id=fichada.id,
            id_pieza=fichada.id_pieza,
            descripcion=fichada.descripcion,
            comentario=fichada.comentario,
            hora=fichada.fecha_fichada.strftime("%H:%M:%S"),
            minutos_desde_anterior=minutos_desde_anterior,
            color=color,
            en_stock=en_stock,
            imagen=imagen_pieza,
            articulo=articulo_pieza,
            marca=marca_pieza,
            modelo=modelo_pieza
        ))
        
        anterior = fichada.fecha_fichada
    
    return DetalleFichadasUsuario(
        usuario_email=usuario.email,
        fecha=fecha_filtro.strftime("%Y-%m-%d"),
        fichadas=detalles,
        total=len(detalles)
    )


@router.get("/mis-fichadas", response_model=List[FichadaResponse])
async def obtener_mis_fichadas(
    fecha: Optional[str] = None,
    limite: int = 50,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener mis fichadas del día"""
    query = db.query(FichadaPieza).filter(
        FichadaPieza.usuario_id == current_user.id
    )
    
    if fecha:
        try:
            fecha_filtro = datetime.strptime(fecha, "%Y-%m-%d").date()
            query = query.filter(func.date(FichadaPieza.fecha_fichada) == fecha_filtro.strftime("%Y-%m-%d"))
        except ValueError:
            pass
    
    fichadas = query.order_by(FichadaPieza.fecha_fichada.desc()).limit(limite).all()
    
    return [
        FichadaResponse(
            id=f.id,
            id_pieza=f.id_pieza,
            descripcion=f.descripcion,
            comentario=f.comentario,
            fecha_fichada=f.fecha_fichada,
            usuario_email=current_user.email
        )
        for f in fichadas
    ]


# ============== BORRAR FICHADAS ==============
class DeleteFichadaResponse(BaseModel):
    success: bool
    message: str
    id: int


@router.delete("/borrar/{fichada_id}", response_model=DeleteFichadaResponse)
async def borrar_fichada(
    fichada_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Borrar una fichada.
    - Sysowner puede borrar fichadas de cualquier entorno
    - Admin, owner pueden borrar cualquier fichada de su entorno
    - Usuarios normales solo pueden borrar sus propias fichadas del día actual
    """
    # Buscar la fichada (sysowner puede ver cualquier entorno)
    if current_user.rol == 'sysowner':
        fichada = db.query(FichadaPieza).filter(
            FichadaPieza.id == fichada_id
        ).first()
    else:
        fichada = db.query(FichadaPieza).filter(
            FichadaPieza.id == fichada_id,
            FichadaPieza.entorno_trabajo_id == current_user.entorno_trabajo_id
        ).first()
    
    if not fichada:
        raise HTTPException(status_code=404, detail="Fichada no encontrada")
    
    # Verificar permisos
    es_admin = current_user.rol in ['admin', 'owner', 'sysowner']
    es_propia = fichada.usuario_id == current_user.id
    es_de_hoy = fichada.fecha_fichada.date() == date.today()
    
    if not es_admin:
        # Usuarios normales solo pueden borrar sus propias fichadas del día
        if not es_propia:
            raise HTTPException(status_code=403, detail="Solo puedes borrar tus propias fichadas")
        if not es_de_hoy:
            raise HTTPException(status_code=403, detail="Solo puedes borrar fichadas del día actual")
    
    # Primero borrar las verificaciones asociadas
    db.query(VerificacionFichada).filter(
        VerificacionFichada.fichada_id == fichada_id
    ).delete()
    
    # Guardar datos antes de borrar para auditoría
    fichada_id_pieza = fichada.id_pieza
    
    # Borrar la fichada
    db.delete(fichada)
    db.commit()
    
    # Log de auditoría
    AuditService.log_fichada(db, current_user, fichada_id, fichada_id_pieza, "DELETE")
    
    return DeleteFichadaResponse(
        success=True,
        message="Fichada eliminada correctamente",
        id=fichada_id
    )


# ============== ACTUALIZAR DESCRIPCIÓN ==============
class ActualizarDescripcionRequest(BaseModel):
    descripcion: Optional[str] = None


class ActualizarDescripcionResponse(BaseModel):
    success: bool
    message: str
    id: int
    descripcion: Optional[str]


@router.patch("/descripcion/{fichada_id}", response_model=ActualizarDescripcionResponse)
async def actualizar_descripcion(
    fichada_id: int,
    datos: ActualizarDescripcionRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Actualizar la descripción de una fichada.
    - Cualquier usuario puede editar descripción de sus propias fichadas
    - Admin+ puede editar descripción de cualquier fichada de su entorno
    - Sysowner puede editar cualquier fichada
    """
    # Buscar la fichada
    if current_user.rol == 'sysowner':
        fichada = db.query(FichadaPieza).filter(
            FichadaPieza.id == fichada_id
        ).first()
    else:
        fichada = db.query(FichadaPieza).filter(
            FichadaPieza.id == fichada_id,
            FichadaPieza.entorno_trabajo_id == current_user.entorno_trabajo_id
        ).first()
    
    if not fichada:
        raise HTTPException(status_code=404, detail="Fichada no encontrada")
    
    # Verificar permisos
    es_admin = current_user.rol in ['admin', 'owner', 'sysowner']
    es_propia = fichada.usuario_id == current_user.id
    
    if not es_admin and not es_propia:
        raise HTTPException(status_code=403, detail="No tienes permisos para editar esta fichada")
    
    # Actualizar descripción
    fichada.descripcion = datos.descripcion.strip() if datos.descripcion else None
    db.commit()
    
    return ActualizarDescripcionResponse(
        success=True,
        message="Descripción actualizada",
        id=fichada_id,
        descripcion=fichada.descripcion
    )


# ============== ACTUALIZAR COMENTARIO ==============
class ActualizarComentarioRequest(BaseModel):
    comentario: Optional[str] = None


class ActualizarComentarioResponse(BaseModel):
    success: bool
    message: str
    id: int
    comentario: Optional[str]


@router.patch("/comentario/{fichada_id}", response_model=ActualizarComentarioResponse)
async def actualizar_comentario(
    fichada_id: int,
    datos: ActualizarComentarioRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Actualizar el comentario de una fichada.
    - Cualquier usuario puede añadir/editar comentario en sus propias fichadas
    - Admin+ puede editar comentarios de cualquier fichada de su entorno
    - Sysowner puede editar cualquier fichada
    """
    # Buscar la fichada
    if current_user.rol == 'sysowner':
        fichada = db.query(FichadaPieza).filter(
            FichadaPieza.id == fichada_id
        ).first()
    else:
        fichada = db.query(FichadaPieza).filter(
            FichadaPieza.id == fichada_id,
            FichadaPieza.entorno_trabajo_id == current_user.entorno_trabajo_id
        ).first()
    
    if not fichada:
        raise HTTPException(status_code=404, detail="Fichada no encontrada")
    
    # Verificar permisos
    es_admin = current_user.rol in ['admin', 'owner', 'sysowner']
    es_propia = fichada.usuario_id == current_user.id
    
    if not es_admin and not es_propia:
        raise HTTPException(status_code=403, detail="No tienes permisos para editar esta fichada")
    
    # Actualizar comentario
    fichada.comentario = datos.comentario.strip() if datos.comentario else None
    db.commit()
    
    return ActualizarComentarioResponse(
        success=True,
        message="Comentario actualizado",
        id=fichada_id,
        comentario=fichada.comentario
    )


# ============== HISTORIAL DE VERIFICACIONES ==============
class VerificacionResponse(BaseModel):
    id: int
    id_pieza: str
    hora_fichada: datetime
    en_stock: bool
    fecha_verificacion: datetime
    usuario_email: str
    
    class Config:
        from_attributes = True


class HistorialVerificacionesUsuario(BaseModel):
    usuario_id: int
    usuario_email: str
    verificaciones: List[VerificacionResponse]
    total: int
    encontradas: int
    no_encontradas: int


@router.get("/verificaciones/{usuario_id}", response_model=HistorialVerificacionesUsuario)
async def obtener_verificaciones_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener historial de verificaciones de un usuario (solo admin+)"""
    if current_user.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver esta información")
    
    # Verificar que el usuario pertenece al mismo entorno
    usuario = db.query(Usuario).filter(
        Usuario.id == usuario_id,
        Usuario.entorno_trabajo_id == current_user.entorno_trabajo_id
    ).first()
    
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado en tu entorno")
    
    # Obtener verificaciones ordenadas por fecha
    verificaciones = db.query(VerificacionFichada).filter(
        VerificacionFichada.usuario_id == usuario_id
    ).order_by(desc(VerificacionFichada.fecha_verificacion)).all()
    
    encontradas = sum(1 for v in verificaciones if v.en_stock)
    no_encontradas = len(verificaciones) - encontradas
    
    return HistorialVerificacionesUsuario(
        usuario_id=usuario.id,
        usuario_email=usuario.email,
        verificaciones=[
            VerificacionResponse(
                id=v.id,
                id_pieza=v.id_pieza,
                hora_fichada=v.hora_fichada,
                en_stock=v.en_stock,
                fecha_verificacion=v.fecha_verificacion,
                usuario_email=usuario.email
            )
            for v in verificaciones
        ],
        total=len(verificaciones),
        encontradas=encontradas,
        no_encontradas=no_encontradas
    )


# ============== INFORME DE RENDIMIENTO ==============
class DatoPeriodo(BaseModel):
    periodo: str  # "2026-W03" para semana o "2026-01" para mes
    label: str    # "Sem 3 (13-19 Ene)" o "Enero 2026"
    total_fichadas: int
    dias_trabajados: int
    promedio_diario: float
    mejor_dia: int
    peor_dia: int
    tiempo_promedio_entre_piezas: Optional[float]  # en minutos


class InformeRendimiento(BaseModel):
    usuario_id: int
    usuario_email: str
    usuario_nombre: Optional[str]
    tipo_periodo: str  # "semana" o "mes"
    periodos: List[DatoPeriodo]
    total_fichadas: int
    promedio_general: float


@router.get("/informe-rendimiento/{usuario_id}", response_model=InformeRendimiento)
async def obtener_informe_rendimiento(
    usuario_id: int,
    tipo: str = "semana",  # "semana" o "mes"
    cantidad: int = 8,      # últimas N semanas/meses
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Obtener informe de rendimiento de un usuario por semanas o meses.
    Solo admin+ puede ver informes de otros usuarios.
    """
    # Verificar permisos
    if current_user.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver informes")
    
    # Determinar entorno
    if entorno_id and current_user.rol == 'sysowner':
        target_entorno_id = entorno_id
    else:
        target_entorno_id = current_user.entorno_trabajo_id
    
    # Verificar usuario
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
        # Últimas N semanas
        for i in range(cantidad - 1, -1, -1):
            # Calcular inicio de semana (lunes)
            dias_desde_lunes = hoy.weekday()
            inicio_semana = hoy - timedelta(days=dias_desde_lunes + 7 * i)
            fin_semana = inicio_semana + timedelta(days=6)
            
            # Obtener fichadas de esa semana
            fichadas = db.query(FichadaPieza).filter(
                FichadaPieza.usuario_id == usuario_id,
                func.date(FichadaPieza.fecha_fichada) >= inicio_semana.strftime("%Y-%m-%d"),
                func.date(FichadaPieza.fecha_fichada) <= fin_semana.strftime("%Y-%m-%d")
            ).order_by(FichadaPieza.fecha_fichada).all()
            
            # Calcular estadísticas
            total = len(fichadas)
            total_general += total
            
            # Fichadas por día
            fichadas_por_dia = {}
            for f in fichadas:
                dia = f.fecha_fichada.date()
                if dia not in fichadas_por_dia:
                    fichadas_por_dia[dia] = []
                fichadas_por_dia[dia].append(f)
            
            dias_trabajados = len(fichadas_por_dia)
            promedio = total / dias_trabajados if dias_trabajados > 0 else 0
            mejor = max(len(v) for v in fichadas_por_dia.values()) if fichadas_por_dia else 0
            peor = min(len(v) for v in fichadas_por_dia.values()) if fichadas_por_dia else 0
            
            # Tiempo promedio entre piezas
            tiempos = []
            for dia_fichadas in fichadas_por_dia.values():
                for j in range(1, len(dia_fichadas)):
                    diff = (dia_fichadas[j].fecha_fichada - dia_fichadas[j-1].fecha_fichada).total_seconds() / 60
                    if diff < 120:  # Ignorar pausas largas (>2h)
                        tiempos.append(diff)
            tiempo_promedio = sum(tiempos) / len(tiempos) if tiempos else None
            
            # Formato label
            num_semana = inicio_semana.isocalendar()[1]
            meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
            label = f"Sem {num_semana} ({inicio_semana.day}-{fin_semana.day} {meses[inicio_semana.month-1]})"
            
            periodos.append(DatoPeriodo(
                periodo=f"{inicio_semana.year}-W{num_semana:02d}",
                label=label,
                total_fichadas=total,
                dias_trabajados=dias_trabajados,
                promedio_diario=round(promedio, 1),
                mejor_dia=mejor,
                peor_dia=peor,
                tiempo_promedio_entre_piezas=round(tiempo_promedio, 1) if tiempo_promedio else None
            ))
    
    else:  # mes
        # Últimos N meses
        for i in range(cantidad - 1, -1, -1):
            # Calcular mes
            mes_actual = hoy.month - i
            anio = hoy.year
            while mes_actual <= 0:
                mes_actual += 12
                anio -= 1
            
            # Primer y último día del mes
            inicio_mes = date(anio, mes_actual, 1)
            if mes_actual == 12:
                fin_mes = date(anio + 1, 1, 1) - timedelta(days=1)
            else:
                fin_mes = date(anio, mes_actual + 1, 1) - timedelta(days=1)
            
            # Obtener fichadas del mes
            fichadas = db.query(FichadaPieza).filter(
                FichadaPieza.usuario_id == usuario_id,
                func.date(FichadaPieza.fecha_fichada) >= inicio_mes.strftime("%Y-%m-%d"),
                func.date(FichadaPieza.fecha_fichada) <= fin_mes.strftime("%Y-%m-%d")
            ).order_by(FichadaPieza.fecha_fichada).all()
            
            # Calcular estadísticas
            total = len(fichadas)
            total_general += total
            
            fichadas_por_dia = {}
            for f in fichadas:
                dia = f.fecha_fichada.date()
                if dia not in fichadas_por_dia:
                    fichadas_por_dia[dia] = []
                fichadas_por_dia[dia].append(f)
            
            dias_trabajados = len(fichadas_por_dia)
            promedio = total / dias_trabajados if dias_trabajados > 0 else 0
            mejor = max(len(v) for v in fichadas_por_dia.values()) if fichadas_por_dia else 0
            peor = min(len(v) for v in fichadas_por_dia.values()) if fichadas_por_dia else 0
            
            # Tiempo promedio
            tiempos = []
            for dia_fichadas in fichadas_por_dia.values():
                for j in range(1, len(dia_fichadas)):
                    diff = (dia_fichadas[j].fecha_fichada - dia_fichadas[j-1].fecha_fichada).total_seconds() / 60
                    if diff < 120:
                        tiempos.append(diff)
            tiempo_promedio = sum(tiempos) / len(tiempos) if tiempos else None
            
            meses_nombre = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                           'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
            
            periodos.append(DatoPeriodo(
                periodo=f"{anio}-{mes_actual:02d}",
                label=f"{meses_nombre[mes_actual-1]} {anio}",
                total_fichadas=total,
                dias_trabajados=dias_trabajados,
                promedio_diario=round(promedio, 1),
                mejor_dia=mejor,
                peor_dia=peor,
                tiempo_promedio_entre_piezas=round(tiempo_promedio, 1) if tiempo_promedio else None
            ))
    
    promedio_general = total_general / len(periodos) if periodos else 0
    
    return InformeRendimiento(
        usuario_id=usuario.id,
        usuario_email=usuario.email,
        usuario_nombre=usuario.nombre,
        tipo_periodo=tipo,
        periodos=periodos,
        total_fichadas=total_general,
        promedio_general=round(promedio_general, 1)
    )


# ============== DETALLE SEMANAL POR DÍAS ==============
class DatoDia(BaseModel):
    fecha: str  # "2026-01-20"
    dia_semana: str  # "Lunes", "Martes", etc.
    total_fichadas: int
    primera_hora: Optional[str]
    ultima_hora: Optional[str]
    tiempo_promedio_entre_piezas: Optional[float]


class DetalleSemana(BaseModel):
    usuario_id: int
    usuario_email: str
    usuario_nombre: Optional[str]
    semana: str  # "2026-W04"
    label: str   # "Semana 4 (20-26 Ene 2026)"
    fecha_inicio: str
    fecha_fin: str
    dias: List[DatoDia]
    total_semana: int
    promedio_diario: float


class SemanasDisponibles(BaseModel):
    semanas: List[dict]  # [{semana: "2026-W04", label: "Sem 4 (20-26 Ene)"}]


@router.get("/semanas-disponibles/{usuario_id}", response_model=SemanasDisponibles)
async def obtener_semanas_disponibles(
    usuario_id: int,
    cantidad: int = 12,
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener lista de semanas disponibles para el selector"""
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
    semana: str,  # Formato: "2026-W04" o fecha "2026-01-20"
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener detalle de fichadas por día para una semana específica"""
    if current_user.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="No tienes permisos")
    
    # Determinar entorno
    if entorno_id and current_user.rol == 'sysowner':
        target_entorno_id = entorno_id
    else:
        target_entorno_id = current_user.entorno_trabajo_id
    
    # Verificar usuario
    usuario = db.query(Usuario).filter(
        Usuario.id == usuario_id,
        Usuario.entorno_trabajo_id == target_entorno_id
    ).first()
    
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Parsear semana
    try:
        if semana.startswith("20") and "-W" in semana:
            # Formato ISO week: 2026-W04
            año, semana_num = semana.split("-W")
            # Calcular primer día de esa semana (lunes)
            primer_dia_año = date(int(año), 1, 1)
            dias_hasta_lunes = (7 - primer_dia_año.weekday()) % 7
            if primer_dia_año.weekday() <= 3:  # Si el 1 de enero es lun-jue
                dias_hasta_lunes = -primer_dia_año.weekday()
            inicio_semana = primer_dia_año + timedelta(days=dias_hasta_lunes + (int(semana_num) - 1) * 7)
        else:
            # Formato fecha: 2026-01-20
            fecha = datetime.strptime(semana, "%Y-%m-%d").date()
            inicio_semana = fecha - timedelta(days=fecha.weekday())
    except:
        # Default: semana actual
        hoy = date.today()
        inicio_semana = hoy - timedelta(days=hoy.weekday())
    
    fin_semana = inicio_semana + timedelta(days=6)
    
    # Obtener fichadas de la semana
    fichadas = db.query(FichadaPieza).filter(
        FichadaPieza.usuario_id == usuario_id,
        func.date(FichadaPieza.fecha_fichada) >= inicio_semana.strftime("%Y-%m-%d"),
        func.date(FichadaPieza.fecha_fichada) <= fin_semana.strftime("%Y-%m-%d")
    ).order_by(FichadaPieza.fecha_fichada).all()
    
    # Agrupar por día
    fichadas_por_dia = {}
    for f in fichadas:
        dia = f.fecha_fichada.date()
        if dia not in fichadas_por_dia:
            fichadas_por_dia[dia] = []
        fichadas_por_dia[dia].append(f)
    
    # Crear datos para cada día de la semana
    dias_semana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
    meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    
    dias = []
    for i in range(7):
        dia_fecha = inicio_semana + timedelta(days=i)
        fichadas_dia = fichadas_por_dia.get(dia_fecha, [])
        
        # Calcular tiempo promedio
        tiempos = []
        for j in range(1, len(fichadas_dia)):
            diff = (fichadas_dia[j].fecha_fichada - fichadas_dia[j-1].fecha_fichada).total_seconds() / 60
            if diff < 120:
                tiempos.append(diff)
        tiempo_prom = sum(tiempos) / len(tiempos) if tiempos else None
        
        dias.append(DatoDia(
            fecha=dia_fecha.strftime("%Y-%m-%d"),
            dia_semana=dias_semana[i],
            total_fichadas=len(fichadas_dia),
            primera_hora=fichadas_dia[0].fecha_fichada.strftime("%H:%M") if fichadas_dia else None,
            ultima_hora=fichadas_dia[-1].fecha_fichada.strftime("%H:%M") if fichadas_dia else None,
            tiempo_promedio_entre_piezas=round(tiempo_prom, 1) if tiempo_prom else None
        ))
    
    total = len(fichadas)
    dias_trabajados = len([d for d in dias if d.total_fichadas > 0])
    promedio = total / dias_trabajados if dias_trabajados > 0 else 0
    
    num_semana = inicio_semana.isocalendar()[1]
    label = f"Semana {num_semana} ({inicio_semana.day}-{fin_semana.day} {meses[inicio_semana.month-1]} {inicio_semana.year})"
    
    return DetalleSemana(
        usuario_id=usuario.id,
        usuario_email=usuario.email,
        usuario_nombre=usuario.nombre,
        semana=f"{inicio_semana.year}-W{num_semana:02d}",
        label=label,
        fecha_inicio=inicio_semana.strftime("%Y-%m-%d"),
        fecha_fin=fin_semana.strftime("%Y-%m-%d"),
        dias=dias,
        total_semana=total,
        promedio_diario=round(promedio, 1)
    )