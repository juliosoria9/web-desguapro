"""
Tests para el router de clientes interesados
"""
import pytest
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestClientesModel:
    """Tests para modelo ClienteInteresado"""

    @pytest.mark.unit
    def test_model_exists(self):
        from app.models.busqueda import ClienteInteresado
        assert ClienteInteresado.__tablename__ == "clientes_interesados"

    @pytest.mark.unit
    def test_model_fields(self):
        from app.models.busqueda import ClienteInteresado
        campos = [
            "id", "entorno_trabajo_id", "usuario_id", "nombre", "email",
            "telefono", "pieza_buscada", "marca_coche", "modelo_coche",
            "anio_coche", "version_coche", "observaciones", "estado",
        ]
        for f in campos:
            assert hasattr(ClienteInteresado, f), f"Campo faltante: {f}"

    @pytest.mark.integration
    def test_crear_cliente_db(self, db_session, entorno_trabajo, usuario_normal):
        from app.models.busqueda import ClienteInteresado
        cliente = ClienteInteresado(
            entorno_trabajo_id=entorno_trabajo.id,
            usuario_id=usuario_normal.id,
            nombre="Test DB",
            telefono="111222333",
            marca_coche="Audi",
            modelo_coche="A3",
            anio_coche="2020",
        )
        db_session.add(cliente)
        db_session.commit()
        assert cliente.id is not None
        assert cliente.estado == "pendiente"

    @pytest.mark.integration
    def test_cliente_estado_default(self, db_session, cliente_ejemplo):
        assert cliente_ejemplo.estado == "pendiente"


