"""
Schemas para API de stock
"""
from pydantic import BaseModel, Field
from typing import List, Optional


class StockItem(BaseModel):
    """Item de stock (formato antiguo)"""
    ref_id: str
    ref_oem: str
    ref_oe: str = ""
    ref_iam: str = ""
    anostock: str = ""
    precio_azeler: float
    peso: str = ""
    estado: str = ""
    articulo: str = ""


class CheckStockRequest(BaseModel):
    """Request para checkeo de stock (formato antiguo)"""
    items: List[StockItem] = Field(..., description="Items a verificar")
    umbral_diferencia: float = Field(default=20.0, ge=5, le=50, description="Umbral de diferencia en %")
    workers: int = Field(default=5, ge=1, le=30, description="Workers paralelos")


class CheckResultItem(BaseModel):
    """Resultado del checkeo de un item (formato antiguo)"""
    ref_id: str
    ref_oem: str
    precio_azeler: float
    precio_mercado: float
    diferencia_porcentaje: float
    precios_encontrados: int
    es_outlier: bool


class CheckStockResponse(BaseModel):
    """Response de checkeo de stock (formato antiguo)"""
    total_items: int
    items_procesados: int
    items_con_outliers: int
    resultados: List[CheckResultItem]
    tiempo_procesamiento: float


# ========== NUEVOS SCHEMAS PARA STOCK MASIVO ==========

class StockMasivoItem(BaseModel):
    """Item de stock con mapeo flexible"""
    ref_id: str = ""
    ref_oem: str
    ref_oe: str = ""
    tipo_pieza: str = ""
    precio: float


class CheckStockMasivoRequest(BaseModel):
    """Request para checkeo masivo con columnas mapeadas"""
    items: List[StockMasivoItem] = Field(..., description="Items a verificar")
    umbral_diferencia: float = Field(default=20.0, ge=5, le=50, description="Umbral de diferencia en %")
    piezas_minimas: int = Field(default=3, ge=1, le=10, description="Número mínimo de precios para calcular media")
    workers: int = Field(default=5, ge=1, le=30, description="Workers paralelos")
    delay: float = Field(default=0.0, ge=0.0, le=5.0, description="Delay entre peticiones")


class CheckMasivoResultItem(BaseModel):
    """Resultado del checkeo masivo de un item"""
    ref_id: str
    ref_oem: str
    tipo_pieza: str
    precio_actual: float
    precio_mercado: float
    precio_sugerido: Optional[float] = None
    diferencia_porcentaje: float
    precios_encontrados: int
    es_outlier: bool
    familia: str = ""


class CheckStockMasivoResponse(BaseModel):
    """Response de checkeo masivo"""
    total_items: int
    items_procesados: int
    items_con_outliers: int
    resultados: List[CheckMasivoResultItem]
    tiempo_procesamiento: float
