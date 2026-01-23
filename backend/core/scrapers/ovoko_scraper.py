"""
Scraper para RRR.LT / Ovoko usando Playwright
Requiere ~10 segundos por búsqueda debido a Cloudflare challenge
"""
import re
import logging
import time
from typing import List, Tuple

from core.base_scraper import PlatformScraper

logger = logging.getLogger(__name__)

# Configuración
CLOUDFLARE_WAIT_TIME = 8000  # ms para pasar Cloudflare
PAGE_TIMEOUT = 60000         # ms timeout navegación


class OvokoScraper(PlatformScraper):
    """
    Scraper para RRR.LT (Ovoko).
    
    ⚠️ LENTO: ~10 segundos por búsqueda debido a Cloudflare.
    No incluir en búsquedas automáticas "todas".
    """
    
    def __init__(self):
        super().__init__("Ovoko", "https://rrr.lt/")
    
    def setup_session(self, reference: str) -> bool:
        self.session_data['setup_done'] = True
        return True
    
    def fetch_prices(self, reference: str, limit: int = 30) -> List[float]:
        prices, _ = self.fetch_prices_with_images(reference, limit)
        return prices
    
    def fetch_prices_with_images(self, reference: str, limit: int = 30) -> Tuple[List[float], List[str]]:
        """
        Obtiene precios e imágenes de RRR.LT/Ovoko.
        Usa Playwright para pasar Cloudflare challenge (~10 seg).
        """
        try:
            from playwright.sync_api import sync_playwright
            
            prices = []
            images = []
            
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    args=['--disable-blink-features=AutomationControlled']
                )
                
                try:
                    context = browser.new_context(
                        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                        locale='es-ES',
                        viewport={'width': 1920, 'height': 1080}
                    )
                    page = context.new_page()
                    
                    # URL de búsqueda
                    url = f"https://rrr.lt/en/search?q={reference}"
                    
                    logger.info(f"Ovoko: Navegando a {url} (espera ~10s)")
                    page.goto(url, timeout=PAGE_TIMEOUT)
                    
                    # Esperar Cloudflare challenge
                    page.wait_for_timeout(CLOUDFLARE_WAIT_TIME)
                    
                    content = page.content()
                    
                    # Verificar que pasó Cloudflare
                    if 'Just a moment' in page.title():
                        logger.warning("Ovoko: Cloudflare challenge no superado")
                        return [], []
                    
                    # Extraer precios formato: "202.50 €"
                    price_matches = re.findall(r'(\d+[.,]\d{2})\s*€', content)
                    
                    for match in price_matches:
                        try:
                            value = match.replace(",", ".")
                            price = float(value)
                            # Filtrar precios válidos y evitar delivery fees (147.61€ es común)
                            if 5.0 <= price <= 5000 and price != 147.61:
                                prices.append(price)
                        except (ValueError, AttributeError):
                            continue
                    
                    # Eliminar duplicados
                    prices = list(dict.fromkeys(prices))
                    
                    # Extraer imágenes de productos (images.ovoko.com)
                    try:
                        img_elements = page.query_selector_all("img")
                        for img in img_elements:
                            src = img.get_attribute("src") or ""
                            # Solo imágenes de productos reales (no SVGs ni iconos)
                            if src and "images.ovoko.com" in src and ".svg" not in src:
                                images.append(src)
                                if len(images) >= 10:
                                    break
                        images = list(dict.fromkeys(images))
                    except:
                        pass
                    
                    page.close()
                    context.close()
                    
                finally:
                    browser.close()
            
            if limit > 0:
                prices = prices[:limit]
            
            logger.info(f"Ovoko: {len(prices)} precios, {len(images)} imágenes para '{reference}'")
            return prices, images
            
        except ImportError:
            logger.error("Playwright no instalado. pip install playwright && playwright install chromium")
            return [], []
        except Exception as e:
            logger.error(f"Error en Ovoko scraper: {e}")
            return [], []
    
    def is_available(self) -> bool:
        return True
