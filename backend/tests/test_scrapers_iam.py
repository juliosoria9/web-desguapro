"""
Tests para scrapers de referencias IAM (equivalencias OEM → IAM).
Verifica los scrapers individuales (Carser, Flamar, Iparlux, NRF, NTY,
Prasco, Triclo, Vauner), el orquestador buscar_en_todos y los endpoints
/api/v1/referencias/buscar y /rapidas.
"""
import pytest
import os
from unittest.mock import patch, MagicMock


SCRAPERS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "app", "scrapers", "referencias",
)
DATA_DIR = os.path.join(SCRAPERS_DIR, "data")


# ============================================================
# SECCIÓN 1: Importación de scrapers IAM
# ============================================================


class TestImportScrapersIAM:
    """Verifica que todos los módulos de scrapers se importan correctamente"""

    @pytest.mark.unit
    def test_import_carser(self):
        """Importa el módulo CarserScraper. Espera: importación exitosa."""
        from app.scrapers.referencias.carser import CarserScraper
        assert CarserScraper is not None

    @pytest.mark.unit
    def test_import_flamar(self):
        """Importa el módulo FlamarScraper. Espera: importación exitosa."""
        from app.scrapers.referencias.flamar import FlamarScraper
        assert FlamarScraper is not None

    @pytest.mark.unit
    def test_import_iparlux(self):
        """Importa el módulo IparluxScraper. Espera: importación exitosa."""
        from app.scrapers.referencias.iparlux import IparluxScraper
        assert IparluxScraper is not None

    @pytest.mark.unit
    def test_import_nrf(self):
        """Importa el módulo NRFScraper. Espera: importación exitosa."""
        from app.scrapers.referencias.nrf import NRFScraper
        assert NRFScraper is not None

    @pytest.mark.unit
    def test_import_nty(self):
        """Importa el módulo NtyScraper. Espera: importación exitosa."""
        from app.scrapers.referencias.nty import NtyScraper
        assert NtyScraper is not None

    @pytest.mark.unit
    def test_import_prasco(self):
        """Importa el módulo PrascoScraper. Espera: importación exitosa."""
        from app.scrapers.referencias.prasco import PrascoScraper
        assert PrascoScraper is not None

    @pytest.mark.unit
    def test_import_triclo(self):
        """Importa la función search_triclo. Espera: función callable."""
        from app.scrapers.referencias.triclo import search_triclo
        assert callable(search_triclo)

    @pytest.mark.unit
    def test_import_vauner(self):
        """Importa la función search_vauner. Espera: función callable."""
        from app.scrapers.referencias.vauner import search_vauner
        assert callable(search_vauner)

    @pytest.mark.unit
    def test_import_buscar_todos(self):
        """Importa el orquestador buscar_en_todos. Espera: función callable."""
        from app.scrapers.referencias.buscar_todos import buscar_en_todos
        assert callable(buscar_en_todos)

    @pytest.mark.unit
    def test_import_obtener_primera_referencia(self):
        """Importa obtener_primera_referencia_por_proveedor. Espera: función callable."""
        from app.scrapers.referencias.buscar_todos import obtener_primera_referencia_por_proveedor
        assert callable(obtener_primera_referencia_por_proveedor)


# ============================================================
# SECCIÓN 2: Estructura de scrapers web (tienen método search)
# ============================================================


class TestEstructuraScrapersWeb:
    """Cada scraper web debe tener .search(oem_ref) y URLs de base"""

    @pytest.mark.unit
    def test_carser_tiene_search(self):
        """Verifica que CarserScraper tiene método search y URL base. Espera: atributos presentes."""
        from app.scrapers.referencias.carser import CarserScraper
        s = CarserScraper()
        assert hasattr(s, "search")
        assert hasattr(s, "BASE_URL") or hasattr(s, "SEARCH_URL")

    @pytest.mark.unit
    def test_flamar_tiene_search(self):
        """Verifica que FlamarScraper tiene método search. Espera: atributo search presente."""
        from app.scrapers.referencias.flamar import FlamarScraper
        s = FlamarScraper()
        assert hasattr(s, "search")

    @pytest.mark.unit
    def test_iparlux_tiene_search(self):
        """Verifica que IparluxScraper tiene método search. Espera: atributo search presente."""
        from app.scrapers.referencias.iparlux import IparluxScraper
        s = IparluxScraper()
        assert hasattr(s, "search")

    @pytest.mark.unit
    def test_nrf_tiene_search(self):
        """Verifica que NRFScraper tiene método search. Espera: atributo search presente."""
        from app.scrapers.referencias.nrf import NRFScraper
        s = NRFScraper()
        assert hasattr(s, "search")

    @pytest.mark.unit
    def test_nty_tiene_search(self):
        """Verifica que NtyScraper tiene método search. Espera: atributo search presente."""
        from app.scrapers.referencias.nty import NtyScraper
        s = NtyScraper()
        assert hasattr(s, "search")

    @pytest.mark.unit
    def test_prasco_tiene_search(self):
        """Verifica que PrascoScraper tiene método search. Espera: atributo search presente."""
        from app.scrapers.referencias.prasco import PrascoScraper
        s = PrascoScraper()
        assert hasattr(s, "search")


