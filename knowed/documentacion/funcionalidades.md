# Funcionalidades — KnowLayer

## Sidebar

- Lista de documentos con secciones **This month** / **Older**
- Búsqueda por nombre en tiempo real
- Checkboxes de selección por documento (estado persiste entre páginas)
- Botón Upload (UI, sin backend)
- Navegación entre vistas (Documents, Graphs, Chat, Policies)

## Topbar

| Condición | Badge |
|-----------|-------|
| 0 docs | Texto de ayuda gris |
| 1–2 docs | `"N doc(s) selected"` — pill gris |
| ≥ 3 docs | `"Graph ready · N docs"` — pill azul con ícono triángulo |

- Pills individuales con `×` para deseleccionar sin salir de la vista
- Botón **Clear all** cuando `selected.length >= 2`
- Selector de modelo LLM (Claude 3.5, GPT-4o, Gemini, Llama)

## Vista Documents (`/documents`)

- Tabla con columnas: Name, Type, Area, Date, Size, Weight, Links, Graphs, Queries
- Filas alternadas, click en fila toggle selección
- TypeBadge coloreado por tipo: xlsx verde, pdf rojo, csv azul
- Weight: color verde si ≥90%, neutro si ≥70%, gris si <70%

## Vista Graphs (`/graphs`)

El grafo **solo se construye cuando hay 3 o más documentos seleccionados**.

| Docs seleccionados | Estado de la vista |
|--------------------|--------------------|
| 0 | Ícono + "Selecciona al menos 3 documentos para construir el grafo" |
| 1–2 | Mismo mensaje + contador "N de 3 seleccionados" |
| ≥ 3 | Grafo 3D activo |

- Grafo 3D interactivo en canvas HTML5 puro
- **Nodos**: solo los documentos seleccionados; círculos con radio proporcional al `weight` (mapeo 20–40px base)
  - Color por tipo: xlsx `#34a853`, pdf `#ea4335`, csv `#4285f4`
  - Opacidad aumenta con profundidad (efecto 3D)
  - Anillo azul `#0071e3` en hover
  - Label truncado a 14 chars bajo cada nodo
- **Aristas**: líneas entre docs co-ocurrentes en `sources` de mensajes AI, filtradas a la selección activa
  - Grosor proporcional al número de co-ocurrencias
- **Rotación**: drag horizontal → eje Y, drag vertical → eje X (clamped ±1.4 rad)
- **Auto-rotación**: eje Y a 0.004 rad/frame cuando no hay drag
- **Click en nodo**: abre modal de detalle del documento
- **Hover**: tooltip ligero con nombre + "Click para ver detalles"
- **Header**: `N nodes · N edges` + badge `Graph ready` cuando ≥3 seleccionados

### Modal de detalle (`DocModal`)

Se abre al hacer click en cualquier nodo del grafo.

| Elemento | Descripción |
|----------|-------------|
| TypeBadge + nombre | Header del modal |
| Barra de Weight | Progress bar `0–100%` con color accent |
| Grid 2×3 | Area, Date, Size, Links, Graphs, Queries |
| "Remove from context" | Deselecciona el doc y cierra el modal |
| "Close" / Escape / click backdrop | Cierra sin deseleccionar |

## Vista Chat (`/chat`) — home

- Banda de contexto con pills de documentos activos (deseleccionables con ×)
- Historial de mensajes pre-seeded (`CHAT_HISTORY`)
- Burbujas de chat: user (azul, derecha) / AI (gris, izquierda)
- Emergent Insight card dentro de burbujas AI cuando hay `msg.insight`
- Source pills bajo burbujas AI indicando qué documentos se usaron
- Input con Enter para enviar, Shift+Enter para salto de línea
- Botón circular con flecha, activo solo si hay texto
- Tracking de `queryStats` por documento en cada envío
- Footer con conteo de contexto y disclaimer de seguridad

## Vista Policies (`/policies`)

- Placeholder — pendiente
