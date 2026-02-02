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
