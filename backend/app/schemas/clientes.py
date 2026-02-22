"""
Schemas Pydantic para Clientes Interesados (módulo Ventas)
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ClienteInteresadoCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=200)
    email: Optional[str] = Field(None, max_length=200)
    telefono: str = Field(..., min_length=1, max_length=50)
    pieza_buscada: Optional[str] = Field(None, max_length=300)
    marca_coche: str = Field(..., min_length=1, max_length=100)
    modelo_coche: str = Field(..., min_length=1, max_length=100)
    anio_coche: str = Field(..., min_length=1, max_length=10)
    version_coche: Optional[str] = Field(None, max_length=150)
    observaciones: Optional[str] = Field(None, max_length=1000)
    entorno_id: Optional[int] = None


class ClienteInteresadoUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[str] = Field(None, max_length=200)
    telefono: Optional[str] = Field(None, max_length=50)
    pieza_buscada: Optional[str] = Field(None, max_length=300)
    marca_coche: Optional[str] = Field(None, max_length=100)
    modelo_coche: Optional[str] = Field(None, max_length=100)
    anio_coche: Optional[str] = Field(None, max_length=10)
    version_coche: Optional[str] = Field(None, max_length=150)
    observaciones: Optional[str] = Field(None, max_length=1000)
    estado: Optional[str] = Field(None, pattern=r"^(pendiente|contactado|vendido|descartado)$")


class ClienteInteresadoResponse(BaseModel):
    id: int
    entorno_trabajo_id: int
    nombre: str
    email: Optional[str] = None
    telefono: Optional[str] = None
    pieza_buscada: Optional[str] = None
    marca_coche: Optional[str] = None
    modelo_coche: Optional[str] = None
    anio_coche: Optional[str] = None
    version_coche: Optional[str] = None
    observaciones: Optional[str] = None
    estado: str
    fecha_registro: datetime
    usuario_email: Optional[str] = None

    class Config:
        from_attributes = True
