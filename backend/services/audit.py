"""
Servicio de Auditoría - Registra todas las acciones importantes del sistema
"""
from sqlalchemy.orm import Session
from app.models.busqueda import AuditLog, Usuario
from datetime import datetime
from typing import Optional
import json


class AuditService:
    """Servicio para registrar logs de auditoría"""
    
    @staticmethod
    def log(
        db: Session,
        accion: str,
        entidad: str,
        descripcion: str,
        usuario: Optional[Usuario] = None,
        entidad_id: Optional[int] = None,
        datos_adicionales: Optional[dict] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        """
        Registrar una acción en el log de auditoría.
        
        Acciones comunes:
        - LOGIN, LOGOUT, LOGIN_FAILED
        - CREATE, UPDATE, DELETE
        - SEARCH, EXPORT
        - BACKUP, RESTORE
        - CONFIG_CHANGE
        """
        try:
            log_entry = AuditLog(
                usuario_id=usuario.id if usuario else None,
                entorno_trabajo_id=usuario.entorno_trabajo_id if usuario else None,
                accion=accion.upper(),
                entidad=entidad.lower(),
                entidad_id=entidad_id,
                descripcion=descripcion,
                datos_adicionales=json.dumps(datos_adicionales) if datos_adicionales else None,
                ip_address=ip_address,
                user_agent=user_agent
            )
            db.add(log_entry)
            db.commit()
            return log_entry
        except Exception as e:
            print(f"Error registrando audit log: {e}")
            db.rollback()
            return None

    @staticmethod
    def log_login(db: Session, usuario: Usuario, ip: str = None, user_agent: str = None, exitoso: bool = True):
        """Registrar intento de login"""
        if exitoso:
            return AuditService.log(
                db=db,
                accion="LOGIN",
                entidad="sesion",
                descripcion=f"Usuario {usuario.email} inició sesión",
                usuario=usuario,
                ip_address=ip,
                user_agent=user_agent
            )
        else:
            return AuditService.log(
                db=db,
                accion="LOGIN_FAILED",
                entidad="sesion",
                descripcion=f"Intento fallido de login para {usuario.email if usuario else 'desconocido'}",
                usuario=usuario,
                ip_address=ip,
                user_agent=user_agent
            )

    @staticmethod
    def log_logout(db: Session, usuario: Usuario, ip: str = None):
        """Registrar logout"""
        return AuditService.log(
            db=db,
            accion="LOGOUT",
            entidad="sesion",
            descripcion=f"Usuario {usuario.email} cerró sesión",
            usuario=usuario,
            ip_address=ip
        )

    @staticmethod
    def log_fichada(db: Session, usuario: Usuario, fichada_id: int, id_pieza: str, accion: str = "CREATE"):
        """Registrar acción de fichada"""
        acciones_desc = {
            "CREATE": f"Fichada creada: {id_pieza}",
            "DELETE": f"Fichada eliminada: {id_pieza}",
            "UPDATE": f"Fichada actualizada: {id_pieza}"
        }
        return AuditService.log(
            db=db,
            accion=accion,
            entidad="fichada",
            descripcion=acciones_desc.get(accion, f"Acción {accion} en fichada {id_pieza}"),
            usuario=usuario,
            entidad_id=fichada_id,
            datos_adicionales={"id_pieza": id_pieza}
        )

    @staticmethod
    def log_busqueda(db: Session, usuario: Usuario, referencia: str, resultados: int):
        """Registrar búsqueda realizada"""
        return AuditService.log(
            db=db,
            accion="SEARCH",
            entidad="busqueda",
            descripcion=f"Búsqueda: '{referencia}' - {resultados} resultados",
            usuario=usuario,
            datos_adicionales={"referencia": referencia, "resultados": resultados}
        )

    @staticmethod
    def log_usuario(db: Session, admin: Usuario, usuario_afectado: Usuario, accion: str):
        """Registrar acción sobre usuario"""
        acciones_desc = {
            "CREATE": f"Usuario creado: {usuario_afectado.email}",
            "UPDATE": f"Usuario actualizado: {usuario_afectado.email}",
            "DELETE": f"Usuario eliminado: {usuario_afectado.email}",
            "ACTIVATE": f"Usuario activado: {usuario_afectado.email}",
            "DEACTIVATE": f"Usuario desactivado: {usuario_afectado.email}"
        }
        return AuditService.log(
            db=db,
            accion=accion,
            entidad="usuario",
            descripcion=acciones_desc.get(accion, f"Acción {accion} en usuario {usuario_afectado.email}"),
            usuario=admin,
            entidad_id=usuario_afectado.id
        )

    @staticmethod
    def log_backup(db: Session, usuario: Optional[Usuario], filename: str, exitoso: bool, mensaje: str = None):
        """Registrar backup realizado"""
        return AuditService.log(
            db=db,
            accion="BACKUP" if exitoso else "BACKUP_FAILED",
            entidad="sistema",
            descripcion=f"Backup {'creado' if exitoso else 'fallido'}: {filename}",
            usuario=usuario,
            datos_adicionales={"filename": filename, "mensaje": mensaje}
        )
