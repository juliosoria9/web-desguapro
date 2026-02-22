"""
Scraper para desguacesazor.com (PrestaShop search_ajax).
"""

import re
import logging
import requests
from html import unescape
from typing import List, Dict
from concurrent.futures import ThreadPoolExecutor, as_completed

from .base import DesguaceScraper

logger = logging.getLogger(__name__)

_SESSION = requests.Session()
_SESSION.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'text/html,*/*',
})

RE_URL = re.compile(r'href="(https://desguacesazor\.com/[^"]+/(\d+)-[^"]+)"')
RE_ALT = re.compile(r'alt="([^"]+)"')
RE_PRECIO = re.compile(r'([0-9]+[,\.][0-9]+)\s*€')
RE_IMG = re.compile(r'src="(https://desguacesazor\.com/\d+-[^"]+\.jpg)"')
RE_VEHICULO = re.compile(
    r'((?:SEAT|VOLKSWAGEN|AUDI|BMW|MERCEDES|RENAULT|PEUGEOT|CITROEN|CITROËN|OPEL|FORD|'
    r'TOYOTA|NISSAN|HYUNDAI|KIA|HONDA|MAZDA|FIAT|SKODA|VOLVO|DACIA|MINI)\s+[A-Z0-9\s\(\)\.,IVX-]+)',
    re.IGNORECASE,
)
RE_PRECIO_CON_IVA = re.compile(r'([0-9]+[,\.][0-9]+)\s*€\s*Con\s*IVA', re.IGNORECASE)
RE_PRECIO_SIN_IVA = re.compile(r'([0-9]+[,\.][0-9]+)\s*€\s*Sin\s*IVA', re.IGNORECASE)
RE_CONTENT_IVA = re.compile(r'priceWithTax[^>]*content="([0-9]+[,.][0-9]+)"', re.IGNORECASE)
RE_CONTENT_SIN = re.compile(r'priceWithoutTax[^>]*content="([0-9]+[,.][0-9]+)"', re.IGNORECASE)


def _parse_precio(texto: str):
    try:
        return float(texto.replace(',', '.'))
    except (ValueError, AttributeError):
        return None


class AzorScraper(DesguaceScraper):
    id = "azor"
    nombre = "Desguaces Azor"
    url_base = "https://desguacesazor.com"

    def buscar(self, referencia: str) -> List[Dict]:
        try:
            return self._buscar_todas_paginas(referencia)
        except Exception as e:
            logger.error(f"[Azor] Error buscando {referencia}: {e}")
            return []

    def _fetch_page(self, referencia: str, pagina: int):
        url = f"{self.url_base}/modules/search_ajax/ajax.php?text={referencia}&sa_pag={pagina}&id_category=3"
        try:
            r = _SESSION.post(url, timeout=10)
            r.raise_for_status()
            return pagina, r.text
        except requests.RequestException:
            return pagina, ""

    def _buscar_todas_paginas(self, referencia: str, max_pag: int = 3) -> List[Dict]:
        piezas = []
        ids_vistos: set = set()

        with ThreadPoolExecutor(max_workers=3) as ex:
            futures = {ex.submit(self._fetch_page, referencia, p): p for p in range(1, max_pag + 1)}
            paginas = {}
            for f in as_completed(futures):
                pag, html = f.result()
                if html:
                    paginas[pag] = html

        ref_upper = referencia.upper()
        for pag in sorted(paginas):
            html = paginas[pag]
            for match in RE_URL.finditer(html):
                url_completa, id_prod = match.groups()
                if ref_upper in url_completa.upper() and id_prod not in ids_vistos:
                    ids_vistos.add(id_prod)
                    ctx = html[max(0, match.start() - 500):match.start() + 3500]
                    pieza = self._extraer(id_prod, url_completa, ctx, referencia)
                    if pieza:
                        piezas.append(pieza)
        return piezas

    def _extraer(self, id_prod: str, url: str, ctx: str, referencia: str) -> Dict | None:
        titulo = ""
        m = RE_ALT.search(ctx)
        if m:
            titulo = unescape(m.group(1).strip())

        imagen = ""
        m = RE_IMG.search(ctx)
        if m:
            imagen = m.group(1)

        vehiculo = ""
        m = RE_VEHICULO.search(ctx)
        if m:
            vehiculo = m.group(1).strip()

        # Precio: preferir texto con IVA, fallback sin IVA, fallback content attr, fallback genérico
        precio_texto = ""
        precio_num = None
        m_iva = RE_PRECIO_CON_IVA.search(ctx)
        m_sin = RE_PRECIO_SIN_IVA.search(ctx)
        if m_iva:
            precio_num = _parse_precio(m_iva.group(1))
            precio_texto = f"{m_iva.group(1)} € (con IVA)"
        elif m_sin:
            precio_num = _parse_precio(m_sin.group(1))
            precio_texto = f"{m_sin.group(1)} € (sin IVA)"
        else:
            m = RE_PRECIO.search(ctx)
            if m:
                precio_num = _parse_precio(m.group(1))
                precio_texto = m.group(0).strip()
            else:
                # Fallback: content attribute de spans priceWithTax/priceWithoutTax
                mc = RE_CONTENT_IVA.search(ctx) or RE_CONTENT_SIN.search(ctx)
                if mc:
                    precio_num = _parse_precio(mc.group(1))
                    if precio_num:
                        precio_texto = f"{mc.group(1)} €"
        # Tratar 0.00 como sin precio
        if precio_num is not None and precio_num < 0.01:
            precio_num = None
            precio_texto = ""

        if not titulo and not url:
            return None

        return {
            "id": id_prod,
            "titulo": titulo,
            "oem": referencia,
            "vehiculo": vehiculo,
            "precio": precio_num,
            "precio_texto": precio_texto,
            "url": url,
            "imagen": imagen,
            "desguace": self.nombre,
            "desguace_id": self.id,
        }
