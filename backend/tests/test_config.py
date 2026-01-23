"""
Tests de configuración de la aplicación
"""
import pytest
import os
import sys

# Añadir el directorio backend al path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestConfig:
    """Tests para la configuración de Settings"""
    
    @pytest.mark.unit
    def test_settings_import(self):
        """Verificar que se puede importar Settings correctamente"""
        from app.config import Settings, settings
        
        assert Settings is not None
        assert settings is not None
    
    @pytest.mark.unit
    def test_settings_default_values(self):
        """Verificar valores por defecto de Settings"""
        from app.config import settings
        
        # Verificar valores básicos
        assert settings.app_name == "DesguaPro API"
        assert settings.api_version == "1.0.0"
        assert "sqlite" in settings.database_url or "postgresql" in settings.database_url
    
    @pytest.mark.unit
    def test_settings_database_url(self):
        """Verificar que database_url tiene un formato válido"""
        from app.config import settings
        
        assert settings.database_url is not None
        assert len(settings.database_url) > 0
        
        # Debe ser SQLite o PostgreSQL
        valid_prefixes = ["sqlite:///", "postgresql://", "postgresql+psycopg2://"]
        assert any(settings.database_url.startswith(p) for p in valid_prefixes), \
            f"URL de BD no válida: {settings.database_url}"
    
    @pytest.mark.unit
    def test_settings_cors_origins(self):
        """Verificar configuración de CORS"""
        from app.config import settings
        
        assert settings.cors_origins is not None
        assert isinstance(settings.cors_origins, list)
        assert len(settings.cors_origins) > 0
        
        # Debe incluir localhost para desarrollo
        localhost_origins = [o for o in settings.cors_origins if "localhost" in o]
        assert len(localhost_origins) > 0, "Debe haber al menos un origen localhost para desarrollo"
    
    @pytest.mark.unit
    def test_settings_secret_key(self):
        """Verificar que hay un secret_key configurado"""
        from app.config import settings
        
        assert settings.secret_key is not None
        assert len(settings.secret_key) > 10, "Secret key debe tener al menos 10 caracteres"
    
    @pytest.mark.unit
    def test_settings_redis_url(self):
        """Verificar configuración de Redis"""
        from app.config import settings
        
        assert settings.redis_url is not None
        assert settings.redis_url.startswith("redis://")
    
    @pytest.mark.unit
    def test_settings_cache_ttl(self):
        """Verificar configuración de cache"""
        from app.config import settings
        
        assert settings.cache_ttl_seconds > 0
        assert isinstance(settings.cache_ttl_seconds, int)
    
    @pytest.mark.unit
    def test_settings_max_workers(self):
        """Verificar configuración de workers"""
        from app.config import settings
        
        assert settings.max_workers > 0
        assert settings.max_workers <= 50, "max_workers no debería exceder 50"
    
    @pytest.mark.unit
    def test_settings_log_level(self):
        """Verificar configuración de logging"""
        from app.config import settings
        
        valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        assert settings.log_level.upper() in valid_levels


class TestEnvironment:
    """Tests para verificar el entorno de desarrollo"""
    
    @pytest.mark.unit
    def test_python_version(self):
        """Verificar versión de Python"""
        import sys
        
        assert sys.version_info >= (3, 9), "Requiere Python 3.9+"
    
    @pytest.mark.unit
    def test_required_modules(self):
        """Verificar que los módulos requeridos están instalados"""
        modules = [
            "fastapi",
            "sqlalchemy",
            "pydantic",
            "requests",
            "bs4",  # BeautifulSoup
        ]
        
        for module in modules:
            try:
                __import__(module)
            except ImportError:
                pytest.fail(f"Módulo requerido no instalado: {module}")
    
    @pytest.mark.unit
    def test_app_directory_structure(self):
        """Verificar estructura de directorios de la aplicación"""
        import os
        
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        app_dir = os.path.join(backend_dir, "app")
        
        required_dirs = ["models", "routers", "schemas", "scrapers"]
        
        for dir_name in required_dirs:
            dir_path = os.path.join(app_dir, dir_name)
            assert os.path.isdir(dir_path), f"Directorio faltante: {dir_name}"
    
    @pytest.mark.unit
    def test_main_exists(self):
        """Verificar que main.py existe y es importable"""
        from app.main import app
        
        assert app is not None
        assert hasattr(app, "include_router"), "app no parece ser una aplicación FastAPI"
