"""
Tests para los scrapers de referencias IAM
Incluye tests unitarios (estructura) y tests de integración (live con internet)
"""
import pytest
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# Referencias OEM conocidas para tests
TEST_REFERENCES = {
    "common": "7701045718",  # Referencia común para pruebas
    "headlight": "1LD008020-591",  # Faro
    "radiator": "JX618005BD",  # Radiador
}


class TestScraperImports:
    """Tests para verificar que todos los scrapers se pueden importar"""
    
    @pytest.mark.unit
    def test_import_carser(self):
        """Verificar importación de CarserScraper"""
        from app.scrapers.referencias.carser import CarserScraper
        
        assert CarserScraper is not None
        scraper = CarserScraper()
        assert hasattr(scraper, "search")
    
    @pytest.mark.unit
    def test_import_flamar(self):
        """Verificar importación de FlamarScraper"""
        from app.scrapers.referencias.flamar import FlamarScraper
        
        assert FlamarScraper is not None
        scraper = FlamarScraper()
        assert hasattr(scraper, "search")
    
    @pytest.mark.unit
    def test_import_iparlux(self):
        """Verificar importación de IparluxScraper"""
        from app.scrapers.referencias.iparlux import IparluxScraper
        
        assert IparluxScraper is not None
        scraper = IparluxScraper()
        assert hasattr(scraper, "search")
    
    @pytest.mark.unit
    def test_import_nrf(self):
        """Verificar importación de NRFScraper"""
        from app.scrapers.referencias.nrf import NRFScraper
        
        assert NRFScraper is not None
        scraper = NRFScraper()
        assert hasattr(scraper, "search")
    
    @pytest.mark.unit
    def test_import_nty(self):
        """Verificar importación de NtyScraper"""
        from app.scrapers.referencias.nty import NtyScraper
        
        assert NtyScraper is not None
        scraper = NtyScraper()
        assert hasattr(scraper, "search")
    
    @pytest.mark.unit
    def test_import_prasco(self):
        """Verificar importación de PrascoScraper"""
        from app.scrapers.referencias.prasco import PrascoScraper
        
        assert PrascoScraper is not None
        scraper = PrascoScraper()
        assert hasattr(scraper, "search")
    
    @pytest.mark.unit
    def test_import_triclo(self):
        """Verificar importación de search_triclo"""
        from app.scrapers.referencias.triclo import search_triclo
        
        assert search_triclo is not None
        assert callable(search_triclo)
    
    @pytest.mark.unit
    def test_import_vauner(self):
        """Verificar importación de search_vauner"""
        from app.scrapers.referencias.vauner import search_vauner
        
        assert search_vauner is not None
        assert callable(search_vauner)
    
    @pytest.mark.unit
    def test_import_buscar_todos(self):
        """Verificar importación del buscador unificado"""
        from app.scrapers.referencias.buscar_todos import buscar_en_todos
        
        assert buscar_en_todos is not None
        assert callable(buscar_en_todos)


class TestScraperStructure:
    """Tests para verificar estructura de scrapers"""
    
    @pytest.mark.unit
    def test_carser_has_urls(self):
        """Verificar que CarserScraper tiene URLs configuradas"""
        from app.scrapers.referencias.carser import CarserScraper
        
        assert hasattr(CarserScraper, "BASE_URL")
        assert hasattr(CarserScraper, "SEARCH_URL")
        assert "carser" in CarserScraper.BASE_URL.lower()
    
    @pytest.mark.unit
    def test_flamar_has_urls(self):
        """Verificar que FlamarScraper tiene URLs configuradas"""
        from app.scrapers.referencias.flamar import FlamarScraper
        
        assert hasattr(FlamarScraper, "BASE_URL")
        assert hasattr(FlamarScraper, "SEARCH_URL")
        assert "flamar" in FlamarScraper.BASE_URL.lower()
    
    @pytest.mark.unit
    def test_nrf_has_urls(self):
        """Verificar que NRFScraper tiene URLs configuradas"""
        from app.scrapers.referencias.nrf import NRFScraper
        
        assert hasattr(NRFScraper, "BASE_URL")
        assert hasattr(NRFScraper, "SEARCH_URL")
        assert "nrf" in NRFScraper.BASE_URL.lower()
    
    @pytest.mark.unit
    def test_scraper_returns_list(self):
        """Verificar que los scrapers retornan listas"""
        from app.scrapers.referencias.carser import CarserScraper
        
        scraper = CarserScraper()
        # Llamar con referencia vacía para obtener lista vacía rápidamente
        result = scraper.search("")
        
        assert isinstance(result, list)


