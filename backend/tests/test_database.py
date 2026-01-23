"""
Tests de base de datos y conexiones
"""
import pytest
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestDatabaseConnection:
    """Tests para conexión a base de datos"""
    
    @pytest.mark.integration
    def test_database_import(self):
        """Verificar que se puede importar el módulo de base de datos"""
        from app.database import Base, get_db, engine
        
        assert Base is not None
        assert get_db is not None
        assert engine is not None
    
    @pytest.mark.integration
    def test_base_metadata(self):
        """Verificar que Base tiene metadata configurado"""
        from app.database import Base
        
        assert hasattr(Base, "metadata")
        assert Base.metadata is not None
    
    @pytest.mark.integration
    def test_get_db_returns_session(self, db_session):
        """Verificar que get_db retorna una sesión válida"""
        from sqlalchemy import text
        
        assert db_session is not None
        
        # Verificar que la sesión puede ejecutar queries
        result = db_session.execute(text("SELECT 1")).fetchone()
        assert result[0] == 1
    
    @pytest.mark.integration
    def test_tables_exist(self, db_session):
        """Verificar que las tablas principales existen"""
        from sqlalchemy import inspect
        from app.database import engine
        
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        
        required_tables = [
            "usuarios",
            "entornos_trabajo",
            "busquedas",
            "fichadas_piezas",
            "verificaciones_fichadas",
        ]
        
        for table in required_tables:
            assert table in tables, f"Tabla faltante: {table}"


class TestDatabaseOperations:
    """Tests para operaciones CRUD básicas"""
    
    @pytest.mark.integration
    def test_create_entorno_trabajo(self, db_session):
        """Test de creación de entorno de trabajo"""
        from app.models.busqueda import EntornoTrabajo
        
        entorno = EntornoTrabajo(
            nombre="Test Entorno",
            descripcion="Descripción de prueba",
            activo=True,
        )
        db_session.add(entorno)
        db_session.commit()
        
        assert entorno.id is not None
        assert entorno.fecha_creacion is not None
    
    @pytest.mark.integration
    def test_create_usuario(self, db_session, entorno_trabajo):
        """Test de creación de usuario"""
        from app.models.busqueda import Usuario
        from utils.security import hash_password
        
        usuario = Usuario(
            email="nuevo@test.com",
            nombre="Nuevo Usuario",
            password_hash=hash_password("password123"),
            rol="user",
            activo=True,
            entorno_trabajo_id=entorno_trabajo.id,
        )
        db_session.add(usuario)
        db_session.commit()
        
        assert usuario.id is not None
        assert usuario.email == "nuevo@test.com"
    
    @pytest.mark.integration
    def test_query_usuarios(self, db_session, usuario_normal):
        """Test de consulta de usuarios"""
        from app.models.busqueda import Usuario
        
        usuarios = db_session.query(Usuario).filter(
            Usuario.email == "user@test.com"
        ).all()
        
        assert len(usuarios) == 1
        assert usuarios[0].nombre == "User Test"
    
    @pytest.mark.integration
    def test_update_usuario(self, db_session, usuario_normal):
        """Test de actualización de usuario"""
        from app.models.busqueda import Usuario
        
        usuario_normal.nombre = "Nombre Actualizado"
        db_session.commit()
        db_session.refresh(usuario_normal)
        
        # Verificar en una nueva query
        usuario = db_session.query(Usuario).filter(
            Usuario.id == usuario_normal.id
        ).first()
        
        assert usuario.nombre == "Nombre Actualizado"
    
    @pytest.mark.integration
    def test_delete_usuario(self, db_session, entorno_trabajo):
        """Test de eliminación de usuario"""
        from app.models.busqueda import Usuario
        from utils.security import hash_password
        
        # Crear usuario temporal
        usuario = Usuario(
            email="delete@test.com",
            nombre="Para Eliminar",
            password_hash=hash_password("test"),
            rol="user",
            entorno_trabajo_id=entorno_trabajo.id,
        )
        db_session.add(usuario)
        db_session.commit()
        usuario_id = usuario.id
        
        # Eliminar
        db_session.delete(usuario)
        db_session.commit()
        
        # Verificar eliminación
        result = db_session.query(Usuario).filter(Usuario.id == usuario_id).first()
        assert result is None
    
    @pytest.mark.integration
    def test_relacion_usuario_entorno(self, db_session, usuario_normal, entorno_trabajo):
        """Test de relación entre Usuario y EntornoTrabajo"""
        # Refrescar para obtener relaciones
        db_session.refresh(usuario_normal)
        
        assert usuario_normal.entorno_trabajo is not None
        assert usuario_normal.entorno_trabajo.id == entorno_trabajo.id
        assert usuario_normal.entorno_trabajo.nombre == "Test Desguace"


class TestDatabaseIntegrity:
    """Tests de integridad referencial"""
    
    @pytest.mark.integration
    def test_cascade_delete_fichadas(self, db_session, fichada_ejemplo, usuario_normal):
        """Test de eliminación en cascada de fichadas"""
        from app.models.busqueda import FichadaPieza, VerificacionFichada
        
        # Crear verificación
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
        
        verificacion_id = verificacion.id
        fichada_id = fichada_ejemplo.id
        
        # Eliminar fichada
        db_session.delete(fichada_ejemplo)
        db_session.commit()
        
        # Verificar que la verificación también se eliminó (cascade)
        resultado = db_session.query(VerificacionFichada).filter(
            VerificacionFichada.id == verificacion_id
        ).first()
        
        assert resultado is None, "La verificación debería haberse eliminado en cascada"
