"""
Router para gestión de Stockeo Automático
Solo accesible por sysowner
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict
import os
import csv
import json
from datetime import datetime

from app.database import get_db
from app.models.busqueda import Usuario, EntornoTrabajo, ConfiguracionStockeo
from app.dependencies import get_current_user

router = APIRouter(prefix="/stockeo", tags=["stockeo"])


# ============== SCHEMAS ==============
class ConfiguracionStockeoCreate(BaseModel):
    entorno_trabajo_id: int
    ruta_csv: Optional[str] = None
    encoding: str = 'utf-8-sig'
    delimitador: str = ';'
    mapeo_columnas: Optional[Dict[str, str]] = None
    intervalo_minutos: int = 30
    activo: bool = False


class ConfiguracionStockeoUpdate(BaseModel):
    ruta_csv: Optional[str] = None
    encoding: Optional[str] = None
    delimitador: Optional[str] = None
    mapeo_columnas: Optional[Dict[str, str]] = None
    intervalo_minutos: Optional[int] = None
    activo: Optional[bool] = None


class ConfiguracionStockeoResponse(BaseModel):
    id: int
    entorno_trabajo_id: int
    entorno_nombre: Optional[str] = None
    ruta_csv: Optional[str] = None
    encoding: str
    delimitador: str
    mapeo_columnas: Optional[Dict[str, str]] = None
    intervalo_minutos: int
    activo: bool
    ultima_ejecucion: Optional[datetime] = None
    ultimo_resultado: Optional[str] = None
    piezas_importadas: int
    ventas_detectadas: int

    class Config:
        from_attributes = True


class CSVHeadersResponse(BaseModel):
    headers: List[str]
    preview: List[Dict[str, str]]
    total_filas: int
    archivo_existe: bool
    error: Optional[str] = None


# Campos de BD que se pueden mapear
# El campo 'oem_oe_iam' es especial: permite mapear una columna con formato "OEM / OE / IAM" 
# a los tres campos separados automáticamente
CAMPOS_BD_DISPONIBLES = [
    {"key": "refid", "label": "ID Referencia", "required": True},
    {"key": "oem_oe_iam", "label": "OEM/OE/IAM (combinado)", "required": False, "descripcion": "Para columnas con formato 'OEM / OE / IAM' separados por /"},
    {"key": "oem", "label": "OEM", "required": False},
    {"key": "oe", "label": "OE", "required": False},
    {"key": "iam", "label": "IAM", "required": False},
    {"key": "precio", "label": "Precio", "required": False},
    {"key": "ubicacion", "label": "Ubicación", "required": False},
    {"key": "observaciones", "label": "Observaciones", "required": False},
    {"key": "articulo", "label": "Artículo/Tipo", "required": False},
    {"key": "marca", "label": "Marca", "required": False},
    {"key": "modelo", "label": "Modelo", "required": False},
    {"key": "version", "label": "Versión", "required": False},
    {"key": "imagen", "label": "URL Imagen", "required": False},
]


def verificar_sysowner(current_user: Usuario):
    """Verificar que el usuario es sysowner"""
    if current_user.rol != 'sysowner':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el sysowner puede acceder a esta funcionalidad"
        )


# ============== ENDPOINTS ==============

@router.get("/campos-disponibles")
def get_campos_disponibles(current_user: Usuario = Depends(get_current_user)):
    """Obtener lista de campos de BD disponibles para mapear"""
    verificar_sysowner(current_user)
    return CAMPOS_BD_DISPONIBLES


@router.get("/configuraciones", response_model=List[ConfiguracionStockeoResponse])
def get_todas_configuraciones(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener todas las configuraciones de stockeo"""
    verificar_sysowner(current_user)
    
    configs = db.query(ConfiguracionStockeo).all()
    result = []
    
    for config in configs:
        entorno = db.query(EntornoTrabajo).filter(EntornoTrabajo.id == config.entorno_trabajo_id).first()
        
        mapeo = None
        if config.mapeo_columnas:
            try:
                mapeo = json.loads(config.mapeo_columnas)
            except:
                mapeo = None
        
        result.append(ConfiguracionStockeoResponse(
            id=config.id,
            entorno_trabajo_id=config.entorno_trabajo_id,
            entorno_nombre=entorno.nombre if entorno else None,
            ruta_csv=config.ruta_csv,
            encoding=config.encoding,
            delimitador=config.delimitador,
            mapeo_columnas=mapeo,
            intervalo_minutos=config.intervalo_minutos,
            activo=config.activo,
            ultima_ejecucion=config.ultima_ejecucion,
            ultimo_resultado=config.ultimo_resultado,
            piezas_importadas=config.piezas_importadas,
            ventas_detectadas=config.ventas_detectadas
        ))
    
    return result


