"""
Servicio para buscar referencias OEM equivalentes.
Fuentes: tarostrade.es y distri-auto.es
Escalable: añadir nuevas fuentes registrándolas en FUENTES_OEM.
"""

import re
import logging
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Set

logger = logging.getLogger(__name__)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
}

PALABRAS_EXCLUIR = {
    'www', 'com', 'http', 'cookie', 'html', 'script', 'style',
    'function', 'return', 'taros', 'trade', 'depo', 'undefined',
    'class', 'click', 'button', 'submit', 'image', 'producto',
    'p21w', 'py21w', 'p21', 'ece', '5w', '21w',
}


# ─── TarosTrade ───────────────────────────────────────────

def _taros_extraer_referencias(descripcion: str) -> List[str]:
    refs: Set[str] = set()
    refs.update(re.findall(r'\b(\d{5,10})\b', descripcion))
    refs.update(r.upper() for r in re.findall(r'\b([0-9]+[A-Z]+[A-Z0-9]+)\b', descripcion, re.I))
    return list(refs)


def _taros_filtrar(referencias: List[str]) -> List[str]:
    limpias = []
    for ref in referencias:
        ref = ref.strip().upper()
        if len(ref) < 5 or len(ref) > 20:
            continue
        if any(x in ref.lower() for x in PALABRAS_EXCLUIR):
            continue
        if not any(c.isdigit() for c in ref):
            continue
        limpias.append(ref)
    return list(set(limpias))


def _taros_buscar_urls(referencia: str) -> List[str]:
    try:
        r = requests.get(f"https://www.tarostrade.es/search?search={referencia}", headers=HEADERS, timeout=15)
        r.raise_for_status()
        urls = []
        for m in re.findall(r'href=["\']?(/[^"\'>\s]+/po/[^"\'>\s]+)["\']?', r.text):
            url = f"https://www.tarostrade.es{m}"
            if url not in urls:
                urls.append(url)
        for url in re.findall(r'https://www\.tarostrade\.es/[^"\'>\s]+/po/[^"\'>\s]+', r.text):
            url = url.split('"')[0].split("'")[0]
            if url not in urls:
                urls.append(url)
        return urls
    except Exception as e:
        logger.debug(f"TarosTrade URLs error: {e}")
        return []


def _taros_refs_producto(url: str, referencia: str) -> Set[str]:
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        refs: Set[str] = set()
        for desc in re.findall(r'"description"\s*:\s*"([^"]+)"', r.text):
            desc_limpia = desc.replace('\\/', '/')
            if referencia.upper() in desc_limpia.upper():
                refs.update(_taros_extraer_referencias(desc_limpia))
        refs.update(m.upper() for m in re.findall(r'OE[:\s]*([A-Z0-9]{5,20})', r.text, re.I))
        return refs
    except Exception:
        return set()


def buscar_tarostrade(referencia: str) -> List[str]:
    urls = _taros_buscar_urls(referencia)
    if not urls:
        return []
    todas: Set[str] = set()
    for url in urls[:3]:
        todas.update(_taros_refs_producto(url, referencia))
    return _taros_filtrar(list(todas))


# ─── Distri-Auto ──────────────────────────────────────────

def _distri_buscar_urls(referencia: str) -> List[str]:
    try:
        r = requests.get(f"https://www.distri-auto.es/piezas-automovil/busqueda?q={referencia}", headers=HEADERS, timeout=15)
        r.raise_for_status()
        urls = set()
        for u in re.findall(r'data-serp-product-clicable-url-value="(/[^"]+)"', r.text):
            urls.add(f"https://www.distri-auto.es{u.split('?')[0]}")
        return list(urls)
    except Exception as e:
        logger.debug(f"DistriAuto URLs error: {e}")
        return []


def _distri_refs_producto(url: str) -> Set[str]:
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        return {ref.strip() for ref in re.findall(r'href="/piezas-automovil/oem/([^"]+)"', r.text) if ref.strip()}
    except Exception:
        return set()


def buscar_distriauto(referencia: str) -> List[str]:
    urls = _distri_buscar_urls(referencia)
    if not urls:
        return []
    todas: Set[str] = set()
    with ThreadPoolExecutor(max_workers=10) as ex:
        for future in as_completed({ex.submit(_distri_refs_producto, u): u for u in urls}):
            try:
                todas.update(future.result())
            except Exception:
                pass
    return sorted(todas)


# ─── API Pública ──────────────────────────────────────────

def buscar_oem_equivalentes(referencia: str) -> List[str]:
    """
    Busca OEM equivalentes en todas las fuentes registradas.
    Retorna lista deduplicada y normalizada (uppercase).
    """
    todas: Set[str] = set()

    with ThreadPoolExecutor(max_workers=2) as ex:
        futuros = {
            ex.submit(buscar_tarostrade, referencia): "tarostrade",
            ex.submit(buscar_distriauto, referencia): "distriauto",
        }
        for f in as_completed(futuros):
            nombre = futuros[f]
            try:
                refs = f.result()
                logger.info(f"OEM equiv [{nombre}]: {len(refs)} refs")
                todas.update(r.upper() for r in refs)
            except Exception as e:
                logger.warning(f"OEM equiv [{nombre}] error: {e}")

    # Excluir la referencia original
    todas.discard(referencia.upper())
    return sorted(todas)
