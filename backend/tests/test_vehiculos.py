"""
Tests para el router de vehículos de referencia
"""
import pytest
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestVehiculoModel:
    """Tests para modelo VehiculoReferencia"""

    @pytest.mark.unit
    def test_model_exists(self):
        from app.models.busqueda import VehiculoReferencia
        assert VehiculoReferencia.__tablename__ == "vehiculos_referencia"

    @pytest.mark.unit
    def test_model_fields(self):
        from app.models.busqueda import VehiculoReferencia
        campos = [
            "id", "marca", "modelo", "rango_anios", "anios_produccion",
            "tiene_serie", "tiene_deportiva", "observaciones_facelift",
            "precio_fatal_10", "precio_mal_13", "precio_regular_17",
            "precio_bien_23", "precio_vida_deportiva",
        ]
        for f in campos:
            assert hasattr(VehiculoReferencia, f), f"Campo faltante: {f}"

    @pytest.mark.integration
    def test_crear_vehiculo_db(self, db_session):
        from app.models.busqueda import VehiculoReferencia
        v = VehiculoReferencia(
            marca="TOYOTA",
            modelo="COROLLA",
            rango_anios="2018-2023",
        )
        db_session.add(v)
        db_session.commit()
        assert v.id is not None

    @pytest.mark.integration
    def test_vehiculo_campos_precios(self, db_session, vehiculo_ejemplo):
        assert vehiculo_ejemplo.precio_fatal_10 == 500.0
        assert vehiculo_ejemplo.precio_bien_23 == 1150.0


class TestListarMarcas:
    """Tests para GET /api/v1/vehiculos/marcas"""

    @pytest.mark.api
    def test_marcas_vacio(self, client, auth_headers_user, usuario_normal):
        response = client.get("/api/v1/vehiculos/marcas", headers=auth_headers_user)
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    @pytest.mark.api
    def test_marcas_con_datos(self, client, auth_headers_user, usuario_normal, vehiculo_ejemplo):
        response = client.get("/api/v1/vehiculos/marcas", headers=auth_headers_user)
        assert response.status_code == 200
        data = response.json()
        assert "BMW" in data

    @pytest.mark.api
    def test_marcas_filtro_q(self, client, auth_headers_user, usuario_normal, vehiculo_ejemplo):
        response = client.get("/api/v1/vehiculos/marcas?q=BM", headers=auth_headers_user)
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert "BMW" in data

    @pytest.mark.api
    def test_marcas_filtro_q_sin_resultados(self, client, auth_headers_user, usuario_normal, vehiculo_ejemplo):
        response = client.get("/api/v1/vehiculos/marcas?q=ZZZZ", headers=auth_headers_user)
        assert response.status_code == 200
        assert len(response.json()) == 0


