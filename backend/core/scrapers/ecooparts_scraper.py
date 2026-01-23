"""
Scraper para Ecooparts
"""
import requests
from bs4 import BeautifulSoup
from typing import List, Tuple, Optional
import logging
import re

from core.base_scraper import PlatformScraper
from core.toen import load_toen, get_new_toen, save_toen
from utils.encoding import b64

logger = logging.getLogger(__name__)

AJAX_URL = "https://ecooparts.com/ajax/ajax_buscador.php"
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "*/*",
    "Referer": "https://ecooparts.com/",
}


class EcoopartsScraper(PlatformScraper):
    """Scraper para la plataforma Ecooparts"""
    
    def __init__(self):
        super().__init__("Ecooparts", "https://ecooparts.com/")
    
    def setup_session(self, reference: str) -> bool:
        """Configura sesión obteniendo token TOEN"""
        try:
            # Intentar cargar token cacheado
            toen = load_toen()
            if toen:
                self.session_data['toen'] = toen
                logger.info("Token TOEN cargado del caché")
                return True
            
            # Generar nuevo token
            toen = get_new_toen(reference)
            if toen:
                self.session_data['toen'] = toen
                save_toen(toen)
                logger.info("Token TOEN generado y guardado")
                return True
            
            logger.error("No se pudo obtener token TOEN")
            return False
        except Exception as e:
            logger.error(f"Error en setup_session: {e}")
            return False
    
    def fetch_prices(self, reference: str, limit: int = 30) -> List[float]:
        """Obtiene precios de Ecooparts"""
        prices, _, _, _ = self.fetch_all_data(reference, limit)
        return prices
    
    def fetch_prices_with_images(self, reference: str, limit: int = 30) -> Tuple[List[float], List[str]]:
        """Obtiene precios e imágenes de Ecooparts"""
        prices, images, _, _ = self.fetch_all_data(reference, limit)
        return prices, images
    
    def fetch_all_data(self, reference: str, limit: int = 30) -> Tuple[List[float], List[str], Optional[str], int]:
        """
        Obtiene precios, imágenes, tipo de pieza y total de piezas de Ecooparts
        
        Returns:
            Tuple[precios_limitados, imagenes, tipo_pieza, total_piezas_encontradas]
        """
        if 'toen' not in self.session_data:
            if not self.setup_session(reference):
                return [], [], None, 0
        
        token = self.session_data['toen']
        all_prices = []
        all_images = []
        tipo_pieza = None
        
        try:
            if limit == -1:
                # Obtener todas las páginas
                page = 1
                while page <= 10:  # Máximo 10 páginas
                    params = self._build_ajax_params(reference, page, token, 180)
                    r = requests.get(AJAX_URL, headers=HEADERS, params=params, timeout=10)
                    
                    if r.status_code != 200 or not r.text.strip():
                        break
                    
                    prices, images, pieza = self._extract_all_data(r.text)
                    if not prices:
                        break
                    
                    all_prices.extend(prices)
                    all_images.extend(images)
                    if not tipo_pieza and pieza:
                        tipo_pieza = pieza
                    page += 1
            else:
                # Obtener suficientes páginas para el límite
                target_pages = max(1, (limit // 30) + 2)
                
                for page in range(1, target_pages + 1):
                    params = self._build_ajax_params(reference, page, token, 180)
                    r = requests.get(AJAX_URL, headers=HEADERS, params=params, timeout=10)
                    
                    if r.status_code != 200 or not r.text.strip():
                        break
                    
                    prices, images, pieza = self._extract_all_data(r.text)
                    if not prices:
                        break
                    
                    all_prices.extend(prices)
                    all_images.extend(images)
                    if not tipo_pieza and pieza:
                        tipo_pieza = pieza
                    
                    if len(all_prices) >= limit * 2:
                        break
            
            # Guardar el total antes de limitar
            total_encontradas = len(all_prices)
            
            # Ordenar precios y aplicar límite
            all_prices.sort()
            if limit != -1:
                all_prices = all_prices[:limit]
            
            # Mantener solo imágenes únicas
            all_images = list(dict.fromkeys(all_images))
            
            logger.info(f"Obtenidos {len(all_prices)} precios (de {total_encontradas}), {len(all_images)} imágenes, tipo: {tipo_pieza}")
            return all_prices, all_images, tipo_pieza, total_encontradas
            
        except Exception as e:
            logger.error(f"Error en fetch_prices: {e}")
            return [], [], None, 0
    
    def is_available(self) -> bool:
        """Verifica si la plataforma está disponible"""
        try:
            r = requests.get(self.base_url, timeout=5)
            return r.status_code == 200
        except:
            return False
    
    def _build_ajax_params(self, reference: str, page: int, token: str, limit: int) -> dict:
        """Construye parámetros para petición AJAX"""
        busval_raw = f"|{reference}|ninguno|producto|-1|0|0|0|0|0|0|0"
        qregx_real = "180" if limit == -1 else str(limit)
        
        return {
            "busval": b64(busval_raw),
            "filval": "",
            "panu": page,
            "toen": token,
            "tolreg": "MA==",
            "veid": "MA==",
            "paid": "NjA=",
            "prid": "MA==",
            "paiCli": "NjA=",
            "provCli": "MA==",
            "munCli": "MA==",
            "caid": "MA==",
            "mosfilm": "MA==",
            "qregx": b64(qregx_real),
            "tmin": "MQ==",
            "idla": "ZXNfRVM=",
        }
    
    def _extract_prices(self, html: str) -> List[float]:
        """Extrae precios del HTML"""
        prices, _, _ = self._extract_all_data(html)
        return prices
    
    def _extract_prices_and_images(self, html: str) -> Tuple[List[float], List[str]]:
        """Extrae precios e imágenes del HTML"""
        prices, images, _ = self._extract_all_data(html)
        return prices, images
    
    def _extract_all_data(self, html: str) -> Tuple[List[float], List[str], Optional[str]]:
        """Extrae precios, imágenes y tipo de pieza del HTML"""
        soup = BeautifulSoup(html, "html.parser")
        prices = []
        images = []
        tipo_pieza = None
        
        products = soup.select("div.product-card")
        
        for product in products:
            # Buscar precio rebajado o precio normal
            price_new = product.select_one("div.product-card__price--new")
            price_current = product.select_one("div.product-card__price--current")
            
            price_el = price_new or price_current
            
            if not price_el:
                continue
            
            text = price_el.get_text(strip=True)
            value = (
                text.replace("€", "")
                .replace(".", "")
                .replace(",", ".")
                .strip()
            )
            
            try:
                prices.append(float(value))
            except ValueError:
                pass
            
            # Buscar imagen del producto (class="image__tag")
            img = product.select_one("img.image__tag")
            if img:
                src = img.get("src") or img.get("data-src")
                if src:
                    # Asegurar URL completa
                    if src.startswith("//"):
                        src = "https:" + src
                    elif src.startswith("/"):
                        src = "https://ecooparts.com" + src
                    images.append(src)
            
            # Extraer tipo de pieza del primer producto (solo una vez)
            if not tipo_pieza:
                # Buscar en el div minseokeywor que contiene el texto como "anillo airbag volkswagen golf plus..."
                seo_div = product.select_one("div[name='minseokeywor']")
                if seo_div:
                    seo_text = seo_div.get_text(strip=True).lower()
                    # El tipo de pieza está al principio, antes del nombre del fabricante
                    # Ejemplo: "anillo airbag volkswagen golf plus 5m1 bkd,1k0959653c"
                    # Buscamos hasta encontrar una marca conocida o la coma
                    marcas = ['volkswagen', 'seat', 'audi', 'bmw', 'mercedes', 'ford', 'opel', 
                              'renault', 'peugeot', 'citroen', 'fiat', 'toyota', 'nissan', 'honda',
                              'hyundai', 'kia', 'mazda', 'volvo', 'skoda', 'mini', 'porsche',
                              'land rover', 'jeep', 'alfa romeo', 'dacia', 'mitsubishi', 'suzuki']
                    
                    for marca in marcas:
                        if marca in seo_text:
                            idx = seo_text.find(marca)
                            tipo_pieza = seo_text[:idx].strip()
                            break
                    
                    # Si no encontramos marca, tomar hasta la coma
                    if not tipo_pieza and ',' in seo_text:
                        tipo_pieza = seo_text.split(',')[0].strip()
                    
                    # Limpiar y capitalizar
                    if tipo_pieza:
                        tipo_pieza = tipo_pieza.upper()
        
        return prices, images, tipo_pieza
