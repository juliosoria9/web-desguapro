"""
Aplicación FastAPI principal
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging

from app.config import settings
from app.routers import precios, stock, plataformas, token, auth, desguace, precios_config, referencias, fichadas, ebay, admin, piezas, stockeo, tickets, anuncios, paqueteria, tests, clientes, vehiculos
from services.scheduler import iniciar_scheduler, detener_scheduler
from app.middleware.request_logger import RequestLoggerMiddleware
from app.database import engine
from app.models.busqueda import Base

# Configurar logging
logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)


# Lifecycle: iniciar/detener scheduler
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: crear tablas nuevas si no existen
    logger.info("Verificando tablas de base de datos...")
    Base.metadata.create_all(bind=engine)
    # Startup: iniciar scheduler de backups
    logger.info("Iniciando scheduler de backups automáticos...")
    iniciar_scheduler()
    yield
    # Shutdown: detener scheduler
    logger.info("Deteniendo scheduler...")
    detener_scheduler()


# Crear aplicación
app = FastAPI(
    title=settings.app_name,
    version=settings.api_version,
    description="API para búsqueda de precios de piezas de automóvil - Con autenticación",
    lifespan=lifespan,
    openapi_url="/api/v1/openapi.json",
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request Logger middleware - registra todas las peticiones API
app.add_middleware(RequestLoggerMiddleware)


# ============== ROUTERS ==============
# Auth (sin autenticación)
app.include_router(auth.router, prefix="/api/v1/auth", tags=["autenticación"])

# API (con autenticación)
app.include_router(precios.router, prefix="/api/v1/precios", tags=["precios"])
app.include_router(stock.router, prefix="/api/v1/stock", tags=["stock"])
app.include_router(plataformas.router, prefix="/api/v1/plataformas", tags=["plataformas"])
app.include_router(token.router, prefix="/api/v1/token", tags=["token"])
app.include_router(desguace.router, prefix="/api/v1/desguace", tags=["desguace"])
app.include_router(precios_config.router, prefix="/api/v1/precios-config", tags=["configuración precios"])
app.include_router(referencias.router, prefix="/api/v1/referencias", tags=["referencias"])
app.include_router(fichadas.router, prefix="/api/v1/fichadas", tags=["fichadas"])
app.include_router(piezas.router, prefix="/api/v1/piezas", tags=["piezas"])

# Admin (auditoría y backups)
app.include_router(admin.router, prefix="/api/v1", tags=["admin"])

# Stockeo automático (solo sysowner)
app.include_router(stockeo.router, prefix="/api/v1", tags=["stockeo"])

# Tickets de soporte
app.include_router(tickets.router, prefix="/api/v1/tickets", tags=["tickets"])

# Anuncios y changelog
app.include_router(anuncios.router, prefix="/api/v1/anuncios", tags=["anuncios"])

# Paquetería y envíos
app.include_router(paqueteria.router, prefix="/api/v1/paqueteria", tags=["paquetería"])

# Clientes interesados (Ventas)
app.include_router(clientes.router, prefix="/api/v1/clientes", tags=["clientes"])

# Datos de vehículos (marcas, modelos, años)
app.include_router(vehiculos.router, prefix="/api/v1/vehiculos", tags=["vehículos"])

# Tests del sistema (solo sysowner)
app.include_router(tests.router, prefix="/api/v1/tests", tags=["tests"])

# eBay API (sin autenticación - público para que eBay pueda verificar)
app.include_router(ebay.router, prefix="/api/v1", tags=["ebay"])


@app.get("/api/v1/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.api_version,
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Bienvenido a DesguaPro API",
        "docs": "/api/v1/docs",
        "version": settings.api_version,
        "auth": "Necesitas hacer login en /api/v1/auth/login",
    }


@app.exception_handler(Exception)
async def exception_handler(request, exc):
    """Global exception handler"""
    logger.error(f"Error: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor"},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
    )
