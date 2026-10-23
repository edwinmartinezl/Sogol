# 007 — Sección Visualizar

**Fecha:** 2026-06-10  
**Estado:** Completado

---

## Qué se construyó

Nueva vista `/visualize` accesible desde la barra de navegación lateral.  
Permite explorar el contenido simulado de cada documento de forma individual.

---

## Layout

```
[Sidebar global 210px] │ [VisualizePage]
                         ├── [DocListPanel 268px] │ [DocViewer flex:1]
                         │     Search input        │   DocPreview centrado
                         │     Lista docs           │   fondo #f5f5f7
                         │     Footer conteo        │
```

---

## Componentes nuevos

### `VisualizePage`

Props: `{ selected, onToggle }` — usa el mismo estado global de selección del App.

Estado local:
- `search: string` — filtro por nombre (dentro de los seleccionados)
- `viewId: string | null` — ID del documento actualmente visualizado

**Regla de visibilidad:** solo los documentos cuyo `id` esté en `selected` aparecen en el panel izquierdo. Si `selected` está vacío, se muestra un estado vacío en lugar del layout de dos paneles. Si un documento visualizado es quitado del contexto, `viewDoc` se vuelve `null` automáticamente (derivado de `selDocs.find(...)`) y la vista derecha muestra el estado vacío.

### `DocPreview`

Props: `{ doc, isSelected, onToggle }`

Estructura:
```
┌──────────────────────────────────────────────────────┐
│  [📄 icon]  Nombre del Documento  [xlsx]  [Add ctx]  │
│             Area · Date · Size                        │
│  Weight ────────────────────────────────────── 92%   │
│  [3 Links]  [8 Graphs]  [20 Queries]                 │
├──────────────────────────────────────────────────────┤
│  SpreadsheetView (xlsx/csv) o PdfView (pdf)          │
└──────────────────────────────────────────────────────┘
```

El botón **Add to context / Remove context** hace toggle de la selección global sin navegar a otra vista.

### `SpreadsheetView`

- Tabla HTML con `DOC_COLS[doc.id]` como cabeceras
- 9 filas de bloques grises (`#e5e5ea`) de anchura variable por columna
- Filas alternadas `C.bg` / `C.surface`

Columnas por documento:
| doc | Cols |
|-----|------|
| doc-001 | Mes, Ventas ($), Target ($), ∆% |
| doc-003 | ID, Segmento, Región, LTV ($) |
| doc-004 | SKU, Producto, Stock, Ubicación |
| doc-006 | Ticket #, Categoría, Tiempo (h), Estado |

### `PdfView`

- Bloque de título (negro/gris oscuro)
- 4 secciones con título textual (`DOC_SECTIONS[doc.id]`)
- Cada sección: 5-7 líneas de bloques grises (`#e5e5ea`) de anchura variable

Secciones por documento:
| doc | Sections |
|-----|----------|
| doc-002 | Resumen Ejecutivo, Análisis de Ingresos, Estructura de Gastos, Balance |
| doc-005 | Alcance, Hallazgos, Análisis de Riesgos, Recomendaciones |
| doc-007 | Visión Estratégica, Objetivos 2026, Iniciativas Clave, Métricas |

---

## Constantes de datos

```js
const DOC_COLS = { 'doc-001': [...], 'doc-003': [...], ... }
const DOC_SECTIONS = { 'doc-002': [...], 'doc-005': [...], ... }
```

Definidas a nivel de módulo, después del array `NAV`.

---

## Archivos modificados

| Acción | Archivo |
|--------|---------|
| Modificado | `app.js` — NAV, DOC_COLS, DOC_SECTIONS, SpreadsheetView, PdfView, DocPreview, VisualizePage, render en App |
| Modificado | `documentacion/funcionalidades.md` |
| Creado | `colaboraciones/007-visualizar.md` |
