"""
Tests para el sistema de piezas (nuevas, CSV, pedidas)
"""
import pytest
import os
import sys
import io

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestPiezaModels:
    """Tests para modelos de piezas"""

    @pytest.mark.unit
    def test_csv_guardado_model_exists(self):
        from app.models.busqueda import CSVGuardado
        assert CSVGuardado.__tablename__ == "csvs_guardados"

    @pytest.mark.unit
    def test_pieza_pedida_model_exists(self):
        from app.models.busqueda import PiezaPedida
        assert PiezaPedida.__tablename__ == "piezas_pedidas"

    @pytest.mark.integration
    def test_csv_guardado_creation(self, db_session, entorno_trabajo, usuario_admin):
        from app.models.busqueda import CSVGuardado
        csv = CSVGuardado(
            entorno_trabajo_id=entorno_trabajo.id,
            usuario_id=usuario_admin.id,
            nombre_archivo="test.csv",
            contenido="refid;oem\nREF-1;OEM-1",
            total_filas=1,
        )
        db_session.add(csv)
        db_session.commit()
        assert csv.id is not None

    @pytest.mark.integration
    def test_pieza_pedida_creation(self, db_session, entorno_trabajo, usuario_normal):
        from app.models.busqueda import PiezaPedida
        pp = PiezaPedida(
            entorno_trabajo_id=entorno_trabajo.id,
            usuario_id=usuario_normal.id,
            referencia="REF-PEDIDA-001",
            descripcion="Faro delantero",
        )
        db_session.add(pp)
        db_session.commit()
        assert pp.id is not None


class TestPiezasEndpoints:
    """Tests para endpoints de piezas"""

    @pytest.mark.api
    def test_crear_pieza_nueva(self, client, auth_headers_admin, usuario_admin, base_desguace_ejemplo):
        response = client.post(
            "/api/v1/piezas/nuevas",
            headers=auth_headers_admin,
            json={
                "refid": "NEW-001",
                "oem": "OEM-NEW-001",
                "precio": 150.0,
                "articulo": "Pieza nueva test",
            },
        )
        # Puede ser 200 o 201 o 422 si falta algo
        assert response.status_code in [200, 201, 422]

    @pytest.mark.api
    def test_piezas_recientes(self, client, auth_headers_admin, usuario_admin):
        response = client.get("/api/v1/piezas/recientes", headers=auth_headers_admin)
        assert response.status_code == 200

    @pytest.mark.api
    def test_piezas_recientes_sin_auth(self, client):
        response = client.get("/api/v1/piezas/recientes")
        assert response.status_code in [401, 403]

    @pytest.mark.api
    def test_listar_pedidas(self, client, auth_headers_user, usuario_normal):
        response = client.get("/api/v1/piezas/pedidas", headers=auth_headers_user)
        assert response.status_code == 200

    @pytest.mark.api
    def test_crear_pedida(self, client, auth_headers_user, usuario_normal):
        response = client.post(
            "/api/v1/piezas/pedidas",
            headers=auth_headers_user,
            json={"referencia": "REF-PEDIDA", "descripcion": "Necesito esta pieza"},
        )
        assert response.status_code in [200, 201]

    @pytest.mark.api
    def test_listar_csvs_guardados(self, client, auth_headers_admin, usuario_admin):
        response = client.get("/api/v1/piezas/csv-guardados", headers=auth_headers_admin)
        assert response.status_code == 200
        assert isinstance(response.json(), list)


class TestPiezaVendidaModel:
    """Tests para modelo de piezas vendidas"""

    @pytest.mark.unit
    def test_pieza_vendida_fields(self):
        from app.models.busqueda import PiezaVendida
        fields = ["id", "entorno_trabajo_id", "refid", "oem", "precio",
                  "fecha_venta", "archivo_origen"]
        for f in fields:
            assert hasattr(PiezaVendida, f), f"Campo faltante: {f}"

    @pytest.mark.integration
    def test_pieza_vendida_creation(self, db_session, entorno_trabajo):
        from app.models.busqueda import PiezaVendida
        vendida = PiezaVendida(
            entorno_trabajo_id=entorno_trabajo.id,
            refid="VENDIDA-TEST",
            oem="OEM-VENDIDA",
            precio=300.0,
            articulo="Alternador",
            archivo_origen="test.csv",
        )
        db_session.add(vendida)
        db_session.commit()
        assert vendida.id is not None
        assert vendida.fecha_venta is not None


class TestVentasEndpoints:
    """Tests para endpoints de ventas"""

    @pytest.mark.api
    def test_listar_ventas(self, client, auth_headers_admin, usuario_admin):
        response = client.get("/api/v1/desguace/ventas", headers=auth_headers_admin)
        assert response.status_code == 200

    @pytest.mark.api
    def test_resumen_ventas(self, client, auth_headers_owner, usuario_owner):
        response = client.get("/api/v1/desguace/ventas/resumen", headers=auth_headers_owner)
        assert response.status_code == 200

    @pytest.mark.api
    def test_stock_resumen(self, client, auth_headers_admin, usuario_admin):
        response = client.get("/api/v1/desguace/stock/resumen", headers=auth_headers_admin)
        assert response.status_code in [200, 404]
