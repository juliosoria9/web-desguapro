"""
Scraper para Opisto - marketplace de piezas de segunda mano
https://www.opisto.com/es/
"""
import re
import logging
import requests
from typing import List, Tuple
from bs4 import BeautifulSoup

from core.base_scraper import PlatformScraper

logger = logging.getLogger(__name__)


class OpistoScraper(PlatformScraper):
    """
    Scraper para Opisto.
    Marketplace europeo de piezas de desguace.
    """
    
    def __init__(self):
        super().__init__("Opisto", "https://www.opisto.com/")
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Referer': 'https://www.opisto.com/es/',
        })
    
    def setup_session(self, reference: str) -> bool:
        self.session_data['setup_done'] = True
        return True
    
    def fetch_prices(self, reference: str, limit: int = 30) -> List[float]:
        prices, _ = self.fetch_prices_with_images(reference, limit)
        return prices
    
    def fetch_prices_with_images(self, reference: str, limit: int = 30) -> Tuple[List[float], List[str]]:
        """
        Obtiene precios e imágenes de Opisto.
        """
        prices = []
        images = []
        
        try:
            # URL de búsqueda - pagina 1
            url = f"https://www.opisto.com/es/auto/piezas-de-ocasion/pagina-1?q={reference}"
            
            logger.info(f"Opisto: Buscando en {url}")
            
            response = self.session.get(url, timeout=15)
            
            if response.status_code != 200:
                logger.warning(f"Opisto: Status {response.status_code}")
                return [], []
            
            html = response.text
            soup = BeautifulSoup(html, 'html.parser')
            
            # Buscar precios de PRODUCTO - tienen clases: fs-3, gotham-rounded-medium, text-nowrap
            # Formato: "134,76 €*"
            # Los precios de ENVÍO tienen formato "a partir de X €" y no tienen estas clases
            price_spans = soup.find_all('span', class_='gotham-rounded-medium')
            
            for span in price_spans:
                text = span.get_text(strip=True)
                # Extraer precio del formato "134,76 €*" o "159,00 €*"
                match = re.search(r'(\d{1,3}(?:\s?\d{3})*[,\.]\d{2})\s*€', text)
                if match:
                    try:
                        # Limpiar y convertir: "1 234,56" -> 1234.56
                        value = match.group(1).replace(" ", "").replace(".", "").replace(",", ".")
                        price = float(value)
                        
                        # Filtrar precios válidos
                        if 10.0 <= price <= 5000:
                            if price not in prices:
                                prices.append(price)
                    except (ValueError, AttributeError):
                        continue
            
            # Extraer imágenes de productos
            try:
                # Buscar imágenes de productos en S3 de Opisto
                img_tags = soup.find_all('img', src=re.compile(r'opisto.*s3.*amazonaws|opisto-prod-pic'))
                for img in img_tags[:10]:
                    src = img.get('src', '')
                    if src and isinstance(src, str) and src.startswith('http') and 'photo' in src.lower():
                        if src not in images:
                            images.append(src)
                
                # También buscar en data-src (lazy loading)
                img_lazy = soup.find_all('img', {'data-src': re.compile(r'opisto')})
                for img in img_lazy[:10]:
                    src = img.get('data-src', '')
                    if src and isinstance(src, str) and src.startswith('http'):
                        if src not in images:
                            images.append(src)
            except Exception as e:
                logger.debug(f"Opisto: Error extrayendo imágenes: {e}")
            
            # Si hay más páginas, intentar página 2
            if len(prices) < limit and ('pagina-2' in html or 'página 2' in html.lower()):
                try:
                    url2 = f"https://www.opisto.com/es/auto/piezas-de-ocasion/pagina-2?q={reference}"
                    response2 = self.session.get(url2, timeout=10)
                    if response2.status_code == 200:
                        soup2 = BeautifulSoup(response2.text, 'html.parser')
                        price_spans2 = soup2.find_all('span', class_='gotham-rounded-medium')
                        for span in price_spans2:
                            text = span.get_text(strip=True)
                            match = re.search(r'(\d{1,3}(?:\s?\d{3})*[,\.]\d{2})\s*€', text)
                            if match:
                                try:
                                    value = match.group(1).replace(" ", "").replace(".", "").replace(",", ".")
                                    price = float(value)
                                    if 10.0 <= price <= 5000 and price not in prices:
                                        prices.append(price)
                                except:
                                    continue
                except:
                    pass
            
            if limit > 0:
                prices = prices[:limit]
            
            logger.info(f"Opisto: {len(prices)} precios, {len(images)} imágenes para '{reference}'")
            return prices, images
            
        except requests.Timeout:
            logger.warning(f"Opisto: Timeout para '{reference}'")
            return [], []
        except Exception as e:
            logger.error(f"Opisto error: {e}")
            return [], []
    
    def is_available(self) -> bool:
        return True
