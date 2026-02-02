"""
Servicio de Tareas Programadas - Scheduler para backups automáticos e importación de CSV
"""
import logging
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
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
    - Backup diario a las 3:00 AM
    - Importación CSV MotoCoche cada 30 minutos
    - Limpieza de ventas falsas cada 6 horas
    """
    if scheduler.running:
        logger.info("Scheduler ya está corriendo")
        return
    
    # Importar aquí para evitar imports circulares
    from services.csv_auto_import import ejecutar_importacion_programada, ejecutar_limpieza_ventas_programada
    
    # Programar backup diario a las 3:00 AM
    scheduler.add_job(
        ejecutar_backup_programado,
        CronTrigger(hour=3, minute=0),  # Todos los días a las 3:00 AM
        id="backup_diario",
        name="Backup diario de base de datos",
        replace_existing=True
    )
    
    # Programar importación CSV de MotoCoche cada 30 minutos
    scheduler.add_job(
        ejecutar_importacion_programada,
        IntervalTrigger(minutes=30),  # Cada 30 minutos
        id="import_csv_motocoche",
        name="Importación automática CSV MotoCoche",
        replace_existing=True
    )
    
    # Programar limpieza de ventas falsas cada 6 horas
    scheduler.add_job(
        ejecutar_limpieza_ventas_programada,
        IntervalTrigger(hours=6),  # Cada 6 horas
        id="limpieza_ventas_falsas",
        name="Limpieza de ventas falsas",
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
    logger.info("Scheduler iniciado:")
    logger.info("  - Backup programado diariamente a las 3:00 AM")
    logger.info("  - Importación CSV MotoCoche cada 30 minutos")
    logger.info("  - Limpieza de ventas falsas cada 6 horas")
    
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


def forzar_importacion_csv_ahora():
    """Ejecutar importación CSV de MotoCoche inmediatamente"""
    from services.csv_auto_import import ejecutar_importacion_programada
    logger.info("Ejecutando importación CSV forzada...")
    return ejecutar_importacion_programada()


def forzar_limpieza_ventas_ahora():
    """Ejecutar limpieza de ventas falsas inmediatamente"""
    from services.csv_auto_import import limpiar_ventas_falsas
    logger.info("Ejecutando limpieza de ventas falsas forzada...")
    return limpiar_ventas_falsas()
