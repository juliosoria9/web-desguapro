# Sistema de Módulos - DesguaPro

> **Última actualización:** 5 de Febrero de 2026

## 📋 Resumen

El sistema de módulos permite controlar qué funcionalidades tiene habilitadas cada empresa (entorno de trabajo). Esto permite ofrecer diferentes paquetes de suscripción y restringir el acceso a funciones específicas.

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                      EntornoTrabajo                              │
│  - modulo_fichadas: boolean                                      │
│  - modulo_stock_masivo: boolean                                  │
│  - modulo_referencias: boolean                                   │
│  - modulo_piezas_nuevas: boolean                                 │
│  - modulo_ventas: boolean                                        │
│  - modulo_precios_sugeridos: boolean                             │
│  - modulo_importacion_csv: boolean                               │
│  - modulo_inventario_piezas: boolean                             │
│  - modulo_estudio_coches: boolean                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Login (JWT)
┌─────────────────────────────────────────────────────────────────┐
│                      Usuario Response                            │
│  {                                                               │
│    modulos: {                                                    │
│      fichadas: true,                                             │
│      stock_masivo: false,                                        │
│      ...                                                         │
│    }                                                             │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Zustand Store
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend                                    │
│  - Dashboard: hasModulo() para ocultar tarjetas                  │
│  - Páginas: <ModuloProtegido> para bloquear acceso              │
└─────────────────────────────────────────────────────────────────┘
```

## 📦 Módulos Disponibles

| Módulo | Descripción | Página Protegida |
|--------|-------------|------------------|
| `fichadas` | Control de fichadas de piezas | `/fichadas` |
| `stock_masivo` | Verificación masiva de stock | `/stock-masivo` |
| `referencias` | Cruce de referencias OEM/IAM | `/referencias` |
| `piezas_nuevas` | Gestión de piezas nuevas desde CSV | `/piezas-nuevas` |
| `ventas` | Historial de ventas | `/admin/ventas` |
| `precios_sugeridos` | Cálculo de precios sugeridos | `/configuracion-precios` |
| `importacion_csv` | Importación automática de CSV | (backend) |
| `inventario_piezas` | Inventario de piezas (stock) | `/admin/stock` |
| `estudio_coches` | Análisis de piezas por vehículo | `/estudio-coches` |

## 🗃️ Base de Datos

### Modelo `EntornoTrabajo` (backend/app/models/busqueda.py)

```python
class EntornoTrabajo(Base):
    __tablename__ = "entornos_trabajo"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, unique=True, index=True)
    
    # Módulos activos (por defecto todos activos)
    modulo_fichadas = Column(Boolean, default=True)
    modulo_stock_masivo = Column(Boolean, default=True)
    modulo_referencias = Column(Boolean, default=True)
    modulo_piezas_nuevas = Column(Boolean, default=True)
    modulo_ventas = Column(Boolean, default=True)
    modulo_precios_sugeridos = Column(Boolean, default=True)
    modulo_importacion_csv = Column(Boolean, default=True)
    modulo_inventario_piezas = Column(Boolean, default=True)
    modulo_estudio_coches = Column(Boolean, default=True)
```

### Migración SQL (si las columnas no existen)

```sql
-- Añadir nuevos módulos
ALTER TABLE entornos_trabajo ADD COLUMN modulo_inventario_piezas BOOLEAN DEFAULT 1;
ALTER TABLE entornos_trabajo ADD COLUMN modulo_estudio_coches BOOLEAN DEFAULT 1;
```

## 🔐 Backend - Login y Permisos

### Endpoint de Login (backend/app/routers/auth.py)

Al hacer login, el backend devuelve los módulos activos del entorno del usuario:

```python
# En el endpoint POST /api/v1/auth/login
if usuario.entorno_trabajo_id:
    entorno = db.query(EntornoTrabajo).filter(...).first()
    if entorno:
        modulos = {
            "fichadas": entorno.modulo_fichadas if entorno.modulo_fichadas is not None else True,
            "stock_masivo": entorno.modulo_stock_masivo if entorno.modulo_stock_masivo is not None else True,
            "referencias": entorno.modulo_referencias if entorno.modulo_referencias is not None else True,
            "piezas_nuevas": entorno.modulo_piezas_nuevas if entorno.modulo_piezas_nuevas is not None else True,
            "ventas": entorno.modulo_ventas if entorno.modulo_ventas is not None else True,
            "precios_sugeridos": entorno.modulo_precios_sugeridos if entorno.modulo_precios_sugeridos is not None else True,
            "importacion_csv": entorno.modulo_importacion_csv if entorno.modulo_importacion_csv is not None else True,
            "inventario_piezas": entorno.modulo_inventario_piezas if hasattr(entorno, 'modulo_inventario_piezas') and entorno.modulo_inventario_piezas is not None else True,
            "estudio_coches": entorno.modulo_estudio_coches if hasattr(entorno, 'modulo_estudio_coches') and entorno.modulo_estudio_coches is not None else True,
        }
