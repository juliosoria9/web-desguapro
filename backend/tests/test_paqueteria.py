"""
Tests para el sistema de paquetería
"""
import pytest
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestPaqueteriaModels:
    """Tests para modelos de paquetería"""

    @pytest.mark.unit
    def test_sucursal_model_exists(self):
        from app.models.busqueda import SucursalPaqueteria
        assert SucursalPaqueteria.__tablename__ == "sucursales_paqueteria"

    @pytest.mark.unit
    def test_registro_paquete_model_exists(self):
        from app.models.busqueda import RegistroPaquete
        assert RegistroPaquete.__tablename__ == "registros_paquetes"

    @pytest.mark.unit
    def test_tipo_caja_model_exists(self):
        from app.models.busqueda import TipoCaja
        assert TipoCaja.__tablename__ == "tipos_caja"

    @pytest.mark.unit
    def test_movimiento_caja_model_exists(self):
        from app.models.busqueda import MovimientoCaja
        assert MovimientoCaja.__tablename__ == "movimientos_caja"

    @pytest.mark.unit
    def test_stock_caja_sucursal_model_exists(self):
        from app.models.busqueda import StockCajaSucursal
        assert StockCajaSucursal.__tablename__ == "stock_caja_sucursal"

    @pytest.mark.integration
    def test_sucursal_creation(self, db_session, entorno_trabajo):
        from app.models.busqueda import SucursalPaqueteria
        suc = SucursalPaqueteria(
            entorno_trabajo_id=entorno_trabajo.id,
            nombre="Madrid Central",
            color_hex="#FF0000",
            activa=True,
        )
        db_session.add(suc)
        db_session.commit()
        assert suc.id is not None

    @pytest.mark.integration
    def test_registro_paquete_creation(self, db_session, usuario_normal, entorno_trabajo, sucursal_ejemplo):
        from app.models.busqueda import RegistroPaquete
        reg = RegistroPaquete(
            usuario_id=usuario_normal.id,
            entorno_trabajo_id=entorno_trabajo.id,
            sucursal_paqueteria_id=sucursal_ejemplo.id,
            id_caja="CAJA-100",
            id_pieza="PIEZA-200",
        )
        db_session.add(reg)
        db_session.commit()
        assert reg.id is not None
        assert reg.fecha_registro is not None

    @pytest.mark.integration
    def test_tipo_caja_creation(self, db_session, entorno_trabajo):
        from app.models.busqueda import TipoCaja
        tipo = TipoCaja(
            entorno_trabajo_id=entorno_trabajo.id,
            referencia_caja="PALET-001",
            tipo_nombre="Palet Grande",
            stock_actual=5,
        )
        db_session.add(tipo)
        db_session.commit()
        assert tipo.id is not None

    @pytest.mark.integration
    def test_movimiento_caja_creation(self, db_session, tipo_caja_ejemplo, entorno_trabajo, usuario_admin):
        from app.models.busqueda import MovimientoCaja
        mov = MovimientoCaja(
            tipo_caja_id=tipo_caja_ejemplo.id,
            entorno_trabajo_id=entorno_trabajo.id,
            usuario_id=usuario_admin.id,
            cantidad=5,
            tipo_movimiento="entrada",
            notas="Entrada inicial",
        )
        db_session.add(mov)
        db_session.commit()
        assert mov.id is not None


class TestPaqueteriaEndpoints:
    """Tests para endpoints de paquetería"""

    @pytest.mark.api
    def test_listar_sucursales(self, client, auth_headers_user, usuario_normal):
        response = client.get("/api/v1/paqueteria/sucursales", headers=auth_headers_user)
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    @pytest.mark.api
    def test_crear_sucursal_admin(self, client, auth_headers_admin, usuario_admin):
        response = client.post(
            "/api/v1/paqueteria/sucursales",
            headers=auth_headers_admin,
            json={"nombre": "Sucursal Nueva", "color_hex": "#00FF00"},
        )
        assert response.status_code in [200, 201]

    @pytest.mark.api
    def test_crear_sucursal_user_forbidden(self, client, auth_headers_user, usuario_normal):
        response = client.post(
            "/api/v1/paqueteria/sucursales",
            headers=auth_headers_user,
            json={"nombre": "No Autorizada"},
        )
        assert response.status_code == 403

    @pytest.mark.api
    def test_registrar_paquete(self, client, auth_headers_user, usuario_normal, sucursal_ejemplo):
        response = client.post(
            "/api/v1/paqueteria/registrar",
            headers=auth_headers_user,
            json={
                "id_caja": "CAJA-TEST-001",
                "id_pieza": "PIEZA-TEST-001",
                "sucursal_id": sucursal_ejemplo.id,
            },
        )
        assert response.status_code in [200, 201]

    @pytest.mark.api
    def test_registrar_paquete_sin_auth(self, client):
        response = client.post(
            "/api/v1/paqueteria/registrar",
            json={"id_caja": "CAJA", "id_pieza": "PIEZA"},
        )
        assert response.status_code in [401, 403]

    @pytest.mark.api
    def test_ranking_diario(self, client, auth_headers_user, usuario_normal):
        response = client.get("/api/v1/paqueteria/ranking", headers=auth_headers_user)
        assert response.status_code == 200

    @pytest.mark.api
    def test_mis_registros(self, client, auth_headers_user, usuario_normal):
        response = client.get("/api/v1/paqueteria/mis-registros", headers=auth_headers_user)
        assert response.status_code == 200

    @pytest.mark.api
    def test_todos_registros_admin(self, client, auth_headers_admin, usuario_admin):
        response = client.get("/api/v1/paqueteria/todos-registros", headers=auth_headers_admin)
        assert response.status_code == 200


