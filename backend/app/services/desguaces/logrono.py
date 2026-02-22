"""
Scraper para desguaceslogrono.com (API JSON).
"""

import logging
import requests
from typing import List, Dict
from concurrent.futures import ThreadPoolExecutor, as_completed

from .base import DesguaceScraper

logger = logging.getLogger(__name__)

_SESSION = requests.Session()
_SESSION.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
})


class LogronoScraper(DesguaceScraper):
    id = "logrono"
    nombre = "Desguaces Logroño"
    url_base = "https://desguaceslogrono.com"

    def buscar(self, referencia: str) -> List[Dict]:
        try:
            return self._buscar_todas_paginas(referencia)
        except Exception as e:
            logger.error(f"[Logroño] Error buscando {referencia}: {e}")
            return []

    def _fetch_page(self, referencia: str, pagina: int):
        url = f"{self.url_base}/desguacesv8/api/recambios/piezas/?locale=es&q={referencia}&pagina={pagina}"
        try:
            r = _SESSION.get(url, timeout=10)
            r.raise_for_status()
            return pagina, r.json()
        except requests.RequestException:
            return pagina, None

    def _buscar_todas_paginas(self, referencia: str, max_pag: int = 5) -> List[Dict]:
        # Primera página para saber total
        _, data = self._fetch_page(referencia, 1)
        if not data:
            return []

        total = data.get('total', 0)
        piezas_por_pagina = 12
        num_paginas = min((total + piezas_por_pagina - 1) // piezas_por_pagina, max_pag)

        piezas = []
        ids_vistos: set = set()

        # Procesar primera página
        self._procesar_pagina(data, referencia, piezas, ids_vistos)

        if num_paginas <= 1:
            return piezas

        # Resto en paralelo
        with ThreadPoolExecutor(max_workers=3) as ex:
            futures = {ex.submit(self._fetch_page, referencia, p): p for p in range(2, num_paginas + 1)}
            for f in as_completed(futures):
                _, page_data = f.result()
                if page_data:
                    self._procesar_pagina(page_data, referencia, piezas, ids_vistos)

        return piezas

    def _procesar_pagina(self, data: dict, referencia: str, piezas: List[Dict], ids_vistos: set):
        if not data or 'piezas' not in data:
            return
        ref_upper = referencia.upper()
        for p in data['piezas']:
            refvisual = (p.get('refvisual') or '').upper()
            observaciones = (p.get('observaciones') or '').upper()
            if ref_upper not in refvisual and ref_upper not in observaciones:
                continue

            id_pieza = str(p.get('idPost', ''))
            if id_pieza in ids_vistos:
                continue
            ids_vistos.add(id_pieza)

            precio_val = p.get('precio')
            precio_num = float(precio_val) if precio_val else None
            precio_texto = f"{precio_val} €" if precio_val else ""

            piezas.append({
                "id": id_pieza,
                "titulo": f"{p.get('articulo', '')} {p.get('refvisual', '')}".strip(),
                "oem": p.get('refvisual', ''),
                "vehiculo": f"{p.get('marca', '')} {p.get('modelo', '')} {p.get('version', '')}".strip(),
                "precio": precio_num,
                "precio_texto": precio_texto,
                "url": f"{self.url_base}/recambios/{p.get('url', '')}" if p.get('url') else "",
                "imagen": p.get('imagen', ''),
                "desguace": self.nombre,
                "desguace_id": self.id,
            })