@router.get("/configuracion/{entorno_id}", response_model=ConfiguracionStockeoResponse)
def get_configuracion(
    entorno_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener configuración de stockeo para un entorno específico"""
    verificar_sysowner(current_user)
    
    config = db.query(ConfiguracionStockeo).filter(
        ConfiguracionStockeo.entorno_trabajo_id == entorno_id
    ).first()
    
    if not config:
        # Retornar configuración vacía si no existe
        entorno = db.query(EntornoTrabajo).filter(EntornoTrabajo.id == entorno_id).first()
        if not entorno:
            raise HTTPException(status_code=404, detail="Entorno no encontrado")
        
        return ConfiguracionStockeoResponse(
            id=0,
            entorno_trabajo_id=entorno_id,
            entorno_nombre=entorno.nombre,
            ruta_csv=None,
            encoding='utf-8-sig',
            delimitador=';',
            mapeo_columnas=None,
            intervalo_minutos=30,
            activo=False,
            ultima_ejecucion=None,
            ultimo_resultado=None,
            piezas_importadas=0,
            ventas_detectadas=0
        )
    
    entorno = db.query(EntornoTrabajo).filter(EntornoTrabajo.id == config.entorno_trabajo_id).first()
    
    mapeo = None
    if config.mapeo_columnas:
        try:
            mapeo = json.loads(config.mapeo_columnas)
        except:
            mapeo = None
    
    return ConfiguracionStockeoResponse(
        id=config.id,
        entorno_trabajo_id=config.entorno_trabajo_id,
        entorno_nombre=entorno.nombre if entorno else None,
        ruta_csv=config.ruta_csv,
        encoding=config.encoding,
        delimitador=config.delimitador,
        mapeo_columnas=mapeo,
        intervalo_minutos=config.intervalo_minutos,
        activo=config.activo,
        ultima_ejecucion=config.ultima_ejecucion,
        ultimo_resultado=config.ultimo_resultado,
        piezas_importadas=config.piezas_importadas,
        ventas_detectadas=config.ventas_detectadas
    )


@router.post("/configuracion", response_model=ConfiguracionStockeoResponse)
def crear_configuracion(
    data: ConfiguracionStockeoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Crear o actualizar configuración de stockeo para un entorno"""
    verificar_sysowner(current_user)
    
    # Verificar que el entorno existe
    entorno = db.query(EntornoTrabajo).filter(EntornoTrabajo.id == data.entorno_trabajo_id).first()
    if not entorno:
        raise HTTPException(status_code=404, detail="Entorno no encontrado")
    
    # Buscar configuración existente
    config = db.query(ConfiguracionStockeo).filter(
        ConfiguracionStockeo.entorno_trabajo_id == data.entorno_trabajo_id
    ).first()
    
    mapeo_json = json.dumps(data.mapeo_columnas) if data.mapeo_columnas else None
    
    if config:
        # Actualizar existente
        config.ruta_csv = data.ruta_csv
        config.encoding = data.encoding
        config.delimitador = data.delimitador
        config.mapeo_columnas = mapeo_json
        config.intervalo_minutos = data.intervalo_minutos
        config.activo = data.activo
    else:
        # Crear nueva
        config = ConfiguracionStockeo(
            entorno_trabajo_id=data.entorno_trabajo_id,
            ruta_csv=data.ruta_csv,
            encoding=data.encoding,
            delimitador=data.delimitador,
            mapeo_columnas=mapeo_json,
            intervalo_minutos=data.intervalo_minutos,
            activo=data.activo
        )
        db.add(config)
    
    db.commit()
    db.refresh(config)
    
    mapeo = None
    if config.mapeo_columnas:
        try:
            mapeo = json.loads(config.mapeo_columnas)
        except:
            mapeo = None
    
    return ConfiguracionStockeoResponse(
        id=config.id,
        entorno_trabajo_id=config.entorno_trabajo_id,
        entorno_nombre=entorno.nombre,
        ruta_csv=config.ruta_csv,
        encoding=config.encoding,
        delimitador=config.delimitador,
        mapeo_columnas=mapeo,
        intervalo_minutos=config.intervalo_minutos,
        activo=config.activo,
        ultima_ejecucion=config.ultima_ejecucion,
        ultimo_resultado=config.ultimo_resultado,
        piezas_importadas=config.piezas_importadas,
        ventas_detectadas=config.ventas_detectadas
    )


@router.put("/configuracion/{entorno_id}", response_model=ConfiguracionStockeoResponse)
def actualizar_configuracion(
    entorno_id: int,
    data: ConfiguracionStockeoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Actualizar configuración de stockeo"""
    verificar_sysowner(current_user)
    
    config = db.query(ConfiguracionStockeo).filter(
        ConfiguracionStockeo.entorno_trabajo_id == entorno_id
    ).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")
    
    if data.ruta_csv is not None:
        config.ruta_csv = data.ruta_csv
    if data.encoding is not None:
        config.encoding = data.encoding
    if data.delimitador is not None:
        config.delimitador = data.delimitador
    if data.mapeo_columnas is not None:
        config.mapeo_columnas = json.dumps(data.mapeo_columnas)
    if data.intervalo_minutos is not None:
        config.intervalo_minutos = data.intervalo_minutos
    if data.activo is not None:
        config.activo = data.activo
    
    db.commit()
    db.refresh(config)
    
    entorno = db.query(EntornoTrabajo).filter(EntornoTrabajo.id == config.entorno_trabajo_id).first()
    
    mapeo = None
    if config.mapeo_columnas:
        try:
            mapeo = json.loads(config.mapeo_columnas)
        except:
            mapeo = None
    
    return ConfiguracionStockeoResponse(
        id=config.id,
        entorno_trabajo_id=config.entorno_trabajo_id,
        entorno_nombre=entorno.nombre if entorno else None,
        ruta_csv=config.ruta_csv,
        encoding=config.encoding,
        delimitador=config.delimitador,
        mapeo_columnas=mapeo,
        intervalo_minutos=config.intervalo_minutos,
        activo=config.activo,
        ultima_ejecucion=config.ultima_ejecucion,
        ultimo_resultado=config.ultimo_resultado,
        piezas_importadas=config.piezas_importadas,
        ventas_detectadas=config.ventas_detectadas
    )


@router.post("/leer-csv-headers", response_model=CSVHeadersResponse)
def leer_csv_headers(
    ruta_csv: str,
    encoding: str = 'utf-8-sig',
    delimitador: str = ';',
    current_user: Usuario = Depends(get_current_user)
):
    """Leer las cabeceras y primeras filas de un CSV para configurar mapeo"""
    verificar_sysowner(current_user)
    
    # Verificar que el archivo existe
    if not os.path.exists(ruta_csv):
        return CSVHeadersResponse(
            headers=[],
            preview=[],
            total_filas=0,
            archivo_existe=False,
            error=f"El archivo no existe: {ruta_csv}"
        )
    
    try:
        headers = []
        preview = []
        total_filas = 0
        
        with open(ruta_csv, 'r', encoding=encoding) as f:
            # Contar líneas totales
            total_filas = sum(1 for _ in f) - 1  # -1 por header
            
        with open(ruta_csv, 'r', encoding=encoding) as f:
            reader = csv.DictReader(f, delimiter=delimitador)
            headers = reader.fieldnames or []
            
            # Leer primeras 5 filas como preview
            for i, row in enumerate(reader):
                if i >= 5:
                    break
                preview.append(dict(row))
        
        return CSVHeadersResponse(
            headers=headers,
            preview=preview,
            total_filas=total_filas,
            archivo_existe=True,
            error=None
        )
        
    except UnicodeDecodeError as e:
        return CSVHeadersResponse(
            headers=[],
            preview=[],
            total_filas=0,
            archivo_existe=True,
            error=f"Error de encoding. Prueba con otro encoding (utf-8, utf-8-sig, latin-1, cp1252). Error: {str(e)}"
        )
    except Exception as e:
        return CSVHeadersResponse(
            headers=[],
            preview=[],
            total_filas=0,
            archivo_existe=True,
            error=f"Error leyendo CSV: {str(e)}"
        )


@router.post("/ejecutar-ahora/{entorno_id}")
def ejecutar_importacion_ahora(
    entorno_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Ejecutar importación manualmente ahora"""
    verificar_sysowner(current_user)
    
    config = db.query(ConfiguracionStockeo).filter(
        ConfiguracionStockeo.entorno_trabajo_id == entorno_id
    ).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")
    
    if not config.ruta_csv:
        raise HTTPException(status_code=400, detail="No hay ruta CSV configurada")
    
    if not config.mapeo_columnas:
        raise HTTPException(status_code=400, detail="No hay mapeo de columnas configurado")
    
    # Parsear mapeo de columnas
    try:
        mapeo = json.loads(config.mapeo_columnas)
    except:
        raise HTTPException(status_code=400, detail="Error en formato del mapeo de columnas")
    
    # Importar función de importación
    from services.csv_auto_import import importar_csv_con_configuracion
    
    # Ejecutar la importación
    resultado = importar_csv_con_configuracion(
        entorno_trabajo_id=entorno_id,
        csv_path=config.ruta_csv,
        mapeo_columnas=mapeo,
        encoding=config.encoding or 'utf-8-sig',
        delimitador=config.delimitador or ';'
    )
    
    # Actualizar la configuración con los resultados
    config.ultima_ejecucion = datetime.now()
    config.ultimo_resultado = "éxito" if resultado["success"] else f"error: {resultado.get('error', 'desconocido')}"
    config.piezas_importadas = resultado.get("piezas_importadas", 0)
    config.ventas_detectadas = resultado.get("piezas_vendidas", 0)
    db.commit()
    
    if resultado["success"]:
        return {
            "mensaje": "Importación completada exitosamente",
            "entorno_id": entorno_id,
            "ruta_csv": config.ruta_csv,
            "piezas_importadas": resultado.get("piezas_importadas", 0),
            "piezas_actualizadas": resultado.get("piezas_actualizadas", 0),
            "piezas_vendidas": resultado.get("piezas_vendidas", 0),
            "total_piezas": resultado.get("total_piezas", 0)
        }
    else:
        raise HTTPException(
            status_code=500, 
            detail=f"Error en importación: {resultado.get('error', 'desconocido')}"
        )


@router.delete("/configuracion/{entorno_id}")
def eliminar_configuracion(
    entorno_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Eliminar configuración de stockeo"""
    verificar_sysowner(current_user)
    
    config = db.query(ConfiguracionStockeo).filter(
        ConfiguracionStockeo.entorno_trabajo_id == entorno_id
    ).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")
    
    db.delete(config)
    db.commit()
    
    return {"mensaje": "Configuración eliminada correctamente"}
