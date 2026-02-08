# 🏢 Informe de Compatibilidad Multi-Empresa

## Resumen Ejecutivo

Este documento detalla **TODOS** los elementos del sistema DesguaPro que están actualmente **hardcodeados** o **específicos para MotoCoche/Seinto** y que necesitan modificarse para que el sistema funcione como plataforma multi-empresa.

---

## 📊 Resumen de Impacto

| Categoría | Elementos Afectados | Prioridad | Esfuerzo |
|-----------|---------------------|-----------|----------|
| 🔴 Sistema de Importación CSV | 1 archivo crítico | CRÍTICA | Alta |
| 🔴 Nombres/Branding | 15+ archivos | ALTA | Media |
| 🟡 Rutas Hardcodeadas | 5 archivos | MEDIA | Baja |
| 🟡 Credenciales de Prueba | 8+ archivos | MEDIA | Baja |
| 🟢 Documentación | 6+ archivos | BAJA | Media |
| 🔴 Scheduler/Tareas Programadas | 2 archivos | CRÍTICA | Alta |

---

## 🔴 1. CRÍTICO: Sistema de Importación Automática de CSV

### Archivo: `backend/services/csv_auto_import.py`

Este es el **problema más grave**. El sistema actual está diseñado para importar **UN SOLO CSV de UNA SOLA empresa (MotoCoche)**.

#### Problemas específicos:

```python
# Línea 36 - Nombre de entorno hardcodeado
MOTOCOCHE_ENTORNO_NOMBRE = "motocoche"  # ❌ Hardcodeado

# Líneas 28-29 - Rutas de CSV fijas
CSV_PATH_DEFAULT_LINUX = "/var/uploads/csv/StockSeinto.csv"  # ❌ Nombre específico
CSV_PATH_DEFAULT_WINDOWS = os.path.join(..., "StockSeinto.csv")  # ❌ Nombre específico

# Líneas 285 y 376 - Nombre de archivo fijo
nombre_archivo="StockSeinto.csv (auto)"  # ❌ Hardcodeado
```

#### Función problemática:

```python
def obtener_entorno_motocoche(db: Session) -> Optional[int]:
    """
    ❌ PROBLEMA: Solo busca el entorno "motocoche"
    """
    entorno = db.query(EntornoTrabajo).filter(
        func.lower(EntornoTrabajo.nombre).like(f"%motocoche%")  # ❌ Específico de MotoCoche
    ).first()
```

#### Solución necesaria:

1. **Crear sistema de importación por entorno**: Cada empresa debe poder configurar:
   - Ruta de su propio CSV
   - Formato de columnas personalizado
   - Frecuencia de importación

2. **Nueva tabla sugerida**:
```python
class ConfiguracionImportacionCSV(Base):
    __tablename__ = "configuracion_importacion_csv"
    
    id = Column(Integer, primary_key=True)
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id"), unique=True)
    csv_path = Column(String(500))  # Ruta del CSV
    frecuencia_minutos = Column(Integer, default=30)
    activo = Column(Boolean, default=True)
    ultimo_import = Column(DateTime, nullable=True)
    # ... más configuraciones
```

---

## 🔴 2. CRÍTICO: Scheduler de Tareas Programadas

### Archivo: `backend/services/scheduler.py`

El scheduler está configurado para **UNA SOLA empresa**.

```python
# Líneas 70-76 - Tarea de importación para MotoCoche
scheduler.add_job(
    ejecutar_importacion_programada,
    IntervalTrigger(minutes=30),  # ❌ Solo 30 min para todos
    id="import_csv_motocoche",  # ❌ ID específico de MotoCoche
    name="Importación automática CSV MotoCoche",  # ❌ Nombre específico
    replace_existing=True
)
```

#### Solución necesaria:

1. **Crear un job por cada empresa** con configuración individual
2. **Permitir configurar frecuencia** desde panel de administración
3. **Renombrar IDs de jobs** para ser genéricos: `import_csv_entorno_{id}`

---

## 🟡 3. Branding y Nombres (15+ archivos)

### Frontend - Nombre "DesguaPro" y "MotoCoche"

| Archivo | Línea | Problema |
|---------|-------|----------|
| `frontend/pages/_app.tsx` | 31-32 | `<title>DesguaPro</title>` |
| `frontend/pages/login.tsx` | 67, 73 | Logo y nombre "DesguaPro" |
| `frontend/pages/dashboard.tsx` | 41, 45 | Logo y nombre |
| `frontend/pages/stock.tsx` | 143, 147 | Logo y nombre |
| `frontend/pages/search.tsx` | 318, 322 | Logo y nombre |
| `frontend/pages/referencias.tsx` | 155, 158 | Logo y nombre |
| `frontend/pages/fichadas.tsx` | 478, 481 | Logo y nombre |
| `frontend/pages/stock-masivo.tsx` | 769, 772 | Logo y nombre |
| `frontend/pages/admin/logs.tsx` | 131, 134 | Logo y nombre |
| `frontend/pages/admin/ventas.tsx` | 327, 330 | Logo y nombre |
| `frontend/pages/admin/users.tsx` | 521 | Logo |