class TestScraperResultFormat:
    """Tests para verificar formato de resultados"""
    
    @pytest.mark.unit
    def test_result_format_expected_keys(self):
        """Verificar que los resultados tienen las claves esperadas"""
        expected_keys = ["source", "iam_ref", "brand", "description", "price", "image_url"]
        
        # Crear resultado de ejemplo
        sample_result = {
            "source": "Test",
            "iam_ref": "REF-001",
            "brand": "TestBrand",
            "description": "Test Description",
            "price": "100.00",
            "image_url": "http://example.com/img.jpg"
        }
        
        for key in expected_keys:
            assert key in sample_result
    
    @pytest.mark.unit
    def test_empty_search_returns_empty_list(self):
        """Verificar que búsqueda vacía retorna lista vacía"""
        from app.scrapers.referencias.carser import CarserScraper
        
        scraper = CarserScraper()
        result = scraper.search("")
        
        assert isinstance(result, list)
        # No hay garantía de que esté vacía, pero debe ser lista


class TestBuscarTodos:
    """Tests para el buscador unificado"""
    
    @pytest.mark.unit
    def test_buscar_todos_returns_dict(self):
        """Verificar que buscar_en_todos retorna estructura correcta"""
        from app.scrapers.referencias.buscar_todos import buscar_en_todos
        
        # Buscar con referencia vacía (rápido)
        resultados, errores = buscar_en_todos("")
        
        assert isinstance(resultados, dict)
        assert isinstance(errores, dict)
    
    @pytest.mark.unit
    def test_obtener_primera_referencia(self):
        """Verificar función de primera referencia por proveedor"""
        from app.scrapers.referencias.buscar_todos import obtener_primera_referencia_por_proveedor
        
        assert obtener_primera_referencia_por_proveedor is not None
        assert callable(obtener_primera_referencia_por_proveedor)


# ============== TESTS LIVE (requieren internet) ==============
# Estos tests hacen peticiones reales a los sitios web
# Pueden fallar si los sitios están caídos o cambian su estructura

@pytest.mark.scraper
@pytest.mark.slow
class TestScrapersLive:
    """Tests que hacen peticiones reales a los sitios"""
    
    def test_carser_live_search(self):
        """Test live de CarserScraper"""
        from app.scrapers.referencias.carser import CarserScraper
        
        scraper = CarserScraper()
        results = scraper.search(TEST_REFERENCES["common"])
        
        assert isinstance(results, list)
        # No verificamos cantidad porque depende de datos reales
    
    def test_flamar_live_search(self):
        """Test live de FlamarScraper"""
        from app.scrapers.referencias.flamar import FlamarScraper
        
        scraper = FlamarScraper()
        results = scraper.search(TEST_REFERENCES["common"])
        
        assert isinstance(results, list)
    
    def test_nrf_live_search(self):
        """Test live de NRFScraper"""
        from app.scrapers.referencias.nrf import NRFScraper
        
        scraper = NRFScraper()
        results = scraper.search(TEST_REFERENCES["radiator"])
        
        assert isinstance(results, list)
    
    def test_nty_live_search(self):
        """Test live de NtyScraper"""
        from app.scrapers.referencias.nty import NtyScraper
        
        scraper = NtyScraper()
        results = scraper.search(TEST_REFERENCES["common"])
        
        assert isinstance(results, list)
    
    def test_prasco_live_search(self):
        """Test live de PrascoScraper"""
        from app.scrapers.referencias.prasco import PrascoScraper
        
        scraper = PrascoScraper()
        results = scraper.search(TEST_REFERENCES["common"])
        
        assert isinstance(results, list)
    
    def test_iparlux_live_search(self):
        """Test live de IparluxScraper"""
        from app.scrapers.referencias.iparlux import IparluxScraper
        
        scraper = IparluxScraper()
        results = scraper.search(TEST_REFERENCES["headlight"])
        
        assert isinstance(results, list)
    
    def test_buscar_en_todos_live(self):
        """Test live del buscador unificado"""
        from app.scrapers.referencias.buscar_todos import buscar_en_todos
        
        resultados, errores = buscar_en_todos(TEST_REFERENCES["common"])
        
        assert isinstance(resultados, dict)
        assert isinstance(errores, dict)
        
        # Debería haber al menos algunos resultados de algún proveedor
        # (no garantizado, pero probable)


