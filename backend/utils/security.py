"""
Utilidades de seguridad y autenticación
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from pydantic import BaseModel
from app.config import settings

# Datos para JWT
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 horas


class TokenData(BaseModel):
    """Datos del token JWT"""
    usuario_id: int
    email: str
    rol: str
    entorno_trabajo_id: Optional[int] = None
    entorno_nombre: Optional[str] = None


def hash_password(password: str) -> str:
    """Hashear contraseña con bcrypt"""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verificar contraseña"""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None
) -> str:
    """Crear token JWT"""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.secret_key,
        algorithm=ALGORITHM
    )
    return encoded_jwt


def decode_access_token(token: str) -> Optional[TokenData]:
    """Decodificar token JWT"""
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[ALGORITHM]
        )
        
        usuario_id: int = payload.get("usuario_id")
        email: str = payload.get("email")
        rol: str = payload.get("rol")
        entorno_trabajo_id: Optional[int] = payload.get("entorno_trabajo_id")
        entorno_nombre: Optional[str] = payload.get("entorno_nombre")
        
        if usuario_id is None or email is None:
            return None
        
        return TokenData(
            usuario_id=usuario_id,
            email=email,
            rol=rol,
            entorno_trabajo_id=entorno_trabajo_id,
            entorno_nombre=entorno_nombre
        )
    except JWTError:
        return None
