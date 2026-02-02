"""
Factory para crear scrapers de diferentes plataformas
"""
from typing import Dict, Type, List
from core.base_scraper import PlatformScraper
from core.scrapers.ecooparts_scraper import EcoopartsScraper
from core.scrapers.recambioverde_scraper import RecambioVerdeScraper
from core.scrapers.ovoko_scraper import OvokoScraper
from core.scrapers.opisto_scraper import OpistoScraper
from core.scrapers.ebay_scraper import EbayScraper
from core.scrapers.partsss_scraper import PartsssScraper
from core.scrapers.motomine_scraper import MotomineScraper


class ScraperFactory:
    """Factory para crear scrapers de diferentes plataformas"""
    
    # Scrapers rápidos (incluidos en "todas")
    _scrapers: Dict[str, Type[PlatformScraper]] = {
        "ecooparts": EcoopartsScraper,
        "recambioverde": RecambioVerdeScraper,
        "opisto": OpistoScraper,
        "ebay": EbayScraper,
    }
    
    # Scrapers lentos (NO incluidos en "todas", solo selección explícita)
    _slow_scrapers: Dict[str, Type[PlatformScraper]] = {
        "ovoko": OvokoScraper,
        "partsss": PartsssScraper,  # Motos - piezas nuevas
        "motomine": MotomineScraper,  # Motos - piezas usadas UK
    }
    
    @classmethod
    def get_available_platforms(cls) -> Dict[str, str]:
        """Retorna diccionario con plataformas disponibles {id: nombre_display}"""
        platforms = {}
        for platform_id, scraper_class in cls._scrapers.items():
            try:
                temp_scraper = scraper_class()
                platforms[platform_id] = temp_scraper.name
            except:
                platforms[platform_id] = platform_id.capitalize()
        return platforms
    
    @classmethod
    def get_slow_platforms(cls) -> List[str]:
        """Retorna lista de IDs de plataformas lentas"""
        return list(cls._slow_scrapers.keys())
    
    @classmethod
    def create_scraper(cls, platform_id: str) -> PlatformScraper:
        """Crea instancia del scraper para la plataforma especificada"""
        # Buscar en scrapers normales
        if platform_id in cls._scrapers:
            return cls._scrapers[platform_id]()
        # Buscar en scrapers lentos
        if platform_id in cls._slow_scrapers:
            return cls._slow_scrapers[platform_id]()
        
        raise ValueError(f"Plataforma no soportada: {platform_id}")
    
    @classmethod
    def get_all_scrapers(cls, include_slow: bool = False) -> Dict[str, PlatformScraper]:
        """Crea instancias de todos los scrapers disponibles"""
        scrapers = {
            platform_id: cls.create_scraper(platform_id) 
            for platform_id in cls._scrapers.keys()
        }
        if include_slow:
            for platform_id in cls._slow_scrapers.keys():
                scrapers[platform_id] = cls.create_scraper(platform_id)
        return scrapers
    
    @classmethod
    def register_scraper(cls, platform_id: str, scraper_class: Type[PlatformScraper], slow: bool = False):
        """Registra un nuevo scraper"""
        if slow:
            cls._slow_scrapers[platform_id] = scraper_class
        else:
            cls._scrapers[platform_id] = scraper_class
