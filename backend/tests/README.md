# Tests de DesguaPro API

Este directorio contiene todos los tests automatizados para la API de DesguaPro.

## Estructura

```
tests/
├── conftest.py          # Fixtures compartidos y configuración de pytest
├── test_config.py       # Tests de configuración (Settings)
├── test_database.py     # Tests de conexión y operaciones de BD
├── test_models.py       # Tests de modelos SQLAlchemy
├── test_auth.py         # Tests de autenticación y seguridad
├── test_fichadas.py     # Tests del sistema de fichadas
├── test_desguace.py     # Tests de la base de datos de desguace
└── test_scrapers.py     # Tests de scrapers de referencias IAM
```

## Instalación

```bash
# Instalar dependencias de testing
pip install pytest pytest-asyncio pytest-cov
```

## Ejecución

### Usando el script Python (multiplataforma)

```bash
# Todos los tests
python run_tests.py

# Solo tests unitarios
python run_tests.py --unit

# Solo tests de API
python run_tests.py --api

# Solo tests de scrapers
python run_tests.py --scraper

# Excluir tests lentos
python run_tests.py --fast

# Con cobertura de código
python run_tests.py --coverage

# Un archivo específico
python run_tests.py -f tests/test_auth.py
```

### Usando PowerShell (Windows)

```powershell
# Todos los tests
.\run_tests.ps1

# Solo tests unitarios
.\run_tests.ps1 -Unit

# Solo tests de API
.\run_tests.ps1 -Api

# Con cobertura
.\run_tests.ps1 -Coverage
```

### Usando pytest directamente

```bash
# Todos los tests
pytest tests/ -v

# Por marcador
pytest tests/ -m "unit" -v
pytest tests/ -m "api" -v
pytest tests/ -m "scraper" -v
pytest tests/ -m "not slow" -v

# Con cobertura
pytest tests/ --cov=app --cov-report=html
```

## Marcadores

Los tests usan los siguientes marcadores:

- `@pytest.mark.unit` - Tests unitarios sin dependencias externas
- `@pytest.mark.integration` - Tests que usan la base de datos
- `@pytest.mark.api` - Tests de endpoints de API
- `@pytest.mark.scraper` - Tests de scrapers
- `@pytest.mark.slow` - Tests lentos (ej: scrapers live)

## Fixtures

Los fixtures principales están en `conftest.py`:

- `db_session` - Sesión de base de datos limpia para cada test
- `client` - Cliente de pruebas FastAPI
- `entorno_trabajo` - Entorno de trabajo de prueba
- `usuario_admin` - Usuario admin de prueba
- `usuario_normal` - Usuario normal de prueba
- `token_admin` / `token_usuario` - Tokens JWT válidos
- `auth_headers_admin` / `auth_headers_user` - Headers con autenticación
- `fichada_ejemplo` - Fichada de prueba
- `base_desguace_ejemplo` - Base de desguace de prueba
- `piezas_desguace` - Lista de piezas de prueba

## Base de Datos de Tests

Los tests usan SQLite en memoria (`:memory:`) para:
- Aislar tests entre sí
- Ejecución rápida
- No afectar la base de datos de desarrollo

## Cobertura de Código

Para generar reportes de cobertura:

```bash
python run_tests.py --coverage
```

El reporte HTML se genera en `htmlcov/index.html`.

## Notas

### Tests de Scrapers

Los tests de scrapers están divididos en:

1. **Tests unitarios** - Verifican estructura e imports
2. **Tests live** - Hacen peticiones reales (marcados como `slow`)

Los tests live pueden fallar si:
- No hay conexión a internet
- Los sitios web están caídos
- Los sitios cambiaron su estructura HTML

Para ejecutar solo tests unitarios de scrapers:
```bash
pytest tests/test_scrapers.py -m "unit" -v
```

### Añadir Nuevos Tests

1. Crear archivo `test_*.py` en `tests/`
2. Usar fixtures de `conftest.py`
3. Marcar tests apropiadamente (`@pytest.mark.unit`, etc.)
4. Usar nombres descriptivos (`test_descripcion_comportamiento`)
