"""
Router para manejar notificaciones de eBay API
Específicamente: Marketplace Account Deletion Notifications
"""
from fastapi import APIRouter, Request, Response, HTTPException
from pydantic import BaseModel
from typing import Optional
import hashlib
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ebay", tags=["ebay"])

# Token de verificación configurado en eBay Developer Portal
VERIFICATION_TOKEN = "desguapro_ebay_verify_2026_for_delivery_method"


@router.get("/account-deletion")
async def ebay_account_deletion_challenge(
    challenge_code: Optional[str] = None
):
    """
    Endpoint de verificación para eBay Marketplace Account Deletion.
    eBay envía un GET con challenge_code para verificar el endpoint.
    Debemos responder con el hash SHA256 del challenge_code + verification_token + endpoint.
    """
    if not challenge_code:
        return {"status": "ok", "message": "eBay Account Deletion endpoint ready"}
    
    # eBay requiere responder con SHA256(challenge_code + verification_token + endpoint)
    endpoint = "https://desguapro/ebay/account-deletion"
    
    # Crear el hash según la documentación de eBay
    hash_input = challenge_code + VERIFICATION_TOKEN + endpoint
    challenge_response = hashlib.sha256(hash_input.encode('utf-8')).hexdigest()
    
    logger.info(f"eBay verification challenge received. Challenge code: {challenge_code[:20]}...")
    
    return {
        "challengeResponse": challenge_response
    }


class AccountDeletionNotification(BaseModel):
    """Modelo para notificaciones de eliminación de cuenta de eBay"""
    metadata: Optional[dict] = None
    notification: Optional[dict] = None


@router.post("/account-deletion")
async def ebay_account_deletion_notification(
    request: Request
):
    """
    Endpoint para recibir notificaciones de eliminación de cuenta de eBay.
    Cuando un usuario elimina su cuenta de eBay, eBay nos notifica aquí.
    """
    try:
        body = await request.json()
        logger.info(f"eBay Account Deletion notification received: {body}")
        
        # Aquí puedes procesar la notificación
        # Por ejemplo: eliminar datos del usuario de tu base de datos
        
        # eBay espera un 200 OK para confirmar la recepción
        return {"status": "received", "message": "Notification processed successfully"}
        
    except Exception as e:
        logger.error(f"Error processing eBay notification: {e}")
        # Aún así devolvemos 200 para que eBay no reintente
        return {"status": "error", "message": str(e)}
