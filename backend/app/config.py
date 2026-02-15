"""
Configuración de la aplicación FastAPI
"""
from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    """Configuración de la aplicación"""
    
    # Database - SQLite para desarrollo
    database_url: str = "sqlite:///./desguapro.db"
    redis_url: str = "redis://localhost:6379/0"
    
    # Application
    debug: bool = False
    secret_key: str = os.getenv("SECRET_KEY", "CHANGE-THIS-IN-PRODUCTION-USE-ENV-VAR")
    app_name: str = "DesguaPro API"
    api_version: str = "1.0.0"
    
    # CORS
    cors_origins: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost",
        "https://desguapro.com",
        "https://www.desguapro.com",
    ]
    
    # Logging
    log_level: str = "INFO"
    
    # Security - Cookies
    cookie_secure: bool = False  # True en producción (requiere HTTPS)
    
    # Features
    enable_stock_check: bool = True
    max_workers: int = 5
    cache_ttl_seconds: int = 3600
    
    # eBay API
    ebay_app_id: str = os.getenv("EBAY_APP_ID", "")  # Client ID
    ebay_cert_id: str = os.getenv("EBAY_CERT_ID", "")  # Client Secret
    ebay_sandbox: bool = os.getenv("EBAY_SANDBOX", "false").lower() == "true"
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
