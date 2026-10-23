# Funcionalidades — Sogol

## Sidebar

El sidebar tiene tres zonas verticales:

1. **Nav** — 6 ítems de navegación (Documents, Visualizar, Graphs, Chat, Policies, Configuración)
2. **This month** — documentos cuya `date` pertenece al mes actual; cada ítem es un `DocItem` toggleable
3. **Older** — historial de sesiones de chat pasadas (`CHAT_SESSIONS`); los documentos de cada sesión siempre están disponibles para añadir al contexto activo

### Older — historial de chats

Cada `ChatSessionItem` muestra:
- Icono `ti-message-circle` + preview truncado de la pregunta principal
- Pills por cada doc referenciado en esa sesión (click = toggle en contexto global)
- Fecha de la sesión alineada a la derecha

**Ventaja de diseño:** los documentos de conversaciones históricas nunca desaparecen del sidebar; siempre se pueden rescatar al contexto activo sin navegar a Documents.

### Búsqueda de chats

El input de búsqueda está ubicado **debajo de la etiqueta "Older"** y filtra `CHAT_SESSIONS` por el texto de `preview` en tiempo real. Placeholder: `"Search chats…"`.

### Highlight de sesión activa

Al hacer click en un `ChatSessionItem`:
- El ítem se marca como activo: borde `1px solid #e8561c55` (naranja suave) + fondo `#e8561c0a`
- Icono y texto del preview cambian a color `accent`
- Todos los docs de esa sesión se añaden al contexto global (si no estaban ya)
- Click en una pill individual hace toggle del doc solo (con `e.stopPropagation()`)

Solo una sesión puede estar activa a la vez (estado `activeSession` en `Sidebar`).

- Estado de selección persiste entre páginas
- Botón Upload **eliminado** del sidebar (la subida ahora vive en el input del chat)

## Topbar

El topbar tiene dos modos según la página activa:

**Modo Documents / Graphs / Visualize / Policies:**

| Condición | Badge |
|-----------|-------|
| 0 docs | Sin badge |
| 1–2 docs | `"N doc(s) selected"` — pill gris |
| ≥ 3 docs | `"Graph ready · N docs"` — pill azul con ícono triángulo |

- Pills individuales con `×` para deseleccionar sin salir de la vista
- Botón **Clear all** cuando `selected.length >= 2`
- Selector de empresa — visible siempre que exista al menos una empresa; sin botón `+ New company` (la creación ocurre desde el grid raíz)

**Modo Chat (`page === 'chat'`):**

- Selector de empresa (igual que otras páginas)
- Chips de contexto inline en la misma barra, scroll horizontal si hay muchos
- Cada chip: icono tipo + nombre corto + `×` para deseleccionar
- Estado sin docs: texto "Sin contexto — selecciona docs en Documents"
- Sin badge de conteo separado — los chips son el contexto visible

Selector de modelo LLM — **solo existe dentro del input de Chat** (no aparece en el topbar).

## Vista Documents (`/documents`)

### Organización de documentos

Los documentos se organizan en 4 niveles:

```
Empresa → Departamento → Grupo → Documento
```

La vista navega entre niveles con breadcrumb:
- **Vista `all`** — grid de departamentos (3 columnas), cada card muestra conteo de docs y grupos
- **Vista `dept`** — carpetas de grupos + docs sueltos (sin grupo asignado)
- **Vista `group`** — tabla de documentos del grupo
- **Vista `flat`** — tabla plana de todos los docs con columna Location (`Dept › Grupo`)

### Sistema de peso (uso real)

El "peso" de un documento es el número de consultas reales desde el chat en que fue incluido en el contexto.

```js
const docQ = doc => docStats?.[doc.id]?.queries || 0;
const maxQ = Math.max(1, ...allDocs.map(docQ));
const effW = doc => docQ(doc) / maxQ;          // 0–1 para la barra
const fmtQ = n => n === 0 ? '—'
  : n >= 1000 ? (n/1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/,'') + 'k'
  : String(n);
```

| Elemento | Valor |
|----------|-------|
| Barra de progreso | Relativa al doc con más consultas (`effW`) |
| Color de la barra | `TYPE_COLOR[doc.type]` — por tipo de archivo |
| Display numérico | `fmtQ`: `—`, `1`, `250`, `1.2k`, `10k` |
| 100% | El doc con más consultas en la sesión actual |

