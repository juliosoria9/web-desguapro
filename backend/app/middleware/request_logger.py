"""
Middleware para registrar todas las peticiones API
Captura método, ruta, usuario, tiempo de respuesta, etc.
"""
import time
import json
from datetime import datetime
from typing import Optional, Callable
from fastapi import Request, Response
from fastapi.routing import APIRoute
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy.orm import Session
from app.database import SessionLocal
from utils.security import decode_access_token


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    """Middleware que registra todas las peticiones a la API"""
    
    # Rutas a excluir del logging (para no generar ruido)
    EXCLUDED_PATHS = {
        "/docs",
        "/openapi.json",
        "/redoc",
        "/favicon.ico",
        "/api/v1/health",
        "/api/v1/admin/api-logs/stream",  # No loguear el stream de logs
        "/api/v1/admin/api-stats",  # No loguear las stats para evitar recursividad
        "/api/v1/admin/api-logs",  # No loguear consultas de logs
        "/api/v1/admin/api-logs/entornos",  # No loguear consultas de entornos
    }
    
    # Rutas que empiezan con estos prefijos se excluyen
    EXCLUDED_PREFIXES = (
        "/_next",
        "/static",
    )
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Excluir ciertas rutas
        path = request.url.path
        if path in self.EXCLUDED_PATHS or path.startswith(self.EXCLUDED_PREFIXES):
            return await call_next(request)
        
        # Solo loguear rutas de API
        if not path.startswith("/api/"):
            return await call_next(request)
        
        # Capturar tiempo de inicio
        start_time = time.time()
        
        # Obtener info del usuario del token
        user_info = await self._get_user_info(request)
        
        # Procesar la petición
        response = await call_next(request)
        
        # Calcular tiempo de respuesta
        duration_ms = (time.time() - start_time) * 1000
        
        # Registrar en BD (async para no bloquear)
        try:
            await self._log_request(
                request=request,
                response=response,
                duration_ms=duration_ms,
                user_info=user_info
            )
        except Exception as e:
            # No bloquear la respuesta si falla el logging
            print(f"Error logging request: {e}")
        
        return response
    
    async def _get_user_info(self, request: Request) -> dict:
        """Extrae info del usuario del token JWT"""
        user_info: dict = {
            "user_id": None,
            "email": None,
            "entorno_id": None,
            "entorno_nombre": None,
            "rol": None
        }
        
        try:
            # Buscar token en header o cookie
            token = None
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header.replace("Bearer ", "")
            elif "access_token" in request.cookies:
                token = request.cookies.get("access_token")
            
            if token:
                token_data = decode_access_token(token)
                if token_data:
                    user_info = {
                        "user_id": token_data.usuario_id,
                        "email": token_data.email,
                        "entorno_id": token_data.entorno_trabajo_id,
                        "entorno_nombre": token_data.entorno_nombre,
                        "rol": token_data.rol
                    }
        except:
            pass
        
        return user_info
    
    async def _log_request(
        self,
        request: Request,
        response: Response,
        duration_ms: float,
        user_info: dict
    ):
        """Guarda el log de la petición en la BD"""
        from app.models.busqueda import APIRequestLog
        
        # Obtener IP del cliente
        client_ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        if not client_ip:
            client_ip = request.client.host if request.client else "unknown"
        
        # Crear registro
        db = SessionLocal()
        try:
            log_entry = APIRequestLog(
                metodo=request.method,
                ruta=str(request.url.path),
                query_params=str(request.query_params) if request.query_params else None,
                status_code=response.status_code,
                duracion_ms=round(duration_ms, 2),
                usuario_id=int(user_info["user_id"]) if user_info["user_id"] else None,
                usuario_email=user_info["email"],
                entorno_trabajo_id=int(user_info["entorno_id"]) if user_info["entorno_id"] else None,
                entorno_nombre=user_info["entorno_nombre"],
                rol=user_info["rol"],
                ip_address=client_ip,
                user_agent=request.headers.get("User-Agent", "")[:255]
            )
            db.add(log_entry)
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"Error saving request log: {e}")
        finally:
            db.close()


# Almacén en memoria para logs en tiempo real (últimos N logs)
class RealTimeLogStore:
    """Almacén en memoria para logs en tiempo real"""
    
    def __init__(self, max_logs: int = 500):
        self.max_logs = max_logs
        self.logs: list = []
        self.listeners: list = []
    
    def add_log(self, log_data: dict):
        """Añade un log y notifica a los listeners"""
        self.logs.append(log_data)
        # Mantener solo los últimos N logs
        if len(self.logs) > self.max_logs:
            self.logs = self.logs[-self.max_logs:]
        
        # Notificar a los listeners (SSE)
        for listener in self.listeners:
            try:
                listener(log_data)
            except:
                pass
    
    def get_recent_logs(self, limit: int = 100) -> list:
        """Obtiene los logs más recientes"""
        return self.logs[-limit:]
    
    def add_listener(self, callback: Callable):
        """Añade un listener para tiempo real"""
        self.listeners.append(callback)
    
    def remove_listener(self, callback: Callable):
        """Elimina un listener"""
        if callback in self.listeners:
            self.listeners.remove(callback)


# Instancia global del store
realtime_store = RealTimeLogStore()
