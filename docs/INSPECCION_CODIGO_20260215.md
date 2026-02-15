# 🔍 Inspección Profunda de Código — DesguaPro

**Fecha:** 15 de Febrero de 2026  
**Alcance:** Backend completo + Frontend completo  
**Estado:** Pendiente de corrección

---

## 🔴 BUGS CRÍTICOS (arreglar ya)

### 1. URL de logout sin `/api/v1/`
- **Archivo:** `frontend/lib/auth-store.ts` (línea 87)
- **Problema:** Usa `${API_URL}/auth/logout` en vez de `${API_URL}/api/v1/auth/logout`
- **Impacto:** El servidor nunca recibe el logout → la cookie HTTPOnly **nunca se invalida**. El catch silencia el 404.
- **Solución:** Añadir `/api/v1` al path del logout.
- **Estado:** ❌ Pendiente

### 2. Módulos por defecto en `true` = acceso gratis a todo
- **Archivo:** `frontend/lib/auth-store.ts` (líneas 39-52)
- **Problema:** Si el backend no envía `modulos` en el JWT, el `defaultModulos` tiene **todos los módulos en `true`**. Un usuario nuevo sin módulos configurados tiene acceso completo a funcionalidades de pago.
- **Solución:** Cambiar los defaults a `false`.
- **Estado:** ✅ Corregido (15/02/2026)

### 3. Filtro SQLAlchemy roto en anuncios
- **Archivo:** `backend/app/routers/anuncios.py` (líneas 229 y 340)
- **Problema:** El filtro `~Anuncio.id.in_(leidos_ids) if leidos_ids else True` usa el booleano Python `True` (no una expresión SQLAlchemy) cuando la lista está vacía. Resultado: **no filtra nada**, potencialmente devolviendo anuncios ya leídos.
- **Solución:** Usar `sqlalchemy.literal(True)` o reestructurar la query con un `if` antes del `.filter()`.
- **Estado:** ✅ Corregido (15/02/2026)

### 4. XSS potencial en ChangelogModal
- **Archivo:** `frontend/components/ChangelogModal.tsx` (líneas 193 y 309)
- **Problema:** Usa `dangerouslySetInnerHTML` para renderizar contenido de anuncios con una función `formatMarkdown()` propia. Si un admin inyecta HTML/JS malicioso en un anuncio, se ejecutaría en el navegador de todos los usuarios.
- **Solución:** Usar una librería de markdown segura (como `react-markdown`) o sanitizar el HTML con `DOMPurify`.
- **Estado:** ✅ Corregido (15/02/2026) — Añadida función `sanitizeHtml()` que elimina `<script>`, `<iframe>`, `<style>`, event handlers (`on*=`), y `javascript:` en hrefs/src

### 5. Path traversal en stockeo (leer archivos del servidor)
- **Archivo:** `backend/app/routers/stockeo.py` (líneas 337-346)
- **Problema:** El endpoint `/leer-csv-headers` acepta una `ruta_csv` como string sin validar. Un sysowner podría leer `/etc/passwd` o cualquier archivo del sistema.
- **Solución:** Validar que la ruta esté dentro de un directorio permitido (whitelist).
- **Estado:** ❌ Pendiente

---

## 🟠 BUGS FUNCIONALES (impacto medio)

### 6. `'use client'` innecesario en 24+ archivos
- **Archivos:** Todos los archivos `.tsx` del frontend
- **Problema:** `'use client'` es directiva del **App Router** (Next.js 13+). Este proyecto usa **Pages Router** (`pages/`), donde no tiene ningún efecto.
- **Impacto:** Confusión para desarrolladores, no afecta funcionalidad.
- **Solución:** Eliminar `'use client'` de todos los archivos.
- **Estado:** ❌ Pendiente

### 7. N+1 queries en múltiples endpoints
- **Archivos afectados:**
  - `backend/app/routers/fichadas.py` — ranking: 1 query por usuario
  - `backend/app/routers/paqueteria.py` — ranking + movimientos: 1 query por registro
  - `backend/app/routers/anuncios.py` — 1 query por anuncio para obtener creador
  - `backend/app/routers/tickets.py` — 4 queries extras por ticket
- **Impacto:** Con 100 registros = 400+ queries innecesarias. Lento bajo carga.
- **Solución:** Usar `joinedload` de SQLAlchemy o pre-cargar datos en una sola query.
- **Estado:** ❌ Pendiente

### 8. Caché global sin invalidación ni límite en stock.py
- **Archivo:** `backend/app/routers/stock.py`
- **Problema:** Variables globales de caché (dict) crecen indefinidamente sin TTL ni límite de tamaño. No son thread-safe.
- **Impacto:** Con 500k piezas, puede consumir GB de RAM. Accesos concurrentes pueden corromper estado.
- **Solución:** Usar `functools.lru_cache` con maxsize, o Redis, o al menos un TTL.
- **Estado:** ❌ Pendiente

---

