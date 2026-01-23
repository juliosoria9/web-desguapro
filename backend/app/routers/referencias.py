"""
Router para cruce de referencias OEM a IAM
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import logging

from app.dependencies import get_current_user
from app.models.busqueda import Usuario
from app.scrapers.referencias import buscar_en_todos, obtener_primera_referencia_por_proveedor

router = APIRouter()
logger = logging.getLogger(__name__)


class BuscarReferenciasRequest(BaseModel):
    referencia: str


class ReferenciaItem(BaseModel):
    source: str
    iam_ref: str
    brand: str
    description: Optional[str] = ""
    price: Optional[str] = ""
    image_url: Optional[str] = ""


class BuscarReferenciasResponse(BaseModel):
    referencia_oem: str
    resultados: Dict[str, List[Dict[str, Any]]]
    errores: Dict[str, str]
    total_encontrados: int
    proveedores_con_resultados: int


class ReferenciasRapidasResponse(BaseModel):
    referencia_oem: str
    referencias_iam: List[str]
    referencias_texto: str  # Separadas por coma


@router.post("/buscar", response_model=BuscarReferenciasResponse)
async def buscar_referencias(
    request: BuscarReferenciasRequest,
    current_user: Usuario = Depends(get_current_user)
):
    """
    Busca referencias IAM equivalentes a partir de una referencia OEM.
    Ejecuta la búsqueda en todos los proveedores disponibles en paralelo.
    """
    referencia = request.referencia.strip()
    
    if not referencia:
        raise HTTPException(status_code=400, detail="La referencia no puede estar vacía")
    
    if len(referencia) < 3:
        raise HTTPException(status_code=400, detail="La referencia debe tener al menos 3 caracteres")
    
    logger.info(f"Usuario {current_user.email} buscando referencias para OEM: {referencia}")
    
    try:
        resultados, errores = buscar_en_todos(referencia)
        
        total_encontrados = sum(len(items) for items in resultados.values())
        proveedores_con_resultados = len(resultados)
        
        return BuscarReferenciasResponse(
            referencia_oem=referencia,
            resultados=resultados,
            errores=errores,
            total_encontrados=total_encontrados,
            proveedores_con_resultados=proveedores_con_resultados
        )
    except Exception as e:
        logger.error(f"Error buscando referencias: {e}")
        raise HTTPException(status_code=500, detail=f"Error en la búsqueda: {str(e)}")


@router.post("/rapidas", response_model=ReferenciasRapidasResponse)
async def referencias_rapidas(
    request: BuscarReferenciasRequest,
    current_user: Usuario = Depends(get_current_user)
):
    """
    Busca y retorna solo la primera referencia IAM de cada proveedor.
    Ideal para mostrar un resumen rápido de equivalencias.
    """
    referencia = request.referencia.strip()
    
    if not referencia:
        raise HTTPException(status_code=400, detail="La referencia no puede estar vacía")
    
    try:
        referencias = obtener_primera_referencia_por_proveedor(referencia)
        
        return ReferenciasRapidasResponse(
            referencia_oem=referencia,
            referencias_iam=referencias,
            referencias_texto=", ".join(referencias)
        )
    except Exception as e:
        logger.error(f"Error buscando referencias rápidas: {e}")
        raise HTTPException(status_code=500, detail=f"Error en la búsqueda: {str(e)}")
