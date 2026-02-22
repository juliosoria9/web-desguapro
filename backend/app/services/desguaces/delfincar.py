"""
Scraper para delfincar.com (PrestaShop search_ajax).
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

RE_URL = re.compile(r'href="(https://delfincar\.com/(\d+)-([^"]+)\.html)"')
RE_ALT = re.compile(r'alt="([^"]+)"')
RE_PRECIO = re.compile(r'([0-9]+[,\.][0-9]+)\s*€')
RE_CONTENT_PRICE = re.compile(r'priceWithTax[^>]*content="([0-9]+[,.][0-9]+)"', re.IGNORECASE)
RE_ID = re.compile(r'ID[:\s]+(\d{6,})')
RE_IMG = re.compile(r'src="(https://delfincar\.com/\d+-[^"]+\.jpg)"')
RE_VEHICULOS = [
    re.compile(rf'({marca}\s+[A-Z0-9\s\(\)\.IVX-]+)', re.IGNORECASE)
    for marca in [
        'NISSAN', r'CITRO[ËE]N', 'PEUGEOT', 'SEAT', 'HYUNDAI', 'KIA', 'FORD',
        'VOLKSWAGEN', 'RENAULT', 'OPEL', 'BMW', 'AUDI', 'MERCEDES', 'TOYOTA',
        'HONDA', 'MAZDA', 'DACIA', 'FIAT', 'SKODA', 'VOLVO', 'MINI',
    ]
]


def _parse_precio(texto: str):
    """Convierte '12,50 €' → 12.50"""
    try:
        return float(texto.replace(' €', '').replace(',', '.'))
    except (ValueError, AttributeError):
        return None


class DelfincarScraper(DesguaceScraper):
    id = "delfincar"
    nombre = "Delfincar"
    url_base = "https://delfincar.com"

    def buscar(self, referencia: str) -> List[Dict]:
        try:
            return self._buscar_todas_paginas(referencia)
        except Exception as e:
            logger.error(f"[Delfincar] Error buscando {referencia}: {e}")
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
                url_completa, id_prod, _ = match.groups()
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
        for rv in RE_VEHICULOS:
            m = rv.search(ctx)
            if m:
                vehiculo = m.group(1).strip()
                break

        precio_texto = ""
        precio_num = None
        m = RE_PRECIO.search(ctx)
        if m:
            precio_texto = m.group(0).strip()
            precio_num = _parse_precio(m.group(1))
        else:
            mc = RE_CONTENT_PRICE.search(ctx)
            if mc:
                precio_num = _parse_precio(mc.group(1))
                if precio_num:
                    precio_texto = f"{mc.group(1)} €"
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
