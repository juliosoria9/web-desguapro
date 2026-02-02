"""
Scraper para Motomine (piezas de moto usadas - UK)
URL: https://parts.motomine.co.uk/search?q={referencia}
Precios en GBP, se convierten a EUR
"""
import requests
from typing import List, Tuple
import logging
import re

from core.base_scraper import PlatformScraper

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
}

# Tasa de conversión GBP a EUR (aproximada)
GBP_TO_EUR = 1.17

# Patrones precompilados para mayor velocidad
PRICE_PATTERN = re.compile(r'£(\d+(?:\.\d{2})?)')
# Buscar imágenes de productos - múltiples patrones
IMG_PATTERN = re.compile(r'(?:src|srcset)=["\']?(//[^"\'>\s]+\.(?:jpg|jpeg|png|webp)|https?://[^"\'>\s]+\.(?:jpg|jpeg|png|webp))', re.I)


class MotomineScraper(PlatformScraper):
    """Scraper para Motomine - piezas de moto usadas (UK)"""
    
    def __init__(self):
        super().__init__("Motomine", "https://parts.motomine.co.uk/")
        self._session = None
    
    def _get_session(self):
        """Reutilizar sesión para conexiones más rápidas"""
        if self._session is None:
            self._session = requests.Session()
            self._session.headers.update(HEADERS)
        return self._session
    
    def setup_session(self, reference: str) -> bool:
        """No requiere sesión especial"""
        return True
    
    def is_available(self) -> bool:
        """Verifica si Motomine está disponible"""
        try:
            response = self._get_session().get(
                "https://parts.motomine.co.uk/",
                timeout=2
            )
            return response.status_code == 200
        except:
            return False
    
    def fetch_prices(self, reference: str, limit: int = 30) -> List[float]:
        """Obtiene precios de Motomine (convertidos a EUR)"""
        prices, _ = self.fetch_prices_with_images(reference, limit)
        return prices
    
    def fetch_prices_with_images(self, reference: str, limit: int = 30) -> Tuple[List[float], List[str]]:
        """Obtiene precios e imágenes de Motomine"""
        prices = []
        images = []
        
        try:
            ref_clean = reference.strip().replace(" ", "").replace("-", "")
            
            url = f"https://parts.motomine.co.uk/search?q={ref_clean}"
            logger.info(f"Motomine: Buscando {ref_clean}")
            
            response = self._get_session().get(url, timeout=2)
            
            if response.status_code != 200:
                logger.warning(f"Motomine: Error HTTP {response.status_code}")
                return [], []
            
            html = response.text
            
            # Extraer imágenes de productos
            img_matches = IMG_PATTERN.findall(html)
            # Filtrar imágenes de productos (no iconos ni logos)
            product_images = []
            for img_url in img_matches:
                # Las imágenes de productos suelen tener tamaño o ser más grandes
                if 'logo' not in img_url.lower() and 'icon' not in img_url.lower() and 'svg' not in img_url.lower():
                    # Normalizar URL (algunas empiezan con //)
                    if img_url.startswith('//'):
                        img_url = 'https:' + img_url
                    product_images.append(img_url)
            
            # Extraer todos los precios en libras
            price_matches = PRICE_PATTERN.findall(html)
            
            seen_prices = set()
            img_idx = 0
            for price_str in price_matches:
                try:
                    price_gbp = float(price_str)
                    if price_gbp > 0 and price_gbp < 10000:
                        price_eur = round(price_gbp * GBP_TO_EUR, 2)
                        if price_eur not in seen_prices:
                            prices.append(price_eur)
                            seen_prices.add(price_eur)
                            # Asignar imagen si hay disponible
                            if img_idx < len(product_images):
                                images.append(product_images[img_idx])
                                img_idx += 1
                            else:
                                images.append('')
                            
                            if len(prices) >= limit:
                                break
                except ValueError:
                    continue
            
            if prices:
                logger.info(f"Motomine: {len(prices)} precios, {len([i for i in images if i])} imágenes")
            
        except requests.Timeout:
            logger.warning(f"Motomine: Timeout buscando {reference}")
        except Exception as e:
            logger.error(f"Motomine: Error: {e}")
        
        return prices, images
