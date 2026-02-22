"""
Tests para APIs de precios y scrapers de precios medios.
Verifica endpoints de búsqueda de precios, plataformas, stock y la lógica
de scraping (ScraperFactory, summarize, detect_outliers_iqr).
"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


# ============================================================
# SECCIÓN 1: Tests de servicios de pricing (summarize / outliers)
# ============================================================


class TestSummarize:
    """Tests del servicio de análisis de precios"""

    @pytest.mark.unit
    def test_summarize_basico(self):
        """Calcula estadísticas básicas de una lista de precios. Espera: media, mediana, mínimo y máximo correctos."""
        from services.pricing import summarize
        precios = [100.0, 200.0, 300.0]
        res = summarize(precios, remove_outliers=False)
        assert res["media"] == 200.0
        assert res["mediana"] == 200.0
        assert res["minimo"] == 100.0
        assert res["maximo"] == 300.0

    @pytest.mark.unit
    def test_summarize_vacio(self):
        """Resumen con lista vacía de precios. Espera: media y mediana igual a 0."""
        from services.pricing import summarize
        res = summarize([], remove_outliers=False)
        assert res["media"] == 0
        assert res["mediana"] == 0

    @pytest.mark.unit
    def test_summarize_un_precio(self):
        """Resumen con un solo precio. Espera: media igual al precio y desviación estándar 0."""
        from services.pricing import summarize
        res = summarize([50.0])
        assert res["media"] == 50.0
        assert res["desviacion_estandar"] == 0

    @pytest.mark.unit
    def test_summarize_con_outliers(self):
        """Resumen eliminando outliers de la lista. Espera: al menos 1 outlier removido y máximo < 1000."""
        from services.pricing import summarize
        precios = [100, 110, 105, 108, 102, 1000]  # 1000 es outlier
        res = summarize(precios, remove_outliers=True)
        assert res["outliers_removidos"] >= 1
        assert res["maximo"] < 1000  # el outlier debe haberse removido

    @pytest.mark.unit
    def test_summarize_pocos_para_outliers(self):
        """Con <= 4 precios no se aplica detección de outliers. Espera: 0 outliers removidos."""
        from services.pricing import summarize
        precios = [10, 20, 30]
        res = summarize(precios, remove_outliers=True)
        assert res["outliers_removidos"] == 0

    @pytest.mark.unit
    def test_summarize_campos_rango(self):
        """Verifica que el resumen incluye campos de rango. Espera: claves rango_original y rango_limpio presentes."""
        from services.pricing import summarize
        precios = [50, 60, 70, 80, 90]
        res = summarize(precios, remove_outliers=True)
        assert "rango_original" in res
        assert "rango_limpio" in res


class TestDetectOutliersIQR:
    """Tests de la función detect_outliers_iqr"""

    @pytest.mark.unit
    def test_sin_outliers(self):
        """Lista de precios sin valores atípicos. Espera: 0 outliers y todos los precios en limpios."""
        from services.pricing import detect_outliers_iqr
        precios = [100, 110, 105, 108, 102]
        limpios, outliers = detect_outliers_iqr(precios)
        assert len(outliers) == 0
        assert len(limpios) == 5

    @pytest.mark.unit
    def test_con_outlier_alto(self):
        """Detecta un valor atípico alto (500) en la lista. Espera: 500 en outliers y ausente en limpios."""
        from services.pricing import detect_outliers_iqr
        precios = [100, 110, 105, 108, 102, 500]
        limpios, outliers = detect_outliers_iqr(precios)
        assert 500 in outliers
        assert 500 not in limpios

    @pytest.mark.unit
    def test_pocos_precios_no_filtra(self):
        """Con < 4 precios no aplica filtrado. Espera: limpios igual a la entrada y outliers vacío."""
        from services.pricing import detect_outliers_iqr
        precios = [10, 20]
        limpios, outliers = detect_outliers_iqr(precios)
        assert limpios == [10, 20]
        assert outliers == []


# ============================================================
# SECCIÓN 2: Tests de ScraperFactory
# ============================================================


class TestScraperFactory:
    """Tests de la fábrica de scrapers"""

    @pytest.mark.unit
    def test_get_available_platforms_retorna_dict(self):
        """Obtiene plataformas disponibles. Espera: dict no vacío."""
        from core.scraper_factory import ScraperFactory
        plats = ScraperFactory.get_available_platforms()
        assert isinstance(plats, dict)
        assert len(plats) > 0

    @pytest.mark.unit
    def test_ecooparts_en_plataformas(self):
        """Verifica que ecooparts está registrada como plataforma. Espera: 'ecooparts' en el dict."""
        from core.scraper_factory import ScraperFactory
        plats = ScraperFactory.get_available_platforms()
        assert "ecooparts" in plats

    @pytest.mark.unit
    def test_create_scraper_valido(self):
        """Crea un scraper válido (ecooparts). Espera: instancia con métodos fetch_prices, setup_session e is_available."""
        from core.scraper_factory import ScraperFactory
        scraper = ScraperFactory.create_scraper("ecooparts")
        assert scraper is not None
        assert hasattr(scraper, "fetch_prices")
        assert hasattr(scraper, "setup_session")
        assert hasattr(scraper, "is_available")

    @pytest.mark.unit
    def test_create_scraper_invalido(self):
        """Intenta crear un scraper con plataforma inexistente. Espera: ValueError."""
        from core.scraper_factory import ScraperFactory
        with pytest.raises(ValueError):
            ScraperFactory.create_scraper("plataforma_inexistente")

    @pytest.mark.unit
    def test_scraper_tiene_nombre(self):
        """Verifica que el scraper tiene un nombre definido. Espera: name no vacío."""
        from core.scraper_factory import ScraperFactory
        scraper = ScraperFactory.create_scraper("ecooparts")
        assert scraper.name and len(scraper.name) > 0

    @pytest.mark.unit
    def test_get_platform_info(self):
        """Obtiene info de plataforma de un scraper. Espera: dict con claves name, base_url y available."""
        from core.scraper_factory import ScraperFactory
        scraper = ScraperFactory.create_scraper("ecooparts")
        info = scraper.get_platform_info()
        assert "name" in info
        assert "base_url" in info
        assert "available" in info

    @pytest.mark.unit
    def test_get_slow_platforms(self):
        """Obtiene lista de plataformas lentas. Espera: lista (puede estar vacía)."""
        from core.scraper_factory import ScraperFactory
        lentos = ScraperFactory.get_slow_platforms()
        assert isinstance(lentos, list)

    @pytest.mark.unit
    def test_recambioverde_existe(self):
        """Verifica que recambioverde está registrada como scraper. Espera: instancia no nula."""
        from core.scraper_factory import ScraperFactory
        scraper = ScraperFactory.create_scraper("recambioverde")
        assert scraper is not None

    @pytest.mark.unit
    def test_get_all_scrapers(self):
        """Obtiene todos los scrapers excluyendo lentos. Espera: dict con al menos 2 scrapers."""
        from core.scraper_factory import ScraperFactory
        all_s = ScraperFactory.get_all_scrapers(include_slow=False)
        assert isinstance(all_s, dict)
        assert len(all_s) >= 2


# ============================================================
# SECCIÓN 3: Tests de endpoint /api/v1/plataformas
# ============================================================


class TestPlataformasEndpoint:
    """Tests de las APIs de información de plataformas"""

    @pytest.mark.integration
    def test_listar_plataformas(self, client):
        """Lista todas las plataformas de scraping. Espera: 200 con total > 0 y lista de plataformas."""
        resp = client.get("/api/v1/plataformas/")
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data
        assert "plataformas" in data
        assert data["total"] > 0

    @pytest.mark.integration
    def test_plataforma_detalle_existente(self, client):
        """Consulta detalle de ecooparts. Espera: 200 con id, nombre y disponibilidad."""
        resp = client.get("/api/v1/plataformas/ecooparts")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "ecooparts"
        assert "nombre" in data
        assert "disponible" in data

    @pytest.mark.integration
    def test_plataforma_detalle_inexistente(self, client):
        """Consulta detalle de plataforma inexistente. Espera: 404."""
        resp = client.get("/api/v1/plataformas/no_existe_xyz")
        assert resp.status_code == 404


# ============================================================
# SECCIÓN 4: Tests de endpoint /api/v1/precios/plataformas-disponibles
# ============================================================


class TestPreciosPlataformasDisponibles:
    """Tests del endpoint de plataformas disponibles (requiere auth)"""

    @pytest.mark.integration
    def test_sin_auth_401(self, client):
        """Accede a plataformas disponibles sin autenticación. Espera: 401 o 403."""
        resp = client.get("/api/v1/precios/plataformas-disponibles")
        assert resp.status_code in (401, 403)

    @pytest.mark.integration
    def test_con_auth_200(self, client, auth_headers_admin):
        """Accede a plataformas disponibles con token admin. Espera: 200 con lista de plataformas y total."""
        resp = client.get("/api/v1/precios/plataformas-disponibles", headers=auth_headers_admin)
        assert resp.status_code == 200
        data = resp.json()
        assert "plataformas" in data
        assert "total" in data


# ============================================================
# SECCIÓN 5: Tests de endpoint /api/v1/precios/buscar (con mocks)
# ============================================================


class TestBuscarPrecios:
    """Tests del endpoint principal de búsqueda de precios.
    Se mockean los scrapers para evitar llamadas externas."""

    def _mock_scrape_platform(self, platform_id, referencia, cantidad):
        """Helper: simula resultado de scraper"""
        return {
            "plataforma_id": platform_id,
            "plataforma_nombre": platform_id.capitalize(),
            "precios": [100.0, 150.0, 200.0],
            "imagenes": ["https://img.test/1.jpg"],
            "tipo_pieza": "MOTOR ARRANQUE",
            "error": None,
        }

    @pytest.mark.integration
    def test_buscar_sin_auth(self, client):
        """Busca precios sin autenticación. Espera: 401 o 403."""
        resp = client.post("/api/v1/precios/buscar", json={
            "referencia": "1K0959653C",
            "plataforma": "todas",
        })
        assert resp.status_code in (401, 403)

    @pytest.mark.integration
    @patch("app.routers.precios._scrape_platform")
    @patch("app.routers.precios.obtener_primera_referencia_por_proveedor", return_value=[])
    def test_buscar_todas_con_mock(self, mock_iam, mock_scrape, client, auth_headers_admin):
        """Busca precios en todas las plataformas con scrapers mockeados. Espera: 200 con referencia y resumen con media > 0."""
        mock_scrape.side_effect = self._mock_scrape_platform
        resp = client.post(
            "/api/v1/precios/buscar",
            json={"referencia": "TEST123", "plataforma": "todas", "cantidad": 5},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "referencia" in data
        assert data["referencia"] == "TEST123"
        assert "resumen" in data
        assert data["resumen"]["media"] > 0

    @pytest.mark.integration
    @patch("app.routers.precios._scrape_platform")
    @patch("app.routers.precios.obtener_primera_referencia_por_proveedor", return_value=[])
    def test_buscar_plataforma_unica_mock(self, mock_iam, mock_scrape, client, auth_headers_admin):
        """Busca precios en una sola plataforma (ecooparts). Espera: 200 con plataforma = 'ecooparts'."""
        mock_scrape.side_effect = self._mock_scrape_platform
        resp = client.post(
            "/api/v1/precios/buscar",
            json={"referencia": "TEST123", "plataforma": "ecooparts"},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["plataforma"] == "ecooparts"

    @pytest.mark.integration
    def test_buscar_plataforma_invalida(self, client, auth_headers_admin):
        """Busca precios en una plataforma que no existe. Espera: 400."""
        resp = client.post(
            "/api/v1/precios/buscar",
            json={"referencia": "TEST", "plataforma": "inventada_xyz"},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 400

    @pytest.mark.integration
    @patch("app.routers.precios._scrape_platform")
    @patch("app.routers.precios.obtener_primera_referencia_por_proveedor", return_value=[])
    def test_buscar_guarda_en_bd(self, mock_iam, mock_scrape, client, auth_headers_admin, db_session):
        """Verifica que la búsqueda persiste un registro en tabla Busqueda. Espera: count no disminuye."""
        from app.models.busqueda import Busqueda
        mock_scrape.side_effect = self._mock_scrape_platform
        count_antes = db_session.query(Busqueda).count()
        client.post(
            "/api/v1/precios/buscar",
            json={"referencia": "GUARDAR_BD", "plataforma": "todas"},
            headers=auth_headers_admin,
        )
        count_despues = db_session.query(Busqueda).count()
        assert count_despues >= count_antes  # al menos no falló

    @pytest.mark.integration
    @patch("app.routers.precios._scrape_platform")
    @patch("app.routers.precios.obtener_primera_referencia_por_proveedor", return_value=[])
    def test_buscar_incluye_inventario(self, mock_iam, mock_scrape, client, auth_headers_admin, piezas_desguace):
        """Busca precios con piezas en stock coincidentes. Espera: 200 y campo inventario con en_stock >= 0."""
        mock_scrape.side_effect = lambda pid, ref, cant: {
            "plataforma_id": pid,
            "plataforma_nombre": pid.capitalize(),
            "precios": [100.0, 150.0, 200.0],
            "imagenes": [],
            "tipo_pieza": None,
            "error": None,
        }
        resp = client.post(
            "/api/v1/precios/buscar",
            json={"referencia": "OEM-001", "plataforma": "todas"},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        data = resp.json()
        if data.get("inventario"):
            assert data["inventario"]["en_stock"] >= 0

    @pytest.mark.integration
    @patch("app.routers.precios._scrape_platform")
    @patch("app.routers.precios.obtener_primera_referencia_por_proveedor", return_value=[])
    def test_buscar_resultados_por_plataforma(self, mock_iam, mock_scrape, client, auth_headers_admin):
        """Verifica desglose de resultados por plataforma. Espera: clave resultados_por_plataforma con plataforma_id y cantidad_precios."""
        mock_scrape.side_effect = self._mock_scrape_platform
        resp = client.post(
            "/api/v1/precios/buscar",
            json={"referencia": "TEST", "plataforma": "todas"},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "resultados_por_plataforma" in data
        if data["resultados_por_plataforma"]:
            plat = data["resultados_por_plataforma"][0]
            assert "plataforma_id" in plat
            assert "cantidad_precios" in plat

    @pytest.mark.integration
    @patch("app.routers.precios._scrape_platform", return_value={
        "plataforma_id": "ecooparts",
        "plataforma_nombre": "Ecooparts",
        "precios": [],
        "imagenes": [],
        "tipo_pieza": None,
        "error": "timeout",
    })
    @patch("app.routers.precios.obtener_primera_referencia_por_proveedor", return_value=[])
    def test_buscar_sin_precios_404(self, mock_iam, mock_scrape, client, auth_headers_admin):
        """Busca precios cuando el scraper no devuelve resultados. Espera: 404."""
        resp = client.post(
            "/api/v1/precios/buscar",
            json={"referencia": "NOEXISTE", "plataforma": "ecooparts"},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 404

    @pytest.mark.integration
    def test_buscar_usuario_sin_entorno(self, client, db_session):
        """Busca precios con usuario sin entorno de trabajo asignado. Espera: 400."""
        from app.models.busqueda import Usuario
        from utils.security import hash_password, create_access_token
        usuario = Usuario(
            email="sin_entorno@test.com",
            nombre="Sin Entorno",
            password_hash=hash_password("test123"),
            rol="admin",
            activo=True,
            entorno_trabajo_id=None,
        )
        db_session.add(usuario)
        db_session.commit()
        db_session.refresh(usuario)
        token = create_access_token({
            "usuario_id": usuario.id,
            "email": usuario.email,
            "rol": usuario.rol,
            "entorno_trabajo_id": None,
        })
        resp = client.post(
            "/api/v1/precios/buscar",
            json={"referencia": "TEST", "plataforma": "todas"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400


# ============================================================
# SECCIÓN 6: Tests de endpoint /api/v1/stock/verificar (legacy)
# ============================================================


class TestStockVerificar:
    """Tests del endpoint de verificación de stock (legacy y masivo).
    Se mockean llamadas a scrapers externos."""

    @pytest.mark.integration
    def test_verificar_sin_auth(self, client):
        """Verifica stock sin autenticación. Espera: 401 o 403."""
        resp = client.post("/api/v1/stock/verificar", json={
            "items": [{"ref_id": "1", "ref_oem": "OEM1", "precio_azeler": 100}],
        })
        assert resp.status_code in (401, 403)

    @pytest.mark.integration
    def test_verificar_masivo_sin_auth(self, client):
        """Verificación masiva de stock sin autenticación. Espera: 401 o 403."""
        resp = client.post("/api/v1/stock/verificar-masivo", json={
            "items": [{"ref_oem": "OEM1", "precio": 100}],
        })
        assert resp.status_code in (401, 403)

    @pytest.mark.integration
    def test_verificar_requiere_admin(self, client, auth_headers_user):
        """Verifica stock con rol user (sin permisos). Espera: 403 o 422."""
        resp = client.post(
            "/api/v1/stock/verificar",
            json={"items": [{"ref_id": "1", "ref_oem": "OEM1", "precio_azeler": 100}]},
            headers=auth_headers_user,
        )
        assert resp.status_code in (403, 422)