> El peso es de sesión — no persiste entre recargas.

### Modos de vista de documentos

El toolbar incluye dos botones (grid / list) que alternan `viewMode`:

| Modo | Descripción |
|------|-------------|
| **Grid** (`ti-layout-grid`) | Tarjetas 3 columnas: icono tipo, nombre, área · tamaño, fecha, barra de uso (color por tipo). Checkbox de selección en esquina superior derecha. |
| **List** (`ti-list`) | Tabla con columnas: checkbox, Name, Type, [Location], Date, Size, Uso, Links, Graphs, Consultas. |

La vista `flat` (All documents) respeta el modo seleccionado y añade columna Location en modo lista o la muestra dentro de la tarjeta en modo grid.

### Drag & drop

- **Documentos** son arrastrables a cualquier carpeta (grupo o departamento) en ambos modos de vista
- **Grupos** son arrastrables entre departamentos (no pueden anidarse)
- Drop target activo: borde azul + fondo azul claro
- Los cambios son en memoria (se pierden al recargar)

### Menú contextual (click derecho)

| Target | Vista | Opciones |
|--------|-------|----------|
| Documento | cualquiera | Move to folder, Copy, Add to context, Details, Delete |
| Carpeta | cualquiera | Rename, Move inside folder, Delete |
| Espacio en blanco | `all` (raíz) | New folder, New department, Upload document, Deseleccionar todo* |
| Espacio en blanco | `dept` / `group` / `flat` | New folder, Upload document, Deseleccionar todo* |

\* "Deseleccionar todo" solo aparece si `selected.length > 0` (`onlyIfSelected:true`).

**Regla:** "New department" solo aparece en la vista raíz (`all`). Dentro de un departamento o grupo la opción queda oculta — no tiene sentido crear un departamento estando navegando dentro de uno.

Cierre: Escape, click fuera del menú, o seleccionar una opción.  
**Acción funcional:** "New folder" en vista `dept` crea un grupo nuevo en el departamento activo.

### Navegación por niveles

La sección Documents navega por 4 niveles jerárquicos. Cada nivel tiene su propio estado vacío centrado con acción directa:

| Nivel | Estado vacío | Acción |
|-------|-------------|--------|
| Raíz sin empresas | "Sin empresas" | Botón `+ New company` |
| Raíz con empresas (ninguna activa) | Grid de tarjetas de empresa | Card `+ Nueva empresa` al final del grid |
| Empresa sin departamentos | "Sin departamentos" | Botón `+ New department` |
| Departamento vacío | "Departamento vacío" | Botones `New folder` + `Upload document` |

#### Tarjetas de empresa

Cuando existe al menos una empresa pero ninguna está activa, el contenido muestra un **grid de tarjetas** (mismo patrón visual que departamentos): icono naranja, nombre, hover con borde naranja. Click en tarjeta activa esa empresa y navega a sus departamentos.

#### Breadcrumb

- Cuando `activeCo` es null → breadcrumb oculto
- Cuando `nav.view === 'all'` → click en nombre de empresa regresa al grid de empresas (`onSwitchCo(null)`)
- Cuando `nav.view === 'dept'` o `'group'` → click en empresa va al grid de departamentos

### Multi-empresa

- Selector de empresa en el **Topbar** — visible solo en Documents y solo si existen empresas
- Las empresas se crean desde la card `+ Nueva empresa` del grid raíz
- Cada empresa tiene su propio árbol de carpetas, departamentos y grupos
- El estado de `companies` y `activeCo` vive en `App` y se pasa hacia abajo como props

### Modales de creación

Todos los modales siguen el mismo patrón: título, subtítulo contextual con el nombre del padre, input con autoFocus, botones **Cancel** / **Create**.

| Modal | Subtítulo contextual |
|-------|---------------------|
| New company | (sin subtítulo) |
| New department | "Organiza documentos y equipos dentro de {empresa}" |
| New folder | "Agrupa documentos dentro de {departamento}" |

### Toolbar

El toolbar (búsqueda + grid/list toggle) solo aparece cuando hay una empresa activa. El botón "New folder" fue eliminado del toolbar — se accede desde el empty state del departamento o el menú contextual.

### Sección "Sin departamento"

