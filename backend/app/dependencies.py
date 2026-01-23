"""
Dependencias para autenticación y autorización
"""
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional
import logging

from app.database import get_db
from app.models.busqueda import Usuario
from utils.security import decode_access_token

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)  # No lanzar error automático, verificar cookie también


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> Usuario:
    """
    Obtiene el usuario actual del token JWT
    Busca el token en: 1) Header Authorization, 2) Cookie HTTPOnly
    Lanza excepción si el token es inválido
    """
    token = None
    
    # Primero intentar obtener token del header Authorization
    if credentials:
        token = credentials.credentials
    
    # Si no hay header, buscar en cookie HTTPOnly
    if not token:
        token = request.cookies.get("access_token")
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se proporcionó token de autenticación",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Decodificar token
    token_data = decode_access_token(token)
    
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Obtener usuario de BD
    usuario = db.query(Usuario).filter(
        Usuario.id == token_data.usuario_id
    ).first()
    
    if not usuario or not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado o inactivo",
        )
    
    return usuario


async def get_current_sysowner(
    usuario: Usuario = Depends(get_current_user),
) -> Usuario:
    """Verificar que el usuario es SYSOWNER (propietario de sistema)"""
    if usuario.rol != "sysowner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requiere permisos de Propietario de Sistema",
        )
    return usuario


async def get_current_owner(
    usuario: Usuario = Depends(get_current_user),
) -> Usuario:
    """Verificar que el usuario es OWNER o SYSOWNER"""
    if usuario.rol not in ["owner", "sysowner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requiere permisos de Propietario",
        )
    return usuario


async def get_current_admin(
    usuario: Usuario = Depends(get_current_user),
) -> Usuario:
    """Verificar que el usuario es ADMIN, OWNER o SYSOWNER"""
    if usuario.rol not in ["admin", "owner", "sysowner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requiere permisos de Admin",
        )
    return usuario


async def get_current_user_with_workspace(
    usuario: Usuario = Depends(get_current_user),
) -> Usuario:
    """Verificar que el usuario tiene un entorno de trabajo asignado"""
    if not usuario.entorno_trabajo_id and usuario.rol != "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuario sin entorno de trabajo asignado",
        )
    return usuario
