"""
Scraper para B-Parts usando Playwright
⚠️ A veces falla por exceso de peticiones (WAF/rate limiting)
"""
import re
import logging
from typing import List, Tuple

from core.base_scraper import PlatformScraper

logger = logging.getLogger(__name__)

# Configuración
PAGE_WAIT_TIME = 5000   # ms espera después de cargar
PAGE_TIMEOUT = 30000    # ms timeout navegación


class BPartsScraper(PlatformScraper):
    """
    Scraper para B-Parts.
    
    ⚠️ INESTABLE: A veces falla por exceso de peticiones (rate limiting).
    Puede mostrar captcha "Human Verification" en períodos de alta demanda.
    """
    
    def __init__(self):
        super().__init__("B-Parts", "https://www.b-parts.com/")
    
    def setup_session(self, reference: str) -> bool:
        self.session_data['setup_done'] = True
        return True
    
    def fetch_prices(self, reference: str, limit: int = 30) -> List[float]:
        prices, _ = self.fetch_prices_with_images(reference, limit)
        return prices
    
    def fetch_prices_with_images(self, reference: str, limit: int = 30) -> Tuple[List[float], List[str]]:
        """
        Obtiene precios e imágenes de B-Parts.
        Usa Playwright para manejar JS dinámico.
        
        ⚠️ Puede fallar con "Human Verification" en períodos de alta demanda.
        """
        try:
            from playwright.sync_api import sync_playwright
            
            prices = []
            images = []
            
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    args=[
                        '--disable-blink-features=AutomationControlled',
                        '--no-sandbox',
                        '--disable-dev-shm-usage'
                    ]
                )
                
                try:
                    context = browser.new_context(
                        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                        locale='es-ES',
                        viewport={'width': 1920, 'height': 1080}
                    )
                    page = context.new_page()
                    
                    # URL de búsqueda
                    url = f"https://www.b-parts.com/es/search?term={reference}"
                    
                    logger.info(f"B-Parts: Navegando a {url}")
                    
                    try:
                        page.goto(url, timeout=PAGE_TIMEOUT)
                        page.wait_for_timeout(PAGE_WAIT_TIME)
                    except Exception as nav_err:
                        logger.warning(f"B-Parts: Error navegación: {nav_err}")
                        return [], []
                    
                    content = page.content()
                    
                    # Verificar si hay captcha/bloqueo
                    if 'Human Verification' in content or 'captcha' in content.lower():
                        logger.warning("B-Parts: Bloqueado por Human Verification (rate limiting)")
                        return [], []
                    
                    if 'Access Denied' in content or 'blocked' in content.lower():
                        logger.warning("B-Parts: Acceso denegado (WAF)")
                        return [], []
                    
                    # Extraer precios - B-Parts usa formato "123,45 €" o "123.45 €"
                    # Buscar en elementos de precio específicos
                    price_patterns = [
                        r'(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*€',  # 1.234,56 € o 1,234.56 €
                        r'€\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})',  # € 123,45
                        r'price["\']?\s*:\s*["\']?(\d+[.,]\d{2})',  # JSON price
                    ]
                    
                    for pattern in price_patterns:
                        matches = re.findall(pattern, content)
                        for match in matches:
                            try:
                                # Limpiar formato europeo (1.234,56 -> 1234.56)
                                value = match.replace(".", "").replace(",", ".")
                                # Si terminó con doble punto, corregir
                                if value.count('.') > 1:
                                    parts = value.split('.')
                                    value = ''.join(parts[:-1]) + '.' + parts[-1]
                                
                                price = float(value)
                                
                                # Filtrar precios válidos
                                if 5.0 <= price <= 5000:
                                    if price not in prices:
                                        prices.append(price)
                            except (ValueError, AttributeError):
                                continue
                    
                    # También buscar precios simples
                    simple_matches = re.findall(r'>(\d{2,4}[.,]\d{2})\s*€<', content)
                    for match in simple_matches:
                        try:
                            value = match.replace(",", ".")
                            price = float(value)
                            if 5.0 <= price <= 5000 and price not in prices:
                                prices.append(price)
                        except:
                            continue
                    
                    # Extraer imágenes
                    try:
                        img_elements = page.query_selector_all("img[src*='b-parts'], img[src*='bparts']")
                        for img in img_elements[:10]:
                            src = img.get_attribute("src")
                            if src and src.startswith("http"):
                                images.append(src)
                        images = list(dict.fromkeys(images))
                    except:
                        pass
                    
                    page.close()
                    context.close()
                    
                finally:
                    browser.close()
            
            if limit > 0:
                prices = prices[:limit]
            
            logger.info(f"B-Parts: {len(prices)} precios, {len(images)} imágenes para '{reference}'")
            return prices, images
            
        except ImportError:
            logger.error("Playwright no instalado. pip install playwright && playwright install chromium")
            return [], []
        except Exception as e:
            logger.error(f"B-Parts error: {e}")
            return [], []
    
    def is_available(self) -> bool:
        return True
