"""
Servicio para sugerir precios basado en familia de piezas
Usa los CSVs familia_precios.csv y pieza_familia.csv como fallback
O la base de datos específica del desguace si está configurada
"""
import csv
import os
from typing import Optional, List, Dict
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)

# Ruta base del backend
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BACKEND_DIR, "data")


def load_pieza_familia() -> Dict[str, str]:
    """Carga el mapeo de pieza -> familia"""
    mapping = {}
    csv_path = os.path.join(DATA_DIR, "pieza_familia.csv")
    
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f, delimiter=';')
            for row in reader:
                pieza = row.get('PIEZA', '').strip().upper()
                familia = row.get('FAMILIA', '').strip().upper()
                if pieza and familia:
                    mapping[pieza] = familia
        logger.info(f"Cargadas {len(mapping)} piezas en mapeo")
    except Exception as e:
        logger.error(f"Error cargando pieza_familia.csv: {e}")
    
    return mapping


def load_familia_precios() -> Dict[str, List[float]]:
    """Carga los precios por familia"""
    precios = {}
    csv_path = os.path.join(DATA_DIR, "familia_precios.csv")
    
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f, delimiter=';')
            for row in reader:
                familia = row.get('FAMILIA', '')
                if not familia:
                    continue
                familia = familia.strip().upper()
                
                # Extraer todos los precios (PRECIO1 a PRECIO20)
                lista_precios = []
                for i in range(1, 21):
                    precio_str = row.get(f'PRECIO{i}')
                    if precio_str is not None and precio_str.strip():
                        # Manejar formato con coma decimal
                        precio_str = precio_str.strip().replace(',', '.')
                        try:
                            lista_precios.append(float(precio_str))
                        except ValueError:
                            pass
                
                if lista_precios:
                    precios[familia] = sorted(lista_precios)
        
        logger.info(f"Cargadas {len(precios)} familias con precios")
    except Exception as e:
        logger.error(f"Error cargando familia_precios.csv: {e}")
    
    return precios


# Cache global
_pieza_familia_cache: Optional[Dict[str, str]] = None
_familia_precios_cache: Optional[Dict[str, List[float]]] = None


def get_pieza_familia() -> Dict[str, str]:
    """Obtiene mapeo pieza -> familia (con cache)"""
    global _pieza_familia_cache
    if _pieza_familia_cache is None:
        _pieza_familia_cache = load_pieza_familia()
    return _pieza_familia_cache


def get_familia_precios() -> Dict[str, List[float]]:
    """Obtiene precios por familia (con cache)"""
    global _familia_precios_cache
    if _familia_precios_cache is None:
        _familia_precios_cache = load_familia_precios()
    return _familia_precios_cache


