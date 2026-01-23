"""
Clase base abstracta para scrapers
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any


class PlatformScraper(ABC):
    """Interfaz abstracta para scrapers de plataformas"""
    
    def __init__(self, name: str, base_url: str):
        self.name = name
        self.base_url = base_url
        self.session_data = {}
    
    @abstractmethod
    def setup_session(self, reference: str) -> bool:
        """Configura la sesión necesaria para scraping"""
        pass
    
    @abstractmethod
    def fetch_prices(self, reference: str, limit: int = 30) -> List[float]:
        """Obtiene lista de precios para la referencia especificada"""
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """Verifica si la plataforma está disponible"""
        pass
    
    def get_platform_info(self) -> Dict[str, Any]:
        """Retorna información básica de la plataforma"""
        return {
            "name": self.name,
            "base_url": self.base_url,
            "available": self.is_available()
        }
