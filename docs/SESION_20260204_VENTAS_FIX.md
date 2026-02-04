# Sesión de Debugging: Sistema de Detección de Ventas
**Fecha:** 4 de Febrero de 2026

## Resumen del Problema

El sistema de detección de piezas vendidas no estaba registrando nuevas ventas desde el 1 de febrero de 2026, a pesar de que se estaban vendiendo piezas en la plataforma.

## Investigación Realizada

### 1. Análisis de la Base de Datos

```
Ventas por día (últimas registradas):
- 2026-02-01: 132 piezas
- 2026-01-30: 149 piezas
- 2026-01-29: 131 piezas
```

La última venta registrada fue el 1 de febrero, confirmando que el sistema dejó de detectar ventas.

### 2. Revisión de Logs del VPS

Los logs del scheduler mostraban:
```
INFO: Importación completada:
  - Nuevas: 0
  - Vendidas detectadas: 0
  - Total en stock: 0  ← ¡PROBLEMA!
```

El sistema reportaba "Total en stock: 0" a pesar de que el CSV tenía 120,163 piezas.

### 3. Análisis del CSV

Al verificar el CSV de MotoCoche (`StockSeinto.csv`):
- El archivo tenía 120,164 líneas (120,163 piezas + cabecera)
- Se actualizaba correctamente cada día
- El número de líneas coincidía con las piezas en BD

### 4. Descubrimiento del Bug

Al leer el CSV programáticamente, se descubrió:

```python
Cabeceras: ['\ufeffref.id', 'ref.pieza', 'anostock', 'precio', 'peso']
Primeros ref.id: ['\ufeff114355', '115363', '116580']
```

**El problema:** El archivo CSV tiene un **BOM (Byte Order Mark)** `\ufeff` al inicio.

## Causa Raíz

El BOM (Byte Order Mark) es un carácter invisible que algunos editores añaden al inicio de archivos UTF-8 para indicar el encoding. 

### Flujo del Bug:

1. El CSV se genera con BOM: `\ufeffref.id;ref.pieza;...`
2. La función `leer_csv_stock()` usaba `encoding='utf-8'` que NO elimina el BOM
3. La cabecera se leía como `'\ufeffref.id'` en lugar de `'ref.id'`
4. La función `mapear_fila_a_pieza()` busca la columna `'ref.id'`
5. No coincide con `'\ufeffref.id'` → El mapeo falla silenciosamente
6. Ninguna fila obtiene un `refid` válido
7. `nuevos_refids` queda vacío
8. El sistema no puede comparar → No detecta ventas ni piezas nuevas

### Por qué funcionaba antes (probablemente):

El CSV probablemente cambió su formato de exportación en algún momento y empezó a incluir el BOM.

## Solución Implementada

### Archivo: `backend/services/csv_auto_import.py`

**Antes:**
```python
with open(csv_path, 'r', encoding='utf-8', errors='replace') as f:
    # ...
    cabeceras = [c.strip().lower() for c in cabeceras]
```

**Después:**
```python
# Usar utf-8-sig para manejar BOM automáticamente
with open(csv_path, 'r', encoding='utf-8-sig', errors='replace') as f:
    # ...
    # Limpiar cabeceras (remover BOM residual si lo hubiera)
    cabeceras = [c.strip().lower().lstrip('\ufeff') for c in cabeceras]
    
    for fila in reader:
        if len(fila) >= len(cabeceras) / 2:
            # Limpiar BOM del primer valor si existe
            if fila and fila[0]:
                fila[0] = fila[0].lstrip('\ufeff')
            filas.append(fila)
```

### Cambios clave:

1. **`encoding='utf-8-sig'`**: Python elimina automáticamente el BOM UTF-8
2. **`.lstrip('\ufeff')`**: Limpieza adicional por si queda BOM residual
3. **Limpieza del primer valor**: Por si el BOM se propaga a los datos

