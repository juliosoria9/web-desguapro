# DesguaPro - Documentación Completa del Proyecto

## 📋 Descripción General

**DesguaPro** es una aplicación web completa para la gestión de piezas de desguace de automóviles. Permite a los desguaces gestionar su inventario, buscar precios de mercado, controlar stock, registrar ventas y administrar usuarios con diferentes niveles de acceso.

---

## 🏗️ Arquitectura del Sistema

### Stack Tecnológico

| Componente | Tecnología | Versión |
|------------|------------|---------|
| **Backend** | FastAPI (Python) | 0.109.0 |
| **Frontend** | Next.js (React + TypeScript) | 14.x |
| **Base de Datos** | SQLite (SQLAlchemy ORM) | - |
| **Autenticación** | JWT + Cookies HTTPOnly | - |
| **Estado Frontend** | Zustand | 4.4.x |
| **Estilos** | Tailwind CSS | 3.4.x |
| **HTTP Client** | Axios | 1.6.x |

### Estructura de Carpetas

```
web-desguapro/
├── backend/                    # API FastAPI
│   ├── app/
│   │   ├── main.py            # Punto de entrada de la API
│   │   ├── config.py          # Configuración (env vars)
│   │   ├── database.py        # Conexión SQLAlchemy
│   │   ├── dependencies.py    # Dependencias FastAPI
│   │   ├── models/            # Modelos SQLAlchemy
│   │   │   └── busqueda.py    # TODOS los modelos de BD
│   │   ├── routers/           # Endpoints API
│   │   │   ├── auth.py        # Autenticación y usuarios
│   │   │   ├── admin.py       # Panel de administración
│   │   │   ├── stock.py       # Gestión de stock
│   │   │   ├── precios.py     # Búsqueda de precios
│   │   │   ├── referencias.py # Referencias OEM
│   │   │   ├── fichadas.py    # Registro de fichadas
│   │   │   ├── desguace.py    # Base de datos desguace
│   │   │   ├── piezas.py      # Gestión de piezas
│   │   │   ├── ebay.py        # Integración eBay
│   │   │   └── ...
│   │   └── schemas/           # Schemas Pydantic
│   ├── core/
│   │   ├── base_scraper.py    # Clase base para scrapers
│   │   └── scrapers/          # Scrapers de plataformas
│   │       ├── ebay_scraper.py
│   │       ├── ecooparts_scraper.py
│   │       ├── recambioverde_scraper.py
│   │       ├── opisto_scraper.py
│   │       └── ...
│   ├── services/
│   │   ├── audit.py           # Auditoría de acciones
│   │   ├── backup.py          # Backups automáticos
│   │   ├── scheduler.py       # Tareas programadas
│   │   └── precio_sugerido.py # Cálculo de precios
│   └── utils/
│       ├── security.py        # Hashing passwords
│       └── encoding.py        # Utilidades de codificación
│
├── frontend/                   # Next.js App
│   ├── pages/
│   │   ├── index.tsx          # Página inicial (redirect)
│   │   ├── login.tsx          # Login
│   │   ├── dashboard.tsx      # Panel principal
│   │   ├── search.tsx         # Búsqueda de precios
│   │   ├── stock.tsx          # Verificar stock
│   │   ├── piezas-nuevas.tsx  # Gestión piezas nuevas
│   │   ├── fichadas.tsx       # Registro de fichadas
│   │   ├── referencias.tsx    # Buscar referencias
│   │   ├── escaner.tsx        # Escanear códigos
│   │   └── admin/             # Panel administración
│   │       ├── stock.tsx      # Ver todo el stock
│   │       ├── ventas.tsx     # Historial ventas
│   │       ├── users.tsx      # Gestión usuarios
│   │       ├── environments.tsx # Entornos de trabajo
│   │       ├── logs.tsx       # Logs de auditoría
│   │       └── sistema.tsx    # Info del sistema
│   ├── lib/
│   │   ├── api-client.ts      # Cliente Axios configurado
│   │   ├── auth-store.ts      # Estado de autenticación (Zustand)
│   │   └── store.ts           # Estado global
│   ├── components/
│   │   ├── FormBuscar.tsx     # Formulario de búsqueda
│   │   ├── ProtectedRoute.tsx # HOC para rutas protegidas
│   │   └── ResumenPrecios.tsx # Componente de resumen
│   └── styles/
│       └── globals.css        # Estilos globales + Tailwind
│
└── docs/                       # Documentación
    ├── PROJECT_DESCRIPTION.md  # Este archivo
    └── CHANGELOG.md            # Historial de cambios
```