## 💀 CÓDIGO MUERTO (eliminar)

### 9. Archivos completamente muertos

| Archivo | Razón | Estado |
|---------|-------|--------|
| `frontend/lib/store.ts` | `useBusquedaStore` y `useStockStore` — Solo los importa `FormBuscar.tsx` que también está muerto | ✅ Eliminado |
| `frontend/lib/api.ts` | `preciosAPI`, `stockAPI`, `plataformasAPI`, `tokenAPI` — Solo los importa `FormBuscar.tsx` (muerto) | ✅ Eliminado |
| `frontend/components/FormBuscar.tsx` | **Nunca importado por ninguna página** | ✅ Eliminado |
| `frontend/components/ResumenPrecios.tsx` | **Nunca importado por ninguna página** | ✅ Eliminado |

### 10. Funciones muertas en archivos vivos

| Archivo | Función muerta | Razón | Estado |
|---------|---------------|-------|--------|
| `backend/utils/encoding.py` | `b64_decode()` | Solo se usa `b64()`, nunca `b64_decode()` | ✅ Eliminado |

---

## ⚠️ MALAS PRÁCTICAS

### 11. 4 patrones distintos para llamadas API autenticadas
- **Problema:** El frontend mezcla aleatoriamente:
  1. `axios.get(url, { withCredentials: true })`
  2. `fetch(url, { credentials: 'include' })`
  3. `axios.get(url, { headers: { Authorization: Bearer ${token} } })`
  4. Mezcla de ambos en el mismo archivo
- **Impacto:** Pesadilla de mantenimiento. Bugs difíciles de rastrear.
- **Solución:** Unificar en un solo patrón (preferiblemente `axios` con `withCredentials: true` usando un interceptor centralizado).
- **Estado:** ❌ Pendiente

### 12. 60+ `console.log`/`console.error` en producción
- **Archivos:** Todos los archivos del frontend
- **Impacto:** Se filtra información en la consola del navegador del usuario.
- **Solución:** Eliminar todos los `console.log` o sustituirlos por un servicio de logging condicional.
- **Estado:** ❌ Pendiente

### 13. Navbar/layout duplicado en ~25 páginas
- **Problema:** Cada página copia-pega el navbar completo (logo, botón logout, sección de usuario).
- **Impacto:** Cambiar el navbar requiere editar 25 archivos.
- **Solución:** Extraer a un componente `Layout` compartido en `_app.tsx` o como wrapper.
- **Estado:** ❌ Pendiente

### 14. URLs localhost hardcodeadas
- **Archivos afectados:**
  - `frontend/pages/dashboard.tsx` — muestra `http://localhost:8000` en la UI
  - `frontend/pages/admin/stockeo-automatico.tsx` — fallback `|| 'http://localhost:8000'`
  - `frontend/pages/admin/api-monitor.tsx` — fallback `|| 'http://localhost:8000'`
  - `frontend/pages/admin/logs.tsx` — fallback `|| 'http://localhost:8000'`
- **Impacto:** En producción, las URLs apuntan a localhost.
- **Solución:** Usar siempre `process.env.NEXT_PUBLIC_API_URL` sin fallback a localhost.
- **Estado:** ❌ Pendiente

### 15. 94 emojis que deberían ser SVG icons
- **Regla del proyecto:** No usar emojis, usar SVG icons.
- **Emojis encontrados:** `🏢`, `🗑`, `💬`, `💰`, `📋`, `⚠️`, `📦`, `🔒`, `📢`, `🔧`, `✏️`, `➕`, `📭`, `🔔`, `🔍`, `ℹ️`, `⏳`, `✓`, `✕`, `⊕`, `🔄`, `🟡`, `🔵`, `🟢`, `⚫`, `⬇`, `💾`, `📊`, `📈`, `📉`, `⬆️`, `❌`
- **Archivos principales:** dashboard.tsx, fichadas.tsx, stock.tsx, paqueteria.tsx, referencias.tsx, admin/*.tsx, components/*.tsx
- **Estado:** ❌ Pendiente

---

## 📊 RESUMEN

| Categoría | Cantidad | Prioridad |
|-----------|----------|-----------|
| 🔴 Bugs críticos (seguridad/funcionalidad) | **5** | URGENTE |
| 🟠 Bugs funcionales (rendimiento/lógica) | **3** | ALTA |
| 💀 Código muerto (archivos/funciones) | **4 archivos + 1 función** | MEDIA |
| ⚠️ Malas prácticas | **5 categorías** | BAJA-MEDIA |
| Emojis → SVG | **94 instancias** | BAJA |
| `console.log` en producción | **60+** | BAJA |
| `'use client'` innecesario | **24 archivos** | BAJA |

---

## ✅ REGISTRO DE CORRECCIONES

_Marcar aquí cada corrección aplicada:_

| # | Descripción | Fecha | Commit |
|---|------------|-------|--------|
| - | - | - | - |

---

**Última actualización:** 15 de Febrero de 2026