Cuando una empresa tiene archivos con `dept_id: null` (sin asignar), la vista `all` muestra una sección **"Sin departamento"** debajo del grid de departamentos. Etiqueta con contador. Usa el mismo `renderDocs` que las demás vistas. Permite arrastrar los docs a un departamento para asignarlos (persistiendo vía `PATCH /api/files/:id/move`).

Si no hay departamentos Y no hay sin-asignar → empty state normal con botón "New department".

### Persistencia de asignación dept/grupo

Cada vez que un documento se mueve (drag&drop) o se sube dentro de un departamento/carpeta, se llama `apiMoveFile(fileId, deptId, groupId)` que hace `PATCH /api/files/:id/move`. La asignación se guarda en SQLite (`dept_id`, `group_id` en la tabla `files`). Al recargar, el archivo aparece en el lugar correcto.

### Ciclo de vida de un documento

```
Seleccionar archivo(s)
    ↓
UploadPreviewModal — previsualización antes de confirmar
    ↓
doUpload() → POST /api/upload
    ↓
VectorizingModal — animación simulada (~4s)
    ↓
Documento en DocumentsPage (vectorized=1, chunks calculados)
    ↓
Uso en consultas de chat → peso sube
    ↓
DeleteDocModal (3 niveles de seguridad) → eliminado de DB y disco
```

### UploadPreviewModal

Intercepta la selección de archivos antes de subirlos — permite al usuario revisar y confirmar.

| Cantidad de archivos | Comportamiento |
|---------------------|----------------|
| 1 archivo | Información detallada + preview por tipo |
| 2–5 archivos | Lista con nombre y tamaño |
| 6+ archivos | Cabecera de advertencia naranja (subida masiva) |

**Previews por tipo:**

| Tipo | Preview |
|------|---------|
| `pdf` | `<iframe>` con blob URL, altura 220 px |
| `csv` | Tabla primeras 5 filas (FileReader) |
| `txt` | `<pre>` con primeras 10 líneas |
| Otros | Placeholder con ícono de tipo |

Al confirmar: se llama el flujo `doUpload` existente sin modificaciones. El servidor recibe el archivo exactamente igual que antes.

### DeleteDocModal — 3 niveles de seguridad

La eliminación de documentos requiere confirmación proporcional al impacto:

| Nivel | Condición | Confirmación |
|-------|-----------|-------------|
| 1 | Sin uso ni relaciones | Botón "Eliminar" simple |
| 2 | Tiene consultas (queries > 0) | Muestra chunks, queries y peso RAG; botón "Sí, eliminar" |
| 3 | Está en grafos guardados o links > 0 | Requiere escribir "BORRAR" para habilitar el botón |

**Lógica de nivel:**

```js
const inGraphs     = savedGraphs.filter(g => g.docIds.includes(doc.id));
const hasRelations = inGraphs.length > 0 || doc.links > 0;
const hasUsage     = (doc.queries || 0) > 0;
const level        = hasRelations ? 3 : hasUsage ? 2 : 1;
```

Al confirmar: `DELETE /api/files/:id` → elimina de disco y SQLite → remueve de `realDocs`, `assign` y `selected`.

### Flujo de subida y vectorización

Cuando el usuario sube un archivo (desde DocumentsPage o desde Chat):

1. `apiUpload(file, slug)` envía el archivo al servidor
2. `VectorizingModal` aparece inmediatamente con barra de progreso animada (~4s simulados)
3. Pasos: Subiendo → Extrayendo texto → Chunks → Embeddings → Vectores → Completo
4. Al terminar: pantalla de éxito con chunks/vectores simulados; botón **"Ver documento"** para PDFs
5. "Ver documento" navega directamente a la sección **Visualize** con el PDF abierto inline
6. El modal muestra error si el servidor no responde

### Visor de PDF inline

"Ver PDF" (click derecho) y "Ver documento" (modal de vectorización) navegan a la sección **Visualize** de la app — no abren el visor del navegador ni modales flotantes.

En Visualize, si el documento activo es un PDF real (`isReal && type === 'pdf'`), el panel derecho muestra `InlinePdfViewer`:
- Hace `fetch /api/files/:id/view` → `r.blob()` → `URL.createObjectURL(blob)` → `<iframe>`
- Evita restricciones CORS del navegador (blob URL es same-origin)
- Estados: cargando (spinner) | ok (iframe fullscreen) | error (link nueva pestaña)

