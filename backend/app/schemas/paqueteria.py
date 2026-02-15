"""
Schemas Pydantic para el módulo de Paquetería (tipo fichaje)
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class RegistroPaqueteCreate(BaseModel):
    """Request para registrar una pieza en una caja"""
    id_caja: str = Field(..., min_length=1)
    id_pieza: str = Field(..., min_length=1)
    entorno_id: Optional[int] = None


class RegistroPaqueteUpdate(BaseModel):
    """Request para editar un registro existente"""
    id_caja: Optional[str] = None
    id_pieza: Optional[str] = None


class RegistroPaqueteResponse(BaseModel):
    """Response de un registro de paquetería"""
    id: int
    usuario_id: int
    usuario_email: str
    entorno_trabajo_id: int
    id_caja: str
    id_pieza: str
    fecha_registro: datetime

    class Config:
        from_attributes = True


class RankingUsuario(BaseModel):
    """Un usuario en el ranking de paquetería"""
    usuario_id: int
    usuario_email: str
    usuario_nombre: Optional[str] = None
    total_registros: int
    primera: Optional[datetime] = None
    ultima: Optional[datetime] = None


class RankingResponse(BaseModel):
    """Ranking de paquetería del día"""
    fecha: str
    usuarios: list[RankingUsuario]
    total_general: int


class MisRegistrosResponse(BaseModel):
    """Un registro propio"""
    id: int
    id_caja: str
    id_pieza: str
    fecha_registro: datetime
    usuario_email: str
    usuario_nombre: Optional[str] = None

    class Config:
        from_attributes = True


# ============== TIPOS DE CAJA ==============

class TipoCajaCreate(BaseModel):
    """Request para crear un tipo de caja"""
    referencia_caja: str = Field(..., min_length=1)
    tipo_nombre: str = Field(..., min_length=1)
    descripcion: Optional[str] = None
    dias_aviso: Optional[int] = None
    entorno_id: Optional[int] = None


class TipoCajaUpdate(BaseModel):
    """Request para actualizar un tipo de caja"""
    referencia_caja: Optional[str] = None
    tipo_nombre: Optional[str] = None
    descripcion: Optional[str] = None
    dias_aviso: Optional[int] = Field(None, description="Días restantes para avisar (null = desactivar)")


class TipoCajaResponse(BaseModel):
    """Response de un tipo de caja"""
    id: int
    entorno_trabajo_id: int
    referencia_caja: str
    tipo_nombre: str
    descripcion: Optional[str] = None
    stock_actual: int = 0
    dias_aviso: Optional[int] = None
    aviso_enviado: bool = False
    fecha_creacion: datetime

    class Config:
        from_attributes = True


# ============== MOVIMIENTOS DE CAJA ==============

class MovimientoCajaCreate(BaseModel):
    """Request para registrar un movimiento de stock"""
    cantidad: int = Field(..., description="Positivo para entrada, negativo para consumo")
    tipo_movimiento: str = Field(..., pattern="^(entrada|consumo|ajuste)$")
    notas: Optional[str] = None


class MovimientoCajaResponse(BaseModel):
    """Response de un movimiento"""
    id: int
    tipo_caja_id: int
    cantidad: int
    tipo_movimiento: str
    notas: Optional[str] = None
    usuario_email: Optional[str] = None
    fecha: datetime

    class Config:
        from_attributes = True


class ResumenTipoCaja(BaseModel):
    """Resumen de un tipo de caja con estadísticas de uso"""
    id: int
    referencia_caja: str
    tipo_nombre: str
    descripcion: Optional[str] = None
    stock_actual: int = 0
    total_entradas: int = 0
    total_consumidas: int = 0
    consumo_periodo: int = 0
    media_diaria: float = 0.0
    dias_restantes: Optional[int] = None
    dias_aviso: Optional[int] = None
    alerta_stock: bool = False  # True si hay que mostrar aviso


# ============== ESTADÍSTICAS ==============

class EstadisticasDia(BaseModel):
    """Datos de un día para la gráfica"""
    fecha: str
    dia_semana: str
    total: int


class EstadisticasUsuario(BaseModel):
    """Estadísticas de un usuario"""
    usuario_id: int
    usuario_email: str
    usuario_nombre: Optional[str] = None
    total: int
    porcentaje: float = 0.0


class EstadisticasCaja(BaseModel):
    """Estadísticas de uso de una caja"""
    id_caja: str
    tipo_nombre: Optional[str] = None
    total_piezas: int
    porcentaje: float = 0.0


class EstadisticasPaqueteriaResponse(BaseModel):
    """Respuesta completa de estadísticas de paquetería"""
    # Totales
    total_hoy: int = 0
    total_semana: int = 0
    total_mes: int = 0
    total_historico: int = 0
    # Promedios
    promedio_diario: float = 0.0
    dias_trabajados: int = 0
    # Mejor día
    mejor_dia_fecha: Optional[str] = None
    mejor_dia_total: int = 0
    # Gráfica últimos 7 días
    ultimos_dias: list[EstadisticasDia] = []
    # Ranking usuarios (del mes)
    usuarios: list[EstadisticasUsuario] = []
    # Cajas más usadas (del mes)
    cajas_top: list[EstadisticasCaja] = []
