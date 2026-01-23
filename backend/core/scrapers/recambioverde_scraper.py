"""
Scraper de RecambioVerde
"""
import requests
from bs4 import BeautifulSoup
from typing import List, Tuple
import logging
import re

from core.base_scraper import PlatformScraper

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
}


class RecambioVerdeScraper(PlatformScraper):
    """Scraper para RecambioVerde"""
    
    def __init__(self):
        super().__init__("RecambioVerde", "https://recambioverde.es/")
    
    def setup_session(self, reference: str) -> bool:
        """Configura sesión"""
        try:
            self.session_data['setup_done'] = True
            return True
        except:
            return False
    
    def fetch_prices(self, reference: str, limit: int = 30) -> List[float]:
        """Obtiene precios de RecambioVerde"""
        prices, _ = self.fetch_prices_with_images(reference, limit)
        return prices
    
    def fetch_prices_with_images(self, reference: str, limit: int = 30) -> Tuple[List[float], List[str]]:
        """Obtiene precios e imágenes de RecambioVerde"""
        try:
            # URL correcta de búsqueda ordenada por precio
            url = f"https://recambioverde.es/recambios-desguace/{reference}?Orden=Precio"
            
            response = requests.get(url, headers=HEADERS, timeout=15)
            if response.status_code != 200:
                logger.warning(f"RecambioVerde respondió con código {response.status_code}")
                return [], []
            
            soup = BeautifulSoup(response.text, "html.parser")
            prices = []
            images = []
            
            # Buscar precios en elementos con clase 'price' o 'price-new'
            price_elements = soup.select(".price-new, .price")
            
            for element in price_elements:
                try:
                    text = element.get_text(strip=True)
                    # Limpiar el precio: "51,42 €" -> 51.42
                    # Eliminar símbolo €, espacios, y convertir coma a punto
                    value = text.replace("€", "").replace(" ", "").replace(".", "").replace(",", ".").strip()
                    
                    if not value:
                        continue
                        
                    price = float(value)
                    # Filtrar precios válidos (entre 1€ y 10000€)
                    if 1.0 <= price <= 10000:
                        prices.append(price)
                except (ValueError, AttributeError):
                    continue
            
            # Buscar imágenes de productos
            img_elements = soup.select("img[src*='metasync'], img[src*='cdn']")
            for img in img_elements[:10]:  # Limitar imágenes
                src = img.get("src") or img.get("data-src")
                if src and src.startswith("http"):
                    images.append(src)
            
            # Eliminar duplicados manteniendo orden
            prices = list(dict.fromkeys(prices))
            images = list(dict.fromkeys(images))
            
            # Aplicar límite
            if limit > 0:
                prices = prices[:limit]
            
            logger.info(f"RecambioVerde: {len(prices)} precios, {len(images)} imágenes para '{reference}'")
            return prices, images
            
        except requests.Timeout:
            logger.error("Timeout al conectar con RecambioVerde")
            return [], []
        except Exception as e:
            logger.error(f"Error en RecambioVerde: {e}")
            return [], []
    
    def is_available(self) -> bool:
        """Verifica disponibilidad"""
        try:
            r = requests.get(self.base_url, headers=HEADERS, timeout=5)
            return r.status_code == 200
        except:
            return False