# ============================================================
# SECCIÓN 3: Scrapers CSV locales (Triclo, Vauner)
# ============================================================


class TestScrapersCSVLocales:
    """Tests de los scrapers que buscan en CSV local"""

    @pytest.mark.unit
    def test_triclo_csv_existe(self):
        """Comprueba que el archivo CSV de Triclo existe en disco. Espera: archivo encontrado."""
        csv_path = os.path.join(DATA_DIR, "triclo_final_unificado.csv")
        assert os.path.exists(csv_path), f"CSV Triclo no encontrado: {csv_path}"

    @pytest.mark.unit
    def test_vauner_csv_existe(self):
        """Comprueba que el archivo CSV de Vauner existe en disco. Espera: archivo encontrado."""
        csv_path = os.path.join(DATA_DIR, "Vauner_Unificado.csv")
        assert os.path.exists(csv_path), f"CSV Vauner no encontrado: {csv_path}"

    @pytest.mark.unit
    def test_triclo_csv_no_existente_retorna_vacio(self):
        """Busca en Triclo con ruta CSV inexistente. Espera: lista vacía sin error."""
        from app.scrapers.referencias.triclo import search_triclo
        result = search_triclo("TEST", csv_path="/ruta/falsa/no_existe.csv")
        assert result == []

    @pytest.mark.unit
    def test_vauner_csv_no_existente_retorna_vacio(self):
        """Busca en Vauner con ruta CSV inexistente. Espera: lista vacía sin error."""
        from app.scrapers.referencias.vauner import search_vauner
        result = search_vauner("TEST", csv_path="/ruta/falsa/no_existe.csv")
        assert result == []

    @pytest.mark.unit
    def test_triclo_formato_resultado(self):
        """Buscar en Triclo CSV real – verificar formato de resultado"""
        from app.scrapers.referencias.triclo import search_triclo
        csv_path = os.path.join(DATA_DIR, "triclo_final_unificado.csv")
        if not os.path.exists(csv_path):
            pytest.skip("CSV Triclo no disponible")
        # Leer primera línea para obtener una referencia real
        import csv as csv_mod
        with open(csv_path, "r", encoding="utf-8-sig") as f:
            reader = csv_mod.DictReader(f)
            primera = next(reader, None)
        if not primera:
            pytest.skip("CSV Triclo vacío")
        oem = str(primera.get("OEM", "")).split(",")[0].strip()
        if not oem or oem.lower() == "nan":
            pytest.skip("No se encontró OEM en primera fila")
        resultados = search_triclo(oem, csv_path)
        if resultados:
            item = resultados[0]
            assert "source" in item
            assert "iam_ref" in item
            assert "brand" in item

    @pytest.mark.unit
    def test_vauner_formato_resultado(self):
        """Buscar en Vauner CSV real – verificar formato de resultado"""
        from app.scrapers.referencias.vauner import search_vauner
        csv_path = os.path.join(DATA_DIR, "Vauner_Unificado.csv")
        if not os.path.exists(csv_path):
            pytest.skip("CSV Vauner no disponible")
        import csv as csv_mod
        with open(csv_path, "r", encoding="utf-8-sig") as f:
            reader = csv_mod.DictReader(f)
            primera = next(reader, None)
        if not primera:
            pytest.skip("CSV Vauner vacío")
        # El OEM puede estar en "OEM" u otra columna
        oem = ""
        for col in ("OEM", "oem", "Oem"):
            oem = str(primera.get(col, "")).split(",")[0].strip()
            if oem and oem.lower() != "nan":
                break
        if not oem or oem.lower() == "nan":
            pytest.skip("No se encontró OEM en primera fila Vauner")
        resultados = search_vauner(oem, csv_path)
        if resultados:
            item = resultados[0]
            assert "source" in item
            assert "iam_ref" in item


# ============================================================
# SECCIÓN 4: Validación de Prasco (filtro 2 letras)
# ============================================================