```

### Endpoint para Actualizar Módulos

```
PUT /api/v1/auth/entornos/{entorno_id}/modulos
Body: {
  "modulo_fichadas": true,
  "modulo_inventario_piezas": false,
  ...
}
```

## 🖥️ Frontend - Zustand Store

### Interfaz de Módulos (frontend/lib/auth-store.ts)

```typescript
export interface Modulos {
  fichadas: boolean;
  stock_masivo: boolean;
  referencias: boolean;
  piezas_nuevas: boolean;
  ventas: boolean;
  precios_sugeridos: boolean;
  importacion_csv: boolean;
  inventario_piezas: boolean;
  estudio_coches: boolean;
}
```

### Función `hasModulo`

```typescript
// En el auth-store
hasModulo: (modulo: string) => {
  const state = get();
  if (!state.user?.modulos) return true; // Si no hay módulos, permitir todo
  return state.user.modulos[modulo as keyof Modulos] ?? true;
}
```

### Valores por Defecto

```typescript
const defaultModulos: Modulos = {
  fichadas: true,
  stock_masivo: true,
  referencias: true,
  piezas_nuevas: true,
  ventas: true,
  precios_sugeridos: true,
  importacion_csv: true,
  inventario_piezas: true,
  estudio_coches: true,
};
```

## 🛡️ Frontend - Componente ModuloProtegido

### Ubicación: `frontend/components/ModuloProtegido.tsx`

Este componente envuelve las páginas que requieren un módulo específico:

```tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import toast from 'react-hot-toast';

interface ModuloProtegidoProps {
  modulo: string;
  children: React.ReactNode;
}

export default function ModuloProtegido({ modulo, children }: ModuloProtegidoProps) {
  const router = useRouter();
  const { hasModulo } = useAuthStore();

  useEffect(() => {
    if (!hasModulo(modulo)) {
      toast.error('No tienes el paquete contratado', {
        duration: 4000,
        position: 'bottom-right',
        style: { background: '#ef4444', color: '#fff', fontWeight: 'bold' },
        icon: '🔒',
      });
      router.push('/dashboard');
    }
  }, [modulo, hasModulo, router]);

  if (!hasModulo(modulo)) {
    return null;
  }

  return <>{children}</>;
}
```

### Uso en Páginas

```tsx
// En frontend/pages/admin/stock.tsx
import ModuloProtegido from '@/components/ModuloProtegido';

export default function StockPage() {
  return (
    <ModuloProtegido modulo="inventario_piezas">
      <div className="min-h-screen bg-gray-50">
        {/* Contenido de la página */}
      </div>
    </ModuloProtegido>
  );
}
```

## 📊 Dashboard - Ocultar Tarjetas

En `frontend/pages/dashboard.tsx`, las tarjetas de módulos se ocultan si no están activos:

```tsx
const { hasModulo } = useAuthStore();

// En el render:
{hasModulo('fichadas') && (
  <div onClick={() => router.push('/fichadas')} className="...">
    <h3>Fichadas</h3>
    {/* ... */}
  </div>
)}

{hasModulo('inventario_piezas') && (
  <div onClick={() => router.push('/admin/stock')} className="...">
    <h3>Inventario Piezas</h3>
    {/* ... */}
  </div>
)}

