"""
Servicio de Backup - Gestión de copias de seguridad automáticas
"""
import os
import shutil
import gzip
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List
from sqlalchemy.orm import Session
from app.models.busqueda import BackupRecord, Usuario
from app.config import settings


class BackupService:
    """Servicio para gestionar backups de la base de datos"""
    
    BACKUP_DIR = Path("backups")
    DB_PATH = Path("desguapro.db")
    MAX_BACKUPS = 30  # Mantener últimos 30 backups
    
    @classmethod
    def ensure_backup_dir(cls):
        """Crear directorio de backups si no existe"""
        cls.BACKUP_DIR.mkdir(exist_ok=True)
    
    @classmethod
    def crear_backup(
        cls,
        db: Session,
        usuario: Optional[Usuario] = None,
        tipo: str = "manual"
    ) -> dict:
        """
        Crear un backup de la base de datos.
        
        Args:
            db: Sesión de base de datos
            usuario: Usuario que solicita el backup (None para automático)
            tipo: 'manual', 'automatico', 'programado'
        
        Returns:
            dict con información del backup
        """
        cls.ensure_backup_dir()
        
        try:
            # Generar nombre único
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"desguapro_backup_{timestamp}.db.gz"
            filepath = cls.BACKUP_DIR / filename
            
            # Copiar y comprimir la base de datos
            with open(cls.DB_PATH, 'rb') as f_in:
                with gzip.open(filepath, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
            
            # Obtener tamaño
            size_bytes = filepath.stat().st_size
            
            # Registrar en base de datos
            backup_record = BackupRecord(
                usuario_id=usuario.id if usuario else None,
                filename=filename,
                filepath=str(filepath.absolute()),
                size_bytes=size_bytes,
                tipo=tipo,
                fecha_expiracion=datetime.now() + timedelta(days=30),
                exitoso=True,
                mensaje="Backup creado correctamente"
            )
            db.add(backup_record)
            db.commit()
            
            # Limpiar backups antiguos
            cls.limpiar_backups_antiguos(db)
            
            return {
                "success": True,
                "filename": filename,
                "size_bytes": size_bytes,
                "size_mb": round(size_bytes / (1024 * 1024), 2),
                "filepath": str(filepath.absolute()),
                "fecha": datetime.now().isoformat()
            }
            
        except Exception as e:
            # Registrar error
            backup_record = BackupRecord(
                usuario_id=usuario.id if usuario else None,
                filename=f"failed_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                filepath="",
                size_bytes=0,
                tipo=tipo,
                exitoso=False,
                mensaje=str(e)
            )
            db.add(backup_record)
            db.commit()
            
            return {
                "success": False,
                "error": str(e)
            }
    
    @classmethod
    def limpiar_backups_antiguos(cls, db: Session):
        """Eliminar backups que excedan el límite o hayan expirado"""
        try:
            # Obtener backups ordenados por fecha
            backups = db.query(BackupRecord).filter(
                BackupRecord.exitoso == True
            ).order_by(BackupRecord.fecha_creacion.desc()).all()
            
            # Eliminar si hay más del máximo
            if len(backups) > cls.MAX_BACKUPS:
                for backup in backups[cls.MAX_BACKUPS:]:
                    # Eliminar archivo físico
                    try:
                        if backup.filepath and os.path.exists(backup.filepath):
                            os.remove(backup.filepath)
                    except:
                        pass
                    
                    # Eliminar registro
                    db.delete(backup)
                
                db.commit()
            
            # Eliminar expirados
            ahora = datetime.now()
            expirados = db.query(BackupRecord).filter(
                BackupRecord.fecha_expiracion < ahora,
                BackupRecord.exitoso == True
            ).all()
            
            for backup in expirados:
                try:
                    if backup.filepath and os.path.exists(backup.filepath):
                        os.remove(backup.filepath)
                except:
                    pass
                db.delete(backup)
            
            if expirados:
                db.commit()
                
        except Exception as e:
            print(f"Error limpiando backups: {e}")
    
    @classmethod
    def listar_backups(cls, db: Session, limite: int = 20) -> List[dict]:
        """Listar backups disponibles"""
        backups = db.query(BackupRecord).order_by(
            BackupRecord.fecha_creacion.desc()
        ).limit(limite).all()
        
        return [
            {
                "id": b.id,
                "filename": b.filename,
                "size_mb": round(b.size_bytes / (1024 * 1024), 2) if b.size_bytes else 0,
                "tipo": b.tipo,
                "exitoso": b.exitoso,
                "mensaje": b.mensaje,
                "fecha": b.fecha_creacion.isoformat() if b.fecha_creacion else None,
                "existe": os.path.exists(b.filepath) if b.filepath else False
            }
            for b in backups
        ]
    
    @classmethod
    def restaurar_backup(cls, db: Session, backup_id: int, usuario: Usuario) -> dict:
        """
        Restaurar un backup (PELIGROSO - requiere confirmación)
        """
        backup = db.query(BackupRecord).filter(BackupRecord.id == backup_id).first()
        
        if not backup:
            return {"success": False, "error": "Backup no encontrado"}
        
        if not backup.filepath or not os.path.exists(backup.filepath):
            return {"success": False, "error": "Archivo de backup no existe"}
        
        try:
            # Crear backup de seguridad antes de restaurar
            safety_backup = cls.crear_backup(db, usuario, tipo="pre-restauracion")
            
            # Descomprimir y restaurar
            with gzip.open(backup.filepath, 'rb') as f_in:
                with open(cls.DB_PATH, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
            
            return {
                "success": True,
                "message": f"Backup {backup.filename} restaurado correctamente",
                "safety_backup": safety_backup.get("filename")
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    @classmethod
    def obtener_estadisticas(cls, db: Session) -> dict:
        """Obtener estadísticas de backups"""
        total = db.query(BackupRecord).count()
        exitosos = db.query(BackupRecord).filter(BackupRecord.exitoso == True).count()
        
        ultimo = db.query(BackupRecord).filter(
            BackupRecord.exitoso == True
        ).order_by(BackupRecord.fecha_creacion.desc()).first()
        
        # Espacio usado
        espacio_total = sum(
            b.size_bytes for b in db.query(BackupRecord).filter(
                BackupRecord.exitoso == True
            ).all() if b.size_bytes
        )
        
        return {
            "total_backups": total,
            "exitosos": exitosos,
            "fallidos": total - exitosos,
            "espacio_usado_mb": round(espacio_total / (1024 * 1024), 2),
            "ultimo_backup": ultimo.fecha_creacion.isoformat() if ultimo else None,
            "ultimo_filename": ultimo.filename if ultimo else None
        }
