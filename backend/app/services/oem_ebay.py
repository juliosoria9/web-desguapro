"""
Filtra referencias OEM equivalentes por relevancia usando la API de eBay.
Busca cada referencia y devuelve las top N con más piezas a la venta.
"""
import logging
import requests
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

from app.config import settings
from app.services.oem_equivalentes import buscar_oem_equivalentes

logger = logging.getLogger(__name__)

EBAY_AUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token"
EBAY_BROWSE_URL = "https://api.ebay.com/buy/browse/v1"

_token_cache: Dict[str, Any] = {"access_token": None, "expires_at": None}


def _get_ebay_token() -> Optional[str]:
    global _token_cache

    if _token_cache["access_token"] and _token_cache["expires_at"]:
        if datetime.now() < _token_cache["expires_at"]:
            return _token_cache["access_token"]

    if not settings.ebay_app_id or not settings.ebay_cert_id:
        logger.error("eBay: credenciales no configuradas")
        return None

    try:
        creds = base64.b64encode(
            f"{settings.ebay_app_id}:{settings.ebay_cert_id}".encode()
        ).decode()
        resp = requests.post(
            EBAY_AUTH_URL,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": f"Basic {creds}",
            },
            data={
                "grant_type": "client_credentials",
                "scope": "https://api.ebay.com/oauth/api_scope",
            },
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            _token_cache["access_token"] = data["access_token"]
            _token_cache["expires_at"] = datetime.now() + timedelta(
                seconds=data.get("expires_in", 7200) - 60
            )
            return _token_cache["access_token"]
        logger.error(f"eBay token error: {resp.status_code}")
    except Exception as e:
        logger.error(f"eBay auth error: {e}")
    return None


def _contar_items_ebay(referencia: str, token: str) -> int:
    """Busca una referencia en eBay y devuelve el total de items encontrados."""
    try:
        resp = requests.get(
            f"{EBAY_BROWSE_URL}/item_summary/search",
            headers={
                "Authorization": f"Bearer {token}",
                "X-EBAY-C-MARKETPLACE-ID": "EBAY_ES",
                "X-EBAY-C-ENDUSERCTX": "contextualLocation=country=ES",
            },
            params={
                "q": referencia,
                "limit": 1,
                "category_ids": "6030",
                "filter": "deliveryCountry:ES,priceCurrency:EUR",
            },
            timeout=10,
        )
        if resp.status_code == 200:
            return resp.json().get("total", 0)
    except Exception as e:
        logger.debug(f"eBay count error for {referencia}: {e}")
    return 0


def buscar_oem_relevantes(
    referencia: str, top_n: int = 5
) -> List[Dict[str, Any]]:
    """
    1. Obtiene OEM equivalentes (tarostrade + distriauto).
    2. Consulta cada una en eBay para contar items a la venta.
    3. Devuelve las top_n con más resultados (>0).
    Retorna: [{"referencia": "XXX", "total_en_venta": 42}, ...]
    """
    oem_refs = buscar_oem_equivalentes(referencia)
    if not oem_refs:
        return []

    token = _get_ebay_token()
    if not token:
        logger.warning("No se pudo obtener token eBay, devolviendo OEM sin filtrar")
        return [{"referencia": r, "total_en_venta": 0} for r in oem_refs[:top_n]]

    # Limitar a 20 refs para no saturar la API
    refs_a_buscar = oem_refs[:20]
    resultados: List[Dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=5) as ex:
        futures = {
            ex.submit(_contar_items_ebay, ref, token): ref
            for ref in refs_a_buscar
        }
        for f in as_completed(futures):
            ref = futures[f]
            try:
                total = f.result()
                resultados.append({"referencia": ref, "total_en_venta": total})
            except Exception:
                resultados.append({"referencia": ref, "total_en_venta": 0})

    # Ordenar por más vendidos y quedarnos con top_n que tengan > 0
    resultados.sort(key=lambda x: x["total_en_venta"], reverse=True)
    top = [r for r in resultados if r["total_en_venta"] > 0][:top_n]

    # Si no hay ninguno con ventas, devolver los primeros top_n sin filtrar
    if not top:
        top = resultados[:top_n]

    logger.info(
        f"OEM relevantes para {referencia}: "
        f"{len(oem_refs)} encontradas → {len(top)} seleccionadas (eBay)"
    )
    return top
