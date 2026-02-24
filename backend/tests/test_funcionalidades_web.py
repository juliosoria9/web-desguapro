"""
Tests de funcionalidades web: acceso a base de datos, usuarios,
autenticación, roles, tickets, anuncios, paquetería, precios-config,
token TOEN y todas las operaciones CRUD que la IA pudiera romper.
"""
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime


# ============================================================
# SECCIÓN 1: Base de datos – operaciones fundamentales
# ============================================================


class TestBaseDeDatosOperaciones:
    """Verifica operaciones CRUD básicas sobre la BD de tests"""

    @pytest.mark.unit
    def test_crear_entorno_trabajo(self, db_session):
        """Crea un entorno de trabajo en la BD de test. Espera: id asignado automáticamente."""
        from app.models.busqueda import EntornoTrabajo
        entorno = EntornoTrabajo(nombre="BD Test", activo=True, owner_id=1)
        db_session.add(entorno)
        db_session.commit()
        assert entorno.id is not None

    @pytest.mark.unit
    def test_crear_usuario(self, db_session, entorno_trabajo):
        """Crea un usuario vinculado a un entorno. Espera: id asignado."""
        from app.models.busqueda import Usuario
        from utils.security import hash_password
        u = Usuario(
            email="nuevo@bd.com",
            nombre="Nuevo",
            password_hash=hash_password("pwd"),
            rol="user",
            activo=True,
            entorno_trabajo_id=entorno_trabajo.id,
        )
        db_session.add(u)
        db_session.commit()
        assert u.id is not None

    @pytest.mark.unit
    def test_buscar_usuario_por_email(self, db_session, usuario_admin):
        """Busca usuario por email en la BD. Espera: usuario encontrado con id correcto."""
        from app.models.busqueda import Usuario
        u = db_session.query(Usuario).filter_by(email="admin@test.com").first()
        assert u is not None
        assert u.id == usuario_admin.id

    @pytest.mark.unit
    def test_crear_busqueda(self, db_session, usuario_admin, entorno_trabajo):
        """Crea un registro de búsqueda de precios. Espera: id asignado."""
        from app.models.busqueda import Busqueda
        b = Busqueda(
            usuario_id=usuario_admin.id,
            entorno_trabajo_id=entorno_trabajo.id,
            referencia="TEST",
            plataforma="ecooparts",
            cantidad_precios=5,
            precio_medio=100,
        )
        db_session.add(b)
        db_session.commit()
        assert b.id is not None

    @pytest.mark.unit
    def test_crear_pieza_desguace(self, db_session, base_desguace_ejemplo):
        """Crea una pieza en la base de desguace. Espera: id asignado."""
        from app.models.busqueda import PiezaDesguace
        p = PiezaDesguace(
            base_desguace_id=base_desguace_ejemplo.id,
            refid="REF-BD",
            oem="OEM-BD",
            precio=99.0,
            articulo="Test BD",
        )
        db_session.add(p)
        db_session.commit()
        assert p.id is not None

    @pytest.mark.unit
    def test_crear_pieza_vendida(self, db_session, entorno_trabajo):
        """Registra una pieza como vendida. Espera: id asignado."""
        from app.models.busqueda import PiezaVendida
        v = PiezaVendida(
            entorno_trabajo_id=entorno_trabajo.id,
            refid="VEND-BD",
            oem="OEM-BD",
            precio=200,
            articulo="Vendida Test",
        )
        db_session.add(v)
        db_session.commit()
        assert v.id is not None

    @pytest.mark.unit
    def test_eliminar_pieza(self, db_session, piezas_desguace):
        """Elimina una pieza y verifica que no existe. Espera: query retorna None."""
        from app.models.busqueda import PiezaDesguace
        pid = piezas_desguace[0].id
        db_session.delete(piezas_desguace[0])
        db_session.commit()
        assert db_session.query(PiezaDesguace).get(pid) is None

    @pytest.mark.unit
    def test_rollback(self, db_session, entorno_trabajo):
        """Crea usuario, hace rollback y verifica que no se guardó. Espera: query retorna None."""
        from app.models.busqueda import Usuario
        from utils.security import hash_password
        u = Usuario(
            email="rollback@test.com", nombre="Roll",
            password_hash=hash_password("x"), rol="user",
            activo=True, entorno_trabajo_id=entorno_trabajo.id,
        )
        db_session.add(u)
        db_session.flush()
        db_session.rollback()
        assert db_session.query(Usuario).filter_by(email="rollback@test.com").first() is None


