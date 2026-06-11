# Arquitectura — KnowLayer

## Stack técnico

| Capa | Tecnología |
|------|------------|
| UI | React 18 (UMD via unpkg) |
| JSX | Babel Standalone (`@babel/standalone`) |
| Estilos | Tailwind CSS CDN + CSS-in-JS inline |
| Iconos | Tabler Icons Webfont CDN |
| Servidor dev | `npx serve` (Node.js) |
| Build | Ninguno — carga directa en browser |

## Design tokens (`C`)

Paleta inspirada en el hardware Meris LVX — tonos cálidos off-white con acento naranja.

| Token | Valor | Uso |
|-------|-------|-----|
| `bg` | `#f4f3f1` | Fondo principal (warm off-white) |
| `surface` | `#eae8e5` | Sidebar, headers, superficies secundarias |
| `border` | `0.5px solid #c4c0b8` | Separadores y bordes de cards |
| `text` | `#28261f` | Texto principal (carbón cálido) |
| `muted` | `#8a8780` | Texto secundario y placeholders |
| `accent` | `#e8561c` | Color de acento (naranja LED) |

El acento naranja sustituye al azul Apple en: botones primarios, pills de selección, estados activos en nav, barras de progreso y badges.

## Sin paso de compilación

El proyecto corre como SPA sin bundler. El browser descarga:

1. `react.development.js` y `react-dom.development.js` (UMD globals `window.React`, `window.ReactDOM`)
2. `babel.min.js` — transforma JSX en runtime
3. `app.js` cargado como `<script type="text/babel" data-presets="react">`

Babel intercepta el script y lo compila antes de ejecutarlo.

## Estructura de archivos

```
knowed/
├── index.html          — shell HTML con CDN scripts
├── app.js              — toda la aplicación React (single file)
├── data/
│   └── mock.js         — ES module (fuente de verdad para backend futuro)
├── documentacion/
│   ├── arquitectura.md
│   ├── funcionalidades.md
│   └── datos-mock.md
└── colaboraciones/
    ├── 001-setup-inicial.md
    ├── 002-layout-base.md
    ├── 003-chat-panel.md
    ├── 004-query-page.md
    └── 005-graphs-y-documentacion.md
```

## Flujo de datos

```
App (estado global)
├── selected: string[]      — IDs de documentos activos
├── page: string            — ruta actual (documents | graphs | chat | policies)
├── llm: string             — modelo LLM seleccionado
└── queryStats: Record      — { [docId]: { count, lastAt } }

App → Sidebar   (selected, onToggle, page, onNav)
App → Topbar    (selected, onRemove, onClearAll, llm, onLlmChange)
App → *Page     (selected, onToggle / onRemove)
```

## Navegación

Estado `page` en `App`. Sin react-router-dom ni URLs. Cada valor de `page` renderiza un componente dentro del área principal:

```
page === 'documents' → <DocumentsPage />
page === 'visualize' → <VisualizePage />
page === 'graphs'    → <GraphsPage />
page === 'chat'      → <ChatPage />
page === 'policies'  → <PoliciesPage />
```

## Jerarquía de organización (Documents)

Los documentos se organizan en 4 niveles navegables:

```
Empresa (company)
└── Departamento (department)   — Finanzas, IT, Ventas, RRHH, Operaciones
    └── Grupo (group)           — Cierres Q1, Pipeline Ventas, …
        └── Documento           — ventas_Q1.xlsx, reporte.pdf, …
```

La estructura se define en la constante `TREE` (módulo `app.js`):

```js
TREE.company          → { id, name }
TREE.departments[]    → { id, name, icon }
TREE.groups[]         → { id, name, deptId }
TREE.docAssignments   → { [docId]: { deptId, groupId } }
```

`docAssignments` es la fuente de verdad inmutable. `DocumentsPage` mantiene una copia mutable en el estado local (`assign`) que se actualiza con drag & drop sin persistencia.

### Vistas internas de `DocumentsPage`

| `nav.view` | Contenido |
|------------|-----------|
| `'all'` | Grid de cards de departamentos |
| `'dept'` | Carpetas de grupos + docs sueltos del departamento |
| `'group'` | Tabla de documentos del grupo |
| `'flat'` | Tabla plana de todos los docs con columna Location |

## Vista Graphs — renderer 2D (D3.js)

- Librería: **D3.js v7** via CDN (`https://d3js.org/d3.v7.min.js`, global `d3`)
- Rendering: SVG — nodos como `<circle>`, aristas como `<line>`, labels como `<text>`
- Simulación: `d3.forceSimulation` con `forceLink`, `forceManyBody`, `forceCenter`, `forceCollide`
- Zoom/pan: `d3.zoom()` aplicado al SVG container
- Drag: `d3.drag()` con `alphaTarget` para "calentar" la simulación
- Click en nodo → abre `DocModal` con detalle del documento
- Hover → tooltip ligero (nombre + "Click para ver detalles")
- Fondo blanco `C.bg` — líneas grises `#d1d1d6` sobre superficie limpia
- Solo se construye con ≥ 3 docs seleccionados; estado vacío si hay menos
- Re-init completo en `useEffect([selected])` con cleanup: `sim.stop()` + zoom off

## Seguridad — modelo basado en datos

El control de acceso en KnowLayer se aplica **en la capa de datos**, no en el LLM.

```
Usuario con rol X
    │
    ▼
Consulta al sistema
    │
    ├─ Política activa → filtra IDs de documentos permitidos
    │
    ▼
DB vectorial (namespace por área/policy)
    │  Solo se recuperan vectores de docs permitidos
    ▼
Contexto LLM  ← nunca recibe vectores de docs fuera de política
    │
    ▼
Respuesta
```

### Principios

| Principio | Implementación |
|-----------|----------------|
| Acceso por rol | Cada política define roles → conjunto de docs |
| Namespaces vectoriales | Cada área/policy tiene su propio namespace en la DB vectorial |
| Zero leakage | El LLM no puede acceder a lo que no está en su contexto de inferencia |
| No depende del LLM | No se instruye al modelo qué puede decir — se controla qué datos recibe |

### Niveles de acceso

| Nivel | Qué entrega a la DB vectorial |
|-------|-------------------------------|
| Full module | Todos los chunks del documento |
| Document only | Solo chunks del documento, sin metadatos de relaciones |
| Temporary (24h) | Token de acceso con TTL; la DB rechaza queries vencidas |

### Relación entre DBs

```
DB Relacional (PostgreSQL)
  └── documents, policies, roles, access_grants
        │
        ▼ filtro de IDs permitidos
DB Vectorial (Pinecone / pgvector)
  └── namespaces: [area-comercial, area-finanzas, area-legal, ...]
        │
        ▼ solo vectores autorizados
LLM context window
```
