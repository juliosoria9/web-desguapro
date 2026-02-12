"""
Router para administración del sistema (auditoría y backups)
Solo accesible por admin+
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel

from app.database import get_db
from app.dependencies import get_current_user
from app.models.busqueda import Usuario, AuditLog, BackupRecord
from services.audit import AuditService
from services.backup import BackupService
from services.scheduler import obtener_estado_scheduler, forzar_backup_ahora, forzar_importacion_csv_ahora, forzar_limpieza_ventas_ahora

router = APIRouter(prefix="/admin", tags=["admin"])


# ============== SCHEMAS ==============
class AuditLogResponse(BaseModel):
    id: int
    usuario_email: Optional[str]
    accion: str
    entidad: str
    descripcion: str
    ip_address: Optional[str]
    fecha: datetime
    
    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    logs: List[AuditLogResponse]
    total: int
    pagina: int
    por_pagina: int


class BackupResponse(BaseModel):
    id: int
    filename: str
    size_mb: float
    tipo: str
    exitoso: bool
    mensaje: Optional[str]
    fecha: Optional[str]
    existe: bool


class BackupListResponse(BaseModel):
    backups: List[BackupResponse]
    estadisticas: dict


class CrearBackupResponse(BaseModel):
    success: bool
    filename: Optional[str] = None
    size_mb: Optional[float] = None
    error: Optional[str] = None


# ============== ENDPOINTS AUDITORÍA ==============
@router.get("/audit-logs", response_model=AuditLogListResponse)
async def obtener_logs_auditoria(
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(50, ge=10, le=200),
    accion: Optional[str] = None,
    entidad: Optional[str] = None,
    usuario_id: Optional[int] = None,
    desde: Optional[str] = None,  # YYYY-MM-DD
    hasta: Optional[str] = None,  # YYYY-MM-DD
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Obtener logs de auditoría con filtros y paginación.
    Solo admin+ puede acceder.
    """
    if current_user.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="No tienes permisos")
    
    # Query base
    query = db.query(AuditLog)
    
    # Sysowner ve todo, otros solo su entorno
    if current_user.rol != 'sysowner':
        query = query.filter(AuditLog.entorno_trabajo_id == current_user.entorno_trabajo_id)
    
    # Filtros
    if accion:
        query = query.filter(AuditLog.accion == accion.upper())
    if entidad:
        query = query.filter(AuditLog.entidad == entidad.lower())
    if usuario_id:
        query = query.filter(AuditLog.usuario_id == usuario_id)
    if desde:
        try:
            fecha_desde = datetime.strptime(desde, "%Y-%m-%d")
            query = query.filter(AuditLog.fecha >= fecha_desde)
        except:
            pass
    if hasta:
        try:
            fecha_hasta = datetime.strptime(hasta, "%Y-%m-%d") + timedelta(days=1)
            query = query.filter(AuditLog.fecha < fecha_hasta)
        except:
            pass
    
    # Total
    total = query.count()
    
    # Paginación
    offset = (pagina - 1) * por_pagina
    logs = query.order_by(desc(AuditLog.fecha)).offset(offset).limit(por_pagina).all()
    
    # Formatear respuesta
    logs_response = []
    for log in logs:
        usuario_email = None
        if log.usuario:
            usuario_email = log.usuario.email
        
        logs_response.append(AuditLogResponse(
            id=log.id,
            usuario_email=usuario_email,
            accion=log.accion,
            entidad=log.entidad,
            descripcion=log.descripcion,
            ip_address=log.ip_address,
            fecha=log.fecha
        ))
    
    return AuditLogListResponse(
        logs=logs_response,
        total=total,
        pagina=pagina,
        por_pagina=por_pagina
    )