## Verificación

Después del fix:
```python
Cabeceras: ['ref.id', 'ref.pieza', 'anostock', 'precio', 'peso']
Primeros ref.id: ['114355', '115363', '116580']
Total filas: 120164
```

✅ Las cabeceras y valores ahora se leen correctamente sin el BOM.

## Cómo Funciona el Sistema de Detección de Ventas

### Flujo Normal:

1. **Cada 30 minutos** el scheduler ejecuta `importar_csv_motocoche()`
2. Lee el CSV de `/var/uploads/csv/StockSeinto.csv`
3. Obtiene todos los `refid` del CSV → `nuevos_refids`
4. Obtiene todos los `refid` de la BD → `ids_actuales`
5. Calcula diferencia: `ids_vendidas = ids_actuales - nuevos_refids`
6. Las piezas que están en BD pero NO en CSV → Se marcan como VENDIDAS
7. Se mueven a la tabla `piezas_vendidas`

### Protecciones:

- **Límite 20%**: Si se detecta más del 20% del stock como vendido, se asume CSV corrupto
- **Límite 50%**: Si el CSV tiene menos del 50% de las piezas, se asume CSV incompleto
- **Limpieza de falsas ventas**: Cada 6 horas se limpia ventas falsas (piezas que volvieron a aparecer)

## Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                     VPS (72.61.98.80)                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────┐     ┌────────────────────────────┐   │
│   │ /var/uploads/   │     │   Backend (FastAPI)        │   │
│   │ csv/            │     │                            │   │
│   │ StockSeinto.csv │────▶│ csv_auto_import.py         │   │
│   │                 │     │   ├─ leer_csv_stock()      │   │
│   │ (Actualizado    │     │   ├─ importar_csv_motocoche│   │
│   │  por FTP desde  │     │   └─ detectar_vendidas()   │   │
│   │  MotoCoche)     │     │                            │   │
│   └─────────────────┘     └────────────────────────────┘   │
│                                    │                        │
│                                    ▼                        │
│                           ┌────────────────┐                │
│                           │  desguapro.db  │                │
│                           │                │                │
│                           │ piezas_desguace│                │
│                           │ piezas_vendidas│                │
│                           └────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

## Estadísticas Actuales

| Métrica | Valor |
|---------|-------|
| Piezas en stock | 477,286 |
| Piezas vendidas | 3,997 |
| Última venta registrada | 2026-02-01 18:33:31 |
| CSV líneas | 120,164 |

## Próximos Pasos

1. ✅ Fix implementado y commiteado localmente
2. ⏳ Subir cambios a GitHub
3. ⏳ Desplegar en VPS
4. ⏳ Reiniciar servicio backend en VPS
5. ⏳ Verificar que el próximo ciclo de importación detecta ventas correctamente

## Lecciones Aprendidas

1. **Siempre usar `utf-8-sig`** cuando se leen CSVs de fuentes externas (Excel, etc.)
2. **Logs silenciosos son peligrosos**: El sistema reportaba "0 piezas" pero no generaba error
3. **Verificar los datos crudos**: Un simple `print(repr(cabeceras[0]))` habría revelado el BOM
4. **Los caracteres invisibles existen**: BOM, zero-width spaces, etc. pueden causar bugs difíciles de detectar

## Comandos Útiles para Debugging

```bash
# Ver si un archivo tiene BOM
file StockSeinto.csv
# Output: "UTF-8 Unicode (with BOM) text"

# Ver caracteres hexadecimales del inicio
xxd StockSeinto.csv | head -1
# Output: EF BB BF (= BOM UTF-8)

# En Python, detectar BOM
with open('file.csv', 'rb') as f:
    print(f.read(3))  # b'\xef\xbb\xbf' = BOM
```

---

**Autor:** GitHub Copilot (Claude Opus 4.5)  
**Commit:** `fix: corregir lectura CSV con BOM`
