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
    BaseDesguace, PiezaDesguace, PiezaVendida,
    Ticket, TicketMensaje,
    Anuncio, AnuncioLeido,
    SucursalPaqueteria, RegistroPaquete, TipoCaja, MovimientoCaja,
    ConfiguracionPrecios, PiezaFamiliaDesguace, FamiliaPreciosDesguace,
    ConfiguracionStockeo, CSVGuardado, PiezaPedida,
    AuditLog, BackupRecord, APIRequestLog,
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


# ============== FIXTURES SYSOWNER / OWNER ==============
@pytest.fixture
def usuario_sysowner(db_session, entorno_trabajo) -> Usuario:
    """Fixture para crear un usuario sysowner de prueba"""
    usuario = Usuario(
        email="sysowner@test.com",
        nombre="SysOwner Test",
        password_hash=hash_password("test123"),
        rol="sysowner",
        activo=True,
        entorno_trabajo_id=entorno_trabajo.id,
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    return usuario


@pytest.fixture
def usuario_owner(db_session, entorno_trabajo) -> Usuario:
    """Fixture para crear un usuario owner de prueba"""
    usuario = Usuario(
        email="owner@test.com",
        nombre="Owner Test",
        password_hash=hash_password("test123"),
        rol="owner",
        activo=True,
        entorno_trabajo_id=entorno_trabajo.id,
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    return usuario


@pytest.fixture
def token_sysowner(usuario_sysowner) -> str:
    """Token de sysowner válido"""
    return create_access_token({
        "usuario_id": usuario_sysowner.id,
        "email": usuario_sysowner.email,
        "rol": usuario_sysowner.rol,
        "entorno_trabajo_id": usuario_sysowner.entorno_trabajo_id,
    })


@pytest.fixture
def token_owner(usuario_owner) -> str:
    """Token de owner válido"""
    return create_access_token({
        "usuario_id": usuario_owner.id,
        "email": usuario_owner.email,
        "rol": usuario_owner.rol,
        "entorno_trabajo_id": usuario_owner.entorno_trabajo_id,
    })


@pytest.fixture
def auth_headers_sysowner(token_sysowner) -> dict:
    """Headers de sysowner"""
    return {"Authorization": f"Bearer {token_sysowner}"}


@pytest.fixture
def auth_headers_owner(token_owner) -> dict:
    """Headers de owner"""
    return {"Authorization": f"Bearer {token_owner}"}


# ============== FIXTURES DE TICKETS ==============
@pytest.fixture
def ticket_ejemplo(db_session, usuario_normal, entorno_trabajo) -> Ticket:
    """Fixture para crear un ticket de ejemplo"""
    ticket = Ticket(
        usuario_id=usuario_normal.id,
        entorno_trabajo_id=entorno_trabajo.id,
        tipo="error",
        asunto="Error de prueba",
        descripcion="Descripción del error de prueba",
        estado="abierto",
        prioridad="normal",
    )
    db_session.add(ticket)
    db_session.commit()
    db_session.refresh(ticket)
    return ticket


# ============== FIXTURES DE ANUNCIOS ==============
@pytest.fixture
def anuncio_ejemplo(db_session, usuario_sysowner) -> Anuncio:
    """Fixture para crear un anuncio de ejemplo"""
    anuncio = Anuncio(
        titulo="Anuncio de prueba",
        contenido="Contenido del anuncio de prueba",
        version="1.0.0",
        tipo="changelog",
        activo=True,
        mostrar_popup=True,
        creado_por_id=usuario_sysowner.id,
    )
    db_session.add(anuncio)
    db_session.commit()
    db_session.refresh(anuncio)
    return anuncio


# ============== FIXTURES DE PAQUETERÍA ==============
@pytest.fixture
def sucursal_ejemplo(db_session, entorno_trabajo) -> SucursalPaqueteria:
    """Fixture para crear una sucursal de paquetería"""
    sucursal = SucursalPaqueteria(
        entorno_trabajo_id=entorno_trabajo.id,
        nombre="Sucursal Test",
        color_hex="#3B82F6",
        activa=True,
    )
    db_session.add(sucursal)
    db_session.commit()
    db_session.refresh(sucursal)
    return sucursal


@pytest.fixture
def tipo_caja_ejemplo(db_session, entorno_trabajo) -> TipoCaja:
    """Fixture para crear un tipo de caja"""
    tipo = TipoCaja(
        entorno_trabajo_id=entorno_trabajo.id,
        referencia_caja="CAJA-001",
        tipo_nombre="Caja Grande",
        descripcion="Caja grande para piezas",
        stock_actual=10,
    )
    db_session.add(tipo)
    db_session.commit()
    db_session.refresh(tipo)
    return tipo


# ============== FIXTURES DE PRECIOS CONFIG ==============
@pytest.fixture
def config_precios_ejemplo(db_session, entorno_trabajo, usuario_admin) -> ConfiguracionPrecios:
    """Fixture para crear configuración de precios"""
    config = ConfiguracionPrecios(
        entorno_trabajo_id=entorno_trabajo.id,
        subido_por_id=usuario_admin.id,
    )
    db_session.add(config)
    db_session.commit()
    db_session.refresh(config)
    return config


# ============== FIXTURES DE VENTAS ==============
@pytest.fixture
def pieza_vendida_ejemplo(db_session, entorno_trabajo) -> PiezaVendida:
    """Fixture para crear una pieza vendida de ejemplo"""
    vendida = PiezaVendida(
        entorno_trabajo_id=entorno_trabajo.id,
        refid="VEND-001",
        oem="OEM-VEND-001",
        precio=250.0,
        articulo="Motor de arranque",
        archivo_origen="test.csv",
    )
    db_session.add(vendida)
    db_session.commit()
    db_session.refresh(vendida)
    return vendida