@router.get("/audit-logs/acciones")
async def obtener_acciones_disponibles(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener lista de acciones únicas para filtrar"""
    if current_user.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="No tienes permisos")
    
    acciones = db.query(AuditLog.accion).distinct().all()
    entidades = db.query(AuditLog.entidad).distinct().all()
    
    return {
        "acciones": sorted([a[0] for a in acciones if a[0]]),
        "entidades": sorted([e[0] for e in entidades if e[0]])
    }


# ============== ENDPOINTS BACKUP ==============
@router.get("/backups", response_model=BackupListResponse)
async def listar_backups(
    limite: int = Query(20, ge=5, le=100),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Listar backups disponibles.
    Solo owner+ puede acceder.
    """
    if current_user.rol not in ['owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="Solo owner puede gestionar backups")
    
    backups = BackupService.listar_backups(db, limite)
    estadisticas = BackupService.obtener_estadisticas(db)
    
    return BackupListResponse(
        backups=[BackupResponse(**b) for b in backups],
        estadisticas=estadisticas
    )


@router.post("/backups/crear", response_model=CrearBackupResponse)
async def crear_backup(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Crear un backup manual de la base de datos.
    Solo owner+ puede crear backups.
    """
    if current_user.rol not in ['owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="Solo owner puede crear backups")
    
    resultado = BackupService.crear_backup(db, current_user, tipo="manual")
    
    # Registrar en auditoría
    AuditService.log_backup(
        db=db,
        usuario=current_user,
        filename=resultado.get("filename", "error"),
        exitoso=resultado.get("success", False),
        mensaje=resultado.get("error")
    )
    
    if resultado.get("success"):
        return CrearBackupResponse(
            success=True,
            filename=resultado["filename"],
            size_mb=resultado["size_mb"]
        )
    else:
        return CrearBackupResponse(
            success=False,
            error=resultado.get("error", "Error desconocido")
        )


@router.post("/backups/restaurar/{backup_id}")
async def restaurar_backup(
    backup_id: int,
    confirmar: bool = False,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Restaurar un backup. PELIGROSO - requiere confirmación.
    Solo sysowner puede restaurar.
    """
    if current_user.rol != 'sysowner':
        raise HTTPException(status_code=403, detail="Solo sysowner puede restaurar backups")
    
    if not confirmar:
        return {
            "warning": "Esta acción es irreversible. Se creará un backup de seguridad antes.",
            "accion_requerida": "Enviar confirmar=true para proceder"
        }
    
    resultado = BackupService.restaurar_backup(db, backup_id, current_user)
    
    AuditService.log(
        db=db,
        accion="RESTORE" if resultado.get("success") else "RESTORE_FAILED",
        entidad="sistema",
        descripcion=f"Restauración de backup #{backup_id}",
        usuario=current_user,
        datos_adicionales=resultado
    )
    
    return resultado


@router.get("/backups/estadisticas")
async def estadisticas_backups(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener estadísticas de backups"""
    if current_user.rol not in ['owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="Solo owner puede ver estadísticas")
    
    return BackupService.obtener_estadisticas(db)


@router.get("/scheduler/estado")
async def estado_scheduler(
    current_user: Usuario = Depends(get_current_user)
):
    """
    Ver estado del scheduler de backups automáticos.
    Solo admin+ puede ver.
    """
    if current_user.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    
    return obtener_estado_scheduler()


@router.post("/scheduler/forzar-backup")
async def forzar_backup_scheduler(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Forzar ejecución inmediata de un backup programado.
    Solo owner+ puede ejecutar.
    """
    if current_user.rol not in ['owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="Solo owner puede forzar backups")
    
    # Ejecutar backup programado
    forzar_backup_ahora()
    
    AuditService.log(
        db=db,
        accion="BACKUP_FORZADO",
        entidad="sistema",
        descripcion="Backup forzado manualmente",
        usuario=current_user
    )
    
    return {"success": True, "message": "Backup programado ejecutado"}


# ============== IMPORTACIÓN AUTOMÁTICA CSV ==============
@router.post("/importar-csv-motocoche")
def importar_csv_motocoche_ahora(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Forzar importación inmediata del CSV de MotoCoche.
    Solo admin+ puede ejecutar.
    """
    if current_user.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="Solo admin puede forzar importación")
    
    resultado = forzar_importacion_csv_ahora()
    
    AuditService.log(
        db=db,
        accion="IMPORTACION_CSV_FORZADA",
        entidad="csv_motocoche",
        descripcion=f"Importación CSV forzada: {resultado.get('piezas_importadas', 0)} nuevas, {resultado.get('piezas_vendidas', 0)} vendidas",
        usuario=current_user
    )
    
    return resultado


@router.post("/limpiar-ventas-falsas")
def limpiar_ventas_falsas_ahora(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Forzar limpieza inmediata de ventas falsas.
    Elimina piezas marcadas como vendidas que todavía existen en stock.
    Solo admin+ puede ejecutar.
    """
    if current_user.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="Solo admin puede ejecutar limpieza")
    
    resultado = forzar_limpieza_ventas_ahora()
    
    AuditService.log(
        db=db,
        accion="LIMPIEZA_VENTAS_FALSAS",
        entidad="piezas_vendidas",
        descripcion=f"Limpieza ventas falsas: {resultado.get('piezas_eliminadas', 0)} eliminadas",
        usuario=current_user
    )
    
    return resultado


# ============== API REQUEST LOGS ==============
from app.models.busqueda import APIRequestLog, EntornoTrabajo
from fastapi.responses import StreamingResponse
import asyncio
import json as json_lib


class APILogResponse(BaseModel):
    id: int
    metodo: str
    ruta: str
    status_code: int
    duracion_ms: float
    usuario_email: Optional[str]
    entorno_nombre: Optional[str]
    rol: Optional[str]
    ip_address: Optional[str]
    fecha: datetime
    
    class Config:
        from_attributes = True


class APIStatsResponse(BaseModel):
    total_peticiones: int
    peticiones_hoy: int
    peticiones_ultima_hora: int
    tiempo_respuesta_medio: float
    errores_hoy: int  # status >= 400
    por_entorno: List[dict]
    por_ruta: List[dict]
    por_usuario: List[dict]
    por_hora: List[dict]


@router.get("/api-logs")
async def obtener_api_logs(
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(100, ge=10, le=500),
    entorno_id: Optional[int] = None,
    usuario_email: Optional[str] = None,
    ruta: Optional[str] = None,
    metodo: Optional[str] = None,
    status_min: Optional[int] = None,
    status_max: Optional[int] = None,
    desde: Optional[str] = None,  # YYYY-MM-DD HH:MM
    hasta: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Obtener logs de peticiones API con filtros y paginación.
    Sysowner ve todo, otros solo su entorno.
    """
    if current_user.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="No tienes permisos")
    
    query = db.query(APIRequestLog)
    
    # Sysowner ve todo, otros solo su entorno
    if current_user.rol != 'sysowner':
        query = query.filter(APIRequestLog.entorno_trabajo_id == current_user.entorno_trabajo_id)
    elif entorno_id:
        query = query.filter(APIRequestLog.entorno_trabajo_id == entorno_id)
    
    # Filtros adicionales
    if usuario_email:
        query = query.filter(APIRequestLog.usuario_email.ilike(f"%{usuario_email}%"))
    if ruta:
        query = query.filter(APIRequestLog.ruta.ilike(f"%{ruta}%"))
    if metodo:
        query = query.filter(APIRequestLog.metodo == metodo.upper())
    if status_min:
        query = query.filter(APIRequestLog.status_code >= status_min)
    if status_max:
        query = query.filter(APIRequestLog.status_code <= status_max)
    
    if desde:
        try:
            fecha_desde = datetime.strptime(desde, "%Y-%m-%d %H:%M")
            query = query.filter(APIRequestLog.fecha >= fecha_desde)
        except:
            try:
                fecha_desde = datetime.strptime(desde, "%Y-%m-%d")
                query = query.filter(APIRequestLog.fecha >= fecha_desde)
            except:
                pass
    
    if hasta:
        try:
            fecha_hasta = datetime.strptime(hasta, "%Y-%m-%d %H:%M")
            query = query.filter(APIRequestLog.fecha <= fecha_hasta)
        except:
            try:
                fecha_hasta = datetime.strptime(hasta, "%Y-%m-%d") + timedelta(days=1)
                query = query.filter(APIRequestLog.fecha < fecha_hasta)
            except:
                pass
    
    total = query.count()
    offset = (pagina - 1) * por_pagina
    logs = query.order_by(desc(APIRequestLog.fecha)).offset(offset).limit(por_pagina).all()
    
    return {
        "logs": [APILogResponse.model_validate(log) for log in logs],
        "total": total,
        "pagina": pagina,
        "por_pagina": por_pagina
    }


@router.get("/api-stats")
async def obtener_api_stats(
    entorno_id: Optional[int] = None,
    horas: int = Query(24, ge=1, le=168),  # Últimas N horas
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Obtener estadísticas de uso de la API.
    Sysowner ve todo, otros solo su entorno.
    """
    if current_user.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="No tienes permisos")
    
    from sqlalchemy import func
    
    # Filtro base por entorno
    base_filter = []
    if current_user.rol != 'sysowner':
        base_filter.append(APIRequestLog.entorno_trabajo_id == current_user.entorno_trabajo_id)
    elif entorno_id:
        base_filter.append(APIRequestLog.entorno_trabajo_id == entorno_id)
    
    # Fechas de referencia
    ahora = datetime.now()
    hace_una_hora = ahora - timedelta(hours=1)
    inicio_hoy = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    hace_n_horas = ahora - timedelta(hours=horas)
    
    # Total peticiones
    total_query = db.query(func.count(APIRequestLog.id))
    if base_filter:
        total_query = total_query.filter(*base_filter)
    total_peticiones = total_query.scalar() or 0
    
    # Peticiones hoy
    hoy_query = db.query(func.count(APIRequestLog.id)).filter(APIRequestLog.fecha >= inicio_hoy)
    if base_filter:
        hoy_query = hoy_query.filter(*base_filter)
    peticiones_hoy = hoy_query.scalar() or 0
    
    # Peticiones última hora
    hora_query = db.query(func.count(APIRequestLog.id)).filter(APIRequestLog.fecha >= hace_una_hora)
    if base_filter:
        hora_query = hora_query.filter(*base_filter)
    peticiones_ultima_hora = hora_query.scalar() or 0
    
    # Tiempo medio de respuesta
    tiempo_query = db.query(func.avg(APIRequestLog.duracion_ms)).filter(APIRequestLog.fecha >= hace_n_horas)
    if base_filter:
        tiempo_query = tiempo_query.filter(*base_filter)
    tiempo_respuesta_medio = round(tiempo_query.scalar() or 0, 2)
    
    # Errores hoy (status >= 400)
    errores_query = db.query(func.count(APIRequestLog.id)).filter(
        APIRequestLog.fecha >= inicio_hoy,
        APIRequestLog.status_code >= 400
    )
    if base_filter:
        errores_query = errores_query.filter(*base_filter)
    errores_hoy = errores_query.scalar() or 0
    
    # Estadísticas por entorno (solo sysowner)
    por_entorno = []
    if current_user.rol == 'sysowner':
        entorno_stats = db.query(
            APIRequestLog.entorno_nombre,
            APIRequestLog.entorno_trabajo_id,
            func.count(APIRequestLog.id).label('total'),
            func.avg(APIRequestLog.duracion_ms).label('tiempo_medio')
        ).filter(
            APIRequestLog.fecha >= hace_n_horas,
            APIRequestLog.entorno_trabajo_id.isnot(None)
        ).group_by(
            APIRequestLog.entorno_trabajo_id,
            APIRequestLog.entorno_nombre
        ).order_by(desc('total')).limit(20).all()
        
        por_entorno = [
            {
                "entorno_id": e.entorno_trabajo_id,
                "nombre": e.entorno_nombre or "Sin nombre",
                "peticiones": e.total,
                "tiempo_medio": round(e.tiempo_medio or 0, 2)
            }
            for e in entorno_stats
        ]
    
    # Top rutas más usadas
    rutas_stats = db.query(
        APIRequestLog.ruta,
        func.count(APIRequestLog.id).label('total'),
        func.avg(APIRequestLog.duracion_ms).label('tiempo_medio')
    ).filter(APIRequestLog.fecha >= hace_n_horas)
    if base_filter:
        rutas_stats = rutas_stats.filter(*base_filter)
    rutas_stats = rutas_stats.group_by(APIRequestLog.ruta).order_by(desc('total')).limit(15).all()
    
    por_ruta = [
        {
            "ruta": r.ruta,
            "peticiones": r.total,
            "tiempo_medio": round(r.tiempo_medio or 0, 2)
        }
        for r in rutas_stats
    ]
    
    # Top usuarios
    usuarios_stats = db.query(
        APIRequestLog.usuario_email,
        APIRequestLog.usuario_id,
        func.count(APIRequestLog.id).label('total')
    ).filter(
        APIRequestLog.fecha >= hace_n_horas,
        APIRequestLog.usuario_email.isnot(None)
    )
    if base_filter:
        usuarios_stats = usuarios_stats.filter(*base_filter)
    usuarios_stats = usuarios_stats.group_by(
        APIRequestLog.usuario_id,
        APIRequestLog.usuario_email
    ).order_by(desc('total')).limit(10).all()
    
    por_usuario = [
        {
            "email": u.usuario_email,
            "usuario_id": u.usuario_id,
            "peticiones": u.total
        }
        for u in usuarios_stats
    ]
    
    # Peticiones por hora (últimas N horas)
    from sqlalchemy import extract
    horas_stats = db.query(
        func.strftime('%Y-%m-%d %H:00', APIRequestLog.fecha).label('hora'),
        func.count(APIRequestLog.id).label('total'),
        func.sum(func.case((APIRequestLog.status_code >= 400, 1), else_=0)).label('errores')
    ).filter(APIRequestLog.fecha >= hace_n_horas)
    if base_filter:
        horas_stats = horas_stats.filter(*base_filter)
    horas_stats = horas_stats.group_by('hora').order_by('hora').all()
    
    por_hora = [
        {
            "hora": h.hora,
            "peticiones": h.total,
            "errores": h.errores or 0
        }
        for h in horas_stats
    ]
    
    return {
        "total_peticiones": total_peticiones,
        "peticiones_hoy": peticiones_hoy,
        "peticiones_ultima_hora": peticiones_ultima_hora,
        "tiempo_respuesta_medio": tiempo_respuesta_medio,
        "errores_hoy": errores_hoy,
        "por_entorno": por_entorno,
        "por_ruta": por_ruta,
        "por_usuario": por_usuario,
        "por_hora": por_hora
    }


@router.get("/api-logs/stream")
async def stream_api_logs(
    current_user: Usuario = Depends(get_current_user)
):
    """
    Stream de logs en tiempo real usando Server-Sent Events (SSE).
    Solo sysowner puede ver todos los logs.
    """
    if current_user.rol != 'sysowner':
        raise HTTPException(status_code=403, detail="Solo sysowner puede ver logs en tiempo real")
    
    async def event_generator():
        from app.database import SessionLocal
        
        last_id = 0
        
        while True:
            try:
                db = SessionLocal()
                # Obtener nuevos logs desde el último ID
                new_logs = db.query(APIRequestLog).filter(
                    APIRequestLog.id > last_id
                ).order_by(APIRequestLog.id.asc()).limit(50).all()
                
                for log in new_logs:
                    last_id = log.id
                    log_data = {
                        "id": log.id,
                        "metodo": log.metodo,
                        "ruta": log.ruta,
                        "status_code": log.status_code,
                        "duracion_ms": log.duracion_ms,
                        "usuario_email": log.usuario_email,
                        "entorno_nombre": log.entorno_nombre,
                        "ip_address": log.ip_address,
                        "fecha": log.fecha.isoformat() if log.fecha else None
                    }
                    yield f"data: {json_lib.dumps(log_data)}\n\n"
                
                db.close()
                
            except Exception as e:
                yield f"data: {json_lib.dumps({'error': str(e)})}\n\n"
            
            # Esperar antes de siguiente consulta
            await asyncio.sleep(2)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get("/api-logs/entornos")
async def obtener_entornos_con_actividad(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener lista de entornos que tienen actividad de API"""
    if current_user.rol != 'sysowner':
        raise HTTPException(status_code=403, detail="Solo sysowner")
    
    # Obtener entornos con actividad
    entornos = db.query(EntornoTrabajo).all()
    
    return [
        {"id": e.id, "nombre": e.nombre}
        for e in entornos
    ]


@router.delete("/api-logs/limpiar")
async def limpiar_api_logs(
    dias: int = Query(30, ge=1, le=365),
    confirmar: bool = False,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Limpiar logs de API más antiguos que N días.
    Solo sysowner puede ejecutar.
    """
    if current_user.rol != 'sysowner':
        raise HTTPException(status_code=403, detail="Solo sysowner puede limpiar logs")
    
    fecha_limite = datetime.now() - timedelta(days=dias)
    
    # Contar logs a eliminar
    count = db.query(APIRequestLog).filter(APIRequestLog.fecha < fecha_limite).count()
    
    if not confirmar:
        return {
            "warning": f"Se eliminarán {count} logs anteriores a {fecha_limite.strftime('%Y-%m-%d')}",
            "accion_requerida": "Enviar confirmar=true para proceder"
        }
    
    # Eliminar logs antiguos
    db.query(APIRequestLog).filter(APIRequestLog.fecha < fecha_limite).delete()
    db.commit()
    
    AuditService.log(
        db=db,
        accion="LIMPIEZA_API_LOGS",
        entidad="api_logs",
        descripcion=f"Eliminados {count} logs anteriores a {dias} días",
        usuario=current_user
    )
    
    return {"success": True, "eliminados": count}

