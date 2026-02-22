"""
Script unificado para buscar una referencia OEM en todos los proveedores disponibles.
Ejecuta las búsquedas en paralelo para mayor velocidad.
"""

import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed


def es_referencia_prasco_valida(ref):
    """
    Valida que una referencia de Prasco empiece con dos letras.
    Ejemplo válido: 'AD1234', 'VW9876'
    Ejemplo inválido: '12345', 'A1234'
    """
    if not ref or ref == "N/A":
        return False
    # Empieza con exactamente dos letras (mayúsculas o minúsculas)
    return bool(re.match(r'^[A-Za-z]{2}', ref))

from .carser import CarserScraper
from .flamar import FlamarScraper
from .iparlux import IparluxScraper
from .nrf import NRFScraper
from .nty import NtyScraper
from .prasco import PrascoScraper
from .triclo import search_triclo
from .vauner import search_vauner


def ejecutar_busqueda(nombre, funcion, oem_ref):
    """Ejecuta una búsqueda y captura errores."""
    try:
        resultados = funcion(oem_ref)
        return nombre, resultados, None
    except Exception as e:
        return nombre, [], str(e)


def buscar_en_todos(oem_ref):
    """
    Busca una referencia OEM en todos los proveedores disponibles.
    Retorna un diccionario con los resultados de cada proveedor.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    vauner_csv = os.path.join(script_dir, "data", "Vauner_Unificado.csv")
    triclo_csv = os.path.join(script_dir, "data", "triclo_final_unificado.csv")
    
    buscadores = {
        "Vauner": lambda ref: search_vauner(ref, vauner_csv),
        "Triclo": lambda ref: search_triclo(ref, triclo_csv),
        "Carser": lambda ref: CarserScraper().search(ref),
        "Flamar": lambda ref: FlamarScraper().search(ref),
        "Iparlux": lambda ref: IparluxScraper().search(ref),
        "NRF": lambda ref: NRFScraper().search(ref),
        "NTY": lambda ref: NtyScraper().search(ref),
        "Prasco": lambda ref: PrascoScraper().search(ref),
    }
    
    resultados = {}
    errores = {}
    
    with ThreadPoolExecutor(max_workers=8) as executor:
        futuros = {
            executor.submit(ejecutar_busqueda, nombre, func, oem_ref): nombre
            for nombre, func in buscadores.items()
        }
        
        for futuro in as_completed(futuros):
            nombre, items, error = futuro.result()
            if error:
                errores[nombre] = error
            if items:
                # Para Prasco, filtrar solo referencias que empiecen con 2 letras
                if nombre == "Prasco":
                    items = [item for item in items if es_referencia_prasco_valida(item.get("iam_ref", ""))]
                if items:  # Solo agregar si quedan items después del filtro
                    resultados[nombre] = items
    
    return resultados, errores


def obtener_primera_referencia_por_proveedor(oem_ref):
    """
    Busca en todos los proveedores y retorna solo la primera referencia IAM de cada uno.
    Retorna lista de strings con las referencias únicas.
    Para Prasco, solo incluye referencias que empiecen con dos letras.
    """
    resultados, _ = buscar_en_todos(oem_ref)
    
    referencias_unicas = []
    for proveedor, items in resultados.items():
        if items and len(items) > 0:
            # Para Prasco, buscar la primera referencia válida (que empiece con 2 letras)
            if proveedor == "Prasco":
                for item in items:
                    ref = item.get("iam_ref", "")
                    if es_referencia_prasco_valida(ref):
                        referencias_unicas.append(ref)
                        break  # Solo la primera válida
            else:
                primera_ref = items[0].get("iam_ref", "")
                if primera_ref and primera_ref != "N/A":
                    referencias_unicas.append(primera_ref)
    
    # Eliminar duplicados manteniendo orden
    seen = set()
    referencias_finales = []
    for ref in referencias_unicas:
        if ref not in seen:
            seen.add(ref)
            referencias_finales.append(ref)
    
    return referencias_finales


def obtener_items_iam_por_proveedor(oem_ref):
    """
    Busca en todos los proveedores y retorna el primer item completo de cada uno
    (con image_url, source, price, etc.) en vez de solo la referencia string.
    Retorna lista de dicts con campos: iam_ref, source, brand, description, price, image_url.
    """
    resultados, _ = buscar_en_todos(oem_ref)

    items_unicos = []
    seen_refs = set()

    for proveedor, items in resultados.items():
        if not items:
            continue
        if proveedor == "Prasco":
            for item in items:
                ref = item.get("iam_ref", "")
                if es_referencia_prasco_valida(ref) and ref not in seen_refs:
                    seen_refs.add(ref)
                    items_unicos.append(item)
                    break
        else:
            item = items[0]
            ref = item.get("iam_ref", "")
            if ref and ref != "N/A" and ref not in seen_refs:
                seen_refs.add(ref)
                items_unicos.append(item)

    return items_unicos