#### Solución necesaria:

1. **Crear configuración de branding por entorno**:
```typescript
interface ConfigBranding {
    nombre_empresa: string;
    logo_url: string;
    color_primario: string;
    // ...
}
```

2. **Cargar branding dinámicamente** según el usuario logueado

3. **Variable de entorno para nombre genérico**:
```
NEXT_PUBLIC_APP_NAME=DesguaPro
```

---

## 🟡 4. Credenciales de Prueba Hardcodeadas

### Archivos afectados:

| Archivo | Problema |
|---------|----------|
| `backend/test_all.py` | `julio@motocoche.com` hardcodeado |
| `backend/test_piezas.py` | `julio@motocoche.com` hardcodeado |
| `backend/test_password.py` | `julio@motocoche.com` hardcodeado |
| `backend/scripts/init_db.py` | `julio@motocoche.com` como usuario inicial |
| `.github/copilot-instructions.md` | Credenciales documentadas |

#### Solución necesaria:

1. **Usar variables de entorno** para tests:
```python
TEST_EMAIL = os.getenv("TEST_EMAIL", "admin@test.com")
```

2. **Eliminar credenciales de documentación** pública

---

## 🟡 5. Email de Contacto en Login

### Archivo: `frontend/pages/login.tsx` (línea 92-94)

```tsx
<a href="mailto:julio.soria.rodriguez@gmail.com" className="hover:text-white">
    julio.soria.rodriguez@gmail.com
</a>
```

#### Solución:
- Usar variable de entorno: `NEXT_PUBLIC_CONTACT_EMAIL`

---

## 🟡 6. Configuración de Backend

### Archivo: `backend/app/config.py`

```python
app_name: str = "DesguaPro API"  # ❌ Hardcodeado

cors_origins: List[str] = [
    "https://desguapro.com",      # ❌ Dominio específico
    "https://www.desguapro.com",  # ❌ Dominio específico
]
```

#### Solución:
- Mover a variables de entorno:
```
APP_NAME=NombreGenerico
CORS_ORIGINS=https://tudominio.com,https://www.tudominio.com
```

---

## 🟡 7. Integración eBay

### Archivo: `backend/app/routers/ebay.py`

```python
# Línea 16
VERIFICATION_TOKEN = "desguapro_ebay_verify_2026_for_delivery_method"  # ❌ Específico

# Línea 32
endpoint = "https://desguapro/ebay/account-deletion"  # ❌ URL incompleta y específica
```

#### Solución:
- Mover a variables de entorno
- Cada empresa necesita su propia integración eBay (si la usa)

---

## 🟡 8. Rutas del VPS Hardcodeadas

### Archivos afectados:
- `DEPLOYMENT.md` - 20+ referencias a `/var/www/motocoche`
- `deploy.sh` - IP del VPS: `72.61.98.80`
- `deploy.ps1` - IP del VPS: `72.61.98.80`
- `.github/copilot-instructions.md` - Múltiples rutas

#### Solución:
- Documentación debe ser genérica
- Scripts de deploy deben usar variables

---

## 🟢 9. Base de Datos SQLite

### Archivo: `backend/app/config.py`

```python
database_url: str = "sqlite:///./desguapro.db"  # ❌ Nombre específico
```

#### Consideraciones multi-empresa:

**Opción A: Una BD para todos (actual)**
- ✅ Ya tiene `entorno_trabajo_id` en casi todas las tablas
- ✅ Multi-tenant por software
- ⚠️ Requiere cuidado con índices y rendimiento

**Opción B: Una BD por empresa**
- ✅ Aislamiento total
- ❌ Más complejo de gestionar
- ❌ Requiere cambios importantes

**Recomendación**: Mantener Opción A pero **migrar a PostgreSQL** para producción multi-empresa.

---

## 🟢 10. Documentación a Actualizar

| Archivo | Contenido a cambiar |
|---------|---------------------|
| `docs/PROJECT_DESCRIPTION.md` | Referencias a MotoCoche/SeintoStock |
| `docs/SESION_20260204_VENTAS_FIX.md` | Referencias específicas |
| `docs/CHANGELOG.md` | Título "DesguaPro" |
| `.github/copilot-instructions.md` | Todo el contenido es específico |
| `DEPLOYMENT.md` | Rutas y nombres específicos |
| `README.md` (si existe) | Branding |

---

## 📋 Checklist de Migración Multi-Empresa

### Fase 1: Crítico (Antes de vender)
- [ ] Crear sistema de configuración de importación CSV por entorno
- [ ] Modificar scheduler para soportar múltiples jobs de importación
- [ ] Parametrizar `csv_auto_import.py` para cualquier empresa
- [ ] Eliminar función `obtener_entorno_motocoche()` - usar ID directo

### Fase 2: Branding
- [ ] Crear sistema de branding dinámico por entorno
- [ ] Variables de entorno para nombre de app, logo, colores
- [ ] Actualizar 15+ páginas del frontend

