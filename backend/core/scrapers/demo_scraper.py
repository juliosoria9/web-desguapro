"""
Scraper de demostración
"""
from typing import List
import time
import random
import logging

from core.base_scraper import PlatformScraper

logger = logging.getLogger(__name__)


class DemoScraper(PlatformScraper):
    """Scraper de demostración"""
    
    def __init__(self):
        super().__init__("Demo Platform", "https://demo-platform.com/")
    
    def setup_session(self, reference: str) -> bool:
        """Simula configuración de sesión"""
        try:
            time.sleep(0.5)
            self.session_data['demo_token'] = f"demo_{hash(reference) % 10000}"
            logger.info("Demo session setup")
            return True
        except:
            return False
    
    def fetch_prices(self, reference: str, limit: int = 30) -> List[float]:
        """Genera precios de demostración"""
        if 'demo_token' not in self.session_data:
            if not self.setup_session(reference):
                return []
        
        try:
            time.sleep(0.5)
            
            random.seed(hash(reference))
            num_prices = random.randint(15, 50)
            if limit != -1:
                num_prices = min(num_prices, limit + random.randint(5, 15))
            
            base_price = random.uniform(20, 100)
            prices = []
            
            for _ in range(num_prices):
                variation = random.uniform(-0.3, 0.3)
                price = base_price * (1 + variation)
                prices.append(round(price, 2))
            
            prices.sort()
            logger.info(f"Generated {len(prices)} demo prices")
            return prices
            
        except Exception as e:
            logger.error(f"Error en fetch_prices demo: {e}")
            return []
    
    def is_available(self) -> bool:
        """Siempre disponible"""
        return True
