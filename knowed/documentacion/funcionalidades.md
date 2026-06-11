# Funcionalidades — KnowLayer

## Sidebar

El sidebar tiene tres zonas verticales:

1. **Nav** — 5 ítems de navegación (Documents, Visualizar, Graphs, Chat, Policies)
2. **This month** — documentos cuya `date` pertenece al mes actual; cada ítem es un `DocItem` toggleable
3. **Older** — historial de sesiones de chat pasadas (`CHAT_SESSIONS`); los documentos de cada sesión siempre están disponibles para añadir al contexto activo

### Older — historial de chats

Cada `ChatSessionItem` muestra:
- Icono `ti-message-circle` + preview truncado de la pregunta principal
- Pills por cada doc referenciado en esa sesión (click = toggle en contexto global)
- Fecha de la sesión alineada a la derecha

**Ventaja de diseño:** los documentos de conversaciones históricas nunca desaparecen del sidebar; siempre se pueden rescatar al contexto activo sin navegar a Documents.

- Búsqueda por nombre en tiempo real (filtra docs en "This month")
- Botón Upload (UI, sin backend)
- Estado de selección persiste entre páginas

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

### Modos de vista de documentos

El toolbar incluye dos botones (grid / list) que alternan `viewMode`:

| Modo | Descripción |
|------|-------------|
| **Grid** (`ti-layout-grid`) | Tarjetas 3 columnas: icono tipo, nombre, área · tamaño, fecha, barra de peso. Checkbox de selección en esquina superior derecha. |
| **List** (`ti-list`) | Tabla con columnas: checkbox, Name, Type, [Location], Date, Size, Weight, Links, Graphs, Queries. |

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
| Espacio en blanco | `all` (raíz) | New folder, New department, Upload document |
| Espacio en blanco | `dept` / `group` / `flat` | New folder, Upload document |

**Regla:** "New department" solo aparece en la vista raíz (`all`). Dentro de un departamento o grupo la opción queda oculta — no tiene sentido crear un departamento estando navegando dentro de uno.

Cierre: Escape, click fuera del menú, o seleccionar una opción.  
**Acción funcional:** "New folder" en vista `dept` crea un grupo nuevo en el departamento activo.

### Multi-empresa

- Selector de empresa en la barra superior (encima del breadcrumb)
- Botón `+ New company` abre modal de creación (input + Enter / botón Crear)
- Cada empresa tiene su propio árbol de carpetas
- Empresa Demo (`c1`) tiene datos precargados; el resto arrancan vacíos

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

## Vista Visualizar (`/visualize`)

> **Regla fundamental:** el panel izquierdo muestra **únicamente los documentos marcados** (seleccionados) en el sidebar global. No aparecen documentos que no estén en el contexto activo. Si un documento es quitado del contexto, desaparece del panel y la vista derecha se limpia automáticamente.

Layout dos paneles:

```
[Panel izquierdo 268px] │ [Panel derecho flex:1]
  Search input           │   DocPreview centrado
  Lista de docs marcados │   (fondo C.surface)
  Footer con conteo      │
```

### Estado vacío (sin docs seleccionados)

Si `selected.length === 0`: icono `ti-eye` + "Marca documentos en el sidebar para visualizarlos".  
No se muestra el layout de dos paneles.

### Panel izquierdo

- Muestra solo los documentos que están en `selected` (marcados en el sidebar)
- Search en tiempo real por nombre (filtra dentro de los seleccionados)
- Cada ítem: icono tipo + nombre + area · size + TypeBadge
- Ítem activo resaltado en azul
- Footer con conteo de documentos filtrados

### DocPreview (panel derecho)

Renderiza un card centrado (`max-width: 700px`) con:

| Sección | Contenido |
|---------|-----------|
| Header | Icono tipo, nombre, TypeBadge |
| Meta | Area, Date, Size |
| Botón | Add to context / Remove context (toggle selección) |
| Weight bar | Progress bar `0–100%` |
| Stats chips | Links, Graphs, Queries |
| Content | SpreadsheetView (xlsx/csv) o PdfView (pdf) |

Si "Remove context" es clickeado, el doc desaparece del panel izquierdo y el visor vuelve al estado vacío ("Selecciona un documento para visualizarlo").

### SpreadsheetView

Tabla HTML con cabecera de columnas específicas por documento (`DOC_COLS`) y 9 filas de celdas placeholder (bloques grises de ancho variable).

### PdfView

Secciones con título textual (`DOC_SECTIONS`) y filas de bloques grises simulando párrafos.

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