## Vista Graphs (`/graphs`)

El grafo **solo se construye cuando hay 3 o más documentos seleccionados**.

| Docs seleccionados | Estado de la vista |
|--------------------|--------------------|
| 0 | Ícono + "Selecciona al menos 3 documentos para construir el grafo" |
| 1–2 | Mismo mensaje + contador "N de 3 seleccionados" |
| ≥ 3 | Grafo interactivo activo |

Layout: panel izquierdo (230px) + área principal del grafo.

### Panel izquierdo — grafos guardados

- Lista de grafos guardados (click → carga esa selección)
- El grafo cuya selección coincide exactamente con `selected` se resalta en azul
- Cada card: nombre, comentario (si tiene), chips de docs (máx. 4), conteo + fecha
- Botón ✕ para eliminar un grafo
- Botón "Guardar grafo (N docs)" en la parte inferior — solo aparece si `selected.length >= 3`

### Modal de guardado (patrón centrado)

Mismo patrón visual que "New folder" / "New department":

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
│                                     │
│  [chip1] [chip2] [chip3] ...        │
│                                     │
│              [Cancelar] [Guardar]   │
└─────────────────────────────────────┘
```

ID único del grafo: `'g' + Date.now()` (timestamp entero).

### Grafo (área principal)

- D3 force layout 2D con canvas (no SVG)
- **Nodos**: docs seleccionados; círculos con radio proporcional al `weight`
  - Color por tipo: pdf `#ea4335`, xlsx/xls `#34a853`, csv `#34a853`, docx/doc `#4285f4`, txt `#9aa0a6`
  - Label truncado a 14 chars bajo cada nodo
- **Aristas**: líneas entre docs con co-ocurrencias en `CHAT_HISTORY`
  - Fallback `weight:1` si no hay co-ocurrencia — garantiza conectividad total
  - Grosor proporcional al número de co-ocurrencias
- **Animación orbital**: D3 sim corre con `.stop()` + loop manual rAF. Al converger (`alpha < alphaMin`) los nodos pasan a modo órbita — rotación global + deriva individual suave (~40s por vuelta)
- **Drag durante órbita**: al soltar, posición se reverse-rota para calcular nuevo centro de órbita
- **Click en nodo**: abre `DocModal` enriquecido con `docStats`
- **Hover**: tooltip con nombre + "Click para ver detalles"
- **Header**: `N nodes · N edges` + badge `Graph ready` cuando ≥3 seleccionados

### Modal de detalle (`DocModal`)

Se abre al hacer click en cualquier nodo.

| Elemento | Descripción |
|----------|-------------|
| TypeBadge + nombre | Header del modal |
| Contador de consultas | Número grande (`18px bold`) + "consultas" — valor real de `docStats` |
| Barra de uso | Proporcional al doc con más consultas en el grafo activo; color por tipo |
| Grid 2×3 | Area, Date, Size, Links, Graphs, Queries |
| "Remove from context" | Deselecciona el doc y cierra el modal |
| "Close" / Escape / click backdrop | Cierra sin deseleccionar |

## Vista Chat (`/chat`) — home

- Contexto de documentos activos visible en el **Topbar** (chips inline en la misma barra que el selector de empresa)
- Fondo animado de red de partículas (canvas rAF independiente, igual que el login)
- **Estado vacío limpio**: sin mensajes pre-seeded; icono + "Ask anything" + texto contextual según si hay docs en contexto o no
- Burbujas de chat: user (azul, derecha) / AI (superficie, izquierda)
- Emergent Insight card dentro de burbujas AI cuando hay `msg.insight`
- Source pills bajo burbujas AI indicando qué documentos se usaron
- Enter para enviar, Shift+Enter para salto de línea
- Al enviar: llama `trackQuery(docIds)` → incrementa `docStats` en App por cada doc en contexto
- Footer con conteo de contexto y disclaimer de seguridad
- **Autofocus**: el textarea recibe foco automáticamente al montar la página (`useEffect + inputRef`)

### Input box rediseñado

El textarea y los controles están dentro de un contenedor rounded unificado:

