# 006 — Modal de Detalle de Nodo (Graphs)

**Fecha:** 2026-06-10  
**Estado:** Completado

---

## Qué se construyó

Componente `DocModal` que se abre al hacer click en cualquier nodo del grafo 2D.

---

## Flujo de interacción

```
Usuario hace click en nodo
  ↓
clickRef.current(d)   ← D3 click handler
  ↓
setModalDoc(documents.find(doc => doc.id === d.id))
  ↓
<DocModal doc={modalDoc} onClose={...} onRemove={onToggle} />
  ↓
  ├── Cierra: Escape / click backdrop / botón Close
  └── Quita del contexto: botón "Remove from context" → onToggle(doc.id) + onClose()
```

---

## Comportamiento del tooltip

El tooltip de hover se simplificó: antes mostraba todos los campos del documento. Ahora muestra solo `nombre + "Click para ver detalles"` para no duplicar con el modal.

---

## Componente `DocModal`

### Props

| Prop | Tipo | Descripción |
|------|------|-------------|
| `doc` | object | Documento completo del corpus |
| `onClose` | function | Cierra el modal (setModalDoc(null)) |
| `onRemove` | function | `onToggle` del App — deselecciona el doc |

### Estructura visual

```
┌──────────────────────────────────────────┐
│  [xlsx]  Ventas Q1 2026             [×]  │
│                                          │
│  Weight ─────────────────────────  85%   │
│  ████████████████░░░░░░                  │
│                                          │
│  ┌──────────┬──────────┐                 │
│  │ Area     │ Date     │                 │
│  │ Comercial│ 2026-03  │                 │
│  ├──────────┼──────────┤                 │
│  │ Size     │ Links    │                 │
│  │ 200 KB   │ 3        │                 │
│  ├──────────┼──────────┤                 │
│  │ Graphs   │ Queries  │                 │
│  │ 5        │ 12       │                 │
│  └──────────┴──────────┘                 │
│                                          │
│  [🗑 Remove from context]  [Close]       │
└──────────────────────────────────────────┘
```

### Cierre

| Acción | Resultado |
|--------|-----------|
| `Escape` | Cierra |
| Click en backdrop | Cierra |
| Botón `Close` | Cierra |
| Botón `Remove from context` | Deselecciona + cierra |

### Posicionamiento

`position: fixed` con `zIndex: 1000`. Overlay backdrop `rgba(0,0,0,0.18)`.  
El modal no cierra si se hace click dentro de él (`stopPropagation` en el card).

---

## Patrón de refs para el click handler

El click handler de D3 necesita acceder a `setModalDoc` (React state setter). Para evitar closures stale, se usa un ref actualizado en cada render:

```js
const clickRef = useRef(null);
clickRef.current = d => setModalDoc(documents.find(doc => doc.id === d.id) || d);
```

Dentro del `useEffect` de D3 (deps `[selected]`), el handler lee `clickRef.current` en tiempo de ejecución, siempre fresco.

---

## Archivos modificados

| Acción | Archivo |
|--------|---------|
| Modificado | `app.js` — nuevo componente `DocModal`, click handler actualizado en GraphsPage |
| Modificado | `documentacion/funcionalidades.md` — sección modal agregada |
| Creado | `colaboraciones/006-modal-detalle-nodo.md` |