class TestListarModelos:
    """Tests para GET /api/v1/vehiculos/modelos"""

    @pytest.mark.api
    def test_modelos_por_marca(self, client, auth_headers_user, usuario_normal, vehiculo_ejemplo):
        response = client.get(
            "/api/v1/vehiculos/modelos?marca=BMW",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        data = response.json()
        assert "SERIE 3" in data

    @pytest.mark.api
    def test_modelos_marca_inexistente(self, client, auth_headers_user, usuario_normal, vehiculo_ejemplo):
        response = client.get(
            "/api/v1/vehiculos/modelos?marca=NOEXISTE",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        assert len(response.json()) == 0

    @pytest.mark.api
    def test_modelos_sin_marca_param(self, client, auth_headers_user, usuario_normal):
        response = client.get("/api/v1/vehiculos/modelos", headers=auth_headers_user)
        assert response.status_code == 422  # marca is required

    @pytest.mark.api
    def test_modelos_con_filtro_q(self, client, auth_headers_user, usuario_normal, vehiculo_ejemplo):
        response = client.get(
            "/api/v1/vehiculos/modelos?marca=BMW&q=SERIE",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        assert len(response.json()) >= 1


class TestListarAnios:
    """Tests para GET /api/v1/vehiculos/anios"""

    @pytest.mark.api
    def test_anios_por_marca_modelo(self, client, auth_headers_user, usuario_normal, vehiculo_ejemplo):
        response = client.get(
            "/api/v1/vehiculos/anios?marca=BMW&modelo=SERIE 3",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert data[0]["rango_anios"] == "2015-2020"

    @pytest.mark.api
    def test_anios_sin_params(self, client, auth_headers_user, usuario_normal):
        response = client.get("/api/v1/vehiculos/anios", headers=auth_headers_user)
        assert response.status_code == 422  # marca y modelo required

    @pytest.mark.api
    def test_anios_marca_modelo_inexistente(self, client, auth_headers_user, usuario_normal, vehiculo_ejemplo):
        response = client.get(
            "/api/v1/vehiculos/anios?marca=BMW&modelo=NOEXISTE",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        assert len(response.json()) == 0


class TestListarTodos:
    """Tests para GET /api/v1/vehiculos/todos"""

    @pytest.mark.api
    def test_todos_vacio(self, client, auth_headers_user, usuario_normal):
        response = client.get("/api/v1/vehiculos/todos", headers=auth_headers_user)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "items" in data

    @pytest.mark.api
    def test_todos_con_datos(self, client, auth_headers_user, usuario_normal, vehiculo_ejemplo):
        response = client.get("/api/v1/vehiculos/todos", headers=auth_headers_user)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert len(data["items"]) >= 1

    @pytest.mark.api
    def test_todos_filtro_marca(self, client, auth_headers_user, usuario_normal, vehiculo_ejemplo):
        response = client.get(
            "/api/v1/vehiculos/todos?marca=BMW",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1

    @pytest.mark.api
    def test_todos_filtro_buscar(self, client, auth_headers_user, usuario_normal, vehiculo_ejemplo):
        response = client.get(
            "/api/v1/vehiculos/todos?buscar=SERIE",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1

    @pytest.mark.api
    def test_todos_paginacion(self, client, auth_headers_user, usuario_normal, vehiculo_ejemplo):
        response = client.get(
            "/api/v1/vehiculos/todos?limit=1&offset=0",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) <= 1

    @pytest.mark.api
    def test_todos_offset_alto(self, client, auth_headers_user, usuario_normal, vehiculo_ejemplo):
        response = client.get(
            "/api/v1/vehiculos/todos?offset=9999",
            headers=auth_headers_user,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 0


class TestCrearVehiculo:
    """Tests para POST /api/v1/vehiculos"""

    @pytest.mark.api
    def test_crear_vehiculo_admin(self, client, auth_headers_admin, usuario_admin):
        response = client.post(
            "/api/v1/vehiculos",
            headers=auth_headers_admin,
            json={
                "marca": "Honda",
                "modelo": "Civic",
                "rango_anios": "2016-2021",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["marca"] == "HONDA"
        assert data["modelo"] == "CIVIC"

    @pytest.mark.api
    def test_crear_vehiculo_campos_completos(self, client, auth_headers_admin, usuario_admin):
        response = client.post(
            "/api/v1/vehiculos",
            headers=auth_headers_admin,
            json={
                "marca": "Ford",
                "modelo": "Focus",
                "rango_anios": "2018-2023",
                "tiene_serie": True,
                "tiene_deportiva": True,
                "precio_fatal_10": 300.0,
                "precio_mal_13": 400.0,
                "precio_regular_17": 550.0,
                "precio_bien_23": 750.0,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["tiene_serie"] is True
        assert data["precio_fatal_10"] == 300.0

    @pytest.mark.api
    def test_crear_vehiculo_user_forbidden(self, client, auth_headers_user, usuario_normal):
        response = client.post(
            "/api/v1/vehiculos",
            headers=auth_headers_user,
            json={"marca": "Test", "modelo": "NoAuth"},
        )
        assert response.status_code == 403

    @pytest.mark.api
    def test_crear_vehiculo_sin_auth(self, client):
        response = client.post(
            "/api/v1/vehiculos",
            json={"marca": "Test", "modelo": "NoAuth"},
        )
        assert response.status_code in [401, 403]

    @pytest.mark.api
    def test_crear_vehiculo_sin_marca(self, client, auth_headers_admin, usuario_admin):
        response = client.post(
            "/api/v1/vehiculos",
            headers=auth_headers_admin,
            json={"modelo": "SinMarca"},
        )
        assert response.status_code == 422

    @pytest.mark.api
    def test_crear_vehiculo_marca_uppercase(self, client, auth_headers_admin, usuario_admin):
        """La marca se almacena en uppercase"""
        response = client.post(
            "/api/v1/vehiculos",
            headers=auth_headers_admin,
            json={"marca": "toyota", "modelo": "yaris"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["marca"] == "TOYOTA"
        assert data["modelo"] == "YARIS"


class TestEditarVehiculo:
    """Tests para PUT /api/v1/vehiculos/{id}"""

    @pytest.mark.api
    def test_editar_vehiculo(self, client, auth_headers_admin, usuario_admin, vehiculo_ejemplo):
        response = client.put(
            f"/api/v1/vehiculos/{vehiculo_ejemplo.id}",
            headers=auth_headers_admin,
            json={"rango_anios": "2015-2022", "precio_fatal_10": 600.0},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["rango_anios"] == "2015-2022"
        assert data["precio_fatal_10"] == 600.0

    @pytest.mark.api
    def test_editar_vehiculo_marca_uppercase(self, client, auth_headers_admin, usuario_admin, vehiculo_ejemplo):
        response = client.put(
            f"/api/v1/vehiculos/{vehiculo_ejemplo.id}",
            headers=auth_headers_admin,
            json={"marca": "audi"},
        )
        assert response.status_code == 200
        assert response.json()["marca"] == "AUDI"

    @pytest.mark.api
    def test_editar_vehiculo_no_existe(self, client, auth_headers_admin, usuario_admin):
        response = client.put(
            "/api/v1/vehiculos/99999",
            headers=auth_headers_admin,
            json={"rango_anios": "2999"},
        )
        assert response.status_code == 404

    @pytest.mark.api
    def test_editar_vehiculo_user_forbidden(self, client, auth_headers_user, usuario_normal, vehiculo_ejemplo):
        response = client.put(
            f"/api/v1/vehiculos/{vehiculo_ejemplo.id}",
            headers=auth_headers_user,
            json={"rango_anios": "hack"},
        )
        assert response.status_code == 403


class TestEliminarVehiculo:
    """Tests para DELETE /api/v1/vehiculos/{id}"""

    @pytest.mark.api
    def test_eliminar_vehiculo_admin(self, client, auth_headers_admin, usuario_admin, vehiculo_ejemplo):
        response = client.delete(
            f"/api/v1/vehiculos/{vehiculo_ejemplo.id}",
            headers=auth_headers_admin,
        )
        assert response.status_code == 200
        assert response.json()["ok"] is True

    @pytest.mark.api
    def test_eliminar_vehiculo_no_existe(self, client, auth_headers_admin, usuario_admin):
        response = client.delete(
            "/api/v1/vehiculos/99999",
            headers=auth_headers_admin,
        )
        assert response.status_code == 404

    @pytest.mark.api
    def test_eliminar_vehiculo_user_forbidden(self, client, auth_headers_user, usuario_normal, vehiculo_ejemplo):
        response = client.delete(
            f"/api/v1/vehiculos/{vehiculo_ejemplo.id}",
            headers=auth_headers_user,
        )
        assert response.status_code == 403

    @pytest.mark.api
    def test_eliminar_vehiculo_sin_auth(self, client, vehiculo_ejemplo):
        response = client.delete(f"/api/v1/vehiculos/{vehiculo_ejemplo.id}")
        assert response.status_code in [401, 403]

    @pytest.mark.api
    def test_eliminar_y_verificar_borrado(self, client, auth_headers_admin, usuario_admin, vehiculo_ejemplo):
        """Tras borrar, el vehículo ya no aparece en la lista"""
        vid = vehiculo_ejemplo.id
        client.delete(f"/api/v1/vehiculos/{vid}", headers=auth_headers_admin)

        response = client.get("/api/v1/vehiculos/todos", headers=auth_headers_admin)
        assert response.status_code == 200
        ids = [v["id"] for v in response.json()["items"]]
        assert vid not in ids
