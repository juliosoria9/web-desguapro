"""
Servicio de Tareas Programadas - Scheduler para backups automáticos
"""
import logging
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session
from app.database import SessionLocal
from services.backup import BackupService

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Instancia global del scheduler
scheduler = BackgroundScheduler()


def ejecutar_backup_programado():
    """
    Ejecutar backup automático programado.
    Se llama desde el scheduler.
    """
    logger.info(f"[{datetime.now()}] Iniciando backup programado...")
    
    db: Session = SessionLocal()
    try:
        resultado = BackupService.crear_backup(
            db=db,
            usuario=None,  # Automático, sin usuario
            tipo="programado"
        )
        
        if resultado.get("success"):
            logger.info(f"[{datetime.now()}] Backup programado completado: {resultado['filename']} ({resultado['size_mb']} MB)")
        else:
            logger.error(f"[{datetime.now()}] Error en backup programado: {resultado.get('error')}")
            
    except Exception as e:
        logger.error(f"[{datetime.now()}] Error crítico en backup programado: {str(e)}")
    finally:
        db.close()


def iniciar_scheduler():
    """
    Iniciar el scheduler de tareas programadas.
    Configura el backup diario a las 3:00 AM.
    """
    if scheduler.running:
        logger.info("Scheduler ya está corriendo")
        return
    
    # Programar backup diario a las 3:00 AM
    scheduler.add_job(
        ejecutar_backup_programado,
        CronTrigger(hour=3, minute=0),  # Todos los días a las 3:00 AM
        id="backup_diario",
        name="Backup diario de base de datos",
        replace_existing=True
    )
    
    # También hacer un backup al iniciar (si no hay uno reciente)
    # scheduler.add_job(
    #     ejecutar_backup_programado,
    #     'date',  # Una sola vez
    #     run_date=datetime.now(),
    #     id="backup_inicial"
    # )
    
    scheduler.start()
    logger.info("Scheduler iniciado - Backup programado diariamente a las 3:00 AM")
    
    # Listar jobs activos
    for job in scheduler.get_jobs():
        logger.info(f"  - Job activo: {job.name} (próxima ejecución: {job.next_run_time})")


def detener_scheduler():
    """Detener el scheduler de forma segura"""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler detenido")


def obtener_estado_scheduler() -> dict:
    """Obtener estado actual del scheduler"""
    jobs = []
    if scheduler.running:
        for job in scheduler.get_jobs():
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
                "trigger": str(job.trigger)
            })
    
    return {
        "running": scheduler.running,
        "jobs": jobs
    }


def forzar_backup_ahora():
    """Ejecutar un backup inmediatamente (para testing o emergencias)"""
    logger.info("Ejecutando backup forzado...")
    ejecutar_backup_programado()
