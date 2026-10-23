# Arquitectura — Sogol

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

Paleta inspirada en el hardware Meris LVX — tonos cálidos off-white con acento azul. Definida como objeto `C` en `app.js`; es la única fuente de verdad de colores — cambiar un token propaga el cambio a toda la UI.

| Token | Valor | Uso |
|-------|-------|-----|
| `bg` | `#f4f3f1` | Fondo principal (warm off-white) |
| `surface` | `#eae8e5` | Sidebar, headers, superficies secundarias |
| `border` | `0.5px solid #c4c0b8` | Separadores y bordes de cards |
| `text` | `#28261f` | Texto principal (carbón cálido) |
| `muted` | `#8a8780` | Texto secundario y placeholders |
| `accent` | `#2563eb` | Color de acento (azul Sogol) |
| `font` | SF Pro Text / system-ui | Fuente del sistema |

El acento azul se aplica en: botones primarios, pills de selección, estados activos en nav, barras de progreso, badges, burbujas de usuario en chat y highlight de sesión activa.

### Variantes de opacidad del acento

| Sufijo | Opacidad | Uso típico |
|--------|----------|------------|
| `C.accent+'14'` | ~8% | Fondo de nav item activo, fondo de pill seleccionada |
| `C.accent+'0a'` | ~4% | Fondo de chat session activa |
| `C.accent+'55'` | ~33% | Borde de chat session activa |
| `C.accent+'35'` | ~21% | Borde de pill seleccionada |
| `C.accent+'12'` | ~7% | Fondo de badge "Graph ready" |

## Backend — servidor Node.js

El proyecto tiene un servidor HTTP mínimo que corre en paralelo al frontend.

| Aspecto | Detalle |
|---------|---------|
| Runtime | Node.js puro — módulos `http`, `fs`, `path`, `crypto` |
| Dependencias | `better-sqlite3` (ORM síncrono) + `busboy` (multipart parser) |
| Puerto | **3001** — el frontend lo llama con `fetch('http://localhost:3001/api/...')` |
| Puerto frontend | 3000 (`python -m http.server`) |

### Endpoints

| Método | Ruta | Función |
|--------|------|---------|
| `POST` | `/api/upload` | Recibe archivo multipart → guarda en disco → inserta en SQLite |
| `GET` | `/api/files` | Lista archivos de una empresa desde SQLite |
| `PATCH` | `/api/files/:id/move` | Actualiza `dept_id` / `group_id` en SQLite |
| `DELETE` | `/api/files/:id` | Elimina registro SQLite + archivo físico |

CORS habilitado con `Access-Control-Allow-Origin: *` en todos los endpoints.

### Storage — estructura en disco

```
knowed/
├── server.js
├── knowlayer.db           ← SQLite (se crea al primer inicio)
├── clientes/
│   └── CLI001/
│       └── empresas/
│           └── empresa-demo/
│               └── files/ ← archivos subidos viven aquí
```

El servidor crea los directorios intermedios (`fs.mkdirSync({ recursive:true })`) si no existen al momento del upload.

### DB — tabla `files`

```sql
CREATE TABLE IF NOT EXISTS files (
  id            TEXT PRIMARY KEY,   -- crypto.randomUUID()
  client_id     TEXT NOT NULL,      -- 'CLI001'
  company_id    TEXT NOT NULL,      -- slug de empresa, ej. 'empresa-demo'
  original_name TEXT NOT NULL,      -- nombre original del archivo
  stored_name   TEXT NOT NULL,      -- '{uuid}.{ext}' — evita colisiones
  path_on_disk  TEXT NOT NULL,      -- ruta absoluta al archivo físico
  type          TEXT NOT NULL,      -- 'pdf' | 'txt' | 'xlsx'
  size_bytes    INTEGER NOT NULL,
  dept_id       TEXT,               -- null si sin asignar
  group_id      TEXT,               -- null si sin asignar
  uploaded_at   TEXT NOT NULL,      -- ISO-8601 UTC
  vectorized    INTEGER DEFAULT 1,  -- 1 = listo para RAG (siempre en prototipo)
  chunks        INTEGER DEFAULT 0   -- fragmentos estimados: max(5, floor(size/1000))
)
```

### Integración frontend ↔ backend

```
DocumentsPage (useEffect[activeCo])
  → apiGetFiles(slug) → GET /api/files
  → normalizeReal(row) → doc con isReal:true, vectorized:1, chunks
  → allDocs = [...mockDocs, ...realDocs]

input[file].onChange → setPendingFiles(files)
  → UploadPreviewModal (previsualización)
  → confirmar → doUpload(file) → apiUpload → POST /api/upload
  → VectorizingModal (~4s animación)
  → inserta en realDocs + assign

handleCtxAction('delete') → setDeleteDocId(id)
  → DeleteDocModal (nivel 1/2/3 según uso)
  → confirmar → apiDeleteFile(id) → DELETE /api/files/:id
  → filtra realDocs + assign + selected
```

Si el servidor no está corriendo, el `catch` silencia el error — los docs mock siguen apareciendo normalmente.

## Sin paso de compilación

El proyecto corre como SPA sin bundler. El browser descarga:

1. `react.development.js` y `react-dom.development.js` (UMD globals `window.React`, `window.ReactDOM`)
2. `babel.min.js` — transforma JSX en runtime
3. `app.js` cargado como `<script type="text/babel" data-presets="react">`

Babel intercepta el script y lo compila antes de ejecutarlo.

## Estructura de archivos

