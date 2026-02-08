"""
Schemas para API de precios
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class BuscarPreciosRequest(BaseModel):
    """Request para buscar precios"""
    referencia: str = Field(..., min_length=1, max_length=100, description="Referencia de la pieza")
    plataforma: str = Field(default="todas", description="ID de la plataforma o 'todas' para buscar en todas")
    cantidad: int = Field(default=20, ge=1, le=1000, description="Cantidad de piezas para calcular media")
    incluir_bparts: bool = Field(default=False, description="Incluir B-Parts en búsqueda 'todas'")
    incluir_ovoko: bool = Field(default=False, description="Incluir Ovoko en búsqueda 'todas'")


class PrecioResumen(BaseModel):
    """Resumen de estadísticas de precios"""
    media: float = Field(..., description="Precio medio")
    mediana: float = Field(..., description="Precio mediana")
    minimo: float = Field(..., description="Precio mínimo")
    maximo: float = Field(..., description="Precio máximo")
    desviacion_estandar: float = Field(..., description="Desviación estándar")
    cantidad_precios: int = Field(..., description="Cantidad de precios encontrados")
    outliers_removidos: int = Field(default=0, description="Cantidad de outliers removidos")
    rango_original: Optional[str] = None
    rango_limpio: Optional[str] = None


class PrecioSugerido(BaseModel):
    """Precio sugerido basado en familia"""
    familia: str
    precio_sugerido: float
    precios_familia: List[float]
    precio_mercado: float


class InfoInventario(BaseModel):
    """Información de inventario propio"""
    en_stock: int = 0
    vendidas: int = 0
    piezas_stock: List[Dict[str, Any]] = []
    piezas_vendidas: List[Dict[str, Any]] = []


class PlataformaResultado(BaseModel):
    """Resultado de una plataforma individual"""
    plataforma_id: str
    plataforma_nombre: str
    precios: List[float] = []
    cantidad_precios: int = 0
    precio_minimo: Optional[float] = None
    precio_maximo: Optional[float] = None
    precio_medio: Optional[float] = None
    imagenes: List[str] = []
    error: Optional[str] = None


class BuscarPreciosResponse(BaseModel):
    """Response de búsqueda de precios"""
    referencia: str
    plataforma: str  # Mantener para compatibilidad
    precios: List[float]
    resumen: PrecioResumen
    total_en_mercado: Optional[int] = None
    imagenes: List[str] = []
    sugerencia: Optional[PrecioSugerido] = None
    inventario: Optional[InfoInventario] = None
    tipo_pieza: Optional[str] = None  # Nombre del artículo desde el scraper
    referencias_iam: Optional[List[str]] = None  # Referencias equivalentes IAM
    referencias_iam_texto: Optional[str] = None  # Referencias IAM separadas por coma
    # Nuevos campos para multi-plataforma
    resultados_por_plataforma: Optional[List[PlataformaResultado]] = None
    plataformas_consultadas: int = 0
    plataformas_con_resultados: int = 0
    # Indica si la empresa tiene configuración de precios propia
    configuracion_precios_activa: bool = False


class CsvExcelRequest(BaseModel):
    """Request para cargar CSV/Excel"""
    datos: List[Dict[str, Any]] = Field(..., description="Datos parseados del archivo")


class CargaArchivoResponse(BaseModel):
    """Response de carga de archivo"""
    precios_encontrados: int
    resumen: PrecioResumen
    detalles: Dict[str, Any] = {}