---

## 🗄️ Modelos de Base de Datos

### Usuarios y Autenticación

#### `Usuario`
```python
- id: Integer (PK)
- email: String(100) - Nombre de usuario (campo legacy)
- nombre: String(100) - Nombre para mostrar
- password_hash: String(255) - Hash bcrypt
- password_plain: String(255) - Contraseña en texto plano (solo para admin)
- rol: String(20) - "sysowner", "owner", "admin", "user"
- activo: Boolean
- entorno_trabajo_id: FK -> EntornoTrabajo
- fecha_creacion: DateTime
- fecha_ultimo_acceso: DateTime
```

#### `EntornoTrabajo`
Aislamiento de datos por empresa/desguace.
```python
- id: Integer (PK)
- nombre: String(100) - Nombre único del entorno
- descripcion: String(255)
- owner_id: FK -> Usuario
- activo: Boolean
- fecha_creacion: DateTime
```

### Roles de Usuario

| Rol | Descripción | Permisos |
|-----|-------------|----------|
| `sysowner` | Propietario del sistema | Acceso total, gestiona todos los entornos |
| `owner` | Propietario de empresa | Gestiona su entorno y usuarios |
| `admin` | Administrador | Gestiona usuarios de su entorno |
| `user` | Usuario normal | Operaciones básicas |

### Stock y Piezas

#### `BaseDesguace`
Representa el archivo CSV de inventario de un desguace.
```python
- id: Integer (PK)
- entorno_trabajo_id: FK (único por entorno)
- nombre_archivo: String(255)
- total_piezas: Integer
- columnas: String(1000) - Columnas CSV
- mapeo_columnas: String(2000) - JSON de mapeo
- subido_por_id: FK -> Usuario
- fecha_subida: DateTime
```

#### `PiezaDesguace`
Cada pieza del inventario.
```python
- id: Integer (PK)
- base_desguace_id: FK -> BaseDesguace
- refid: String(100) - Referencia interna (index)
- oem: String(100) - Referencia OEM (index)
- oe: String(100) - Referencia OE
- iam: String(100) - Referencia IAM
- precio: Float
- ubicacion: String(100)
- observaciones: String(500)
- articulo: String(255) - Nombre del artículo
- marca: String(100)
- modelo: String(100)
- version: String(100)
- imagen: String(500) - URLs separadas por coma
```

#### `PiezaVendida`
Historial de piezas vendidas (detectadas al actualizar base).
```python
- Campos similares a PiezaDesguace
- fecha_venta: DateTime
- archivo_origen: String(255)
```

### Fichadas

#### `FichadaPieza`
Registro de piezas fichadas por usuarios.
```python
- id: Integer (PK)
- usuario_id: FK -> Usuario
- entorno_trabajo_id: FK
- id_pieza: String(100) - ID fichado
- descripcion: String(500)
- comentario: String(500)
- fecha_fichada: DateTime
```

### Configuración de Precios

#### `ConfiguracionPrecios`
Configuración de precios por familia para cada desguace.
```python
- id: Integer (PK)
- entorno_trabajo_id: FK (único)
- pieza_familia_archivo: String
- familia_precios_archivo: String
```

#### `PiezaFamiliaDesguace`
Mapeo pieza -> familia.
```python
- pieza: String(255) - Ej: "ALTERNADOR"
- familia: String(255) - Ej: "ALTERNADORES"
```

#### `FamiliaPreciosDesguace`
Precios por familia.
```python
- familia: String(255)
- precios: String(1000) - "18,28,48,88,148"
```

### Auditoría y Backups