{hasModulo('estudio_coches') && (
  <div onClick={() => router.push('/estudio-coches')} className="...">
    <h3>Estudio Coches</h3>
    {/* ... */}
  </div>
)}
```

## 🔧 Panel de Administración de Módulos

### Ubicación: `frontend/pages/admin/environments.tsx`

El sysowner puede gestionar los módulos de cada entorno desde esta página:

```typescript
const MODULOS_DISPONIBLES = [
  { key: 'modulo_fichadas', nombre: 'Fichadas', descripcion: 'Control de fichadas de piezas' },
  { key: 'modulo_stock_masivo', nombre: 'Stock Masivo', descripcion: 'Verificación masiva de stock' },
  { key: 'modulo_referencias', nombre: 'Referencias', descripcion: 'Cruce de referencias OEM/IAM' },
  { key: 'modulo_piezas_nuevas', nombre: 'Piezas Nuevas', descripcion: 'Gestión de piezas nuevas' },
  { key: 'modulo_ventas', nombre: 'Ventas', descripcion: 'Historial de ventas' },
  { key: 'modulo_precios_sugeridos', nombre: 'Precios Sugeridos', descripcion: 'Cálculo de precios' },
  { key: 'modulo_importacion_csv', nombre: 'Importación CSV', descripcion: 'Importación automática' },
  { key: 'modulo_inventario_piezas', nombre: 'Inventario Piezas', descripcion: 'Gestión de inventario' },
  { key: 'modulo_estudio_coches', nombre: 'Estudio Coches', descripcion: 'Análisis por vehículo' },
];
```

## ⚠️ Consideraciones Importantes

### 1. Re-login Requerido
Los módulos se cargan en el token JWT al hacer login. **Si se cambian los módulos de un entorno, los usuarios de ese entorno deben cerrar sesión y volver a entrar** para que los cambios surtan efecto.

### 2. Nombres de Módulos
- En la **base de datos**: `modulo_fichadas` (con prefijo `modulo_`)
- En el **frontend (auth-store)**: `fichadas` (sin prefijo)
- En **hasModulo()**: usar sin prefijo → `hasModulo('fichadas')`

### 3. Protección Doble
Para máxima seguridad, cada módulo tiene:
1. **Dashboard**: La tarjeta no aparece si el módulo está deshabilitado
2. **Página**: El componente `ModuloProtegido` bloquea el acceso directo por URL

### 4. Valores por Defecto
Si un módulo no existe en la BD (null), se asume como `true` (activo) para compatibilidad hacia atrás.

## 📁 Archivos Relacionados

```
backend/
├── app/
│   ├── models/busqueda.py      # Modelo EntornoTrabajo con columnas modulo_*
│   ├── schemas/auth.py         # EntornoModulosUpdate schema
│   └── routers/auth.py         # Endpoints de login y actualización de módulos

frontend/
├── lib/
│   └── auth-store.ts           # Interface Modulos, hasModulo(), defaultModulos
├── components/
│   └── ModuloProtegido.tsx     # Componente wrapper para páginas protegidas
└── pages/
    ├── dashboard.tsx           # Tarjetas con hasModulo()
    ├── fichadas.tsx            # <ModuloProtegido modulo="fichadas">
    ├── piezas-nuevas.tsx       # <ModuloProtegido modulo="piezas_nuevas">
    ├── estudio-coches.tsx      # <ModuloProtegido modulo="estudio_coches">
    └── admin/
        ├── stock.tsx           # <ModuloProtegido modulo="inventario_piezas">
        └── environments.tsx    # Panel de gestión de módulos
```

## 🧪 Testing

### Verificar que un módulo está deshabilitado:

1. Ir a `/admin/environments` como sysowner
2. Seleccionar un entorno y desactivar un módulo (ej: "Estudio Coches")
3. Cerrar sesión
4. Iniciar sesión con un usuario de ese entorno
5. Verificar que:
   - La tarjeta no aparece en el dashboard
   - Acceder directamente a `/estudio-coches` muestra toast "No tienes el paquete contratado" y redirige

### SQL para verificar módulos:

```sql
SELECT id, nombre, modulo_fichadas, modulo_inventario_piezas, modulo_estudio_coches 
FROM entornos_trabajo;
```

---

*Documentación creada el 5 de Febrero de 2026*