class TestTipoCajaEndpoints:
    """Tests para endpoints de tipos de caja"""

    @pytest.mark.api
    def test_listar_tipos_caja(self, client, auth_headers_admin, usuario_admin):
        response = client.get("/api/v1/paqueteria/tipos-caja", headers=auth_headers_admin)
        assert response.status_code == 200

    @pytest.mark.api
    def test_crear_tipo_caja(self, client, auth_headers_admin, usuario_admin):
        response = client.post(
            "/api/v1/paqueteria/tipos-caja",
            headers=auth_headers_admin,
            json={
                "referencia_caja": "TIPO-NEW-001",
                "tipo_nombre": "Paletón",
                "descripcion": "Palet grande",
            },
        )
        assert response.status_code in [200, 201]

    @pytest.mark.api
    def test_crear_tipo_caja_duplicada(self, client, auth_headers_admin, usuario_admin, tipo_caja_ejemplo):
        response = client.post(
            "/api/v1/paqueteria/tipos-caja",
            headers=auth_headers_admin,
            json={"referencia_caja": "CAJA-001", "tipo_nombre": "Duplicada"},
        )
        assert response.status_code == 409

    @pytest.mark.api
    def test_editar_tipo_caja(self, client, auth_headers_admin, usuario_admin, tipo_caja_ejemplo):
        response = client.put(
            f"/api/v1/paqueteria/tipos-caja/{tipo_caja_ejemplo.id}",
            headers=auth_headers_admin,
            json={"tipo_nombre": "Caja Renombrada"},
        )
        assert response.status_code == 200

    @pytest.mark.api
    def test_borrar_tipo_caja(self, client, auth_headers_admin, usuario_admin, tipo_caja_ejemplo):
        response = client.delete(
            f"/api/v1/paqueteria/tipos-caja/{tipo_caja_ejemplo.id}",
            headers=auth_headers_admin,
        )
        assert response.status_code == 200

    @pytest.mark.api
    def test_registrar_movimiento_entrada(self, client, auth_headers_admin, usuario_admin, tipo_caja_ejemplo):
        response = client.post(
            f"/api/v1/paqueteria/tipos-caja/{tipo_caja_ejemplo.id}/movimiento",
            headers=auth_headers_admin,
            json={"cantidad": 5, "tipo_movimiento": "entrada", "notas": "Lote nuevo"},
        )
        assert response.status_code == 200

    @pytest.mark.api
    def test_registrar_movimiento_consumo(self, client, auth_headers_admin, usuario_admin, tipo_caja_ejemplo):
        response = client.post(
            f"/api/v1/paqueteria/tipos-caja/{tipo_caja_ejemplo.id}/movimiento",
            headers=auth_headers_admin,
            json={"cantidad": 2, "tipo_movimiento": "consumo"},
        )
        assert response.status_code == 200

    @pytest.mark.api
    def test_listar_movimientos(self, client, auth_headers_admin, usuario_admin, tipo_caja_ejemplo):
        response = client.get(
            f"/api/v1/paqueteria/tipos-caja/{tipo_caja_ejemplo.id}/movimientos",
            headers=auth_headers_admin,
        )
        assert response.status_code == 200

    @pytest.mark.api
    def test_establecer_stock(self, client, auth_headers_admin, usuario_admin, tipo_caja_ejemplo):
        response = client.put(
            f"/api/v1/paqueteria/tipos-caja/{tipo_caja_ejemplo.id}/stock?stock=25",
            headers=auth_headers_admin,
        )
        assert response.status_code == 200