def buscar_familia_en_mapeo(referencia: str, pieza_familia: Dict[str, str]) -> Optional[str]:
    """
    Busca la familia de una pieza en un mapeo dado.
    Usa búsqueda exacta primero, luego parcial con prioridad por longitud.
    Si no encuentra, busca por la primera palabra significativa.
    """
    referencia_upper = referencia.strip().upper()
    
    # Búsqueda exacta primero
    if referencia_upper in pieza_familia:
        return pieza_familia[referencia_upper]
    
    # Búsqueda parcial - priorizar coincidencias más específicas
    mejor_match = None
    mejor_longitud = 0
    
    for pieza, fam in pieza_familia.items():
        # Coincidencia directa (una contiene a la otra)
        if pieza in referencia_upper or referencia_upper in pieza:
            longitud = len(pieza)
            if longitud > mejor_longitud:
                mejor_match = fam
                mejor_longitud = longitud
        else:
            # Búsqueda por palabras clave
            palabras_ref = set(referencia_upper.replace('/', ' ').split())
            palabras_pieza = set(pieza.replace('/', ' ').split())
            # Si todas las palabras de la referencia están en la pieza
            if palabras_ref and palabras_ref.issubset(palabras_pieza):
                longitud = len(pieza)
                if longitud > mejor_longitud:
                    mejor_match = fam
                    mejor_longitud = longitud
            # Si hay al menos 2 palabras en común
            elif len(palabras_ref & palabras_pieza) >= 2:
                longitud = len(pieza)
                if longitud > mejor_longitud:
                    mejor_match = fam
                    mejor_longitud = longitud
    
    if mejor_match:
        return mejor_match
    
    # FALLBACK: Buscar solo por la primera palabra significativa
    # Ignorar palabras cortas como "DE", "EL", "LA", etc.
    palabras_ignorar = {'DE', 'EL', 'LA', 'LOS', 'LAS', 'DEL', 'AL', 'Y', 'O', 'EN', 'CON', 'POR', 'PARA'}
    palabras = [p for p in referencia_upper.replace('/', ' ').split() if p not in palabras_ignorar and len(p) > 2]
    
    if palabras:
        primera_palabra = palabras[0]
        logger.info(f"Buscando fallback por primera palabra: {primera_palabra}")
        
        for pieza, fam in pieza_familia.items():
            # Si la pieza empieza con la misma palabra
            if pieza.startswith(primera_palabra):
                logger.info(f"Fallback encontrado: {pieza} -> {fam}")
                return fam
        
        # Último intento: buscar cualquier pieza que contenga la primera palabra
        for pieza, fam in pieza_familia.items():
            if primera_palabra in pieza:
                logger.info(f"Fallback parcial encontrado: {pieza} -> {fam}")
                return fam
    
    return None


def sugerir_precio(referencia: str, precio_mercado: float) -> Optional[Dict]:
    """
    Sugiere un precio para una pieza basándose en su familia
    
    Args:
        referencia: Nombre/tipo de la pieza (ej: "ALTERNADOR", "FARO DERECHO")
        precio_mercado: Precio medio del mercado
    
    Returns:
        Dict con precio_sugerido, familia, y lista de precios de la familia
    """
    pieza_familia = get_pieza_familia()
    familia_precios = get_familia_precios()
    
    # Buscar la familia de la pieza usando la función mejorada
    familia = buscar_familia_en_mapeo(referencia, pieza_familia)
    
    logger.info(f"Familia encontrada para '{referencia}': {familia}")
    
    if not familia:
        # FALLBACK FINAL: Si no encontramos familia, calculamos precio sugerido
        # como porcentaje del precio de mercado (sin IVA, redondeado)
        logger.info(f"No se encontró familia, usando fallback de porcentaje para: {referencia}")
        precio_sin_iva = precio_mercado / 1.21
        # Sugerir 50-60% del precio de mercado como precio competitivo
        precio_sugerido = round(precio_sin_iva * 0.55, -1)  # Redondear a decenas
        if precio_sugerido < 10:
            precio_sugerido = 10  # Mínimo 10€
        return {
            "familia": "SIN CLASIFICAR",
            "precio_sugerido": precio_sugerido,
            "precios_familia": [],
            "precio_mercado": precio_mercado,
            "metodo": "fallback_porcentaje"
        }
    
    # Obtener precios de la familia
    precios_familia = familia_precios.get(familia, [])
    if not precios_familia:
        logger.info(f"Familia '{familia}' no tiene precios definidos")
        # Fallback: calcular precio sugerido por porcentaje
        precio_sin_iva = precio_mercado / 1.21
        precio_sugerido = round(precio_sin_iva * 0.55, -1)
        if precio_sugerido < 10:
            precio_sugerido = 10
        return {
            "familia": familia,
            "precio_sugerido": precio_sugerido,
            "precios_familia": [],
            "precio_mercado": precio_mercado,
            "metodo": "fallback_familia_sin_precios"
        }
    
    # Quitar 21% IVA al precio de mercado para comparar
    precio_sin_iva = precio_mercado / 1.21
    
    # Si el precio está por debajo del mínimo, usar el mínimo
    if precio_sin_iva <= precios_familia[0]:
        precio_sugerido = precios_familia[0]
    # Si el precio está por encima del máximo, usar el máximo
    elif precio_sin_iva >= precios_familia[-1]:
        precio_sugerido = precios_familia[-1]
    else:
        # Buscar entre qué dos precios cae y aplicar regla 65%
        precio_sugerido = precios_familia[-1]  # Default al máximo
        for i in range(len(precios_familia) - 1):
            precio_bajo = precios_familia[i]
            precio_alto = precios_familia[i + 1]
            
            if precio_bajo <= precio_sin_iva < precio_alto:
                # Calcular punto de corte con ratio 65/35
                rango = precio_alto - precio_bajo
                punto_corte = precio_bajo + (rango * 0.65)
                
                # Si NO supera el 65% del rango, elige el precio bajo
                # Si supera el 65%, elige el precio alto
                if precio_sin_iva < punto_corte:
                    precio_sugerido = precio_bajo
                else:
                    precio_sugerido = precio_alto
                break
    
    return {
        "familia": familia,
        "precio_sugerido": precio_sugerido,
        "precios_familia": precios_familia,
        "precio_mercado": precio_mercado,
    }


