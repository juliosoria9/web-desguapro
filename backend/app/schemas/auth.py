"""
Schemas para autenticación y usuarios
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ============== LOGIN ==============
class LoginRequest(BaseModel):
    """Request para login"""
    email: str = Field(..., min_length=1, max_length=100)  # Puede ser email o username
    password: str = Field(..., min_length=6)


class LoginResponse(BaseModel):
    """Response de login"""
    access_token: str
    token_type: str = "bearer"
    usuario: "UsuarioResponse"


# ============== USUARIOS ==============
class UsuarioCreate(BaseModel):
    """Request para crear usuario"""
    email: str = Field(..., min_length=1, max_length=100)  # Puede ser email o username
    password: str = Field(..., min_length=6)
    nombre: Optional[str] = None
    rol: str = Field(default="user")  # user, admin, owner
    entorno_trabajo_id: Optional[int] = None  # ID del entorno/empresa


class UsuarioUpdate(BaseModel):
    """Request para actualizar usuario"""
    nombre: Optional[str] = None
    password: Optional[str] = None


class UsuarioResponse(BaseModel):
    """Response de usuario (sin contraseña)"""
    id: int
    email: str
    nombre: Optional[str] = None
    rol: str
    activo: bool
    entorno_trabajo_id: Optional[int] = None
    entorno_nombre: Optional[str] = None
    fecha_creacion: datetime
    # Módulos activos del entorno
    modulos: Optional[dict] = None
    
    class Config:
        from_attributes = True


class UsuarioListResponse(BaseModel):
    """Response de listado de usuarios"""
    total: int
    usuarios: list[UsuarioResponse]


# ============== ENTORNO DE TRABAJO ==============
class EntornoTrabajoCreate(BaseModel):
    """Request para crear entorno de trabajo"""
    nombre: str = Field(..., min_length=1, max_length=100)
    descripcion: Optional[str] = None


class EntornoModulosUpdate(BaseModel):
    """Request para actualizar módulos de un entorno"""
    modulo_fichadas: Optional[bool] = None
    modulo_stock_masivo: Optional[bool] = None
    modulo_referencias: Optional[bool] = None
    modulo_piezas_nuevas: Optional[bool] = None
    modulo_ventas: Optional[bool] = None
    modulo_precios_sugeridos: Optional[bool] = None
    modulo_importacion_csv: Optional[bool] = None
    modulo_inventario_piezas: Optional[bool] = None
    modulo_estudio_coches: Optional[bool] = None


class EntornoTrabajoResponse(BaseModel):
    """Response de entorno de trabajo"""
    id: int
    nombre: str
    descripcion: Optional[str] = None
    activo: bool
    fecha_creacion: datetime
    # Módulos
    modulo_fichadas: bool = True
    modulo_stock_masivo: bool = True
    modulo_referencias: bool = True
    modulo_piezas_nuevas: bool = True
    modulo_ventas: bool = True
    modulo_precios_sugeridos: bool = True
    modulo_importacion_csv: bool = True
    
    class Config:
        from_attributes = True


# ============== USUARIO ACTUAL ==============
class UsuarioActual(BaseModel):
    """Datos del usuario actual (en token)"""
    usuario_id: int
    email: str
    rol: str
    entorno_trabajo_id: Optional[int] = None