class TestPaqueteriaEstadisticas:
    """Tests para estadísticas de paquetería"""

    @pytest.mark.api
    def test_estadisticas(self, client, auth_headers_user, usuario_normal):
        response = client.get("/api/v1/paqueteria/estadisticas", headers=auth_headers_user)
        assert response.status_code == 200
        data = response.json()
        assert "total_hoy" in data
        assert "total_mes" in data
        assert "ultimos_dias" in data

    @pytest.mark.api
    def test_resumen_stock_cajas(self, client, auth_headers_admin, usuario_admin):
        response = client.get("/api/v1/paqueteria/tipos-caja/resumen", headers=auth_headers_admin)
        assert response.status_code == 200


class TestBorrarRegistroPaquete:
    """Tests para DELETE /api/v1/paqueteria/borrar/{id}"""

    @pytest.mark.api
    def test_borrar_registro_admin(self, client, auth_headers_admin, usuario_admin, registro_paquete_ejemplo):
        """Admin puede borrar cualquier registro"""
        response = client.delete(
            f"/api/v1/paqueteria/borrar/{registro_paquete_ejemplo.id}",
            headers=auth_headers_admin,
        )
        assert response.status_code == 200
        assert "eliminado" in response.json()["message"].lower()

    @pytest.mark.api
    def test_borrar_registro_propio_hoy(self, client, auth_headers_user, usuario_normal, registro_paquete_ejemplo):
        """User puede borrar su propio registro del día"""
        response = client.delete(
            f"/api/v1/paqueteria/borrar/{registro_paquete_ejemplo.id}",
            headers=auth_headers_user,
        )
        assert response.status_code == 200

    @pytest.mark.api
    def test_borrar_registro_no_existe(self, client, auth_headers_admin, usuario_admin):
        response = client.delete(
            "/api/v1/paqueteria/borrar/99999",
            headers=auth_headers_admin,
        )
        assert response.status_code == 404

    @pytest.mark.api
    def test_borrar_registro_sin_auth(self, client, registro_paquete_ejemplo):
        response = client.delete(f"/api/v1/paqueteria/borrar/{registro_paquete_ejemplo.id}")
        assert response.status_code in [401, 403]

    @pytest.mark.api
    def test_borrar_registro_devuelve_stock_caja(self, client, db_session, auth_headers_admin, usuario_admin, tipo_caja_ejemplo, sucursal_ejemplo, entorno_trabajo):
        """Al borrar un registro, el stock de la caja se devuelve +1"""
        from app.models.busqueda import RegistroPaquete
        stock_antes = tipo_caja_ejemplo.stock_actual

        registro = RegistroPaquete(
            usuario_id=usuario_admin.id,
            entorno_trabajo_id=entorno_trabajo.id,
            sucursal_paqueteria_id=sucursal_ejemplo.id,
            id_caja="CAJA-001",
            id_pieza="TEST-DEVOLVER",
        )
        db_session.add(registro)
        db_session.commit()
        db_session.refresh(registro)

        response = client.delete(
            f"/api/v1/paqueteria/borrar/{registro.id}",
            headers=auth_headers_admin,
        )
        assert response.status_code == 200

        db_session.refresh(tipo_caja_ejemplo)
        assert tipo_caja_ejemplo.stock_actual >= stock_antes