```
┌──────────────────────────────────────────────────┐
│  [pills de archivos adjuntos si hay]             │
│  textarea (rows=1, borde propio eliminado)       │
│──────────────────────────────────────────────────│
│  [+]           [modelo ▾]  [🎤]  [⬆ naranja]    │
└──────────────────────────────────────────────────┘
```

| Control | Posición | Función |
|---------|----------|---------|
| `+` | Izquierda inferior | Abre selector de archivos (`.pdf,.xlsx,.csv,.docx,.txt`) |
| Selector de modelo | Centro-derecha | Claude 3.5 / GPT-4o / Gemini / Llama |
| Micrófono `🎤` | Centro-derecha | Placeholder UI |
| Enviar `⬆` | Extremo derecho | Naranja si hay texto, gris si vacío |

### Subida de archivos

- `fileRef` apunta a un `<input type="file" multiple>` oculto
- Archivos seleccionados aparecen como pills `{nombre, tamaño}` dentro del input box
- Cada pill tiene botón `×` para eliminar el adjunto antes de enviar

## Vista Visualizar (`/visualize`)

> **Regla fundamental:** el panel izquierdo muestra documentos seleccionados en el contexto global. Incluye tanto documentos mock como documentos reales de SQLite. Si un documento es quitado del contexto, desaparece del panel y la vista derecha se limpia automáticamente.

Layout dos paneles:

```
[Panel izquierdo 268px] │ [Panel derecho flex:1]
  Search input           │   InlinePdfViewer (PDFs reales)
  Lista de docs          │   o DocPreview (otros)
  Footer con conteo      │
```

### Entrada desde "Ver PDF" / "Ver documento"

Cuando el usuario llega desde click derecho "Ver PDF" o el botón "Ver documento" del modal de vectorización, `VisualizePage` recibe `focusDoc` y auto-selecciona ese documento como activo en el panel derecho. El doc se añade al contexto (`selected`) automáticamente si no estaba.

### Estado vacío

Si no hay docs en el panel (`panelDocs.length === 0`): icono `ti-eye` + "Marca documentos en el sidebar para visualizarlos".

### Panel izquierdo

- Muestra `focusDoc` (si llega de "Ver PDF") + documentos en `selected`
- Incluye documentos reales de SQLite via prop `allRealDocs`
- Search en tiempo real por nombre
- Cada ítem: icono tipo + nombre + area · size + TypeBadge
- Ítem activo resaltado con borde accent naranja
- Footer con conteo de documentos

### Panel derecho — lógica de renderizado

| Condición | Render |
|-----------|--------|
| Sin doc activo | Empty state ("Selecciona un documento…") |
| Doc real + tipo `pdf` | `InlinePdfViewer` — iframe con blob URL, ocupa 100% del panel |
| Cualquier otro doc | `DocPreview` — card con metadatos y placeholder de contenido |

### `InlinePdfViewer`

- `fetch /api/files/:id/view` → blob → `URL.createObjectURL` → `<iframe>`
- Revoca el blob URL al desmontar (`useEffect` cleanup)
- Header con nombre y tamaño; spinner mientras carga; mensaje de error si falla

### DocPreview (panel derecho, docs no-PDF)

Renderiza un card centrado (`max-width: 700px`) con:

| Sección | Contenido |
|---------|-----------|
| Header | Icono tipo, nombre, TypeBadge |
| Meta | Area, Date, Size |
| Botón | Add to context / Remove context |
| Weight bar | Progress bar `0–100%` |
| Stats chips | Links, Graphs, Queries |
| Content | SpreadsheetView (xlsx/csv) o PdfView placeholder |

### Sistema de colores por tipo de archivo

Aplicado en TypeBadge, iconos de árbol, tarjetas de documentos, nodos del grafo y pills de contexto:

| Tipo | Color UI | Color grafo | Icono |
|------|----------|-------------|-------|
| `pdf` | `#c0392b` rojo | `#ea4335` | `ti-file-text` |
| `xlsx`, `xls` | `#1a7a4a` verde | `#34a853` | `ti-table` |
| `csv` | `#2a7a4a` verde | `#34a853` | `ti-file-spreadsheet` |
| `docx`, `doc` | `#0078d4` azul | `#4285f4` | `ti-file-word` |
| `txt` | `#6b7280` gris | `#9aa0a6` | `ti-file-description` |

## Vista Policies (`/policies`)