#### `AuditLog`
```python
- accion: String(50) - LOGIN, CREATE, UPDATE, DELETE, etc.
- entidad: String(50) - usuario, fichada, busqueda
- descripcion: String(500)
- ip_address: String(45)
- user_agent: String(255)
- fecha: DateTime
```

#### `BackupRecord`
```python
- filename: String(255)
- filepath: String(500)
- size_bytes: Integer
- tipo: String(20) - manual, automatico
- exitoso: Boolean
```

### Otros Modelos

- `Busqueda` - Historial de búsquedas de precios
- `ResultadoStock` - Checkeos de stock
- `TokenToen` - Tokens de plataformas externas
- `CSVGuardado` - CSVs subidos para verificación
- `PiezaPedida` - Piezas marcadas como pedidas

---

## 🔌 API Endpoints

### Autenticación (`/api/v1/auth`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/login` | Login con email/password |
| POST | `/logout` | Cerrar sesión |
| GET | `/me` | Obtener usuario actual |
| GET | `/users` | Listar usuarios (admin) |
| POST | `/users` | Crear usuario |
| PUT | `/users/{id}` | Actualizar usuario |
| DELETE | `/users/{id}` | Eliminar usuario |

### Precios (`/api/v1/precios`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/buscar` | Buscar precios por referencia |
| GET | `/plataformas` | Listar plataformas disponibles |

### Stock (`/api/v1/stock`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/verificar` | Verificar stock vs CSV |
| GET | `/piezas` | Obtener piezas del inventario |

### Desguace (`/api/v1/desguace`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/subir-base` | Subir CSV de inventario |
| GET | `/resumen` | Obtener resumen de la base |
| GET | `/piezas` | Listar piezas con paginación |
| PUT | `/piezas/{id}` | Actualizar pieza |
| DELETE | `/piezas/{id}` | Eliminar pieza |

### Fichadas (`/api/v1/fichadas`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/` | Registrar fichada |
| GET | `/` | Listar fichadas |
| DELETE | `/{id}` | Eliminar fichada |
| POST | `/verificar` | Verificar fichadas contra stock |

### Piezas (`/api/v1/piezas`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/pedidas` | Listar piezas pedidas |
| POST | `/pedidas` | Marcar pieza como pedida |
| DELETE | `/pedidas/{ref}` | Desmarcar pieza |

### Admin (`/api/v1`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/entornos` | Listar entornos |
| POST | `/entornos` | Crear entorno |
| GET | `/audit-logs` | Ver logs de auditoría |
| GET | `/backups` | Listar backups |
| POST | `/backups/crear` | Crear backup manual |

### eBay (`/api/v1/ebay`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/account-deletion` | Verificación de endpoint |
| POST | `/account-deletion` | Notificaciones de eBay |

---

## 🔐 Sistema de Autenticación

### Flujo de Login
1. Usuario envía `POST /auth/login` con `{email, password}`
2. Backend valida credenciales contra hash bcrypt
3. Si es válido:
   - Genera JWT token
   - Establece cookie HTTPOnly `access_token`
   - Retorna datos de usuario
4. Frontend guarda usuario en localStorage y Zustand

### Tokens JWT
- **Algoritmo**: HS256
- **Expiración**: Configurable
- **Payload**: `{sub: user_id, email, rol, entorno_trabajo_id}`

### Cookies HTTPOnly
- Cookie `access_token` para seguridad XSS
- `withCredentials: true` en axios

---

## 🕷️ Scrapers de Plataformas

### Plataformas Soportadas
| Plataforma | Archivo | Método |
|------------|---------|--------|
| eBay | `ebay_scraper.py` | API oficial (Browse API) |
| Ecooparts | `ecooparts_scraper.py` | Scraping HTML |
| RecambioVerde | `recambioverde_scraper.py` | Scraping HTML |
| Opisto | `opisto_scraper.py` | Scraping HTML |
| B-Parts | `bparts_scraper.py` | Scraping HTML |
| Ovoko | `ovoko_scraper.py` | Scraping HTML |
| Partsss | `partsss_scraper.py` | Scraping HTML |

