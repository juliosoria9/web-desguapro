"""
Configuración de pytest y fixtures compartidos para todos los tests
"""
import pytest
import os
import sys
from typing import Generator
from datetime import datetime

# Añadir el directorio backend al path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.busqueda import (
    Usuario, EntornoTrabajo, Busqueda, 
    FichadaPieza, VerificacionFichada,
    BaseDesguace, PiezaDesguace
)
from utils.security import hash_password, create_access_token


# ============== BASE DE DATOS DE TESTS ==============
# Usar SQLite en memoria para tests
TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    """Override de la dependencia de base de datos para tests"""
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function")
def db_session() -> Generator:
    """
    Fixture para crear una sesión de base de datos limpia para cada test.
    Crea todas las tablas al inicio y las elimina al final.
    """
    # Crear todas las tablas
    Base.metadata.create_all(bind=engine)
    
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        # Limpiar tablas después del test
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session) -> Generator:
    """
    Fixture para crear un cliente de pruebas con la base de datos de tests.
    """
    # Override de la dependencia de BD
    app.dependency_overrides[get_db] = override_get_db
    
    # Crear tablas para este test
    Base.metadata.create_all(bind=engine)
    
    with TestClient(app) as test_client:
        yield test_client
    
    # Limpiar
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


# ============== FIXTURES DE DATOS ==============
@pytest.fixture
def entorno_trabajo(db_session) -> EntornoTrabajo:
    """Fixture para crear un entorno de trabajo de prueba"""
    entorno = EntornoTrabajo(
        nombre="Test Desguace",
        descripcion="Entorno de prueba para tests",
        owner_id=1,  # Se asignará después
        activo=True,
    )
    db_session.add(entorno)
    db_session.commit()
    db_session.refresh(entorno)
    return entorno


@pytest.fixture
def usuario_admin(db_session, entorno_trabajo) -> Usuario:
    """Fixture para crear un usuario admin de prueba"""
    usuario = Usuario(
        email="admin@test.com",
        nombre="Admin Test",
        password_hash=hash_password("test123"),
        rol="admin",
        activo=True,
        entorno_trabajo_id=entorno_trabajo.id,
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    
    # Actualizar owner del entorno
    entorno_trabajo.owner_id = usuario.id
    db_session.commit()
    
    return usuario


@pytest.fixture
def usuario_normal(db_session, entorno_trabajo) -> Usuario:
    """Fixture para crear un usuario normal de prueba"""
    usuario = Usuario(
        email="user@test.com",
        nombre="User Test",
        password_hash=hash_password("test123"),
        rol="user",
        activo=True,
        entorno_trabajo_id=entorno_trabajo.id,
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    return usuario


@pytest.fixture
def token_admin(usuario_admin) -> str:
    """Fixture para obtener un token de admin válido"""
    token_data = {
        "usuario_id": usuario_admin.id,
        "email": usuario_admin.email,
        "rol": usuario_admin.rol,
        "entorno_trabajo_id": usuario_admin.entorno_trabajo_id,
    }
    return create_access_token(token_data)


@pytest.fixture
def token_usuario(usuario_normal) -> str:
    """Fixture para obtener un token de usuario normal válido"""
    token_data = {
        "usuario_id": usuario_normal.id,
        "email": usuario_normal.email,
        "rol": usuario_normal.rol,
        "entorno_trabajo_id": usuario_normal.entorno_trabajo_id,
    }
    return create_access_token(token_data)


@pytest.fixture
def auth_headers_admin(token_admin) -> dict:
    """Headers con autenticación de admin"""
    return {"Authorization": f"Bearer {token_admin}"}


@pytest.fixture
def auth_headers_user(token_usuario) -> dict:
    """Headers con autenticación de usuario normal"""
    return {"Authorization": f"Bearer {token_usuario}"}


@pytest.fixture
def fichada_ejemplo(db_session, usuario_normal, entorno_trabajo) -> FichadaPieza:
    """Fixture para crear una fichada de ejemplo"""
    fichada = FichadaPieza(
        usuario_id=usuario_normal.id,
        entorno_trabajo_id=entorno_trabajo.id,
        id_pieza="REF-001",
        descripcion="Pieza de prueba",
    )
    db_session.add(fichada)
    db_session.commit()
    db_session.refresh(fichada)
    return fichada


@pytest.fixture
def base_desguace_ejemplo(db_session, entorno_trabajo, usuario_admin) -> BaseDesguace:
    """Fixture para crear una base de desguace de ejemplo"""
    base = BaseDesguace(
        entorno_trabajo_id=entorno_trabajo.id,
        nombre_archivo="test_piezas.csv",
        total_piezas=100,
        columnas="refid,oem,precio,articulo",
        mapeo_columnas='{"refid": "refid", "oem": "oem", "precio": "precio", "articulo": "articulo"}',
        subido_por_id=usuario_admin.id,
    )
    db_session.add(base)
    db_session.commit()
    db_session.refresh(base)
    return base


@pytest.fixture
def piezas_desguace(db_session, base_desguace_ejemplo) -> list:
    """Fixture para crear piezas de ejemplo en el desguace"""
    piezas = []
    for i in range(5):
        pieza = PiezaDesguace(
            base_desguace_id=base_desguace_ejemplo.id,
            refid=f"REF-{str(i+1).zfill(3)}",
            oem=f"OEM-{str(i+1).zfill(3)}",
            precio=100.0 + (i * 10),
            articulo=f"Pieza Test {i+1}",
        )
        db_session.add(pieza)
        piezas.append(pieza)
    
    db_session.commit()
    for p in piezas:
        db_session.refresh(p)
    
    return piezas
