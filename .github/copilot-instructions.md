# Instrucciones para IA - Proyecto DesguaPro (SeintoStock)

> **IMPORTANTE:** Lee este archivo completo antes de hacer cualquier cambio en el proyecto.

## 🎯 Resumen Ejecutivo

**DesguaPro** (también conocido como **SeintoStock**) es una aplicación web para gestión de desguaces de automóviles. Permite:
- Gestionar inventario de piezas de segunda mano
- Buscar precios en plataformas competidoras (scraping)
- Detectar automáticamente piezas vendidas
- Gestionar usuarios y entornos de trabajo multi-tenant
- Control de fichadas de piezas (entrada/verificación)

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  Next.js 14.2.35 | TypeScript | Tailwind CSS | Zustand          │
│  Puerto: 3000                                                    │
│  Directorio: /frontend                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ HTTP/REST
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
│  FastAPI | Python 3.13+ | SQLAlchemy | APScheduler              │
│  Puerto: 8000                                                    │
│  Directorio: /backend                                            │
│  API Base: /api/v1                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BASE DE DATOS                             │
│  SQLite: desguapro.db                                            │
│  ~500,000 piezas | Multi-tenant por entorno_trabajo_id          │
└─────────────────────────────────────────────────────────────────┘
```

## 📁 Estructura de Directorios

```
web-desguapro/
├── backend/
│   ├── app/
│   │   ├── main.py              # Punto de entrada FastAPI
│   │   ├── config.py            # Configuración (env vars)
│   │   ├── database.py          # Conexión SQLAlchemy
│   │   ├── dependencies.py      # Dependencias de inyección
│   │   ├── models/
│   │   │   └── busqueda.py      # TODOS los modelos SQLAlchemy
│   │   ├── routers/
│   │   │   ├── auth.py          # Login, registro, JWT
│   │   │   ├── desguace.py      # Stock, ventas, búsquedas (PRINCIPAL)
│   │   │   ├── fichadas.py      # Control de fichadas
│   │   │   ├── precios.py       # Scraping de precios
│   │   │   ├── admin.py         # Panel de administración
│   │   │   └── ...
│   │   └── schemas/             # Pydantic schemas
│   ├── services/
│   │   ├── csv_auto_import.py   # ⚠️ CRÍTICO: Importación CSV y detección ventas
│   │   ├── scheduler.py         # APScheduler para tareas programadas
│   │   └── pricing.py           # Lógica de precios
│   ├── core/
│   │   └── scrapers/            # Scrapers de precios (Ecooparts, etc.)
│   ├── utils/
│   │   ├── security.py          # Hashing, JWT
│   │   └── encoding.py          # Utilidades de encoding
│   ├── desguapro.db             # Base de datos SQLite
│   └── requirements.txt
│
├── frontend/
│   ├── pages/
│   │   ├── index.tsx            # Landing
│   │   ├── login.tsx            # Login con texto promocional
│   │   ├── dashboard.tsx        # Dashboard principal
│   │   ├── stock.tsx            # Gestión de stock
│   │   ├── fichadas.tsx         # Control de fichadas
│   │   ├── referencias.tsx      # Búsqueda de referencias
│   │   └── admin/
│   │       ├── stock.tsx        # Admin stock (con contador OEM)
│   │       ├── ventas.tsx       # Historial de ventas
│   │       ├── users.tsx        # Gestión usuarios
│   │       └── base-desguace.tsx
│   ├── components/
│   ├── lib/
│   │   ├── api.ts               # Cliente API base
│   │   ├── api-client.ts        # Funciones específicas
│   │   ├── store.ts             # Zustand store
│   │   └── auth-store.ts        # Estado de autenticación
│   ├── .env.local               # NEXT_PUBLIC_API_URL=http://localhost:8000
│   └── package.json
│
├── docs/
│   ├── PROJECT_DESCRIPTION.md   # Descripción general
│   ├── CHANGELOG.md             # Historial de cambios
│   └── SESION_20260204_VENTAS_FIX.md  # Debugging de ventas
│
└── .github/
    └── copilot-instructions.md  # ESTE ARCHIVO
```

## 🗃️ Modelos de Base de Datos

### Tablas Principales (en `backend/app/models/busqueda.py`)

```python
# Usuarios y Autenticación
Usuario           # id, email, password_hash, rol, entorno_trabajo_id
EntornoTrabajo    # id, nombre (multi-tenant)

# Inventario
BaseDesguace      # id, entorno_trabajo_id, nombre_archivo, total_piezas
PiezaDesguace     # id, base_desguace_id, refid, oem, oe, iam, precio, marca, modelo...
PiezaVendida      # id, entorno_trabajo_id, refid, oem, precio, fecha_venta...

# Fichadas
FichadaPieza      # Control de entrada de piezas
VerificacionFichada

