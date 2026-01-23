"""
Gestión de token TOEN para Ecooparts
"""
import os
import requests
import logging

# Intentar importar Playwright
try:
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False

from utils.encoding import b64

logger = logging.getLogger(__name__)

# Ruta base del backend
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CACHE_FILE = os.path.join(BACKEND_DIR, "toen_cache.txt")

BASE_URL = "https://ecooparts.com/recambios-automovil-segunda-mano/"
AJAX_URL = "https://ecooparts.com/ajax/ajax_buscador.php"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "*/*",
    "Referer": "https://ecooparts.com/",
}


def load_toen(cache_file: str = None) -> str:
    """Carga token del archivo de caché"""
    if cache_file is None:
        cache_file = DEFAULT_CACHE_FILE
    try:
        if os.path.exists(cache_file):
            with open(cache_file, "r") as f:
                token = f.read().strip()
                if token:
                    logger.info(f"Token cargado desde {cache_file}")
                    return token
    except Exception as e:
        logger.error(f"Error cargando token: {e}")
    return None


def save_toen(token: str, cache_file: str = None):
    """Guarda token en archivo de caché"""
    if cache_file is None:
        cache_file = DEFAULT_CACHE_FILE
    try:
        with open(cache_file, "w") as f:
            f.write(token)
        logger.info(f"Token guardado en {cache_file}")
    except Exception as e:
        logger.error(f"Error guardando token: {e}")


def validate_toen(token: str, reference: str = "1K0959653C") -> bool:
    """Valida si un TOEN funciona"""
    try:
        params = {
            "pag": "pro",
            "txbu": b64(reference),
            "panu": b64("1"),
            "toen": token,
            "tipor": b64("producto"),
            "limit": "30"
        }
        r = requests.get(AJAX_URL, headers=HEADERS, params=params, timeout=10)
        return r.status_code == 200 and len(r.text) > 100
    except:
        return False


def get_toen_with_playwright(reference: str = "1K0959653C") -> str:
    """Obtiene TOEN usando Playwright"""
    if not PLAYWRIGHT_AVAILABLE:
        return None
    
    token_value = None
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            
            def on_request(req):
                nonlocal token_value
                if "ajax/ajax_buscador.php" in req.url and "toen=" in req.url:
                    for part in req.url.split("&"):
                        if part.startswith("toen="):
                            token_value = part.split("=", 1)[1]
            
            page.on("request", on_request)
            
            busval_raw = f"|{reference}|ninguno|producto|-1|0|0|0|0|0|0|0"
            search_url = (
                f"{BASE_URL}"
                f"?pag=pro"
                f"&busval={b64(busval_raw)}"
                f"&tebu={b64(reference)}"
                f"&txbu={b64(reference)}"
                f"&panu={b64('1')}"
            )
            
            page.goto(search_url, wait_until="networkidle")
            page.wait_for_timeout(2000)
            browser.close()
    except Exception as e:
        logger.error(f"Error obteniendo token con Playwright: {e}")
        return None
    
    return token_value


def get_new_toen(reference: str = "1K0959653C") -> str:
    """Obtiene un nuevo token TOEN"""
    token = get_toen_with_playwright(reference)
    if token:
        logger.info("Token TOEN obtenido con Playwright")
        return token
    
    logger.warning("No se pudo obtener token TOEN automáticamente")
    return None
