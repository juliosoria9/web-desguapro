"""
Análisis de precios con estadísticas
"""
from statistics import mean, median, quantiles, stdev
from typing import List, Dict, Any, Tuple


def detect_outliers_iqr(prices: List[float], factor: float = 1.5) -> Tuple[List[float], List[float]]:
    """
    Detecta outliers usando método IQR
    """
    if len(prices) < 4:
        return prices.copy(), []
    
    try:
        q1, q2, q3 = quantiles(prices, n=4)
    except:
        sorted_prices = sorted(prices)
        n = len(sorted_prices)
        q1 = sorted_prices[n//4]
        q3 = sorted_prices[3*n//4]
    
    iqr = q3 - q1
    lower_factor = factor
    upper_factor = factor * 0.75
    
    lower_bound = q1 - lower_factor * iqr
    upper_bound = q3 + upper_factor * iqr
    
    clean_prices = []
    outliers = []
    
    for price in prices:
        if lower_bound <= price <= upper_bound:
            clean_prices.append(price)
        else:
            outliers.append(price)
    
    return clean_prices, outliers


def summarize(prices: List[float], remove_outliers: bool = True, outlier_method: str = "iqr") -> Dict[str, Any]:
    """
    Analiza precios y retorna estadísticas
    """
    if not prices:
        return {
            "media": 0,
            "mediana": 0,
            "minimo": 0,
            "maximo": 0,
            "desviacion_estandar": 0,
            "outliers_removidos": 0,
        }
    
    # Estadísticas originales
    precio_min = min(prices)
    precio_max = max(prices)
    precio_media = mean(prices)
    precio_mediana = median(prices)
    
    # Desviación estándar
    try:
        desv_est = stdev(prices) if len(prices) > 1 else 0
    except:
        desv_est = 0
    
    # Detectar outliers
    outliers_removidos = 0
    rango_original = f"{precio_min:.2f}€ - {precio_max:.2f}€"
    rango_limpio = rango_original
    
    if remove_outliers and len(prices) > 4:
        clean_prices, outliers = detect_outliers_iqr(prices)
        
        if outliers:
            outliers_removidos = len(outliers)
            # Recalcular estadísticas sin outliers
            precio_min = min(clean_prices) if clean_prices else precio_min
            precio_max = max(clean_prices) if clean_prices else precio_max
            precio_media = mean(clean_prices) if clean_prices else precio_media
            precio_mediana = median(clean_prices) if clean_prices else precio_mediana
            
            try:
                desv_est = stdev(clean_prices) if len(clean_prices) > 1 else 0
            except:
                desv_est = 0
            
            rango_limpio = f"{precio_min:.2f}€ - {precio_max:.2f}€"
    
    return {
        "media": round(precio_media, 2),
        "mediana": round(precio_mediana, 2),
        "minimo": round(precio_min, 2),
        "maximo": round(precio_max, 2),
        "desviacion_estandar": round(desv_est, 2),
        "outliers_removidos": outliers_removidos,
        "rango_original": rango_original,
        "rango_limpio": rango_limpio,
    }