### Fase 3: Configuración
- [ ] Mover dominios CORS a variables de entorno
- [ ] Parametrizar integración eBay
- [ ] Crear script de inicialización genérico

### Fase 4: Limpieza
- [ ] Eliminar credenciales hardcodeadas de tests
- [ ] Actualizar toda la documentación
- [ ] Renombrar archivos con nombres específicos

### Fase 5: Producción
- [ ] Migrar de SQLite a PostgreSQL
- [ ] Configurar backups por empresa
- [ ] Implementar logs separados por entorno

---

## ⏱️ Estimación de Tiempo

| Tarea | Tiempo Estimado |
|-------|-----------------|
| Sistema de importación CSV multi-empresa | 8-12 horas |
| Scheduler multi-empresa | 4-6 horas |
| Sistema de branding dinámico | 6-8 horas |
| Limpieza de hardcoding | 4-6 horas |
| Actualización documentación | 2-4 horas |
| Testing completo | 4-6 horas |
| **TOTAL** | **28-42 horas** |

---

## 🚨 Lo que NO funcionará sin cambios

1. **Importación automática de CSV** - Solo funciona para "motocoche"
2. **Detección de ventas** - Vinculada al entorno "motocoche"
3. **Scheduler** - Solo una tarea para una empresa
4. **Branding** - Siempre muestra "DesguaPro"

---

## ✅ Lo que YA funciona para multi-empresa

1. **Sistema de autenticación** - Soporta múltiples entornos
2. **Aislamiento de datos** - `entorno_trabajo_id` en todas las tablas
3. **Roles de usuario** - sysowner, owner, admin, user
4. **Gestión de usuarios por entorno** - Funciona correctamente
5. **Búsqueda de precios** - No depende de empresa específica
6. **Scrapers** - Funcionan independientemente
7. **Fichadas** - Aisladas por entorno

---

## ✅ IMPLEMENTADO: Sistema de Módulos por Empresa

### Fecha de implementación: 5 de Febrero de 2026

Se ha implementado un sistema completo de módulos configurables por empresa que permite activar/desactivar funcionalidades específicas.

### Campos añadidos a `EntornoTrabajo`:

```python
modulo_fichadas = Column(Boolean, default=True)
modulo_stock_masivo = Column(Boolean, default=True)
modulo_referencias = Column(Boolean, default=True)
modulo_piezas_nuevas = Column(Boolean, default=True)
modulo_ventas = Column(Boolean, default=True)
modulo_precios_sugeridos = Column(Boolean, default=True)
modulo_importacion_csv = Column(Boolean, default=True)
```

### Archivos modificados:

| Archivo | Cambio |
|---------|--------|
| `backend/app/models/busqueda.py` | Añadidos 7 campos boolean de módulos |
| `backend/app/schemas/auth.py` | Schema `EntornoModulosUpdate` + módulos en `UsuarioResponse` |
| `backend/app/routers/auth.py` | Endpoint `PUT /api/v1/auth/entornos/{id}/modulos` |
| `frontend/lib/auth-store.ts` | Interface `Modulos` + función `hasModulo()` |
| `frontend/pages/admin/environments.tsx` | Panel de gestión de módulos por empresa |
| `frontend/components/ModuloProtegido.tsx` | Componente de protección de páginas |
| `frontend/pages/dashboard.tsx` | Cards ocultadas según módulos activos |
| `frontend/pages/fichadas.tsx` | Protección con `ModuloProtegido` |
| `frontend/pages/stock-masivo.tsx` | Protección con `ModuloProtegido` |
| `frontend/pages/referencias.tsx` | Protección con `ModuloProtegido` |
| `frontend/pages/piezas-nuevas.tsx` | Protección con `ModuloProtegido` |
| `frontend/pages/configuracion-precios.tsx` | Protección con `ModuloProtegido` |
| `frontend/pages/admin/ventas.tsx` | Protección con `ModuloProtegido` |

### Funcionamiento:

1. **sysowner** puede activar/desactivar módulos desde "Empresas" → expandir empresa → toggles
2. El login devuelve los módulos activos del entorno del usuario
3. El dashboard oculta las cards de módulos desactivados
4. Las páginas redirigen al dashboard si el módulo está desactivado
5. **sysowner** siempre tiene acceso a todos los módulos

---

## 📞 Recomendación Final

**Para la nueva empresa**, lo mínimo indispensable antes de entregar:

1. ✅ Crear un nuevo entorno de trabajo para ellos
2. ✅ **IMPLEMENTADO**: Configurar qué módulos tienen activos
3. ❌ **CRÍTICO**: Modificar `csv_auto_import.py` para soportar su CSV
4. ❌ **CRÍTICO**: Configurar su tarea de importación en el scheduler
5. ⚠️ Cambiar branding (puede hacerse después)

Si necesitas que implemente alguno de estos cambios, ¡avísame!

---

**Fecha del informe**: 5 de Febrero de 2026  
**Última actualización**: 5 de Febrero de 2026 (Sistema de módulos)  
