"""
Tests de modelos de SQLAlchemy
"""
import pytest
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestUsuarioModel:
    """Tests para el modelo Usuario"""
    
    @pytest.mark.unit
    def test_usuario_model_exists(self):
        """Verificar que el modelo Usuario existe"""
        from app.models.busqueda import Usuario
        
        assert Usuario is not None
        assert hasattr(Usuario, "__tablename__")
        assert Usuario.__tablename__ == "usuarios"
    
    @pytest.mark.unit
    def test_usuario_required_fields(self):
        """Verificar campos requeridos de Usuario"""
        from app.models.busqueda import Usuario
        
        # Verificar que los campos existen
        required_fields = ["id", "email", "password_hash", "rol", "activo"]
        
        for field in required_fields:
            assert hasattr(Usuario, field), f"Campo faltante: {field}"
    
    @pytest.mark.integration
    def test_usuario_creation(self, db_session, entorno_trabajo):
        """Test de creación de Usuario"""
        from app.models.busqueda import Usuario
        from utils.security import hash_password
        
        usuario = Usuario(
            email="modelo@test.com",
            nombre="Test Modelo",
            password_hash=hash_password("test123"),
            rol="user",
            activo=True,
            entorno_trabajo_id=entorno_trabajo.id,
        )
        db_session.add(usuario)
        db_session.commit()
        
        assert usuario.id is not None
        assert usuario.fecha_creacion is not None
    
    @pytest.mark.unit
    def test_roles_enum(self):
        """Verificar que los roles están definidos"""
        from app.models.busqueda import RoleEnum
        
        assert RoleEnum.SYSOWNER == "sysowner"
        assert RoleEnum.OWNER == "owner"
        assert RoleEnum.ADMIN == "admin"
        assert RoleEnum.USER == "user"


class TestEntornoTrabajoModel:
    """Tests para el modelo EntornoTrabajo"""
    
    @pytest.mark.unit
    def test_entorno_model_exists(self):
        """Verificar que el modelo EntornoTrabajo existe"""
        from app.models.busqueda import EntornoTrabajo
        
        assert EntornoTrabajo is not None
        assert EntornoTrabajo.__tablename__ == "entornos_trabajo"
    
    @pytest.mark.integration
    def test_entorno_creation(self, db_session):
        """Test de creación de EntornoTrabajo"""
        from app.models.busqueda import EntornoTrabajo
        
        entorno = EntornoTrabajo(
            nombre="Entorno Modelo Test",
            descripcion="Descripción del entorno",
            activo=True,
        )
        db_session.add(entorno)
        db_session.commit()
        
        assert entorno.id is not None
        assert entorno.nombre == "Entorno Modelo Test"


class TestBusquedaModel:
    """Tests para el modelo Busqueda"""
    
    @pytest.mark.unit
    def test_busqueda_model_exists(self):
        """Verificar que el modelo Busqueda existe"""
        from app.models.busqueda import Busqueda
        
        assert Busqueda is not None
        assert Busqueda.__tablename__ == "busquedas"
    
    @pytest.mark.unit
    def test_busqueda_statistics_fields(self):
        """Verificar campos estadísticos de Busqueda"""
        from app.models.busqueda import Busqueda
        
        stats_fields = [
            "cantidad_precios",
            "precio_medio",
            "precio_mediana",
            "precio_minimo",
            "precio_maximo",
            "desviacion_estandar",
            "outliers_removidos",
        ]
        
        for field in stats_fields:
            assert hasattr(Busqueda, field), f"Campo estadístico faltante: {field}"
    
    @pytest.mark.integration
    def test_busqueda_creation(self, db_session, usuario_normal, entorno_trabajo):
        """Test de creación de Busqueda"""
        from app.models.busqueda import Busqueda
        
        busqueda = Busqueda(
            usuario_id=usuario_normal.id,
            entorno_trabajo_id=entorno_trabajo.id,
            referencia="TEST-REF-001",
            plataforma="ecooparts",
            cantidad_precios=5,
            precio_medio=150.0,
            precio_mediana=145.0,
            precio_minimo=100.0,
            precio_maximo=200.0,
            desviacion_estandar=25.0,
            outliers_removidos=1,
        )
        db_session.add(busqueda)
        db_session.commit()
        
        assert busqueda.id is not None
        assert busqueda.referencia == "TEST-REF-001"


