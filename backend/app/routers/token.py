"""
Router para gestión de tokens (TOEN de Ecooparts)
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
import logging

from app.database import get_db
from app.models.busqueda import TokenToen, Usuario
from app.dependencies import get_current_admin
from core.toen import validate_toen, save_toen, load_toen

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/obtener")
async def obtener_token(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_admin),
):
    """
    Obtiene el token TOEN guardado para el entorno de trabajo del usuario
    
    Requiere autenticación con rol owner o admin
    """
    try:
        logger.info(f"Usuario {usuario.email} obteniendo token - Entorno: {usuario.entorno_trabajo_id}")
        
        token_bd = db.query(TokenToen).filter(
            TokenToen.entorno_trabajo_id == usuario.entorno_trabajo_id,
            TokenToen.plataforma == "ecooparts"
        ).first()
        
        if not token_bd:
            return {"token": None, "mensaje": "No hay token configurado para este entorno"}
        
        return {
            "token": token_bd.token[:20] + "..." if len(token_bd.token) > 20 else token_bd.token,
            "fecha_creacion": token_bd.fecha_creacion,
        }
    except Exception as e:
        logger.error(f"Error obteniendo token: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/configurar")
async def configurar_token(
    token: str,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_admin),
):
    """
    Configura un nuevo token TOEN para el entorno de trabajo del usuario
    
    Requiere autenticación con rol owner o admin
    """
    try:
        logger.info(f"Usuario {usuario.email} configurando token - Entorno: {usuario.entorno_trabajo_id}")
        
        if not token or len(token) < 10:
            raise HTTPException(status_code=400, detail="Token inválido")
        
        # Validar token
        if not validate_toen(token):
            logger.warning(f"Token posiblemente inválido, pero se guarda")
        
        # Guardar en BD
        token_bd = db.query(TokenToen).filter(
            TokenToen.entorno_trabajo_id == usuario.entorno_trabajo_id,
            TokenToen.plataforma == "ecooparts"
        ).first()
        
        if token_bd:
            token_bd.token = token
        else:
            token_bd = TokenToen(
                entorno_trabajo_id=usuario.entorno_trabajo_id,
                plataforma="ecooparts",
                token=token
            )
            db.add(token_bd)
        
        db.commit()
        
        # Guardar también en caché local
        save_toen(token)
        
        logger.info(f"Token configurado exitosamente para entorno {usuario.entorno_trabajo_id}")
        
        return {
            "mensaje": "Token configurado exitosamente",
            "token": token[:20] + "...",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error configurando token: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