### Clase Base
```python
class PlatformScraper:
    def setup_session(reference: str) -> bool
    def is_available() -> bool
    def fetch_prices(reference: str, limit: int) -> List[float]
    def fetch_prices_with_images(reference: str, limit: int) -> Tuple[List[float], List[str]]
```

### eBay API
- Usa OAuth2 Client Credentials Grant
- Requiere `EBAY_APP_ID` y `EBAY_CERT_ID` en `.env`
- Cache de token con expiración

---

## 📱 Páginas del Frontend

### Públicas
- `/login` - Formulario de login

### Usuario Normal
- `/dashboard` - Panel principal con accesos rápidos
- `/search` - Búsqueda de precios por OEM
- `/stock` - Verificar stock personal
- `/fichadas` - Registrar/ver fichadas
- `/referencias` - Buscar referencias cruzadas
- `/escaner` - Escanear códigos de barras

### Administración
- `/piezas-nuevas` - Gestión de piezas nuevas (verificación CSV)
- `/configuracion-precios` - Configurar precios por familia
- `/admin/stock` - Ver todo el inventario
- `/admin/ventas` - Historial de ventas
- `/admin/users` - Gestión de usuarios
- `/admin/environments` - Gestión de entornos
- `/admin/logs` - Logs de auditoría
- `/admin/sistema` - Información del sistema

---

## ⚙️ Configuración

### Variables de Entorno Backend (`.env`)
```env
SECRET_KEY=clave-secreta-produccion
DATABASE_URL=sqlite:///./desguapro.db
DEBUG=false

# eBay API
EBAY_APP_ID=tu-client-id
EBAY_CERT_ID=tu-client-secret
EBAY_SANDBOX=false
```

### Variables de Entorno Frontend (`.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

---

## 🚀 Despliegue

### VPS Actual
- **IP**: 72.61.98.80
- **Usuario**: root
- **Ruta**: `/var/www/motocoche`
- **Servicios**: systemd (`motocoche-backend.service`, `motocoche-frontend.service`)

### Comandos de Despliegue
```bash
# Conectar a VPS
ssh root@72.61.98.80

# Actualizar código
cd /var/www/motocoche
git pull origin main

# Reiniciar servicios
systemctl restart motocoche-backend
systemctl restart motocoche-frontend
```

---

## 📝 Convenciones de Código

### Backend
- **Modelos**: Definidos en `app/models/busqueda.py`
- **Fechas**: Usar `now_spain_naive()` para timezone España
- **Logging**: `logger = logging.getLogger(__name__)`

### Frontend
- **Estado**: Zustand para autenticación, props para componentes
- **API**: Axios con interceptores para 401
- **Estilos**: Tailwind CSS, clases inline

---

## 🔧 Funcionalidades Especiales

### Burbuja de Conteo por OEM
En las páginas de stock (`admin/stock.tsx`, `piezas-nuevas.tsx`), cada pieza muestra una burbuja azul sobre la imagen con el **número de piezas que comparten el mismo OEM**.

### Backups Automáticos
- Scheduler con APScheduler
- Backups diarios automáticos
- Limpieza de backups antiguos

### Auditoría
- Registro automático de acciones importantes
- Logs de login/logout
- Historial de cambios en entidades

### Detección de Ventas
Al actualizar la base de datos, las piezas que desaparecen se registran automáticamente en `PiezaVendida`.

---

## 📊 Flujos Principales

### Flujo de Búsqueda de Precios
1. Usuario introduce referencia OEM
2. Backend ejecuta scrapers en paralelo
3. Se calculan estadísticas (media, mediana, min, max)
4. Se guarda registro en `Busqueda`
5. Frontend muestra resultados con gráficos

### Flujo de Verificación de Stock
1. Usuario sube CSV con piezas a verificar
2. Backend compara contra `PiezaDesguace`
3. Clasifica piezas: en stock, a comprar, nuevas
4. Muestra resumen y permite exportar

### Flujo de Fichadas
1. Usuario escanea/introduce ID de pieza
2. Se crea registro en `FichadaPieza`
3. Opcionalmente se verifica contra stock
4. Se genera informe de verificación

---

*Última actualización: 31 de enero de 2026*
