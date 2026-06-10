# 004 — Query Page y Rediseño de Selección

**Fecha:** 2026-06-10  
**Estado:** Completado

---

## Qué cambió

### Eliminado
- `ChatPanel` (componente lateral del split view)
- Lógica `showChat` y la vista dividida 60/40 en Documents

### Agregado
- `QueryPage` — página de chat full-width en `/query`
- `queryStats` — estado en `App` que acumula contadores por doc
- Badge de selección en `Topbar`
- Botón "Clear all" en `Topbar`

---

## Flujo de selección

| Docs seleccionados | Badge en Topbar |
|--------------------|-----------------|
| 0 | Placeholder text |
| 1–2 | `"N doc(s) selected"` · gris (`C.muted`) |
| ≥ 3 | `"Graph ready · N docs"` · azul (`C.accent`) + ícono `ti-vector-triangle` |

Los documentos seleccionados persisten al navegar entre páginas (estado en `App`).

---

## Topbar (actualizado)

```
[pills con ×] [Clear all?] [badge] [LLM selector]
```

- **Pills**: cada doc seleccionado con `×` para deseleccionar individualmente
- **Clear all**: visible cuando `selected.length >= 2`, llama `onClearAll → setSelected([])`
- **Badge**: indica estado de selección y disponibilidad de Graph
- **LLM selector**: movido a la derecha, estado en `App`

---

## QueryPage — arquitectura

```
QueryPage
├── Context band (fixed)
│   └── Pills azules de docs en contexto (con × para deseleccionar sin salir del chat)
├── Messages area (flex:1, scrollable)
│   └── max-width 720px centrado
│       └── MessageBubble × N
└── Input area (fixed bottom)
    └── max-width 720px centrado
        ├── textarea (14px, borderRadius 14px, padding-right para botón)
        ├── button circular (32×32px, borderRadius 50%, flecha arriba)
        └── footer: "N docs in context · vectors stored on your server"
```

### Estado vacío
Cuando `selected.length === 0`:
> ícono `ti-file-search` + "Select documents from the Documents page to start querying"

---

## Query tracking (queryStats)

Cada vez que el usuario envía un mensaje en `/query`:

```js
onTrackQuery([...selected])
// → App actualiza queryStats:
// { [docId]: { count: número acumulado, lastAt: ISO timestamp } }
```

Este acumulador simula el peso orgánico de cada documento: cuántas veces fue incluido en una query activa. En etapas futuras puede alimentar el campo `weight` dinámico o el grafo de conocimiento.

---

## Qué sigue (Etapa 5)

- Vista `/graphs` — visualización de nodos (documentos) y aristas (co-ocurrencias en queries)
  - Nodos escalados por `weight` o `queryStats.count`
  - Aristas entre docs que aparecen juntos en `sources` de mensajes AI
- O bien: mejoras al input (auto-resize textarea, streaming simulado de respuesta AI)
