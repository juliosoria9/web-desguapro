# DesguaPro - Historial de Cambios (CHANGELOG)

Registro de todos los cambios realizados respecto a versiones anteriores.

---

## [1.1.0] - 2026-01-31

### ✨ Nuevas Funcionalidades

#### Burbuja de Conteo por OEM
**Archivos modificados:**
- `frontend/pages/admin/stock.tsx`
- `frontend/pages/piezas-nuevas.tsx`

**Descripción del cambio:**
La burbuja azul que aparece sobre las imágenes de las piezas ahora muestra **la cantidad de piezas que comparten el mismo OEM**, en lugar de mostrar la cantidad de imágenes de la pieza.

**Antes:**
- La burbuja mostraba `+N` donde N era el número de imágenes adicionales
- Por ejemplo: una pieza con 4 fotos mostraba `+3`

**Ahora:**
- La burbuja muestra el número de piezas con el mismo OEM
- Por ejemplo: si hay 8 piezas con OEM "1J4959857D", todas muestran `8`
- Solo aparece si hay más de 1 pieza con ese OEM
- Al hacer hover muestra tooltip: "8 piezas con OEM: 1J4959857D"

**Implementación técnica:**

1. **Contador por OEM con `useMemo`:**
```typescript
const contadorPorOem = React.useMemo(() => {
  const contador: Record<string, number> = {};
  piezas.forEach(p => {
    if (p.oem && p.oem.trim()) {
      const oem = p.oem.trim().toLowerCase();
      contador[oem] = (contador[oem] || 0) + 1;
    }
  });
  return contador;
}, [piezas]);
```

2. **Función auxiliar:**
```typescript
const getCantidadMismoOem = (pieza: PiezaStock): number => {
  if (!pieza.oem || !pieza.oem.trim()) return 0;
  return contadorPorOem[pieza.oem.trim().toLowerCase()] || 0;
};
```

3. **Renderizado de la burbuja:**
```tsx
{getCantidadMismoOem(pieza) > 1 && (
  <span 
    className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold"
    title={`${getCantidadMismoOem(pieza)} piezas con OEM: ${pieza.oem}`}
  >
    {getCantidadMismoOem(pieza)}
  </span>
)}
```

**Nota:** En `piezas-nuevas.tsx` se usa el campo `oe` en lugar de `oem` debido a la estructura de datos diferente de esa página.

---

## [1.0.0] - 2026-01-24

### 🚀 Versión Inicial
- Sistema completo de gestión de piezas de desguace
- Autenticación con JWT y cookies HTTPOnly
- Multi-tenant con entornos de trabajo
- Scrapers de múltiples plataformas (eBay, Ecooparts, etc.)
- Sistema de fichadas
- Gestión de stock y ventas
- Panel de administración
- Backups automáticos
- Auditoría de acciones

---

*Este archivo se actualiza con cada cambio significativo del proyecto.*