class TestFichadaModel:
    """Tests para el modelo FichadaPieza"""
    
    @pytest.mark.unit
    def test_fichada_model_exists(self):
        """Verificar que el modelo FichadaPieza existe"""
        from app.models.busqueda import FichadaPieza
        
        assert FichadaPieza is not None
        assert FichadaPieza.__tablename__ == "fichadas_piezas"
    
    @pytest.mark.unit
    def test_fichada_required_fields(self):
        """Verificar campos de FichadaPieza"""
        from app.models.busqueda import FichadaPieza
        
        fields = ["id", "usuario_id", "entorno_trabajo_id", "id_pieza", "fecha_fichada"]
        
        for field in fields:
            assert hasattr(FichadaPieza, field), f"Campo faltante: {field}"
    
    @pytest.mark.integration
    def test_fichada_creation(self, db_session, usuario_normal, entorno_trabajo):
        """Test de creación de FichadaPieza"""
        from app.models.busqueda import FichadaPieza
        
        fichada = FichadaPieza(
            usuario_id=usuario_normal.id,
            entorno_trabajo_id=entorno_trabajo.id,
            id_pieza="REF-MODEL-001",
            descripcion="Pieza de prueba modelo",
        )
        db_session.add(fichada)
        db_session.commit()
        
        assert fichada.id is not None
        assert fichada.fecha_fichada is not None


class TestVerificacionFichadaModel:
    """Tests para el modelo VerificacionFichada"""
    
    @pytest.mark.unit
    def test_verificacion_model_exists(self):
        """Verificar que el modelo VerificacionFichada existe"""
        from app.models.busqueda import VerificacionFichada
        
        assert VerificacionFichada is not None
        assert VerificacionFichada.__tablename__ == "verificaciones_fichadas"
    
    @pytest.mark.unit
    def test_verificacion_fields(self):
        """Verificar campos de VerificacionFichada"""
        from app.models.busqueda import VerificacionFichada
        
        fields = ["id", "fichada_id", "usuario_id", "entorno_trabajo_id", 
                  "id_pieza", "hora_fichada", "en_stock", "fecha_verificacion"]
        
        for field in fields:
            assert hasattr(VerificacionFichada, field), f"Campo faltante: {field}"
    
    @pytest.mark.integration
    def test_verificacion_creation(self, db_session, fichada_ejemplo, usuario_normal):
        """Test de creación de VerificacionFichada"""
        from app.models.busqueda import VerificacionFichada
        
        verificacion = VerificacionFichada(
            fichada_id=fichada_ejemplo.id,
            usuario_id=usuario_normal.id,
            entorno_trabajo_id=usuario_normal.entorno_trabajo_id,
            id_pieza=fichada_ejemplo.id_pieza,
            hora_fichada=fichada_ejemplo.fecha_fichada,
            en_stock=True,
        )
        db_session.add(verificacion)
        db_session.commit()
        
        assert verificacion.id is not None
        assert verificacion.en_stock == True


class TestBaseDesguaceModel:
    """Tests para el modelo BaseDesguace"""
    
    @pytest.mark.unit
    def test_base_desguace_model_exists(self):
        """Verificar que el modelo BaseDesguace existe"""
        from app.models.busqueda import BaseDesguace
        
        assert BaseDesguace is not None
        assert BaseDesguace.__tablename__ == "bases_desguace"
    
    @pytest.mark.integration
    def test_base_desguace_creation(self, db_session, entorno_trabajo, usuario_admin):
        """Test de creación de BaseDesguace"""
        from app.models.busqueda import BaseDesguace
        
        base = BaseDesguace(
            entorno_trabajo_id=entorno_trabajo.id,
            nombre_archivo="test.csv",
            total_piezas=50,
            columnas="refid,oem,precio",
            subido_por_id=usuario_admin.id,
        )
        db_session.add(base)
        db_session.commit()
        
        assert base.id is not None
        assert base.total_piezas == 50


class TestPiezaDesguaceModel:
    """Tests para el modelo PiezaDesguace"""
    
    @pytest.mark.unit
    def test_pieza_desguace_model_exists(self):
        """Verificar que el modelo PiezaDesguace existe"""
        from app.models.busqueda import PiezaDesguace
        
        assert PiezaDesguace is not None
        assert PiezaDesguace.__tablename__ == "piezas_desguace"
    
    @pytest.mark.unit
    def test_pieza_desguace_fields(self):
        """Verificar campos de PiezaDesguace"""
        from app.models.busqueda import PiezaDesguace
        
        fields = ["id", "base_desguace_id", "refid", "oem", "precio", 
                  "ubicacion", "articulo", "marca", "modelo"]
        
        for field in fields:
            assert hasattr(PiezaDesguace, field), f"Campo faltante: {field}"
    
    @pytest.mark.integration
    def test_pieza_desguace_creation(self, db_session, base_desguace_ejemplo):
        """Test de creación de PiezaDesguace"""
        from app.models.busqueda import PiezaDesguace
        
        pieza = PiezaDesguace(
            base_desguace_id=base_desguace_ejemplo.id,
            refid="PIEZA-001",
            oem="OEM-001",
            precio=99.99,
            articulo="Faro delantero",
            marca="Ford",
            modelo="Focus",
        )
        db_session.add(pieza)
        db_session.commit()
        
        assert pieza.id is not None
        assert pieza.precio == 99.99