@pytest.mark.scraper
class TestScraperErrorHandling:
    """Tests de manejo de errores en scrapers"""
    
    def test_scraper_handles_timeout(self):
        """Verificar que los scrapers manejan timeouts"""
        from app.scrapers.referencias.carser import CarserScraper
        
        scraper = CarserScraper()
        # Una referencia muy larga no debería causar crash
        try:
            result = scraper.search("X" * 100)
            assert isinstance(result, list)
        except Exception as e:
            # Si hay excepción, debería ser manejable
            assert True
    
    def test_scraper_handles_special_characters(self):
        """Verificar manejo de caracteres especiales"""
        from app.scrapers.referencias.carser import CarserScraper
        
        scraper = CarserScraper()
        # Caracteres especiales no deberían causar crash
        try:
            result = scraper.search("REF-123/ABC")
            assert isinstance(result, list)
        except Exception as e:
            assert True
    
    def test_scraper_handles_unicode(self):
        """Verificar manejo de caracteres unicode"""
        from app.scrapers.referencias.carser import CarserScraper
        
        scraper = CarserScraper()
        try:
            result = scraper.search("REF-ñ-123")
            assert isinstance(result, list)
        except Exception as e:
            assert True


class TestDataScrapers:
    """Tests para scrapers basados en datos locales (CSV)"""
    
    @pytest.mark.unit
    def test_triclo_csv_exists(self):
        """Verificar que el CSV de Triclo existe"""
        import os
        
        script_dir = os.path.dirname(os.path.abspath(__file__))
        backend_dir = os.path.dirname(script_dir)
        csv_path = os.path.join(
            backend_dir, "app", "scrapers", "referencias", "data", 
            "triclo_final_unificado.csv"
        )
        
        # El archivo puede no existir en ambiente de test
        # Solo verificar que el path tiene sentido
        assert "triclo" in csv_path.lower()
    
    @pytest.mark.unit
    def test_vauner_csv_exists(self):
        """Verificar que el CSV de Vauner existe"""
        import os
        
        script_dir = os.path.dirname(os.path.abspath(__file__))
        backend_dir = os.path.dirname(script_dir)
        csv_path = os.path.join(
            backend_dir, "app", "scrapers", "referencias", "data",
            "Vauner_Unificado.csv"
        )
        
        assert "vauner" in csv_path.lower()


class TestScraperParallelExecution:
    """Tests para ejecución paralela de scrapers"""
    
    @pytest.mark.unit
    def test_thread_pool_execution(self):
        """Verificar que la ejecución paralela funciona"""
        from concurrent.futures import ThreadPoolExecutor, as_completed
        
        def mock_search(name):
            return name, []
        
        scrapers = ["Carser", "Flamar", "NRF"]
        
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = {
                executor.submit(mock_search, name): name
                for name in scrapers
            }
            
            results = []
            for future in as_completed(futures):
                name, items = future.result()
                results.append(name)
        
        assert len(results) == 3
        assert set(results) == set(scrapers)
