"""
Router para búsqueda de precios
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
import logging
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Tuple, Optional

from app.schemas.precios import BuscarPreciosRequest, BuscarPreciosResponse, PrecioResumen, PrecioSugerido, InfoInventario, PlataformaResultado
from app.database import get_db
from app.models.busqueda import Busqueda, Usuario, BaseDesguace, PiezaDesguace, PiezaVendida
from app.dependencies import get_current_user_with_workspace
from core.scraper_factory import ScraperFactory
from services.pricing import summarize, detect_outliers_iqr
from services.precio_sugerido import sugerir_precio, sugerir_precio_db
from app.scrapers.referencias import obtener_primera_referencia_por_proveedor

logger = logging.getLogger(__name__)
router = APIRouter()


def _scrape_platform(platform_id: str, referencia: str, cantidad: int) -> Dict:
    """Función helper para scraping en paralelo de una plataforma"""
    try:
        scraper = ScraperFactory.create_scraper(platform_id)
        
        if not scraper.setup_session(referencia):
            return {
                "plataforma_id": platform_id,
                "plataforma_nombre": scraper.name,
                "precios": [],
                "imagenes": [],
                "tipo_pieza": None,
                "error": "No se pudo configurar sesión"
            }
        
        imagenes = []
        tipo_pieza = None
        
        if hasattr(scraper, 'fetch_all_data'):
            precios, imagenes, tipo_pieza, _ = scraper.fetch_all_data(referencia, cantidad)
        elif hasattr(scraper, 'fetch_prices_with_images'):
            precios, imagenes = scraper.fetch_prices_with_images(referencia, cantidad)
        else:
            precios = scraper.fetch_prices(referencia, cantidad)
        
        return {
            "plataforma_id": platform_id,
            "plataforma_nombre": scraper.name,
            "precios": precios or [],
            "imagenes": imagenes[:5] if imagenes else [],  # Limitar imágenes
            "tipo_pieza": tipo_pieza,
            "error": None
        }
    except Exception as e:
        logger.error(f"Error scraping {platform_id}: {e}")
        return {
            "plataforma_id": platform_id,
            "plataforma_nombre": platform_id.capitalize(),
            "precios": [],
            "imagenes": [],
            "tipo_pieza": None,
            "error": str(e)
        }


@router.post("/buscar", response_model=BuscarPreciosResponse)
async def buscar_precios(
    request: BuscarPreciosRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user_with_workspace),
):
    """
    Busca precios de una referencia en una o todas las plataformas
    
    Requiere autenticación y que el usuario tenga un entorno de trabajo asignado
    """
    try:
        logger.info(
            f"Usuario {usuario.email} buscando: {request.referencia} "
            f"en plataforma {request.plataforma} - Entorno: {usuario.entorno_trabajo_id}"
        )
        
        if not usuario.entorno_trabajo_id:
            raise HTTPException(
                status_code=400,
                detail="Usuario no tiene entorno de trabajo asignado"
            )
        
        # Plataformas rápidas (incluidas en "todas")
        scrapers_rapidos = ScraperFactory.get_available_platforms()
        
        # Plataformas lentas (solo selección explícita)
        scrapers_lentos = ScraperFactory.get_slow_platforms()
        
        # Todas las plataformas válidas
        todas_plataformas = list(scrapers_rapidos.keys()) + scrapers_lentos
        
        # Determinar qué plataformas buscar
        if request.plataforma == "todas":
            # "Todas" incluye las rápidas + las lentas seleccionadas
            plataformas_a_buscar = list(scrapers_rapidos.keys())
            # Añadir plataformas lentas si están marcadas
            if request.incluir_bparts:
                plataformas_a_buscar.append("bparts")
            if request.incluir_ovoko:
                plataformas_a_buscar.append("ovoko")
        else:
            if request.plataforma not in todas_plataformas:
                raise HTTPException(
                    status_code=400,
                    detail=f"Plataforma no válida. Disponibles: {todas_plataformas}"
                )
            plataformas_a_buscar = [request.plataforma]
        
        # Buscar en paralelo en todas las plataformas seleccionadas
        resultados_plataformas: List[PlataformaResultado] = []
        todos_precios: List[float] = []
        todas_imagenes: List[str] = []
        tipo_pieza_detectado = None
        
        with ThreadPoolExecutor(max_workers=len(plataformas_a_buscar)) as executor:
            futures = {
                executor.submit(_scrape_platform, pid, request.referencia, request.cantidad): pid
                for pid in plataformas_a_buscar
            }
            
            for future in as_completed(futures):
                resultado = future.result()
                
                # Calcular estadísticas por plataforma (con outliers removidos)
                precios_plat = resultado["precios"]
                
                # Aplicar detección de outliers para min/max/media
                precios_limpios = precios_plat
                if len(precios_plat) > 4:
                    precios_limpios, _ = detect_outliers_iqr(precios_plat)
                    if not precios_limpios:  # Si todos son outliers, usar originales
                        precios_limpios = precios_plat
                
                resultado_plat = PlataformaResultado(
                    plataforma_id=resultado["plataforma_id"],
                    plataforma_nombre=resultado["plataforma_nombre"],
                    precios=precios_plat,  # Guardar todos para referencia
                    cantidad_precios=len(precios_plat),
                    precio_minimo=min(precios_limpios) if precios_limpios else None,
                    precio_maximo=max(precios_limpios) if precios_limpios else None,
                    precio_medio=sum(precios_limpios) / len(precios_limpios) if precios_limpios else None,
                    imagenes=resultado["imagenes"],
                    error=resultado["error"]
                )
                resultados_plataformas.append(resultado_plat)
                
                # Acumular datos globales
                todos_precios.extend(precios_plat)
                todas_imagenes.extend(resultado["imagenes"])
                
                # Capturar tipo de pieza si se detectó
                if not tipo_pieza_detectado and resultado.get("tipo_pieza"):
                    tipo_pieza_detectado = resultado["tipo_pieza"]
        
        # Ordenar resultados por plataforma
        resultados_plataformas.sort(key=lambda x: x.plataforma_id)
        
        plataformas_con_resultados = sum(1 for r in resultados_plataformas if r.cantidad_precios > 0)
        
        # Si buscamos en una sola plataforma y no hay tipo de pieza,
        # buscar SOLO en ecooparts (la más rápida para detectar tipo)
        if request.plataforma != "todas" and not tipo_pieza_detectado and todos_precios:
            logger.info("Buscando tipo de pieza en ecooparts...")
            try:
                resultado_eco = _scrape_platform("ecooparts", request.referencia, 5)
                if resultado_eco.get("tipo_pieza"):
                    tipo_pieza_detectado = resultado_eco["tipo_pieza"]
                    logger.info(f"Tipo de pieza detectado de ecooparts: {tipo_pieza_detectado}")
                    # Añadir precios para mejor referencia
                    if resultado_eco["precios"]:
                        todos_precios.extend(resultado_eco["precios"])
            except Exception as e:
                logger.warning(f"Error buscando tipo en ecooparts: {e}")
        
        if not todos_precios:
            raise HTTPException(
                status_code=404,
                detail=f"No se encontraron precios para {request.referencia} en ninguna plataforma"
            )
        
        # Analizar precios combinados
        resumen_dict = summarize(todos_precios, remove_outliers=True)
        
        # Convertir resumen a schema
        resumen = PrecioResumen(
            media=resumen_dict.get('media', 0),
            mediana=resumen_dict.get('mediana', 0),
            minimo=resumen_dict.get('minimo', 0),
            maximo=resumen_dict.get('maximo', 0),
            desviacion_estandar=resumen_dict.get('desviacion_estandar', 0),
            cantidad_precios=len(todos_precios),
            outliers_removidos=resumen_dict.get('outliers_removidos', 0),
            rango_original=resumen_dict.get('rango_original'),
            rango_limpio=resumen_dict.get('rango_limpio'),
        )
        
        # Guardar en BD
        busqueda = Busqueda(
            usuario_id=usuario.id,
            entorno_trabajo_id=usuario.entorno_trabajo_id,
            referencia=request.referencia,
            plataforma=request.plataforma if request.plataforma != "todas" else "multi",
            cantidad_precios=len(todos_precios),
            precio_medio=resumen.media,
            precio_mediana=resumen.mediana,
            precio_minimo=resumen.minimo,
            precio_maximo=resumen.maximo,
            desviacion_estandar=resumen.desviacion_estandar,
            outliers_removidos=resumen.outliers_removidos,
        )
        db.add(busqueda)
        db.commit()
        
        logger.info(f"Búsqueda guardada con ID: {busqueda.id}")
        
        # Seleccionar imágenes (3 aleatorias de todas las plataformas)
        imagenes_unicas = list(dict.fromkeys(todas_imagenes))
        imagenes_resultado = random.sample(imagenes_unicas, min(3, len(imagenes_unicas))) if imagenes_unicas else []
        
        # Consultar piezas en stock y vendidas del inventario propio
        inventario_info = None
        try:
            from sqlalchemy import or_
            
            # Buscar en stock (PiezaDesguace)
            base_desguace = db.query(BaseDesguace).filter(
                BaseDesguace.entorno_trabajo_id == usuario.entorno_trabajo_id
            ).first()
            
            piezas_stock = []
            en_stock_count = 0
            if base_desguace:
                piezas_en_stock = db.query(PiezaDesguace).filter(
                    PiezaDesguace.base_desguace_id == base_desguace.id,
                    or_(
                        PiezaDesguace.refid.ilike(f"%{request.referencia}%"),
                        PiezaDesguace.oem.ilike(f"%{request.referencia}%"),
                        PiezaDesguace.oe.ilike(f"%{request.referencia}%"),
                        PiezaDesguace.iam.ilike(f"%{request.referencia}%")
                    )
                ).all()
                en_stock_count = len(piezas_en_stock)
                for p in piezas_en_stock[:5]:  # Limitar a 5
                    piezas_stock.append({
                        "id": p.id,
                        "refid": p.refid,
                        "oem": p.oem,
                        "articulo": p.articulo,
                        "marca": p.marca,
                        "modelo": p.modelo,
                        "precio": p.precio,
                        "ubicacion": p.ubicacion,
                        "imagen": p.imagen
                    })
            
            # Buscar vendidas (PiezaVendida)
            piezas_vendidas = db.query(PiezaVendida).filter(
                PiezaVendida.entorno_trabajo_id == usuario.entorno_trabajo_id,
                or_(
                    PiezaVendida.refid.ilike(f"%{request.referencia}%"),
                    PiezaVendida.oem.ilike(f"%{request.referencia}%"),
                    PiezaVendida.oe.ilike(f"%{request.referencia}%"),
                    PiezaVendida.iam.ilike(f"%{request.referencia}%")
                )
            ).all()
            vendidas_count = len(piezas_vendidas)
            piezas_vendidas_list = []
            for p in piezas_vendidas[:5]:  # Limitar a 5
                # Calcular días de rotación
                dias_rotacion = None
                if p.fecha_venta and p.fecha_fichaje:
                    delta = p.fecha_venta - p.fecha_fichaje
                    dias_rotacion = delta.days
                
                piezas_vendidas_list.append({
                    "id": p.id,
                    "refid": p.refid,
                    "oem": p.oem,
                    "articulo": p.articulo,
                    "precio": p.precio,
                    "fecha_venta": p.fecha_venta.isoformat() if p.fecha_venta else None,
                    "fecha_fichaje": p.fecha_fichaje.isoformat() if p.fecha_fichaje else None,
                    "dias_rotacion": dias_rotacion
                })
            
            inventario_info = InfoInventario(
                en_stock=en_stock_count,
                vendidas=vendidas_count,
                piezas_stock=piezas_stock,
                piezas_vendidas=piezas_vendidas_list
            )
            
            # Si no se detectó tipo de pieza desde scrapers, intentar obtenerlo del inventario propio
            if not tipo_pieza_detectado and piezas_en_stock:
                for p in piezas_en_stock:
                    if p.articulo:
                        tipo_pieza_detectado = p.articulo.strip().upper()
                        logger.info(f"Tipo de pieza obtenido del inventario: {tipo_pieza_detectado}")
                        break
            
            # También intentar con piezas vendidas si aún no hay tipo
            if not tipo_pieza_detectado and piezas_vendidas:
                for p in piezas_vendidas:
                    if p.articulo:
                        tipo_pieza_detectado = p.articulo.strip().upper()
                        logger.info(f"Tipo de pieza obtenido de vendidas: {tipo_pieza_detectado}")
                        break
                        
        except Exception as inv_error:
            logger.warning(f"Error consultando inventario: {inv_error}")
        
        # Intentar sugerir precio basado en familia
        # Usar el tipo de pieza detectado desde cualquier scraper o inventario
        # Usa configuración del desguace si existe, sino CSV global
        sugerencia = None
        if tipo_pieza_detectado:
            logger.info(f"Tipo de pieza para sugerencia: {tipo_pieza_detectado}")
            logger.info(f"Precio medio para cálculo: {resumen.media}")
            sugerencia_data = sugerir_precio_db(db, usuario.entorno_trabajo_id, tipo_pieza_detectado, resumen.media)
            logger.info(f"Resultado sugerencia_data: {sugerencia_data}")
            if sugerencia_data:
                sugerencia = PrecioSugerido(
                    familia=sugerencia_data["familia"],
                    precio_sugerido=sugerencia_data["precio_sugerido"],
                    precios_familia=sugerencia_data["precios_familia"],
                    precio_mercado=sugerencia_data["precio_mercado"],
                )
                logger.info(f"Sugerencia creada: familia={sugerencia.familia}, precio={sugerencia.precio_sugerido}")
        else:
            logger.warning("No se detectó tipo de pieza, no se puede sugerir precio")
        
        # Buscar referencias IAM equivalentes en segundo plano
        referencias_iam = []
        referencias_iam_texto = ""
        try:
            referencias_iam = obtener_primera_referencia_por_proveedor(request.referencia)
            referencias_iam_texto = "/".join(referencias_iam) if referencias_iam else ""
            logger.info(f"Referencias IAM encontradas: {len(referencias_iam)}")
        except Exception as ref_error:
            logger.warning(f"Error buscando referencias IAM: {ref_error}")
        
        # Retornar respuesta con datos multi-plataforma
        return BuscarPreciosResponse(
            referencia=request.referencia,
            plataforma=request.plataforma,
            precios=sorted(todos_precios),
            resumen=resumen,
            total_en_mercado=len(todos_precios),
            imagenes=imagenes_resultado,
            sugerencia=sugerencia,
            inventario=inventario_info,
            tipo_pieza=tipo_pieza_detectado,
            referencias_iam=referencias_iam if referencias_iam else None,
            referencias_iam_texto=referencias_iam_texto if referencias_iam_texto else None,
            resultados_por_plataforma=resultados_plataformas,
            plataformas_consultadas=len(plataformas_a_buscar),
            plataformas_con_resultados=plataformas_con_resultados,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error en búsqueda de precios: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error durante la búsqueda: {str(e)}"
        )


@router.get("/plataformas-disponibles")
async def plataformas_disponibles(
    usuario: Usuario = Depends(get_current_user_with_workspace),
):
    """
    Obtiene lista de plataformas disponibles
    
    Requiere autenticación
    """
    scrapers = ScraperFactory.get_available_platforms()
    return {
        "plataformas": scrapers,
        "total": len(scrapers)
    }
