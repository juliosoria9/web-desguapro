"""
Scraper para eBay usando la API oficial (Browse API)
Documentación: https://developer.ebay.com/api-docs/buy/browse/overview.html
"""
import requests
from typing import List, Tuple, Optional, Dict, Any
import logging
import base64
import json
from datetime import datetime, timedelta

from core.base_scraper import PlatformScraper
from app.config import settings

logger = logging.getLogger(__name__)

# URLs de eBay
EBAY_AUTH_URL_PROD = "https://api.ebay.com/identity/v1/oauth2/token"
EBAY_AUTH_URL_SANDBOX = "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
EBAY_BROWSE_URL_PROD = "https://api.ebay.com/buy/browse/v1"
EBAY_BROWSE_URL_SANDBOX = "https://api.sandbox.ebay.com/buy/browse/v1"

# Cache del token (tipado para evitar warnings)
_token_cache: Dict[str, Any] = {
    "access_token": None,
    "expires_at": None
}


class EbayScraper(PlatformScraper):
    """Scraper para eBay usando la API oficial Browse"""
    
    def __init__(self):
        super().__init__("eBay", "https://www.ebay.es/")
        self.access_token = None
        self.auth_url = EBAY_AUTH_URL_SANDBOX if settings.ebay_sandbox else EBAY_AUTH_URL_PROD
        self.browse_url = EBAY_BROWSE_URL_SANDBOX if settings.ebay_sandbox else EBAY_BROWSE_URL_PROD
    
    def _get_access_token(self) -> Optional[str]:
        """Obtiene token OAuth2 de eBay (Client Credentials Grant)"""
        global _token_cache
        
        # Verificar cache
        if _token_cache["access_token"] and _token_cache["expires_at"]:
            if datetime.now() < _token_cache["expires_at"]:
                return _token_cache["access_token"]
        
        if not settings.ebay_app_id or not settings.ebay_cert_id:
            logger.error("eBay: Credenciales no configuradas (EBAY_APP_ID, EBAY_CERT_ID)")
            return None
        
        try:
            # Codificar credenciales en Base64
            credentials = f"{settings.ebay_app_id}:{settings.ebay_cert_id}"
            encoded_credentials = base64.b64encode(credentials.encode()).decode()
            
            headers = {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": f"Basic {encoded_credentials}"
            }
            
            data = {
                "grant_type": "client_credentials",
                "scope": "https://api.ebay.com/oauth/api_scope"
            }
            
            response = requests.post(
                self.auth_url,
                headers=headers,
                data=data,
                timeout=10
            )
            
            if response.status_code == 200:
                token_data = response.json()
                _token_cache["access_token"] = token_data["access_token"]
                expires_in = token_data.get("expires_in", 7200)
                _token_cache["expires_at"] = datetime.now() + timedelta(seconds=expires_in - 60)
                logger.info(f"eBay: Token obtenido, expira en {expires_in}s")
                return _token_cache["access_token"]
            else:
                logger.error(f"eBay: Error obteniendo token: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"eBay: Error en autenticación: {e}")
            return None
    
    def setup_session(self, reference: str) -> bool:
        """Configura sesión obteniendo token OAuth"""
        token = self._get_access_token()
        if token:
            self.access_token = token
            return True
        return False
    
    def is_available(self) -> bool:
        """Verifica si eBay API está disponible"""
        return bool(settings.ebay_app_id and settings.ebay_cert_id)
    
    def fetch_prices(self, reference: str, limit: int = 30) -> List[float]:
        """Obtiene precios de eBay"""
        prices, _ = self.fetch_prices_with_images(reference, limit)
        return prices
    
    def fetch_prices_with_images(self, reference: str, limit: int = 30) -> Tuple[List[float], List[str]]:
        """Obtiene precios e imágenes de eBay"""
        if not self.access_token:
            if not self.setup_session(reference):
                logger.warning("eBay: No se pudo establecer sesión")
                return [], []
        
        prices = []
        images = []
        
        try:
            # Buscar en eBay España (EBAY_ES) - piezas de coche
            headers = {
                "Authorization": f"Bearer {self.access_token}",
                "X-EBAY-C-MARKETPLACE-ID": "EBAY_ES",
                "X-EBAY-C-ENDUSERCTX": "contextualLocation=country=ES",
                "Content-Type": "application/json"
            }
            
            # Parámetros de búsqueda
            # Filtrar por categoría de piezas de coche: 6030 (Auto Parts & Accessories)
            params = {
                "q": reference,
                "limit": min(limit, 50),  # eBay máximo 200 por página
                "category_ids": "6030",  # Auto Parts & Accessories
                "filter": "deliveryCountry:ES,priceCurrency:EUR",
                "sort": "price"
            }
            
            response = requests.get(
                f"{self.browse_url}/item_summary/search",
                headers=headers,
                params=params,
                timeout=15
            )
            
            if response.status_code == 200:
                data = response.json()
                items = data.get("itemSummaries", [])
                
                for item in items:
                    # Extraer precio
                    price_info = item.get("price", {})
                    price_value = price_info.get("value")
                    if price_value:
                        try:
                            price = float(price_value)
                            if price > 0:
                                prices.append(price)
                        except (ValueError, TypeError):
                            pass
                    
                    # Extraer imagen
                    image_info = item.get("image", {})
                    image_url = image_info.get("imageUrl")
                    if image_url:
                        images.append(image_url)
                
                logger.info(f"eBay: {len(prices)} precios, {len(images)} imágenes para '{reference}'")
                
            elif response.status_code == 401:
                # Token expirado, intentar renovar
                logger.warning("eBay: Token expirado, renovando...")
                _token_cache["access_token"] = None
                if self.setup_session(reference):
                    return self.fetch_prices_with_images(reference, limit)
            else:
                logger.warning(f"eBay: Error en búsqueda: {response.status_code} - {response.text[:200]}")
                
        except Exception as e:
            logger.error(f"eBay: Error en fetch_prices_with_images: {e}")
        
        return prices, images
    
    def fetch_all_data(self, reference: str, limit: int = 30) -> Tuple[List[float], List[str], Optional[str], int]:
        """
        Obtiene precios, imágenes, tipo de pieza y total de eBay
        
        Returns:
            Tuple[precios, imagenes, tipo_pieza, total_encontrados]
        """
        prices, images = self.fetch_prices_with_images(reference, limit)
        return prices, images, None, len(prices)
