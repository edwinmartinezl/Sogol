# 018 — Weight real, grafos guardados y deseleccionar

**Fecha:** 2026-06-12  
**Estado:** Completado

---

## Resumen

Esta etapa añadió tres grupos de mejoras:

1. **Weight real** — la barra de progreso y el % de cada documento ahora reflejan el uso real (consultas desde el chat)
2. **Grafos guardados** — la sección Grafos permite guardar combinaciones de ≥3 documentos con nombre, comentario e ID único
3. **Deseleccionar** — botón en toolbar y opción en menú contextual para limpiar la selección

---

## 1. Weight real

### Problema anterior

`weight` era un valor estático (`0.5`) en todos los documentos reales. La barra de progreso y la columna `queries` en la tabla no reflejaban uso real.

### Solución: `docStats` en App

```js
const [docStats, setDocStats] = useState({});
// { [docId]: { queries: number } }
```

`trackQuery(docIds)` — llamado cuando el usuario envía un mensaje desde el chat con docs en contexto:

```js
const trackQuery = docIds => {
  setDocStats(prev => {
    const next = { ...prev };
    docIds.forEach(id => {
      next[id] = { queries: (prev[id]?.queries || 0) + 1 };
    });
    return next;
  });
};
```

### Helper `effW` en DocumentsPage

```js
const effW = doc => {
  const q = docStats?.[doc.id]?.queries || 0;
  return q > 0 ? Math.min(1, q / 10) : doc.weight;
};
```

Escala: 0 queries = peso original del doc · 10 queries = 100%

### Columna queries

La columna `queries` en la vista tabla ahora muestra:
```js
docStats?.[doc.id]?.queries || doc.queries
```

### Props añadidos

| Prop | De → A |
|------|--------|
| `docStats` | App → DocumentsPage |
| `docStats` | App → GraphsPage |

---

## 2. Grafos guardados

### Estado en App

```js
const [savedGraphs, setSavedGraphs] = useState([]);
// [{ id, name, comment, docIds, createdAt }]
```

### `saveGraph({ name, comment })`

```js
const saveGraph = ({ name, comment } = {}) => {
  if (selected.length < 3) return;
  const g = {
    id:        'g' + Date.now(),   // ID único interno (timestamp)
    name:      name.trim() || `Grafo ${savedGraphs.length + 1}`,
    comment:   comment.trim(),
    docIds:    [...selected],
    createdAt: new Date().toISOString(),
  };
  setSavedGraphs(prev => [g, ...prev]);
};
```

Restricción: mínimo 3 documentos seleccionados para poder guardar.

### Modal de guardado (patrón centrado)

Misma UX que "New folder" / "New department":

```
┌─────────────────────────────────────┐
│  Guardar grafo                      │
│  N documentos · combinación         │
│                                     │
│  Nombre                             │
│  [────────────────────────────]     │
│                                     │
│  Comentario (opcional)              │
│  [────────────────────────────]     │
│  [────────────────────────────]     │
│                                     │
│  [chip1] [chip2] [chip3] ...        │
│                                     │
│              [Cancelar] [Guardar]   │
└─────────────────────────────────────┘
```

- Preview de chips con nombre corto (sin extensión) y color por tipo
- ESC cierra el modal

### Panel lateral de grafos (GraphsPage)

Panel izquierdo (`230px`) siempre visible en la sección Grafos:

- Lista de grafos guardados (click → carga esa selección)
- El grafo cuya selección coincide exactamente con `selected` se resalta en azul
- Cada card muestra: nombre, comentario (si tiene), chips de docs (máx. 4), conteo + fecha
- Botón ✕ para eliminar
- Botón "Guardar grafo (N docs)" en la parte inferior (solo si ≥3 docs seleccionados)

### Props añadidos a GraphsPage

| Prop | Descripción |
|------|-------------|
| `savedGraphs` | Array de grafos guardados |
| `onSaveGraph(obj)` | Guarda un grafo nuevo |
| `onDeleteGraph(id)` | Elimina por ID |
| `onLoadGraph(docIds)` | Carga una selección guardada |

---

## 3. Deseleccionar todo

### Botón en toolbar (DocumentsPage)

Aparece cuando `selected.length > 0`:

```jsx
<button onClick={onClearAll}>
  <i className="ti ti-square-x" />
  {selected.length} seleccionados · Deseleccionar
</button>
```

### Menú contextual (click derecho sobre área vacía)

Nueva opción en `CTX_ITEMS.blank`:

```js
{ icon:'ti-checkbox', label:'Deseleccionar todo', action:'clearall', onlyIfSelected:true }
```

`onlyIfSelected:true` → solo aparece si `selected.length > 0` (pasado como `menu.hasSelected`).

`openCtx` ahora incluye `hasSelected: selected.length > 0` en el estado del menú.

Handler:
```js
} else if (action === 'clearall') {
  onClearAll?.();
}
```

---

## 4. Correcciones menores

- **Details** (click derecho → Detalles): ahora abre `DocModal` correctamente (antes solo hacía `console.log`)
- **Mover a carpeta**: abre `MoveToModal` con jerarquía dept → grupos, actualiza inmediatamente y llama `PATCH /api/files/:id/move`
- **Barra de progreso**: color según tipo de archivo (`TYPE_COLOR[doc.type]`) en lugar de color fijo

---

## Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `app.js` | `docStats`, `savedGraphs`, `saveGraph`, `deleteGraph`, `loadGraph`, `GraphsPage` rediseñado con panel lateral, modal de guardado, toolbar con deseleccionar, menú contextual actualizado |