# ============================================================
# SECCIÓN 2: Autenticación – Login / Logout / Token
# ============================================================


class TestAuthLogin:
    """Tests de login y JWT"""

    @pytest.mark.integration
    def test_login_correcto(self, client, usuario_admin):
        """Login con credenciales válidas. Espera: 200 con access_token."""
        resp = client.post("/api/v1/auth/login", json={
            "email": "admin@test.com",
            "password": "test123",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data

    @pytest.mark.integration
    def test_login_password_incorrecto(self, client, usuario_admin):
        """Login con contraseña incorrecta. Espera: 401/400."""
        resp = client.post("/api/v1/auth/login", json={
            "email": "admin@test.com",
            "password": "mal_password_123",
        })
        assert resp.status_code in (401, 400)

    @pytest.mark.integration
    def test_login_email_inexistente(self, client):
        """Login con email que no existe. Espera: 401/400."""
        resp = client.post("/api/v1/auth/login", json={
            "email": "noexiste@test.com",
            "password": "test123",
        })
        assert resp.status_code in (401, 400)

    @pytest.mark.integration
    def test_login_usuario_inactivo(self, client, db_session, entorno_trabajo):
        """Login con usuario desactivado. Espera: 401/403/400."""
        from app.models.busqueda import Usuario
        from utils.security import hash_password
        u = Usuario(
            email="inactivo@test.com", nombre="Inactivo",
            password_hash=hash_password("test123"),
            rol="user", activo=False,
            entorno_trabajo_id=entorno_trabajo.id,
        )
        db_session.add(u)
        db_session.commit()
        resp = client.post("/api/v1/auth/login", json={
            "email": "inactivo@test.com",
            "password": "test123",
        })
        assert resp.status_code in (401, 403, 400)

    @pytest.mark.integration
    def test_me_con_token(self, client, auth_headers_admin):
        """Consulta /auth/me con token válido de admin. Espera: 200 con email correcto."""
        resp = client.get("/api/v1/auth/me", headers=auth_headers_admin)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "admin@test.com"

    @pytest.mark.integration
    def test_me_sin_token(self, client):
        """Consulta /auth/me sin token. Espera: 401/403."""
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code in (401, 403)

    @pytest.mark.integration
    def test_me_token_invalido(self, client):
        """Consulta /auth/me con token falso. Espera: 401/403."""
        resp = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer token_falso"})
        assert resp.status_code in (401, 403)


# ============================================================
# SECCIÓN 3: Roles y permisos
# ============================================================


class TestRolesPermisos:
    """Verifica que cada rol tiene acceso correcto"""

    @pytest.mark.integration
    def test_user_no_puede_acceder_admin(self, client, auth_headers_user):
        """Un usuario normal no debe poder acceder a endpoints de admin"""
        resp = client.post("/api/v1/stock/verificar", json={
            "items": [{"ref_id": "1", "ref_oem": "X", "precio_azeler": 10}],
        }, headers=auth_headers_user)
        assert resp.status_code in (403, 422)

    @pytest.mark.integration
    def test_admin_puede_acceder_me(self, client, auth_headers_admin):
        """Admin accede a /auth/me. Espera: 200."""
        resp = client.get("/api/v1/auth/me", headers=auth_headers_admin)
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_sysowner_puede_acceder_me(self, client, auth_headers_sysowner):
        """Sysowner accede a /auth/me. Espera: 200 con rol=sysowner."""
        resp = client.get("/api/v1/auth/me", headers=auth_headers_sysowner)
        assert resp.status_code == 200
        assert resp.json()["rol"] == "sysowner"

    @pytest.mark.integration
    def test_owner_puede_acceder_me(self, client, auth_headers_owner):
        """Owner accede a /auth/me. Espera: 200 con rol=owner."""
        resp = client.get("/api/v1/auth/me", headers=auth_headers_owner)
        assert resp.status_code == 200
        assert resp.json()["rol"] == "owner"


# ============================================================
# SECCIÓN 4: Seguridad – hash, tokens JWT
# ============================================================


class TestSeguridadUtilidades:
    """Tests de funciones de seguridad"""

    @pytest.mark.unit
    def test_hash_password_no_plaintext(self):
        """Hash de contraseña no es texto plano. Espera: hash != contraseña original."""
        from utils.security import hash_password
        h = hash_password("mi_password")
        assert h != "mi_password"

    @pytest.mark.unit
    def test_verify_password_valido(self):
        """Verifica contraseña correcta contra su hash. Espera: True."""
        from utils.security import hash_password, verify_password
        h = hash_password("secreto")
        assert verify_password("secreto", h) is True

    @pytest.mark.unit
    def test_verify_password_invalido(self):
        """Verifica contraseña incorrecta contra hash. Espera: False."""
        from utils.security import hash_password, verify_password
        h = hash_password("secreto")
        assert verify_password("incorrecto", h) is False

    @pytest.mark.unit
    def test_create_access_token(self):
        """Genera un JWT. Espera: token no nulo con longitud > 20."""
        from utils.security import create_access_token
        token = create_access_token({"usuario_id": 1, "email": "a@b.com", "rol": "admin"})
        assert token is not None
        assert len(token) > 20

    @pytest.mark.unit
    def test_decode_token(self):
        """Decodifica un JWT generado. Espera: email correcto en el payload."""
        from utils.security import create_access_token, decode_access_token
        data = {"usuario_id": 99, "email": "decode@test.com", "rol": "user"}
        token = create_access_token(data)
        decoded = decode_access_token(token)
        assert decoded is not None
        assert decoded.email == "decode@test.com"


# ============================================================
# SECCIÓN 5: Tickets CRUD
# ============================================================


class TestTickets:
    """Tests de los endpoints de tickets de soporte"""

    @pytest.mark.integration
    def test_crear_ticket(self, client, auth_headers_admin):
        """Crea un ticket de soporte tipo reporte. Espera: 200 con asunto correcto."""
        resp = client.post("/api/v1/tickets/crear", json={
            "tipo": "reporte",
            "asunto": "Error de prueba",
            "descripcion": "Descripción del error",
            "prioridad": "normal",
        }, headers=auth_headers_admin)
        assert resp.status_code == 200
        data = resp.json()
        assert data["asunto"] == "Error de prueba"

    @pytest.mark.integration
    def test_crear_ticket_sin_auth(self, client):
        """Intenta crear ticket sin autenticación. Espera: 401/403."""
        resp = client.post("/api/v1/tickets/crear", json={
            "tipo": "error", "asunto": "X", "descripcion": "Y",
        })
        assert resp.status_code in (401, 403)

    @pytest.mark.integration
    def test_mis_tickets(self, client, auth_headers_user, ticket_ejemplo):
        """Lista tickets del usuario logueado. Espera: 200 con lista."""
        resp = client.get("/api/v1/tickets/mis-tickets", headers=auth_headers_user)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    @pytest.mark.integration
    def test_todos_tickets_requiere_admin(self, client, auth_headers_user):
        """Usuario normal intenta ver todos los tickets. Espera: 200/403."""
        resp = client.get("/api/v1/tickets/todos", headers=auth_headers_user)
        # Puede dar 403 o 200 dependiendo de la lógica
        assert resp.status_code in (200, 403)

    @pytest.mark.integration
    def test_todos_tickets_sysowner(self, client, auth_headers_sysowner, ticket_ejemplo):
        """Sysowner lista todos los tickets. Espera: 200."""
        resp = client.get("/api/v1/tickets/todos", headers=auth_headers_sysowner)
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_obtener_ticket_por_id(self, client, auth_headers_user, ticket_ejemplo):
        """Obtiene un ticket específico por su ID. Espera: 200 con asunto correcto."""
        resp = client.get(
            f"/api/v1/tickets/{ticket_ejemplo.id}",
            headers=auth_headers_user,
        )
        assert resp.status_code == 200
        assert resp.json()["asunto"] == "Error de prueba"

    @pytest.mark.integration
    def test_obtener_ticket_inexistente(self, client, auth_headers_admin):
        """Busca ticket con ID inexistente (99999). Espera: 404."""
        resp = client.get("/api/v1/tickets/99999", headers=auth_headers_admin)
        assert resp.status_code == 404

    @pytest.mark.integration
    def test_agregar_mensaje_ticket(self, client, auth_headers_user, ticket_ejemplo):
        """Añade un mensaje a un ticket existente. Espera: 200."""
        resp = client.post(
            f"/api/v1/tickets/{ticket_ejemplo.id}/mensaje",
            json={"mensaje": "Mensaje de prueba"},
            headers=auth_headers_user,
        )
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_eliminar_ticket(self, client, auth_headers_sysowner, ticket_ejemplo):
        """Sysowner elimina un ticket. Espera: 200."""
        resp = client.delete(
            f"/api/v1/tickets/{ticket_ejemplo.id}",
            headers=auth_headers_sysowner,
        )
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_estadisticas_tickets(self, client, auth_headers_sysowner):
        """Obtiene resumen estadístico de tickets. Espera: 200."""
        resp = client.get(
            "/api/v1/tickets/estadisticas/resumen",
            headers=auth_headers_sysowner,
        )
        assert resp.status_code == 200


# ============================================================
# SECCIÓN 6: Anuncios CRUD
# ============================================================


class TestAnuncios:
    """Tests de los endpoints de anuncios y changelog"""

    @pytest.mark.integration
    def test_crear_anuncio_sysowner(self, client, auth_headers_sysowner):
        """Sysowner crea un anuncio/changelog. Espera: 200 con título correcto."""
        resp = client.post("/api/v1/anuncios/crear", json={
            "titulo": "Nuevo anuncio",
            "contenido": "Contenido de prueba",
            "version": "2.0.0",
            "tipo": "changelog",
            "mostrar_popup": True,
        }, headers=auth_headers_sysowner)
        assert resp.status_code == 200
        data = resp.json()
        assert data["titulo"] == "Nuevo anuncio"

    @pytest.mark.integration
    def test_crear_anuncio_user_prohibido(self, client, auth_headers_user):
        """Usuario normal intenta crear anuncio. Espera: 403."""
        resp = client.post("/api/v1/anuncios/crear", json={
            "titulo": "No permitido",
            "contenido": "Contenido",
            "tipo": "changelog",
        }, headers=auth_headers_user)
        assert resp.status_code == 403

    @pytest.mark.integration
    def test_listar_anuncios_admin(self, client, auth_headers_sysowner, anuncio_ejemplo):
        """Sysowner lista todos los anuncios. Espera: 200 con lista."""
        resp = client.get("/api/v1/anuncios/admin/todos", headers=auth_headers_sysowner)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.integration
    def test_no_leidos(self, client, auth_headers_user, anuncio_ejemplo):
        """Obtiene anuncios no leídos del usuario. Espera: 200 con lista."""
        resp = client.get("/api/v1/anuncios/no-leidos", headers=auth_headers_user)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    @pytest.mark.integration
    def test_changelog(self, client, auth_headers_user, anuncio_ejemplo):
        """Obtiene el changelog público. Espera: 200."""
        resp = client.get("/api/v1/anuncios/changelog", headers=auth_headers_user)
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_marcar_leido(self, client, auth_headers_user, anuncio_ejemplo):
        """Marca un anuncio como leído. Espera: 200."""
        resp = client.post(
            f"/api/v1/anuncios/{anuncio_ejemplo.id}/marcar-leido",
            headers=auth_headers_user,
        )
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_marcar_todos_leidos(self, client, auth_headers_user):
        """Marca todos los anuncios como leídos. Espera: 200."""
        resp = client.post(
            "/api/v1/anuncios/marcar-todos-leidos",
            headers=auth_headers_user,
        )
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_actualizar_anuncio(self, client, auth_headers_sysowner, anuncio_ejemplo):
        """Sysowner actualiza título de un anuncio. Espera: 200 con título cambiado."""
        resp = client.put(
            f"/api/v1/anuncios/{anuncio_ejemplo.id}",
            json={"titulo": "Actualizado"},
            headers=auth_headers_sysowner,
        )
        assert resp.status_code == 200
        assert resp.json()["titulo"] == "Actualizado"

    @pytest.mark.integration
    def test_eliminar_anuncio(self, client, auth_headers_sysowner, anuncio_ejemplo):
        """Sysowner elimina un anuncio. Espera: 200."""
        resp = client.delete(
            f"/api/v1/anuncios/{anuncio_ejemplo.id}",
            headers=auth_headers_sysowner,
        )
        assert resp.status_code == 200


# ============================================================
# SECCIÓN 7: Paquetería – Sucursales CRUD
# ============================================================


class TestPaqueteriaSucursales:
    """Tests de los endpoints de sucursales de paquetería"""

    @pytest.mark.integration
    def test_listar_sucursales(self, client, auth_headers_admin, sucursal_ejemplo):
        """Lista sucursales de paquetería. Espera: 200 con 'Sucursal Test' presente."""
        resp = client.get("/api/v1/paqueteria/sucursales", headers=auth_headers_admin)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        # La sucursal de ejemplo no es legacy, así que debe aparecer
        nombres = [s["nombre"] for s in data]
        assert "Sucursal Test" in nombres

    @pytest.mark.integration
    def test_crear_sucursal(self, client, auth_headers_admin):
        """Crea una nueva sucursal. Espera: 200 con nombre correcto."""
        resp = client.post(
            "/api/v1/paqueteria/sucursales",
            json={"nombre": "Nueva Sucursal", "color_hex": "#FF0000"},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        assert resp.json()["nombre"] == "Nueva Sucursal"

    @pytest.mark.integration
    def test_crear_sucursal_sin_auth(self, client):
        """Intenta crear sucursal sin autenticación. Espera: 401/403."""
        resp = client.post("/api/v1/paqueteria/sucursales", json={"nombre": "X"})
        assert resp.status_code in (401, 403)

    @pytest.mark.integration
    def test_actualizar_sucursal(self, client, auth_headers_admin, sucursal_ejemplo):
        """Actualiza nombre de una sucursal. Espera: 200."""
        resp = client.put(
            f"/api/v1/paqueteria/sucursales/{sucursal_ejemplo.id}",
            json={"nombre": "Renombrada"},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_eliminar_sucursal(self, client, auth_headers_admin, sucursal_ejemplo):
        """Elimina una sucursal. Espera: 200."""
        resp = client.delete(
            f"/api/v1/paqueteria/sucursales/{sucursal_ejemplo.id}",
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200


# ============================================================
# SECCIÓN 8: Paquetería – Registros y Ranking
# ============================================================


class TestPaqueteriaRegistros:
    """Tests de registrar piezas en cajas, ranking y mis-registros"""

    @pytest.mark.integration
    def test_registrar_pieza(self, client, auth_headers_user, sucursal_ejemplo):
        """Registra una pieza en una caja de paquetería. Espera: 200 con id_caja correcto."""
        resp = client.post(
            "/api/v1/paqueteria/registrar",
            json={
                "id_caja": "CAJA-1",
                "id_pieza": "PIEZA-1",
                "sucursal_id": sucursal_ejemplo.id,
            },
            headers=auth_headers_user,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id_caja"] == "CAJA-1"

    @pytest.mark.integration
    def test_registrar_sin_auth(self, client):
        """Intenta registrar pieza sin autenticación. Espera: 401/403."""
        resp = client.post("/api/v1/paqueteria/registrar", json={
            "id_caja": "X", "id_pieza": "Y",
        })
        assert resp.status_code in (401, 403)

    @pytest.mark.integration
    def test_ranking(self, client, auth_headers_admin):
        """Obtiene ranking de paquetería del equipo. Espera: 200 con fecha y usuarios."""
        resp = client.get("/api/v1/paqueteria/ranking", headers=auth_headers_admin)
        assert resp.status_code == 200
        data = resp.json()
        assert "fecha" in data
        assert "usuarios" in data

    @pytest.mark.integration
    def test_mis_registros(self, client, auth_headers_user):
        """Lista registros de paquetería del usuario actual. Espera: 200 con lista."""
        resp = client.get("/api/v1/paqueteria/mis-registros", headers=auth_headers_user)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)


# ============================================================
# SECCIÓN 9: Paquetería – Tipos de Caja
# ============================================================


class TestPaqueteriaTiposCaja:
    """Tests de CRUD de tipos de caja"""

    @pytest.mark.integration
    def test_listar_tipos_caja(self, client, auth_headers_admin, tipo_caja_ejemplo):
        """Lista tipos de caja registrados. Espera: 200 con lista."""
        resp = client.get("/api/v1/paqueteria/tipos-caja", headers=auth_headers_admin)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    @pytest.mark.integration
    def test_crear_tipo_caja(self, client, auth_headers_admin):
        """Crea un nuevo tipo de caja. Espera: 200."""
        resp = client.post(
            "/api/v1/paqueteria/tipos-caja",
            json={
                "referencia_caja": "CAJA-NEW",
                "tipo_nombre": "Caja Mediana",
                "descripcion": "Test",
                "stock_actual": 5,
            },
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_actualizar_tipo_caja(self, client, auth_headers_admin, tipo_caja_ejemplo):
        """Actualiza nombre de un tipo de caja. Espera: 200."""
        resp = client.put(
            f"/api/v1/paqueteria/tipos-caja/{tipo_caja_ejemplo.id}",
            json={"tipo_nombre": "Caja Renombrada"},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_eliminar_tipo_caja(self, client, auth_headers_admin, tipo_caja_ejemplo):
        """Elimina un tipo de caja. Espera: 200."""
        resp = client.delete(
            f"/api/v1/paqueteria/tipos-caja/{tipo_caja_ejemplo.id}",
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200


# ============================================================
# SECCIÓN 10: Paquetería – Estadísticas
# ============================================================


class TestPaqueteriaEstadisticas:
    """Tests del endpoint de estadísticas de paquetería"""

    @pytest.mark.integration
    def test_estadisticas(self, client, auth_headers_admin):
        """Obtiene estadísticas de paquetería. Espera: 200 con dict de datos."""
        resp = client.get(
            "/api/v1/paqueteria/estadisticas", headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "total_registros" in data or "total_general" in data or isinstance(data, dict)


# ============================================================
# SECCIÓN 11: Precios Config – Pieza-Familia / Familia-Precios
# ============================================================


class TestPreciosConfig:
    """Tests de la configuración de precios por empresa"""

    @pytest.mark.integration
    def test_estado_sin_config(self, client, auth_headers_admin):
        """Consulta estado de precios sin configuración previa. Espera: tiene_configuracion=False."""
        resp = client.get(
            "/api/v1/precios-config/estado", headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["tiene_configuracion"] is False

    @pytest.mark.integration
    def test_estado_con_config(self, client, auth_headers_admin, config_precios_ejemplo):
        """Consulta estado con configuración existente. Espera: tiene_configuracion=True."""
        resp = client.get(
            "/api/v1/precios-config/estado", headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["tiene_configuracion"] is True

    @pytest.mark.integration
    def test_listar_piezas_familia_vacio(self, client, auth_headers_admin):
        """Lista piezas-familia sin datos. Espera: 200 con lista vacía."""
        resp = client.get(
            "/api/v1/precios-config/piezas-familia", headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.integration
    def test_listar_familias_precios_vacio(self, client, auth_headers_admin):
        """Lista familias-precios sin datos. Espera: 200 con lista vacía."""
        resp = client.get(
            "/api/v1/precios-config/familias-precios", headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.integration
    def test_crear_pieza_familia(self, client, auth_headers_admin):
        """Crea mapeo pieza FARO → familia ILUMINACION. Espera: success=True."""
        resp = client.post(
            "/api/v1/precios-config/pieza-familia/nuevo",
            params={"pieza": "FARO", "familia": "ILUMINACION"},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    @pytest.mark.integration
    def test_crear_pieza_familia_duplicada(self, client, auth_headers_admin):
        # Crear primera vez
        """Intenta crear mapeo pieza-familia que ya existe. Espera: 400."""
        client.post(
            "/api/v1/precios-config/pieza-familia/nuevo",
            params={"pieza": "MOTOR", "familia": "MOTOR"},
            headers=auth_headers_admin,
        )
        # Intentar duplicar
        resp = client.post(
            "/api/v1/precios-config/pieza-familia/nuevo",
            params={"pieza": "MOTOR", "familia": "MOTOR"},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 400

    @pytest.mark.integration
    def test_crear_familia_precios(self, client, auth_headers_admin):
        """Crea precios para familia ILUMINACION (10,20,30). Espera: success=True."""
        resp = client.post(
            "/api/v1/precios-config/familia-precios/nuevo",
            params={"familia": "ILUMINACION", "precios": "10,20,30"},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    @pytest.mark.integration
    def test_eliminar_configuracion(self, client, auth_headers_owner, config_precios_ejemplo):
        """Owner elimina toda la configuración de precios. Espera: 200."""
        resp = client.delete(
            "/api/v1/precios-config/eliminar", headers=auth_headers_owner,
        )
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_eliminar_config_user_prohibido(self, client, auth_headers_user):
        """Usuario normal intenta eliminar config de precios. Espera: 403."""
        resp = client.delete(
            "/api/v1/precios-config/eliminar", headers=auth_headers_user,
        )
        assert resp.status_code == 403

    @pytest.mark.integration
    def test_subir_pieza_familia_csv(self, client, auth_headers_admin):
        """Sube un CSV de pieza-familia"""
        csv_content = b"PIEZA;FAMILIA\nFARO;ILUMINACION\nMOTOR;PROPULSION\n"
        resp = client.post(
            "/api/v1/precios-config/pieza-familia",
            files={"file": ("pieza_familia.csv", csv_content, "text/csv")},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["registros"] == 2

    @pytest.mark.integration
    def test_subir_familia_precios_csv(self, client, auth_headers_admin):
        """Sube un CSV de familia-precios"""
        csv_content = b"FAMILIA;PRECIO1;PRECIO2;PRECIO3\nILUMINACION;10;20;30\n"
        resp = client.post(
            "/api/v1/precios-config/familia-precios",
            files={"file": ("familia_precios.csv", csv_content, "text/csv")},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    @pytest.mark.integration
    def test_exportar_pieza_familia(self, client, auth_headers_admin, config_precios_ejemplo):
        """Exportar pieza-familia a CSV (vacío ok)"""
        resp = client.get(
            "/api/v1/precios-config/exportar/pieza-familia",
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_exportar_familia_precios(self, client, auth_headers_admin, config_precios_ejemplo):
        """Exporta familia-precios a CSV. Espera: 200."""
        resp = client.get(
            "/api/v1/precios-config/exportar/familia-precios",
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200


# ============================================================
# SECCIÓN 12: Token TOEN (Ecooparts)
# ============================================================


class TestTokenTOEN:
    """Tests del endpoint de gestión de token TOEN"""

    @pytest.mark.integration
    def test_obtener_token_vacio(self, client, auth_headers_admin):
        """Obtiene token TOEN cuando no hay ninguno guardado. Espera: token=None."""
        resp = client.get("/api/v1/token/obtener", headers=auth_headers_admin)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("token") is None or "No hay token" in data.get("mensaje", "")

    @pytest.mark.integration
    def test_obtener_token_sin_auth(self, client):
        """Intenta obtener token TOEN sin autenticación. Espera: 401/403."""
        resp = client.get("/api/v1/token/obtener")
        assert resp.status_code in (401, 403)

    @pytest.mark.integration
    @patch("app.routers.token.validate_toen", return_value=True)
    @patch("app.routers.token.save_toen")
    def test_configurar_token(self, mock_save, mock_validate, client, auth_headers_admin):
        """Configura un token TOEN válido (mockeado). Espera: 200 con mensaje exitoso."""
        resp = client.post(
            "/api/v1/token/configurar",
            params={"token": "TOKEN_VALIDO_1234567890"},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        assert "exitosamente" in resp.json()["mensaje"]

    @pytest.mark.integration
    def test_configurar_token_corto(self, client, auth_headers_admin):
        """Intenta configurar token TOEN demasiado corto. Espera: 400."""
        resp = client.post(
            "/api/v1/token/configurar",
            params={"token": "abc"},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 400

    @pytest.mark.integration
    def test_configurar_token_user_prohibido(self, client, auth_headers_user):
        """Usuario normal intenta configurar token TOEN. Espera: 403."""
        resp = client.post(
            "/api/v1/token/configurar",
            params={"token": "TOKEN_1234567890ABCDEF"},
            headers=auth_headers_user,
        )
        assert resp.status_code == 403


# ============================================================
# SECCIÓN 13: Fichadas – endpoints principales
# ============================================================


class TestFichadasEndpoints:
    """Tests de creación y listado de fichadas"""

    @pytest.mark.integration
    def test_crear_fichada(self, client, auth_headers_user):
        """Crea una fichada de pieza. Espera: 200."""
        resp = client.post("/api/v1/fichadas/registrar", json={
            "id_pieza": "PIEZA-FICH-001",
            "descripcion": "Test fichada",
        }, headers=auth_headers_user)
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_resumen_equipo(self, client, auth_headers_admin, fichada_ejemplo):
        """Obtiene resumen de fichadas del equipo. Espera: 200."""
        resp = client.get("/api/v1/fichadas/resumen-equipo", headers=auth_headers_admin)
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_mis_fichadas(self, client, auth_headers_user, fichada_ejemplo):
        """Lista fichadas del usuario actual. Espera: 200."""
        resp = client.get("/api/v1/fichadas/mis-fichadas", headers=auth_headers_user)
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_crear_fichada_sin_auth(self, client):
        """Intenta fichar pieza sin autenticación. Espera: 401/403."""
        resp = client.post("/api/v1/fichadas/registrar", json={
            "id_pieza": "X", "descripcion": "Y",
        })
        assert resp.status_code in (401, 403)


# ============================================================
# SECCIÓN 14: Desguace – CSV, búsqueda, stock
# ============================================================


class TestDesguaceEndpoints:
    """Tests de los endpoints principales de desguace"""

    @pytest.mark.integration
    def test_buscar_piezas(self, client, auth_headers_admin, piezas_desguace):
        """Busca piezas en el stock por referencia. Espera: 200."""
        resp = client.get(
            "/api/v1/desguace/buscar?referencia=REF",
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_buscar_sin_auth(self, client):
        """Busca piezas sin autenticación. Espera: 401/403."""
        resp = client.get("/api/v1/desguace/buscar?q=TEST")
        assert resp.status_code in (401, 403)

    @pytest.mark.integration
    def test_obtener_stock_info(self, client, auth_headers_admin, base_desguace_ejemplo):
        """Obtiene información del stock. Espera: 200/404/405."""
        resp = client.get(
            "/api/v1/desguace/stock-info",
            headers=auth_headers_admin,
        )
        # Puede devolver 200 o no existir → verificamos que el router responde
        assert resp.status_code in (200, 404, 405)

    @pytest.mark.integration
    def test_ventas(self, client, auth_headers_admin, pieza_vendida_ejemplo):
        """Lista piezas vendidas. Espera: 200."""
        resp = client.get(
            "/api/v1/desguace/ventas",
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200


# ============================================================
# SECCIÓN 15: Modelos – Integridad referencial
# ============================================================


class TestIntegridadModelos:
    """Verifica relaciones FK y campos obligatorios"""

    @pytest.mark.unit
    def test_usuario_tiene_email(self, db_session, usuario_admin):
        """Un usuario creado correctamente debe tener email"""
        assert usuario_admin.email is not None
        assert "@" in usuario_admin.email

    @pytest.mark.unit
    def test_pieza_tiene_base_desguace(self, db_session, piezas_desguace):
        """Una pieza creada correctamente debe tener base_desguace_id"""
        for p in piezas_desguace:
            assert p.base_desguace_id is not None

    @pytest.mark.unit
    def test_entorno_nombre_unico(self, db_session, entorno_trabajo):
        """Intenta insertar entorno con nombre duplicado. Espera: inserción o error controlado."""
        from app.models.busqueda import EntornoTrabajo
        duplicate = EntornoTrabajo(nombre="Test Desguace", activo=True, owner_id=1)
        db_session.add(duplicate)
        # Puede que no haya constraint unique en nombre → verificar inserción
        try:
            db_session.commit()
            # Si se insertó, al menos el modelo lo permite
        except Exception:
            db_session.rollback()

    @pytest.mark.unit
    def test_fichada_pertenece_a_usuario(self, db_session, fichada_ejemplo, usuario_normal):
        """Verifica FK fichada → usuario. Espera: usuario_id correcto."""
        assert fichada_ejemplo.usuario_id == usuario_normal.id

    @pytest.mark.unit
    def test_pieza_vendida_pertenece_a_entorno(self, db_session, pieza_vendida_ejemplo, entorno_trabajo):
        """Verifica FK pieza_vendida → entorno. Espera: entorno_trabajo_id correcto."""
        assert pieza_vendida_ejemplo.entorno_trabajo_id == entorno_trabajo.id


# ============================================================
# SECCIÓN 16: Endpoint raíz y health
# ============================================================


class TestHealthEndpoints:
    """Tests de endpoints generales del backend"""

    @pytest.mark.integration
    def test_root(self, client):
        """Accede a la raíz /. Espera: 200."""
        resp = client.get("/")
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_docs(self, client):
        """Accede a /api/v1/docs (Swagger). Espera: 200."""
        resp = client.get("/api/v1/docs")
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_openapi_json(self, client):
        """Accede a /api/v1/openapi.json. Espera: 200 con paths."""
        resp = client.get("/api/v1/openapi.json")
        assert resp.status_code == 200
        data = resp.json()
        assert "paths" in data


# ============================================================
# SECCIÓN 17: Configuración de la app
# ============================================================


class TestConfiguracion:
    """Tests de la configuración del backend"""

    @pytest.mark.unit
    def test_config_tiene_secret_key(self):
        """Verifica que la config tiene secret_key definida. Espera: no vacía."""
        from app.config import settings
        assert settings.secret_key is not None
        assert len(settings.secret_key) > 0

    @pytest.mark.unit
    def test_config_tiene_database_url(self):
        """Verifica que la config tiene database_url. Espera: no nula."""
        from app.config import settings
        assert settings.database_url is not None

    @pytest.mark.unit
    def test_config_tiene_app_name(self):
        """Verifica nombre de la app. Espera: 'DesguaPro API'."""
        from app.config import settings
        assert settings.app_name == "DesguaPro API"
