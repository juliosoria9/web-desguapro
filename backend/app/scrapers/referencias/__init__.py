# Referencias scrapers module
from .carser import CarserScraper
from .flamar import FlamarScraper
from .iparlux import IparluxScraper
from .nrf import NRFScraper
from .nty import NtyScraper
from .prasco import PrascoScraper
from .triclo import search_triclo
from .vauner import buscar_iam_por_oem, search_vauner
from .buscar_todos import buscar_en_todos, obtener_primera_referencia_por_proveedor

__all__ = [
    'CarserScraper',
    'FlamarScraper', 
    'IparluxScraper',
    'NRFScraper',
    'NtyScraper',
    'PrascoScraper',
    'search_triclo',
    'buscar_iam_por_oem',
    'search_vauner',
    'buscar_en_todos',
    'obtener_primera_referencia_por_proveedor'
]