```
knowed/
├── index.html          — shell HTML con CDN scripts + título "Sogol"
├── app.js              — toda la aplicación React (single file)
├── server.js           — servidor HTTP Node.js + SQLite
├── knowlayer.db        — SQLite (se crea al primer inicio)
├── data/
│   └── mock.js         — ES module (fuente de verdad para datos de prueba)
├── documentacion/
│   ├── arquitectura.md
│   ├── funcionalidades.md
│   └── datos-mock.md
├── colaboraciones/
│   ├── 017-rebrand-sogol-login-animaciones.md
│   ├── 018-weight-real-grafos-guardados-deseleccionar.md
│   ├── 019-sistema-peso-absoluto.md
│   └── 020-upload-preview-delete-safe.md
└── clientes/
    └── CLI001/empresas/{slug}/files/  — archivos subidos
```

## Flujo de datos

```
App (estado global)
├── selected: string[]        — IDs de documentos activos en contexto
├── page: string              — ruta actual (documents | graphs | chat | policies)
├── llm: string               — modelo LLM seleccionado
├── docStats: Record          — { [docId]: { queries: number } } — conteo por sesión
├── savedGraphs: Graph[]      — [{ id, name, comment, docIds, createdAt }]
├── companies: { id, name }[] — lista de empresas
├── activeCo: string          — ID de empresa activa
├── showNewCo: boolean        — modal de nueva empresa
└── newCoName: string         — input del modal

App → Sidebar       (selected, onToggle, page, onNav)
App → Topbar        (selected, onRemove, onClearAll, page, companies, activeCo,
                     onSwitchCo, onNewCo, allRealDocs)
App → DocumentsPage (activeCo, companies, docStats, savedGraphs)
App → GraphsPage    (selected, docStats, savedGraphs, onSaveGraph, onDeleteGraph,
                     onLoadGraph, allRealDocs)
App → ChatPage      (selected, onSend → trackQuery)
```

`trackQuery(docIds)` — incrementa `docStats[id].queries` por cada doc en contexto cuando el usuario envía un mensaje real desde el chat:

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

> `docStats` vive en memoria — no persiste entre recargas. Para persistencia futura: `localStorage` o columna en `files`.

### Por qué `companies`/`activeCo` viven en App

El selector de empresa necesita estar en el Topbar (visibilidad global), pero la lógica de árbol está en DocumentsPage. Levantar el estado a App permite que Topbar lea y mute la empresa activa mientras DocumentsPage reacciona con `useEffect([activeCo])`.

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
- Fondo `C.bg` (warm off-white) — aristas en tono muted sobre superficie limpia
- Solo se construye con ≥ 3 docs seleccionados; estado vacío si hay menos
- Re-init completo en `useEffect([selected])` con cleanup: `sim.stop()` + zoom off

### Construcción de aristas (`GRAPH_EDGES`)

`GRAPH_EDGES` se computa al inicio desde `CHAT_HISTORY` como co-ocurrencias de docs en `msg.sources`:

```js
const GRAPH_EDGES = (() => {
  const co = {};
  CHAT_HISTORY.forEach(msg => {
    if (!msg.sources || msg.sources.length < 2) return;
    for (let i = 0; i < msg.sources.length; i++)
      for (let j = i+1; j < msg.sources.length; j++) {
        const k = [msg.sources[i], msg.sources[j]].sort().join('|');
        co[k] = (co[k] || 0) + 1;
      }
  });
  return Object.entries(co).map(([k,w]) => {
    const [a,b] = k.split('|');
    return { from:a, to:b, weight:w };
  });
})();
```

En el `useEffect` de GraphsPage, el grafo conecta **todos los pares** de `selDocs` con fallback `weight:1` cuando no hay co-ocurrencia — garantiza conectividad total para cualquier combinación ≥ 3 docs.

## Principio fundamental de Sogol (prototipo)

> **Todo documento subido al sistema está vectorizado por definición.**

En la fase de prototipo, no existe un motor de vectorización real. El campo `vectorized = 1` se asigna automáticamente en el servidor al momento de la subida — todos los archivos están listos para RAG desde que se cargan.

| Aspecto | Valor |
|---------|-------|
| `vectorized` | Siempre `1` en la BD |
| `chunks` | `max(5, floor(size_bytes / 1000))` — estimado por tamaño |
| `VectorizingModal` | Animación de progreso simulada (~4s); no ejecuta vectorización real |
| Restricción de subida | Ninguna — cualquier doc válido se puede subir en modo prueba |

**Por qué:** Sogol se está desarrollando y probando antes de integrar un motor de embeddings real (OpenAI, Cohere, etc.). Bloquear la subida hasta tener vectorización real impediría avanzar el prototipo. Cuando se integre el motor, se cambia `vectorized` al valor real y `VectorizingModal` ejecutará el proceso verdadero.

### Columnas de vectorización en `files`

```sql
vectorized INTEGER DEFAULT 1   -- 1 = listo para RAG (siempre en prototipo)
chunks     INTEGER DEFAULT 0   -- número de fragmentos; 0 si no está calculado
```

Migración segura para bases de datos existentes:

```js
try { db.exec(`ALTER TABLE files ADD COLUMN vectorized INTEGER DEFAULT 1`); } catch {}
try { db.exec(`ALTER TABLE files ADD COLUMN chunks INTEGER DEFAULT 0`);     } catch {}
```

El `try/catch` silencia el error si la columna ya existe — idempotente en cualquier DB.

---

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
