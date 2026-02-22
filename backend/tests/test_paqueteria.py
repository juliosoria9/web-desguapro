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