def buscar_familia(texto: str) -> Optional[str]:
    """Busca la familia de una pieza por texto (usa archivos CSV globales)"""
    pieza_familia = get_pieza_familia()
    texto_upper = texto.strip().upper()
    
    # Búsqueda exacta
    if texto_upper in pieza_familia:
        return pieza_familia[texto_upper]
    
    # Búsqueda parcial
    for pieza, familia in pieza_familia.items():
        if pieza in texto_upper or texto_upper in pieza:
            return familia
    
    return None


# ============== FUNCIONES PARA USAR BASE DE DATOS POR DESGUACE ==============

def get_pieza_familia_db(db: Session, entorno_trabajo_id: int) -> Dict[str, str]:
    """
    Obtiene mapeo pieza -> familia desde la base de datos del desguace
    """
    from app.models.busqueda import ConfiguracionPrecios, PiezaFamiliaDesguace
    
    config = db.query(ConfiguracionPrecios).filter(
        ConfiguracionPrecios.entorno_trabajo_id == entorno_trabajo_id
    ).first()
    
    if not config:
        return {}
    
    piezas = db.query(PiezaFamiliaDesguace).filter(
        PiezaFamiliaDesguace.configuracion_id == config.id
    ).all()
    
    return {p.pieza: p.familia for p in piezas}


def get_familia_precios_db(db: Session, entorno_trabajo_id: int) -> Dict[str, List[float]]:
    """
    Obtiene precios por familia desde la base de datos del desguace
    """
    from app.models.busqueda import ConfiguracionPrecios, FamiliaPreciosDesguace
    
    config = db.query(ConfiguracionPrecios).filter(
        ConfiguracionPrecios.entorno_trabajo_id == entorno_trabajo_id
    ).first()
    
    if not config:
        return {}
    
    familias = db.query(FamiliaPreciosDesguace).filter(
        FamiliaPreciosDesguace.configuracion_id == config.id
    ).all()
    
    return {
        f.familia: sorted([float(p) for p in f.precios.split(",") if p])
        for f in familias
    }


def tiene_configuracion_precios(db: Session, entorno_trabajo_id: int) -> bool:
    """Verifica si el entorno tiene configuración de precios en BD"""
    try:
        from app.models.busqueda import ConfiguracionPrecios
        
        config = db.query(ConfiguracionPrecios).filter(
            ConfiguracionPrecios.entorno_trabajo_id == entorno_trabajo_id
        ).first()
        
        return config is not None and config.pieza_familia_registros > 0 and config.familia_precios_registros > 0
    except Exception as e:
        # Si la tabla no existe o hay error, usar CSV globales
        logger.warning(f"Error verificando config precios: {e}")
        return False