class TestListarClientes:
    """Tests para GET /api/v1/clientes"""

    @pytest.mark.api
    def test_listar_vacio(self, client, auth_headers_user, usuario_normal):
        response = client.get("/api/v1/clientes", headers=auth_headers_user)
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    @pytest.mark.api
    def test_listar_con_datos(self, client, auth_headers_user, usuario_normal, cliente_ejemplo):
        response = client.get("/api/v1/clientes", headers=auth_headers_user)
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert data[0]["nombre"] == "Juan Pérez"

    @pytest.mark.api
    def test_listar_filtro_estado(self, client, auth_headers_user, usuario_normal, cliente_ejemplo):
        response = client.get(
            "/api/v1/clientes?estado=pendiente",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        data = response.json()
        assert all(c["estado"] == "pendiente" for c in data)

    @pytest.mark.api
    def test_listar_filtro_estado_sin_resultados(self, client, auth_headers_user, usuario_normal, cliente_ejemplo):
        response = client.get(
            "/api/v1/clientes?estado=completado",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        assert len(response.json()) == 0

    @pytest.mark.api
    def test_listar_buscar_nombre(self, client, auth_headers_user, usuario_normal, cliente_ejemplo):
        response = client.get(
            "/api/v1/clientes?buscar=Juan",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1

    @pytest.mark.api
    def test_listar_buscar_telefono(self, client, auth_headers_user, usuario_normal, cliente_ejemplo):
        response = client.get(
            "/api/v1/clientes?buscar=600111",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1

    @pytest.mark.api
    def test_listar_buscar_sin_resultados(self, client, auth_headers_user, usuario_normal, cliente_ejemplo):
        response = client.get(
            "/api/v1/clientes?buscar=NoExiste999",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        assert len(response.json()) == 0

    @pytest.mark.api
    def test_listar_sin_auth(self, client):
        response = client.get("/api/v1/clientes")
        assert response.status_code in [401, 403]

    @pytest.mark.api
    def test_listar_con_limite(self, client, auth_headers_user, usuario_normal, cliente_ejemplo):
        response = client.get(
            "/api/v1/clientes?limite=1",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) <= 1


class TestVerificarDuplicados:
    """Tests para GET /api/v1/clientes/verificar-duplicados"""

    @pytest.mark.api
    def test_verificar_sin_params(self, client, auth_headers_user, usuario_normal):
        response = client.get(
            "/api/v1/clientes/verificar-duplicados",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.api
    def test_verificar_nombre_existente(self, client, auth_headers_user, usuario_normal, cliente_ejemplo):
        response = client.get(
            "/api/v1/clientes/verificar-duplicados?nombre=Juan Pérez",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert "nombre" in data[0]["coincide_por"]

    @pytest.mark.api
    def test_verificar_telefono_existente(self, client, auth_headers_user, usuario_normal, cliente_ejemplo):
        response = client.get(
            "/api/v1/clientes/verificar-duplicados?telefono=600111222",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert "teléfono" in data[0]["coincide_por"]

    @pytest.mark.api
    def test_verificar_email_existente(self, client, auth_headers_user, usuario_normal, cliente_ejemplo):
        response = client.get(
            "/api/v1/clientes/verificar-duplicados?email=juan@example.com",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert "email" in data[0]["coincide_por"]

    @pytest.mark.api
    def test_verificar_con_excluir_id(self, client, auth_headers_user, usuario_normal, cliente_ejemplo):
        response = client.get(
            f"/api/v1/clientes/verificar-duplicados?nombre=Juan Pérez&excluir_id={cliente_ejemplo.id}",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        assert len(response.json()) == 0

    @pytest.mark.api
    def test_verificar_no_coincide(self, client, auth_headers_user, usuario_normal, cliente_ejemplo):
        response = client.get(
            "/api/v1/clientes/verificar-duplicados?nombre=NoExiste",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        assert len(response.json()) == 0


class TestCrearCliente:
    """Tests para POST /api/v1/clientes"""

    @pytest.mark.api
    def test_crear_cliente_exitoso(self, client, auth_headers_user, usuario_normal):
        response = client.post(
            "/api/v1/clientes",
            headers=auth_headers_user,
            json={
                "nombre": "Pedro López",
                "telefono": "699888777",
                "marca_coche": "Audi",
                "modelo_coche": "A4",
                "anio_coche": "2019",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["nombre"] == "Pedro López"
        assert data["telefono"] == "699888777"
        assert data["estado"] == "pendiente"

    @pytest.mark.api
    def test_crear_cliente_campos_completos(self, client, auth_headers_user, usuario_normal):
        response = client.post(
            "/api/v1/clientes",
            headers=auth_headers_user,
            json={
                "nombre": "María García",
                "telefono": "611222333",
                "email": "maria@test.com",
                "pieza_buscada": "Alternador",
                "marca_coche": "Mercedes",
                "modelo_coche": "Clase C",
                "anio_coche": "2017",
                "version_coche": "220d",
                "observaciones": "Urgente",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "maria@test.com"
        assert data["pieza_buscada"] == "Alternador"

    @pytest.mark.api
    def test_crear_cliente_sin_nombre(self, client, auth_headers_user, usuario_normal):
        response = client.post(
            "/api/v1/clientes",
            headers=auth_headers_user,
            json={
                "telefono": "600000000",
                "marca_coche": "BMW",
                "modelo_coche": "X5",
                "anio_coche": "2020",
            },
        )
        assert response.status_code == 422

    @pytest.mark.api
    def test_crear_cliente_sin_auth(self, client):
        response = client.post(
            "/api/v1/clientes",
            json={"nombre": "Test", "telefono": "111", "marca_coche": "A", "modelo_coche": "B", "anio_coche": "2020"},
        )
        assert response.status_code in [401, 403]


class TestEditarCliente:
    """Tests para PUT /api/v1/clientes/{id}"""

    @pytest.mark.api
    def test_editar_cliente_exitoso(self, client, auth_headers_user, usuario_normal, cliente_ejemplo):
        response = client.put(
            f"/api/v1/clientes/{cliente_ejemplo.id}",
            headers=auth_headers_user,
            json={"nombre": "Juan Modificado", "estado": "contactado"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["nombre"] == "Juan Modificado"
        assert data["estado"] == "contactado"

    @pytest.mark.api
    def test_editar_cliente_parcial(self, client, auth_headers_user, usuario_normal, cliente_ejemplo):
        response = client.put(
            f"/api/v1/clientes/{cliente_ejemplo.id}",
            headers=auth_headers_user,
            json={"observaciones": "Llamar mañana"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["observaciones"] == "Llamar mañana"
        assert data["nombre"] == "Juan Pérez"  # no cambió

    @pytest.mark.api
    def test_editar_cliente_no_existe(self, client, auth_headers_user, usuario_normal):
        response = client.put(
            "/api/v1/clientes/99999",
            headers=auth_headers_user,
            json={"nombre": "X"},
        )
        assert response.status_code == 404

    @pytest.mark.api
    def test_editar_cliente_otro_entorno(self, client, db_session, auth_headers_user, usuario_normal):
        """Un usuario no puede editar un cliente de otro entorno"""
        from app.models.busqueda import ClienteInteresado, EntornoTrabajo
        otro_entorno = EntornoTrabajo(nombre="Otro Entorno", activo=True)
        db_session.add(otro_entorno)
        db_session.commit()
        db_session.refresh(otro_entorno)

        cliente_otro = ClienteInteresado(
            entorno_trabajo_id=otro_entorno.id,
            nombre="Otro Cliente",
            telefono="000",
            marca_coche="X",
            modelo_coche="Y",
            anio_coche="2020",
        )
        db_session.add(cliente_otro)
        db_session.commit()
        db_session.refresh(cliente_otro)

        response = client.put(
            f"/api/v1/clientes/{cliente_otro.id}",
            headers=auth_headers_user,
            json={"nombre": "Hacked"},
        )
        assert response.status_code == 403


class TestBorrarCliente:
    """Tests para DELETE /api/v1/clientes/{id}"""

    @pytest.mark.api
    def test_borrar_cliente_admin(self, client, auth_headers_admin, usuario_admin, cliente_ejemplo):
        response = client.delete(
            f"/api/v1/clientes/{cliente_ejemplo.id}",
            headers=auth_headers_admin,
        )
        assert response.status_code == 200
        assert "eliminado" in response.json()["message"].lower()

    @pytest.mark.api
    def test_borrar_cliente_user_forbidden(self, client, auth_headers_user, usuario_normal, cliente_ejemplo):
        response = client.delete(
            f"/api/v1/clientes/{cliente_ejemplo.id}",
            headers=auth_headers_user,
        )
        assert response.status_code == 403

    @pytest.mark.api
    def test_borrar_cliente_no_existe(self, client, auth_headers_admin, usuario_admin):
        response = client.delete(
            "/api/v1/clientes/99999",
            headers=auth_headers_admin,
        )
        assert response.status_code == 404

    @pytest.mark.api
    def test_borrar_cliente_otro_entorno(self, client, db_session, auth_headers_admin, usuario_admin):
        from app.models.busqueda import ClienteInteresado, EntornoTrabajo
        otro_entorno = EntornoTrabajo(nombre="Otro Entorno 2", activo=True)
        db_session.add(otro_entorno)
        db_session.commit()
        db_session.refresh(otro_entorno)

        cliente_otro = ClienteInteresado(
            entorno_trabajo_id=otro_entorno.id,
            nombre="Cliente Ajeno",
            telefono="000",
            marca_coche="X",
            modelo_coche="Y",
            anio_coche="2020",
        )
        db_session.add(cliente_otro)
        db_session.commit()
        db_session.refresh(cliente_otro)

        response = client.delete(
            f"/api/v1/clientes/{cliente_otro.id}",
            headers=auth_headers_admin,
        )
        assert response.status_code == 403

    @pytest.mark.api
    def test_borrar_cliente_sysowner_otro_entorno(self, client, db_session, auth_headers_sysowner, usuario_sysowner):
        """Sysowner puede borrar de cualquier entorno"""
        from app.models.busqueda import ClienteInteresado, EntornoTrabajo
        otro_entorno = EntornoTrabajo(nombre="Otro Entorno 3", activo=True)
        db_session.add(otro_entorno)
        db_session.commit()
        db_session.refresh(otro_entorno)

        cliente_otro = ClienteInteresado(
            entorno_trabajo_id=otro_entorno.id,
            nombre="Cliente Global",
            telefono="000",
            marca_coche="X",
            modelo_coche="Y",
            anio_coche="2020",
        )
        db_session.add(cliente_otro)
        db_session.commit()
        db_session.refresh(cliente_otro)

        response = client.delete(
            f"/api/v1/clientes/{cliente_otro.id}",
            headers=auth_headers_sysowner,
        )
        assert response.status_code == 200

    @pytest.mark.api
    def test_borrar_cliente_sin_auth(self, client, cliente_ejemplo):
        response = client.delete(f"/api/v1/clientes/{cliente_ejemplo.id}")
        assert response.status_code in [401, 403]