Gestión de acceso por documento. Define qué roles pueden usar qué documentos en el LLM.

Layout dos paneles:

```
[Panel izquierdo 320px] │ [Panel derecho flex:1]
  Header + "New policy"  │   Detalle de política seleccionada
  Lista de policy cards  │   (fondo C.surface)
```

### Panel izquierdo — lista de políticas

Cada card muestra:
- Nombre + badge de estado (`Active` verde / `Draft` gris)
- Pills de documentos incluidos (con icono de tipo)
- Pills de roles con acceso (con icono `ti-user`)

### Panel derecho — detalle de política

| Sección | Contenido |
|---------|-----------|
| Header | Nombre, badge de estado, fecha de creación, botón "Edit policy" |
| Nota de seguridad | Aviso amarillo explicando que el LLM solo ve vectores permitidos |
| Documents in policy | Cards por cada doc con icono tipo, nombre y área |
| Access roles | Pills azules con icono `ti-user` por cada rol |
| Access level | 3 opciones seleccionables: Full module, Document only, Temporary (24h) |

### Niveles de acceso

| Nivel | Descripción |
|-------|-------------|
| Full module | Acceso completo a todos los vectores del documento |
| Document only | Solo el documento, sin metadatos ni relaciones |
| Temporary (24h) | Acceso expira automáticamente en 24 horas |

### Filosofía de seguridad

> "El LLM solo accede a vectores de los documentos permitidos por esta política. El control se aplica en la capa de datos, no en el modelo."

El acceso no se controla diciéndole al LLM qué puede o no puede decir — se controla qué datos llegan al LLM. Si un documento no está en la política activa del usuario, sus vectores nunca entran en el contexto de inferencia.

---

## Configuración y límites de almacenamiento (`SettingsPage`)

Vista accesible desde el ítem **Configuración** (`ti-settings`) al final del NAV del sidebar. Layout de una sola columna centrada, `max-width: 720px`.

### Sección Plan

Muestra el plan activo (**Plan Free**) con badge azul y sus características:
- 1 GB de almacenamiento
- Documentos ilimitados
- 1 empresa

Botón "Actualizar plan" (decorativo en prototipo) a la derecha.

### Sección Almacenamiento

Carga datos del servidor con `apiGetStorage(slug)` al montar / cuando cambia `activeCo`.

**Titular de uso:**
```
46.0 MB  de 1 GB usados
```

**Barra de progreso** estilo Google Drive:
- Ancho: `(totalBytes / limitBytes) * 100%` con `transition: width 0.4s ease`
- Color normal: `C.accent` (azul)
- Color advertencia (≥ 90%): `#dc2626` (rojo)
- Etiquetas: `X% utilizado` · `Y disponible`
- Alerta visual si supera el 100%: banner rojo "Has alcanzado el límite de tu plan"

**Desglose por tipo** — una fila por cada tipo de archivo presente:

| Columna | Contenido |
|---------|-----------|
| Ícono | `TYPE_ICON` + `TYPE_COLOR` del tipo |
| Nombre | PDF / Excel / CSV / Word / Texto |
| Cantidad | N documentos |
| Tamaño | `formatBytes(bytes)` |
| Mini-barra | % del espacio total que ocupa ese tipo |

**Footer:** `Total: N documentos · X MB`

### Función `formatBytes(b)`

```js
const formatBytes = b => {
  if (b >= 1073741824) return (b/1073741824).toFixed(1)+' GB';
  if (b >= 1048576)    return (b/1048576).toFixed(1)+' MB';
  if (b >= 1024)       return (b/1024).toFixed(1)+' KB';
  return b+' B';
};
```

### Endpoint `GET /api/storage`

```
GET /api/storage?company_id=<slug>
```

Query SQLite:
```sql
SELECT type, COUNT(*) as count, SUM(size_bytes) as bytes
FROM files WHERE company_id=? GROUP BY type
```

Respuesta:
```json
{
  "totalBytes": 48234112,
  "limitBytes": 1073741824,
  "byType": {
    "pdf":  { "count": 12, "bytes": 30000000 },
    "xlsx": { "count": 8,  "bytes": 15000000 }
  },
  "totalDocs": 20
}
```

`limitBytes` es la constante `1073741824` (1 GB) fija en el servidor — corresponde al plan free.