def sugerir_precio_db(
    db: Session, 
    entorno_trabajo_id: int, 
    referencia: str, 
    precio_mercado: float
) -> Optional[Dict]:
    """
    Sugiere un precio para una pieza usando la configuración del desguace
    
    Si el desguace tiene configuración propia, la usa.
    Si no, usa los archivos CSV globales como fallback.
    
    Args:
        db: Sesión de base de datos
        entorno_trabajo_id: ID del entorno de trabajo del usuario
        referencia: Nombre/tipo de la pieza (ej: "ALTERNADOR", "FARO DERECHO")
        precio_mercado: Precio medio del mercado
    
    Returns:
        Dict con precio_sugerido, familia, y lista de precios de la familia
    """
    # Verificar si tiene configuración propia
    if tiene_configuracion_precios(db, entorno_trabajo_id):
        pieza_familia = get_pieza_familia_db(db, entorno_trabajo_id)
        familia_precios = get_familia_precios_db(db, entorno_trabajo_id)
        logger.info(f"Usando configuración de precios del entorno {entorno_trabajo_id}")
    else:
        # Fallback a archivos CSV globales
        pieza_familia = get_pieza_familia()
        familia_precios = get_familia_precios()
        logger.info(f"Entorno {entorno_trabajo_id} sin config propia, usando CSV globales")
    
    # Buscar la familia de la pieza usando la función mejorada
    familia = buscar_familia_en_mapeo(referencia, pieza_familia)
    
    if not familia:
        logger.warning(f"No se encontró familia para: {referencia.upper()}")
        # FALLBACK FINAL: Calcular precio sugerido por porcentaje
        precio_sin_iva = precio_mercado / 1.21
        precio_sugerido = round(precio_sin_iva * 0.55, -1)  # 55% redondeado a decenas
        if precio_sugerido < 10:
            precio_sugerido = 10
        return {
            "familia": "SIN CLASIFICAR",
            "precio_sugerido": precio_sugerido,
            "precios_familia": [],
            "precio_mercado": precio_mercado,
            "metodo": "fallback_porcentaje"
        }
    
    logger.info(f"Familia encontrada para '{referencia}': {familia}")
    
    # Obtener precios de la familia
    precios_familia = familia_precios.get(familia, [])
    if not precios_familia:
        logger.warning(f"No hay precios definidos para familia: {familia}")
        # FALLBACK: Familia encontrada pero sin precios
        precio_sin_iva = precio_mercado / 1.21
        precio_sugerido = round(precio_sin_iva * 0.55, -1)
        if precio_sugerido < 10:
            precio_sugerido = 10
        return {
            "familia": familia,
            "precio_sugerido": precio_sugerido,
            "precios_familia": [],
            "precio_mercado": precio_mercado,
            "metodo": "fallback_familia_sin_precios"
        }
    
    # Quitar 21% IVA al precio de mercado para comparar
    precio_sin_iva = precio_mercado / 1.21
    
    # Si el precio está por debajo del mínimo, usar el mínimo
    if precio_sin_iva <= precios_familia[0]:
        precio_sugerido = precios_familia[0]
    # Si el precio está por encima del máximo, usar el máximo
    elif precio_sin_iva >= precios_familia[-1]:
        precio_sugerido = precios_familia[-1]
    else:
        # Buscar entre qué dos precios cae y aplicar regla 65%
        precio_sugerido = precios_familia[-1]  # Default al máximo
        for i in range(len(precios_familia) - 1):
            precio_bajo = precios_familia[i]
            precio_alto = precios_familia[i + 1]
            
            if precio_bajo <= precio_sin_iva < precio_alto:
                rango = precio_alto - precio_bajo
                punto_corte = precio_bajo + (rango * 0.65)
                
                if precio_sin_iva < punto_corte:
                    precio_sugerido = precio_bajo
                else:
                    precio_sugerido = precio_alto
                break
    
    return {
        "familia": familia,
        "precio_sugerido": precio_sugerido,
        "precios_familia": precios_familia,
        "precio_mercado": precio_mercado,
    }


def buscar_familia_db(db: Session, entorno_trabajo_id: int, texto: str) -> Optional[str]:
    """Busca la familia de una pieza usando la configuración del desguace"""
    if tiene_configuracion_precios(db, entorno_trabajo_id):
        pieza_familia = get_pieza_familia_db(db, entorno_trabajo_id)
    else:
        pieza_familia = get_pieza_familia()
    
    return buscar_familia_en_mapeo(texto, pieza_familia)
