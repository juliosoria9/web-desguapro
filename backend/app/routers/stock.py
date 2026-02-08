"""
Router para checkeo de stock
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
import logging
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor

from app.schemas.stock import (
    CheckStockRequest, CheckStockResponse, CheckResultItem,
    CheckStockMasivoRequest, CheckStockMasivoResponse, CheckMasivoResultItem
)
from app.database import get_db
from app.models.busqueda import ResultadoStock, Usuario
from app.dependencies import get_current_admin
from core.scraper_factory import ScraperFactory
from services.pricing import summarize
from services.precio_sugerido import sugerir_precio, buscar_familia, sugerir_precio_db

logger = logging.getLogger(__name__)
router = APIRouter()

# Scraper global reutilizable (evita setup_session en cada petición)
_ecooparts_scraper = None
_scraper_last_setup = 0

# Caché de precios por OEM (evita búsquedas repetidas)
_oem_cache = {}

def get_ecooparts_scraper():
    """Obtiene scraper de Ecooparts reutilizando sesión si es posible"""
    global _ecooparts_scraper, _scraper_last_setup
    
    current_time = time.time()
    # Re-crear scraper cada 5 minutos o si no existe
    if _ecooparts_scraper is None or (current_time - _scraper_last_setup) > 300:
        logger.info("Creando nueva sesión de Ecooparts scraper...")
        _ecooparts_scraper = ScraperFactory.create_scraper("ecooparts")
        if _ecooparts_scraper.setup_session("1K0959653C"):
            _scraper_last_setup = current_time
            logger.info("Sesión de Ecooparts creada correctamente")
        else:
            logger.error("No se pudo crear sesión de Ecooparts")
            _ecooparts_scraper = None
    
    return _ecooparts_scraper


def procesar_item(item, scraper, umbral: float, db: Session = None, entorno_trabajo_id: int = None):
    """Procesa un item de forma síncrona (para usar con ThreadPoolExecutor)"""
    global _oem_cache
    
    try:
        oem = item.ref_oem
        
        # Verificar caché primero
        if oem in _oem_cache:
            precios, precio_mercado = _oem_cache[oem]
        else:
            # Buscar precios en Ecooparts
            precios = scraper.fetch_prices(oem, limit=50)
            
            if not precios:
                _oem_cache[oem] = ([], 0)  # Cachear resultado vacío también
                return None
            
            # Analizar precios
            resumen = summarize(precios, remove_outliers=True)
            precio_mercado = resumen.get('media', resumen.get('promedio', 0))
            
            # Guardar en caché
            _oem_cache[oem] = (precios, precio_mercado)
        
        if not precios or precio_mercado <= 0:
            return None
        
        # Calcular diferencia respecto al mercado
        diferencia = ((item.precio - precio_mercado) / precio_mercado) * 100
        
        # Buscar precio sugerido basado en familia
        # SOLO usa la configuración de precios de la empresa del usuario
        precio_sugerido = None
        familia = ""
        
        if item.tipo_pieza and db and entorno_trabajo_id:
            # Usar configuración de la empresa (si no tiene, devuelve None)
            sugerencia = sugerir_precio_db(db, entorno_trabajo_id, item.tipo_pieza, precio_mercado)
            
            if sugerencia:
                precio_sugerido = sugerencia.get("precio_sugerido")
                familia = sugerencia.get("familia", "")
        
        # Determinar si es outlier:
        # El precio sugerido es SIN IVA, el precio actual INCLUYE IVA (21%)
        # Solo es outlier si el precio actual es significativamente diferente al sugerido+IVA
        es_outlier = False
        if precio_sugerido is not None:
            precio_sugerido_con_iva = precio_sugerido * 1.21
            # Tolerancia del 10% para evitar falsos positivos por redondeos
            tolerancia = precio_sugerido_con_iva * 0.10
            # Solo marcar como outlier si el precio actual está fuera del rango sugerido+IVA
            if item.precio > precio_sugerido_con_iva + tolerancia:
                es_outlier = True  # Precio actual muy alto
            elif item.precio < precio_sugerido_con_iva - tolerancia:
                es_outlier = True  # Precio actual muy bajo
            # Si está dentro del rango (sugerido+IVA ± 10%), no es outlier
        else:
            # Sin precio sugerido, solo marcar si está MUY por encima del mercado
            es_outlier = diferencia > umbral  # Solo outlier si está por encima
        
        return CheckMasivoResultItem(
            ref_id=item.ref_id,
            ref_oem=item.ref_oem,
            tipo_pieza=item.tipo_pieza,
            precio_actual=item.precio,
            precio_mercado=precio_mercado,
            precio_sugerido=precio_sugerido,
            diferencia_porcentaje=diferencia,
            precios_encontrados=len(precios),
            es_outlier=es_outlier,
            familia=familia,
        )
    except Exception as e:
        logger.warning(f"Error procesando {item.ref_oem}: {str(e)}")
        return None


@router.post("/verificar-masivo", response_model=CheckStockMasivoResponse)
async def verificar_stock_masivo(
    request: CheckStockMasivoRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_admin),
):
    """
    Verifica stock masivo con mapeo de columnas flexible.
    Incluye cálculo de precios sugeridos por familia.
    
    Requiere autenticación con rol owner o admin
    """
    try:
        logger.info(f"Usuario {usuario.email} verificando stock masivo - {len(request.items)} items")
        inicio = time.time()
        
        # Obtener scraper reutilizable
        scraper = get_ecooparts_scraper()
        
        if not scraper:
            raise HTTPException(
                status_code=500,
                detail="No se pudo configurar sesión en Ecooparts"
            )
        
        resultados = []
        items_con_outliers = 0
        
        # Procesar items (secuencialmente con delay mínimo)
        # Obtener el entorno_trabajo_id del usuario para configuración de precios
        entorno_id = usuario.entorno_trabajo_id
        
        for i, item in enumerate(request.items):
            try:
                resultado = procesar_item(item, scraper, request.umbral_diferencia, db, entorno_id)
                
                if resultado:
                    resultados.append(resultado)
                    if resultado.es_outlier:
                        items_con_outliers += 1
                    
                    # Guardar en BD (opcional, puede hacer lento)
                    # resultado_bd = ResultadoStock(
                    #     ref_id=item.ref_id,
                    #     ref_oem=item.ref_oem,
                    #     precio_azeler=item.precio,
                    #     precio_mercado=resultado.precio_mercado,
                    #     diferencia_porcentaje=resultado.diferencia_porcentaje,
                    #     es_outlier=resultado.es_outlier,
                    #     precios_encontrados=resultado.precios_encontrados,
                    # )
                    # db.add(resultado_bd)
                
                # Delay mínimo entre peticiones (solo si hay más de 1 item)
                if len(request.items) > 1:
                    await asyncio.sleep(request.delay)
                
            except Exception as e:
                logger.warning(f"Error procesando item {i}: {str(e)}")
                continue
        
        # Commit deshabilitado temporalmente para velocidad
        # db.commit()
        
        tiempo_procesamiento = time.time() - inicio
        logger.info(f"Verificación completada: {len(resultados)} items procesados en {tiempo_procesamiento:.2f}s")
        
        return CheckStockMasivoResponse(
            total_items=len(request.items),
            items_procesados=len(resultados),
            items_con_outliers=items_con_outliers,
            resultados=resultados,
            tiempo_procesamiento=tiempo_procesamiento,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en verificación masiva: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error durante la verificación: {str(e)}"
        )


@router.post("/verificar", response_model=CheckStockResponse)
async def verificar_stock(
    request: CheckStockRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_admin),
):
    """
    Verifica stock de múltiples items contra Ecooparts (endpoint legacy)
    
    Requiere autenticación con rol owner o admin
    """
    try:
        logger.info(f"Usuario {usuario.email} verificando stock - {len(request.items)} items")
        inicio = time.time()
        
        # Crear scraper de Ecooparts
        scraper = ScraperFactory.create_scraper("ecooparts")
        
        # Setup sesión
        if not scraper.setup_session("1K0959653C"):
            raise HTTPException(
                status_code=500,
                detail="No se pudo configurar sesión en Ecooparts"
            )
        
        resultados = []
        items_con_outliers = 0
        
        # Procesar cada item
        for item in request.items:
            try:
                # Buscar precios en Ecooparts
                precios = scraper.fetch_prices(item.ref_oem, limit=50)
                
                if not precios:
                    continue
                
                # Analizar precios
                resumen = summarize(precios, remove_outliers=True)
                precio_mercado = resumen.get('media', resumen.get('promedio', 0))
                
                # Calcular diferencia
                if precio_mercado > 0:
                    diferencia = ((item.precio_azeler - precio_mercado) / precio_mercado) * 100
                else:
                    diferencia = 0
                
                # Determinar si es outlier
                es_outlier = abs(diferencia) > request.umbral_diferencia
                if es_outlier:
                    items_con_outliers += 1
                
                # Crear resultado
                resultado = CheckResultItem(
                    ref_id=item.ref_id,
                    ref_oem=item.ref_oem,
                    precio_azeler=item.precio_azeler,
                    precio_mercado=precio_mercado,
                    diferencia_porcentaje=diferencia,
                    precios_encontrados=len(precios),
                    es_outlier=es_outlier,
                )
                resultados.append(resultado)
                
                # Guardar en BD
                resultado_bd = ResultadoStock(
                    ref_id=item.ref_id,
                    ref_oem=item.ref_oem,
                    precio_azeler=item.precio_azeler,
                    precio_mercado=precio_mercado,
                    diferencia_porcentaje=diferencia,
                    es_outlier=es_outlier,
                    precios_encontrados=len(precios),
                )
                db.add(resultado_bd)
                
                # Delay para no saturar
                await asyncio.sleep(0.5)
                
            except Exception as e:
                logger.warning(f"Error procesando {item.ref_oem}: {str(e)}")
                continue
        
        db.commit()
        
        tiempo_procesamiento = time.time() - inicio
        
        return CheckStockResponse(
            total_items=len(request.items),
            items_procesados=len(resultados),
            items_con_outliers=items_con_outliers,
            resultados=resultados,
            tiempo_procesamiento=tiempo_procesamiento,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en verificación de stock: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error durante la verificación: {str(e)}"
        )