class TestValidacionPrasco:
    """Tests de la función de validación de referencias Prasco"""

    @pytest.mark.unit
    def test_prasco_ref_valida(self):
        """Valida referencias Prasco con 2 letras iniciales (AD1234, VW9876). Espera: True."""
        from app.scrapers.referencias.buscar_todos import es_referencia_prasco_valida
        assert es_referencia_prasco_valida("AD1234") is True
        assert es_referencia_prasco_valida("VW9876") is True

    @pytest.mark.unit
    def test_prasco_ref_invalida(self):
        """Valida referencias Prasco sin 2 letras iniciales (12345, A1234). Espera: False."""
        from app.scrapers.referencias.buscar_todos import es_referencia_prasco_valida
        assert es_referencia_prasco_valida("12345") is False
        assert es_referencia_prasco_valida("A1234") is False

    @pytest.mark.unit
    def test_prasco_ref_nula_o_na(self):
        """Valida referencias Prasco vacías o N/A. Espera: False en todos los casos."""
        from app.scrapers.referencias.buscar_todos import es_referencia_prasco_valida
        assert es_referencia_prasco_valida("") is False
        assert es_referencia_prasco_valida("N/A") is False
        assert es_referencia_prasco_valida(None) is False


# ============================================================
# SECCIÓN 5: Orquestador buscar_en_todos (con mocks)
# ============================================================