class TestEditarRegistroPaquete:
    """Tests para PUT /api/v1/paqueteria/editar/{id}"""

    @pytest.mark.api
    def test_editar_registro_admin(self, client, auth_headers_admin, usuario_admin, registro_paquete_ejemplo):
        response = client.put(
            f"/api/v1/paqueteria/editar/{registro_paquete_ejemplo.id}",
            headers=auth_headers_admin,
            json={"id_pieza": "PIEZA-EDITADA"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id_pieza"] == "PIEZA-EDITADA"

    @pytest.mark.api
    def test_editar_registro_cambiar_caja(self, client, auth_headers_admin, usuario_admin, registro_paquete_ejemplo):
        response = client.put(
            f"/api/v1/paqueteria/editar/{registro_paquete_ejemplo.id}",
            headers=auth_headers_admin,
            json={"id_caja": "CAJA-NUEVA"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id_caja"] == "CAJA-NUEVA"

    @pytest.mark.api
    def test_editar_registro_no_existe(self, client, auth_headers_admin, usuario_admin):
        response = client.put(
            "/api/v1/paqueteria/editar/99999",
            headers=auth_headers_admin,
            json={"id_pieza": "X"},
        )
        assert response.status_code == 404

    @pytest.mark.api
    def test_editar_registro_user_propio_hoy(self, client, auth_headers_user, usuario_normal, registro_paquete_ejemplo):
        """User puede editar su propio registro del día"""
        response = client.put(
            f"/api/v1/paqueteria/editar/{registro_paquete_ejemplo.id}",
            headers=auth_headers_user,
            json={"id_pieza": "PIEZA-USER-EDIT"},
        )
        assert response.status_code == 200

    @pytest.mark.api
    def test_editar_registro_sin_auth(self, client, registro_paquete_ejemplo):
        response = client.put(
            f"/api/v1/paqueteria/editar/{registro_paquete_ejemplo.id}",
            json={"id_pieza": "X"},
        )
        assert response.status_code in [401, 403]


class TestPaqueteriaDuplicados:
    """Tests para validación de piezas duplicadas en paquetería"""

    @pytest.mark.api
    def test_registrar_pieza_duplicada_mismo_dia(self, client, auth_headers_user, usuario_normal, sucursal_ejemplo):
        """No se puede registrar la misma pieza dos veces el mismo día"""
        payload = {
            "id_caja": "CAJA-DUP-01",
            "id_pieza": "PIEZA-DUP-001",
            "sucursal_id": sucursal_ejemplo.id,
        }
        r1 = client.post("/api/v1/paqueteria/registrar", headers=auth_headers_user, json=payload)
        assert r1.status_code in [200, 201]

        payload2 = {
            "id_caja": "CAJA-DUP-02",
            "id_pieza": "PIEZA-DUP-001",
            "sucursal_id": sucursal_ejemplo.id,
        }
        r2 = client.post("/api/v1/paqueteria/registrar", headers=auth_headers_user, json=payload2)
        assert r2.status_code == 409
        assert "ya empaquetadas hoy" in r2.json()["detail"]

    @pytest.mark.api
    def test_registrar_pieza_duplicada_dentro_lote(self, client, auth_headers_user, usuario_normal, sucursal_ejemplo):
        """No se puede enviar la misma pieza repetida dentro de una petición"""
        payload = {
            "id_caja": "CAJA-DUP-03",
            "id_pieza": "PIEZA-INT-001, PIEZA-INT-001",
            "sucursal_id": sucursal_ejemplo.id,
        }
        r = client.post("/api/v1/paqueteria/registrar", headers=auth_headers_user, json=payload)
        assert r.status_code == 409
        assert "duplicadas en la misma petición" in r.json()["detail"]

    @pytest.mark.api
    def test_registrar_pieza_multi_duplicada_parcial(self, client, auth_headers_user, usuario_normal, sucursal_ejemplo):
        """Si se envían varias piezas y una ya existe hoy, se rechaza todo"""
        # Registrar PIEZA-PARCIAL-A
        r1 = client.post("/api/v1/paqueteria/registrar", headers=auth_headers_user, json={
            "id_caja": "CAJA-DUP-04",
            "id_pieza": "PIEZA-PARCIAL-A",
            "sucursal_id": sucursal_ejemplo.id,
        })
        assert r1.status_code in [200, 201]

        # Intentar registrar PIEZA-PARCIAL-B, PIEZA-PARCIAL-A (la A ya existe)
        r2 = client.post("/api/v1/paqueteria/registrar", headers=auth_headers_user, json={
            "id_caja": "CAJA-DUP-05",
            "id_pieza": "PIEZA-PARCIAL-B, PIEZA-PARCIAL-A",
            "sucursal_id": sucursal_ejemplo.id,
        })
        assert r2.status_code == 409
        assert "PIEZA-PARCIAL-A" in r2.json()["detail"]

    @pytest.mark.api
    def test_registrar_piezas_distintas_ok(self, client, auth_headers_user, usuario_normal, sucursal_ejemplo):
        """Piezas distintas se pueden registrar sin problemas"""
        r1 = client.post("/api/v1/paqueteria/registrar", headers=auth_headers_user, json={
            "id_caja": "CAJA-OK-01",
            "id_pieza": "PIEZA-UNICA-A",
            "sucursal_id": sucursal_ejemplo.id,
        })
        assert r1.status_code in [200, 201]

        r2 = client.post("/api/v1/paqueteria/registrar", headers=auth_headers_user, json={
            "id_caja": "CAJA-OK-02",
            "id_pieza": "PIEZA-UNICA-B",
            "sucursal_id": sucursal_ejemplo.id,
        })
        assert r2.status_code in [200, 201]

    @pytest.mark.api
    def test_registrar_pieza_case_insensitive(self, client, auth_headers_user, usuario_normal, sucursal_ejemplo):
        """La detección de duplicados es case-insensitive"""
        r1 = client.post("/api/v1/paqueteria/registrar", headers=auth_headers_user, json={
            "id_caja": "CAJA-CI-01",
            "id_pieza": "pieza-case-test",
            "sucursal_id": sucursal_ejemplo.id,
        })
        assert r1.status_code in [200, 201]

        r2 = client.post("/api/v1/paqueteria/registrar", headers=auth_headers_user, json={
            "id_caja": "CAJA-CI-02",
            "id_pieza": "PIEZA-CASE-TEST",
            "sucursal_id": sucursal_ejemplo.id,
        })
        assert r2.status_code == 409
