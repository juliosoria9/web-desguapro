"""
Scraper para Partsss (piezas de moto nuevas)
URL: https://partsss.com/es/search/reference/{referencia}
"""
import requests
from bs4 import BeautifulSoup
from typing import List, Tuple, Optional
import logging
import re

from core.base_scraper import PlatformScraper

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Referer": "https://partsss.com/",
}


class PartsssScraper(PlatformScraper):
    """Scraper para Partsss - piezas de moto nuevas"""
    
    def __init__(self):
        super().__init__("Partsss", "https://partsss.com/")
    
    def setup_session(self, reference: str) -> bool:
        """No requiere sesión especial"""
        return True
    
    def is_available(self) -> bool:
        """Verifica si Partsss está disponible"""
        try:
            response = requests.get(
                "https://partsss.com/es",
                headers=HEADERS,
                timeout=5
            )
            return response.status_code == 200
        except:
            return False
    
    def fetch_prices(self, reference: str, limit: int = 30) -> List[float]:
        """Obtiene precios de Partsss"""
        prices, _ = self.fetch_prices_with_images(reference, limit)
        return prices
    
    def fetch_prices_with_images(self, reference: str, limit: int = 30) -> Tuple[List[float], List[str]]:
        """Obtiene precios e imágenes de Partsss"""
        prices = []
        images = []
        
        try:
            # Limpiar referencia (quitar espacios, guiones, etc.)
            ref_clean = reference.strip().replace(" ", "").replace("-", "")
            
            url = f"https://partsss.com/es/search/reference/{ref_clean}"
            logger.info(f"Partsss: Buscando en {url}")
            
            response = requests.get(url, headers=HEADERS, timeout=15)
            
            if response.status_code != 200:
                logger.warning(f"Partsss: Error HTTP {response.status_code}")
                return [], []
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Buscar productos - el precio aparece junto a "Añadir a la cesta"
            # Buscar divs o secciones que contengan productos
            
            # Método 1: Buscar el patrón específico de precio "XXX,XX €"
            # El precio está en un elemento específico cerca del botón de añadir
            price_elements = soup.find_all(string=re.compile(r'^\s*\d+[.,]\d{2}\s*€\s*$'))
            
            for elem in price_elements:
                try:
                    price_text = elem.strip()
                    # Extraer número: "570,11 €" -> 570.11
                    match = re.search(r'(\d+)[.,](\d{2})', price_text)
                    if match:
                        price = float(f"{match.group(1)}.{match.group(2)}")
                        if price > 0 and price < 50000:
                            prices.append(price)
                except (ValueError, TypeError, AttributeError):
                    pass
            
            # Método 2: Si no encontramos nada, buscar elementos con clase de precio
            if not prices:
                # Buscar en el HTML cualquier elemento que tenga formato de precio
                all_text = soup.get_text()
                # Buscar solo el primer precio que aparece después de la referencia
                ref_pos = all_text.lower().find(ref_clean.lower())
                if ref_pos > -1:
                    # Buscar el primer precio después de la referencia
                    text_after_ref = all_text[ref_pos:]
                    match = re.search(r'(\d+)[.,](\d{2})\s*€', text_after_ref)
                    if match:
                        price = float(f"{match.group(1)}.{match.group(2)}")
                        if price > 0 and price < 50000:
                            prices.append(price)
            
            # Buscar imágenes de productos (logo Honda, etc.)
            img_tags = soup.find_all('img')
            for img in img_tags:
                src = img.get('src', '') or ''
                if isinstance(src, list):
                    src = src[0] if src else ''
                src = str(src)
                if src and 'shops' in src.lower():
                    if src.startswith('/'):
                        src = f"https://partsss.com{src}"
                    elif not src.startswith('http'):
                        src = f"https://partsss.com/{src}"
                    images.append(src)
            
            # Eliminar duplicados
            prices = list(dict.fromkeys(prices))  # Mantiene orden
            images = list(dict.fromkeys(images))
            
            logger.info(f"Partsss: {len(prices)} precios, {len(images)} imágenes para '{reference}'")
            
        except Exception as e:
            logger.error(f"Partsss: Error - {e}")
        
        return prices[:limit], images[:limit]
    
    def fetch_all_data(self, reference: str, limit: int = 30) -> Tuple[List[float], List[str], Optional[str], int]:
        """
        Obtiene precios, imágenes, tipo de pieza y total de Partsss
        
        Returns:
            Tuple[precios, imagenes, tipo_pieza, total_encontrados]
        """
        prices, images = self.fetch_prices_with_images(reference, limit)
        return prices, images, None, len(prices)