class TestBuscarEnTodos:
    """Tests del orquestador que busca en todos los proveedores en paralelo"""

    @pytest.mark.unit
    def test_ejecutar_busqueda_exito(self):
        """Ejecuta búsqueda individual con scraper mock exitoso. Espera: nombre, items y sin error."""
        from app.scrapers.referencias.buscar_todos import ejecutar_busqueda
        nombre, items, error = ejecutar_busqueda(
            "Test", lambda ref: [{"iam_ref": "T001", "source": "test"}], "OEM123"
        )
        assert nombre == "Test"
        assert len(items) == 1
        assert error is None

    @pytest.mark.unit
    def test_ejecutar_busqueda_error(self):
        """Ejecuta búsqueda cuando el scraper lanza ConnectionError. Espera: items vacío, error capturado."""
        from app.scrapers.referencias.buscar_todos import ejecutar_busqueda
        def falla(ref):
            raise ConnectionError("timeout")
        nombre, items, error = ejecutar_busqueda("Fail", falla, "OEM")
        assert nombre == "Fail"
        assert items == []
        assert error is not None

    @pytest.mark.unit
    @patch("app.scrapers.referencias.buscar_todos.CarserScraper")
    @patch("app.scrapers.referencias.buscar_todos.FlamarScraper")
    @patch("app.scrapers.referencias.buscar_todos.IparluxScraper")
    @patch("app.scrapers.referencias.buscar_todos.NRFScraper")
    @patch("app.scrapers.referencias.buscar_todos.NtyScraper")
    @patch("app.scrapers.referencias.buscar_todos.PrascoScraper")
    @patch("app.scrapers.referencias.buscar_todos.search_triclo", return_value=[])
    @patch("app.scrapers.referencias.buscar_todos.search_vauner", return_value=[])
    def test_buscar_en_todos_sin_resultados(
        self, mock_vauner, mock_triclo, mock_prasco, mock_nty, mock_nrf,
        mock_iparlux, mock_flamar, mock_carser,
    ):
        # Configurar todos los scrapers para retornar vacío
        """Busca en todos los proveedores mockeados sin resultados. Espera: dicts vacíos."""
        for mock_cls in (mock_carser, mock_flamar, mock_iparlux, mock_nrf, mock_nty, mock_prasco):
            mock_cls.return_value.search.return_value = []

        from app.scrapers.referencias.buscar_todos import buscar_en_todos
        resultados, errores = buscar_en_todos("REF_INEXISTENTE_XYZ")
        assert isinstance(resultados, dict)
        assert isinstance(errores, dict)

    @pytest.mark.unit
    @patch("app.scrapers.referencias.buscar_todos.CarserScraper")
    @patch("app.scrapers.referencias.buscar_todos.FlamarScraper")
    @patch("app.scrapers.referencias.buscar_todos.IparluxScraper")
    @patch("app.scrapers.referencias.buscar_todos.NRFScraper")
    @patch("app.scrapers.referencias.buscar_todos.NtyScraper")
    @patch("app.scrapers.referencias.buscar_todos.PrascoScraper")
    @patch("app.scrapers.referencias.buscar_todos.search_triclo", return_value=[{"iam_ref": "T1", "source": "Triclo"}])
    @patch("app.scrapers.referencias.buscar_todos.search_vauner", return_value=[])
    def test_buscar_en_todos_con_resultado_triclo(
        self, mock_vauner, mock_triclo, mock_prasco, mock_nty, mock_nrf,
        mock_iparlux, mock_flamar, mock_carser,
    ):
        """Busca en todos con Triclo retornando 1 resultado. Espera: resultado en clave 'Triclo'."""
        for mock_cls in (mock_carser, mock_flamar, mock_iparlux, mock_nrf, mock_nty, mock_prasco):
            mock_cls.return_value.search.return_value = []

        from app.scrapers.referencias.buscar_todos import buscar_en_todos
        resultados, errores = buscar_en_todos("OEM_TEST")
        assert "Triclo" in resultados
        assert len(resultados["Triclo"]) == 1

    @pytest.mark.unit
    @patch("app.scrapers.referencias.buscar_todos.buscar_en_todos")
    def test_obtener_primera_ref_por_proveedor(self, mock_buscar):
        """Obtiene primera referencia de cada proveedor. Espera: C001 y T001, no C002."""
        mock_buscar.return_value = (
            {
                "Carser": [{"iam_ref": "C001"}, {"iam_ref": "C002"}],
                "Triclo": [{"iam_ref": "T001"}],
            },
            {},
        )
        from app.scrapers.referencias.buscar_todos import obtener_primera_referencia_por_proveedor
        refs = obtener_primera_referencia_por_proveedor("OEM_TEST")
        assert "C001" in refs
        assert "T001" in refs
        assert "C002" not in refs  # Solo la primera

    @pytest.mark.unit
    @patch("app.scrapers.referencias.buscar_todos.buscar_en_todos")
    def test_obtener_primera_ref_elimina_duplicados(self, mock_buscar):
        """Elimina referencias duplicadas entre proveedores. Espera: DUPE1 aparece solo 1 vez."""
        mock_buscar.return_value = (
            {
                "Carser": [{"iam_ref": "DUPE1"}],
                "Triclo": [{"iam_ref": "DUPE1"}],  # misma ref
            },
            {},
        )
        from app.scrapers.referencias.buscar_todos import obtener_primera_referencia_por_proveedor
        refs = obtener_primera_referencia_por_proveedor("OEM_TEST")
        assert refs.count("DUPE1") == 1

    @pytest.mark.unit
    @patch("app.scrapers.referencias.buscar_todos.buscar_en_todos")
    def test_obtener_primera_ref_filtra_na(self, mock_buscar):
        """Filtra referencias con valor N/A. Espera: N/A excluido del resultado."""
        mock_buscar.return_value = (
            {"Carser": [{"iam_ref": "N/A"}]},
            {},
        )
        from app.scrapers.referencias.buscar_todos import obtener_primera_referencia_por_proveedor
        refs = obtener_primera_referencia_por_proveedor("OEM")
        assert "N/A" not in refs

    @pytest.mark.unit
    @patch("app.scrapers.referencias.buscar_todos.buscar_en_todos")
    def test_obtener_primera_ref_prasco_filtra_invalidas(self, mock_buscar):
        """Para Prasco, solo incluye refs que empiezan con 2 letras"""
        mock_buscar.return_value = (
            {"Prasco": [{"iam_ref": "12345"}, {"iam_ref": "AB678"}]},
            {},
        )
        from app.scrapers.referencias.buscar_todos import obtener_primera_referencia_por_proveedor
        refs = obtener_primera_referencia_por_proveedor("OEM")
        assert "12345" not in refs
        assert "AB678" in refs


# ============================================================
# SECCIÓN 6: Endpoints /api/v1/referencias
# ============================================================