# Otros
ConfiguracionPrecios
PiezaPedida       # Piezas solicitadas pendientes
```

### Relaciones Clave

```
EntornoTrabajo (1) ──► (N) Usuario
EntornoTrabajo (1) ──► (N) BaseDesguace
BaseDesguace   (1) ──► (N) PiezaDesguace
EntornoTrabajo (1) ──► (N) PiezaVendida
```

## 🔐 Sistema de Autenticación

### Roles
- `sysowner`: Administrador del sistema (puede ver todos los entornos)
- `owner`: Dueño de un desguace (gestiona su entorno)
- `admin`: Administrador de entorno
- `user`: Usuario normal

### JWT Token
- Endpoint: `POST /api/v1/auth/login`
- Body: `{ "email": "...", "password": "..." }`
- Response: `{ "access_token": "...", "token_type": "bearer" }`
- Header: `Authorization: Bearer <token>`

### Credenciales de Prueba
```
Email: julio@motocoche.com
Password: admin123
Rol: sysowner
```

## 📅 Tareas Programadas (APScheduler)

Configuradas en `backend/services/scheduler.py`:

| Tarea | Frecuencia | Función |
|-------|------------|---------|
| Importación CSV | Cada 30 min | `importar_csv_motocoche()` |
| Limpieza ventas falsas | Cada 6 horas | `limpiar_ventas_falsas()` |
| Backup BD | Diario 3:00 AM | `ejecutar_backup_programado()` |

## ⚠️ Sistema de Detección de Ventas (CRÍTICO)

### Flujo
1. El CSV de MotoCoche se actualiza en `/var/uploads/csv/StockSeinto.csv` (VPS)
2. Cada 30 min, `importar_csv_motocoche()` lee el CSV
3. Compara `refid` del CSV vs `refid` en BD
4. Piezas en BD pero NO en CSV → Marcadas como VENDIDAS
5. Se mueven a tabla `piezas_vendidas`

### Archivo Clave
`backend/services/csv_auto_import.py`

### Bug Histórico (Corregido 2026-02-04)
El CSV tenía BOM (Byte Order Mark) que causaba que las cabeceras se leyeran como `\ufeffref.id` en lugar de `ref.id`. 

**Solución:** Usar `encoding='utf-8-sig'` en lugar de `encoding='utf-8'`.

Ver: `docs/SESION_20260204_VENTAS_FIX.md`

### Protecciones
- Máximo 20% del stock puede marcarse como vendido de golpe
- Si CSV tiene menos del 50% de piezas, se asume incompleto

## 🖥️ Despliegue en VPS

### Servidor
- IP: `72.61.98.80`
- Usuario: `root`
- Path: `/var/www/motocoche`

### Servicios Systemd
```bash
# Backend
sudo systemctl status motocoche-backend.service
sudo systemctl restart motocoche-backend.service

# Frontend
sudo systemctl status motocoche-frontend.service
```

### Logs
```bash
journalctl -u motocoche-backend.service -f
journalctl -u motocoche-backend.service --since "1 hour ago"
```

### Archivos Importantes en VPS
```
/var/www/motocoche/backend/.env          # Variables de entorno
/var/www/motocoche/backend/desguapro.db  # Base de datos
/var/uploads/csv/StockSeinto.csv         # CSV de MotoCoche (FTP)
```

### Actualizar desde Git
```bash
cd /var/www/motocoche
git pull origin main
sudo systemctl restart motocoche-backend.service
```

## 🔧 Desarrollo Local

### Requisitos
- Python 3.13+
- Node.js 18+
- Git

### Iniciar Backend
```bash
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1  # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Iniciar Frontend
```bash
cd frontend
npm install
npm run dev
```

### Variables de Entorno

**Frontend (.env.local):**
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Backend (.env):**
```
SECRET_KEY=tu-clave-secreta
DATABASE_URL=sqlite:///./desguapro.db
EBAY_APP_ID=...
EBAY_CERT_ID=...
```

## 🐛 Debugging Común

### El login no funciona
1. Verificar que backend esté corriendo en puerto 8000
2. Verificar `.env.local` tiene `NEXT_PUBLIC_API_URL=http://localhost:8000` (SIN `/api/v1`)
3. Probar: `curl -X POST http://localhost:8000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"julio@motocoche.com","password":"admin123"}'`

### No se detectan ventas
1. Verificar logs del scheduler: `journalctl -u motocoche-backend.service | grep "Vendidas detectadas"`
2. Si dice "Total en stock: 0", el CSV tiene problemas de encoding (BOM)
3. Verificar que el CSV existe y tiene contenido válido

### Base de datos corrupta
```bash
# Restaurar desde backup
cd backend
cp desguapro_backup.db desguapro.db
```

### SSH bloqueado (firewall)
El VPS tiene firewall que bloquea IPs tras muchos intentos. Esperar 10-15 min.

## 📊 Consultas SQL Útiles

```sql
-- Contar piezas por base
SELECT base_desguace_id, COUNT(*) FROM piezas_desguace GROUP BY base_desguace_id;

-- Ventas por día
SELECT DATE(fecha_venta), COUNT(*) FROM piezas_vendidas GROUP BY DATE(fecha_venta) ORDER BY fecha_venta DESC;

-- Última venta
SELECT MAX(fecha_venta) FROM piezas_vendidas;

-- Usuarios y sus entornos
SELECT id, email, rol, entorno_trabajo_id FROM usuarios;

-- Entornos
SELECT * FROM entornos_trabajo;
```

## 🚀 Features Implementadas Recientemente

### Contador OEM en Burbujas (2026-02-02)
Las burbujas azules en las imágenes de piezas ahora muestran la cantidad de piezas con el mismo OEM, no el número de fotos.

Archivos modificados:
- `frontend/pages/admin/stock.tsx`
- `frontend/pages/piezas-nuevas.tsx`

### Texto Promocional en Login (2026-02-04)
Añadido texto descriptivo y email de contacto en la página de login.

Archivo: `frontend/pages/login.tsx`

## 🔄 Git Workflow

```bash
# Ver estado
git status

# Commit
git add .
git commit -m "tipo: descripción"

# Push
git push origin main

# Pull en VPS
ssh root@72.61.98.80 "cd /var/www/motocoche && git pull origin main && sudo systemctl restart motocoche-backend.service"
```

### Tipos de Commit
- `feat:` Nueva funcionalidad
- `fix:` Corrección de bug
- `docs:` Documentación
- `refactor:` Refactorización
- `style:` Cambios de estilo/formato

## 📞 Contacto

- Email del proyecto: julio@motocoche.com
- Repositorio: https://github.com/juliosoria9/web-desguapro

---

**Última actualización:** 4 de Febrero de 2026