class TestReferenciasEndpoint:
    """Tests de los endpoints de búsqueda de referencias IAM"""

    @pytest.mark.integration
    def test_buscar_sin_auth(self, client):
        """Busca referencias IAM sin autenticación. Espera: 401/403."""
        resp = client.post("/api/v1/referencias/buscar", json={"referencia": "TEST"})
        assert resp.status_code in (401, 403)

    @pytest.mark.integration
    def test_rapidas_sin_auth(self, client):
        """Búsqueda rápida de referencias sin auth. Espera: 401/403."""
        resp = client.post("/api/v1/referencias/rapidas", json={"referencia": "TEST"})
        assert resp.status_code in (401, 403)

    @pytest.mark.integration
    @patch("app.routers.referencias.buscar_en_todos", return_value=({}, {}))
    @patch("app.routers.referencias.ScraperFactory")
    def test_buscar_vacio(self, mock_factory, mock_buscar, client, auth_headers_admin):
        """Busca referencia inexistente con mocks. Espera: 200 con total_encontrados=0."""
        mock_scraper = MagicMock()
        mock_scraper.setup_session.return_value = False
        mock_factory.create_scraper.return_value = mock_scraper
        resp = client.post(
            "/api/v1/referencias/buscar",
            json={"referencia": "OEMINEXISTENTE"},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_encontrados"] == 0

    @pytest.mark.integration
    @patch("app.routers.referencias.buscar_en_todos")
    @patch("app.routers.referencias.ScraperFactory")
    def test_buscar_con_resultados(self, mock_factory, mock_buscar, client, auth_headers_admin):
        """Busca referencia con resultados mockeados. Espera: 200 con total=1 y precio_mercado."""
        mock_buscar.return_value = (
            {"Carser": [{"iam_ref": "C001", "source": "Carser", "brand": "Test"}]},
            {},
        )
        mock_scraper = MagicMock()
        mock_scraper.setup_session.return_value = True
        mock_scraper.fetch_prices.return_value = [100.0, 120.0, 110.0]
        mock_factory.create_scraper.return_value = mock_scraper
        resp = client.post(
            "/api/v1/referencias/buscar",
            json={"referencia": "OEM_TEST"},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_encontrados"] == 1
        assert data["proveedores_con_resultados"] == 1
        assert data["precio_mercado"] is not None

    @pytest.mark.integration
    def test_buscar_referencia_vacia(self, client, auth_headers_admin):
        """Busca con referencia vacía. Espera: 400/422."""
        resp = client.post(
            "/api/v1/referencias/buscar",
            json={"referencia": ""},
            headers=auth_headers_admin,
        )
        assert resp.status_code in (400, 422)

    @pytest.mark.integration
    def test_buscar_referencia_corta(self, client, auth_headers_admin):
        """Busca con referencia demasiado corta (2 chars). Espera: 400."""
        resp = client.post(
            "/api/v1/referencias/buscar",
            json={"referencia": "AB"},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 400

    @pytest.mark.integration
    @patch("app.routers.referencias.obtener_primera_referencia_por_proveedor", return_value=["IAM1", "IAM2"])
    def test_rapidas_con_resultados(self, mock_obtener, client, auth_headers_admin):
        """Búsqueda rápida con resultados mockeados. Espera: 200 con 2 referencias IAM."""
        resp = client.post(
            "/api/v1/referencias/rapidas",
            json={"referencia": "OEM_TEST"},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["referencia_oem"] == "OEM_TEST"
        assert len(data["referencias_iam"]) == 2
        assert "IAM1" in data["referencias_texto"]

    @pytest.mark.integration
    @patch("app.routers.referencias.obtener_primera_referencia_por_proveedor", return_value=[])
    def test_rapidas_sin_resultados(self, mock_obtener, client, auth_headers_admin):
        """Búsqueda rápida sin resultados. Espera: 200 con lista vacía."""
        resp = client.post(
            "/api/v1/referencias/rapidas",
            json={"referencia": "NO_EXISTE"},
            headers=auth_headers_admin,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["referencias_iam"] == []
        assert data["referencias_texto"] == ""


# ============================================================
# SECCIÓN 7: Tests de scrapers web con conexión real (marcados @live)
# ============================================================


class TestScrapersLive:
    """Tests que hacen peticiones reales a los servidores.
    Marcados con @pytest.mark.live para poder excluirlos: pytest -m 'not live' """

    @pytest.mark.live
    def test_carser_live(self):
        """Conecta a Carser real con referencia de prueba. Espera: lista (puede estar vacía si servidor no responde)."""
        from app.scrapers.referencias.carser import CarserScraper
        result = CarserScraper().search("1K0959653C")
        # Puede retornar lista vacía si el servidor no responde
        assert isinstance(result, list)

    @pytest.mark.live
    def test_flamar_live(self):
        """Conecta a Flamar real con referencia de prueba. Espera: lista."""
        from app.scrapers.referencias.flamar import FlamarScraper
        result = FlamarScraper().search("1K0959653C")
        assert isinstance(result, list)

    @pytest.mark.live
    def test_nty_live(self):
        """Conecta a NTY real con referencia de prueba. Espera: lista."""
        from app.scrapers.referencias.nty import NtyScraper
        result = NtyScraper().search("1K0959653C")
        assert isinstance(result, list)
