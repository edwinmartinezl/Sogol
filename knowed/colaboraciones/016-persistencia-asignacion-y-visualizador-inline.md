# 016 — Persistencia de asignación, visor PDF inline y corrección de contexto cross-page

**Fecha:** 2026-06-11  
**Estado:** Completado

---

## Resumen

Esta etapa resolvió tres grupos de bugs críticos descubiertos tras la Etapa 15:

1. **Persistencia de asignación dept/grupo** — los documentos quedaban "Sin departamento" aunque se hubieran subido desde una carpeta.
2. **Visor PDF inline** — "Ver PDF" y "Ver documento" abrían el visor del navegador en lugar de la sección Visualize de la app.
3. **Docs reales invisibles en Visualize, Graph y Chat** — al seleccionar documentos reales, no aparecían en ninguna otra página.

---

## 1. Diagnóstico del servidor (tablas inexistentes)

Al arrancar la sesión se detectó que las tablas `companies`, `departments` y `groups` no existían en el SQLite. El proceso antiguo del servidor seguía corriendo en el puerto 3001 bloqueando el nuevo.

**Acciones:**
- Se mató el proceso viejo (`Stop-Process -Id <PID>`)
- Se ejecutó la migración manualmente contra el `.db` para crear las tres tablas
- Se añadió un **banner de versión** al arranque del servidor:

```
╔══════════════════════════════════════════╗
║  KnowLayer API  v2  (companies + depts)  ║
╚══════════════════════════════════════════╝
   Tables: files, companies, departments, groups
```

- Se añadió `GET /api/ping` que devuelve `{ version, tables, db }` para diagnóstico rápido.

---

## 2. Persistencia de asignación dept/grupo

### Causa raíz

`doUpload` y `handleDrop` actualizaban el mapa `assign` en memoria pero **nunca llamaban `PATCH /api/files/:id/move`**. Al recargar la página el archivo perdía su departamento/carpeta.

### Nueva función `apiMoveFile`

```js
async function apiMoveFile(fileId, deptId, groupId) {
  await fetch(`${API_BASE}/files/${fileId}/move`, {
    method:'PATCH', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ dept_id: deptId || null, group_id: groupId || null }),
  });
}
```

### `doUpload` (DocumentsPage)

```js
if (assignDept || assignGroup) apiMoveFile(norm.id, assignDept, assignGroup).catch(() => {});
```

### `handleDrop`

```js
apiMoveFile(dragDocId, tDeptId, tGroupId || null).catch(() => {});
```

### Chat upload — bug adicional

`setUploadDest(null)` se ejecutaba **antes** del `await apiUpload`, perdiendo el destino seleccionado.

**Fix:** capturar `const dest = uploadDest` antes de limpiar, luego:

```js
if (dest.deptId || dest.groupId)
  apiMoveFile(result.id, dest.deptId||null, dest.groupId||null).catch(() => {});
const norm = { ...normalizeReal(result), _deptId: dest.deptId||null, _groupId: dest.groupId||null };
```

---

## 3. Sección "Sin departamento" en vista All

Los archivos con `dept_id: null` eran completamente invisibles hasta ir a la vista flat. Ahora la vista de empresa (nav.view === 'all') muestra una sección **"Sin departamento"** debajo del grid de departamentos cuando hay archivos sin asignar.

```
┌─────────────────────────────────────────────────┐
│  Departamento A    Departamento B    + Nuevo     │
├─────────────────────────────────────────────────┤
│  SIN DEPARTAMENTO  (3)                          │
│  archivo1.pdf  ·  archivo2.xlsx  ·  ...         │
└─────────────────────────────────────────────────┘
```

La sección solo aparece cuando `unassigned.length > 0`. Si no hay departamentos Y no hay sin-asignar → muestra el empty state normal.

---

## 4. Visor PDF inline (`InlinePdfViewer`)

### Componente nuevo

`InlinePdfViewer({ fileId, fileName })` usa el patrón blob URL para evitar restricciones CORS del navegador:

```
fetch /api/files/:id/view → r.blob() → URL.createObjectURL(blob) → <iframe src={blobUrl}>
```

Estados: `loading` (spinner animado) | `ok` (iframe) | `error` (mensaje + link nueva pestaña).

### Integración en `VisualizePage`

El panel derecho detecta si el doc activo es real PDF (`doc.isReal && doc.type === 'pdf'`):

```jsx
viewDoc.isReal && viewDoc.type === 'pdf'
  ? <InlinePdfViewer fileId={viewDoc.id} fileName={viewDoc.name} />
  : <DocPreview ... />
```

El iframe ocupa todo el panel derecho (sin padding, sin scroll extra).

---

## 5. Navegación "Ver PDF" / "Ver documento" → Visualize

Todos los puntos de entrada al visor de PDF ahora navegan a la sección Visualize en lugar de abrir modales flotantes o el visor del navegador:

| Origen | Antes | Ahora |
|--------|-------|-------|
| Click derecho → "Ver PDF" | `PdfViewerModal` (modal fullscreen) | `onGoVisualize(doc)` → Visualize |
| VectorizingModal → "Ver documento" (Documents) | `PdfViewerModal` | `onGoVisualize(doc)` → Visualize |
| VectorizingModal → "Ver documento" (Chat) | Sin acción (`onViewPdf={null}`) | `onGoVisualize(doc)` → Visualize |

### Handler `onGoVisualize` (App)

```js
const onGoVisualize = doc => {
  if (!selected.includes(doc.id)) addDocToContext(doc);
  setVisualizeFocusDoc(doc);
  setPage('visualize');
};
```

`VisualizePage` recibe `focusDoc` y lo auto-selecciona como `viewId` vía `useEffect([focusDoc?.id])`.

---

## 6. Docs reales en Visualize, Graphs y Chat

### Causa raíz

`appRealDocs` solo se poblaba cuando `DocumentsPage` cargaba archivos. Las demás páginas usaban el array global `documents` (vacío).

### Solución: estado `appRealDocs` en App

```js
const [appRealDocs, setAppRealDocs] = useState([]);
```

**Cuándo se actualiza:**
- `DocumentsPage` → `onRealDocsChange?.(norm)` al cargar archivos del API
- `DocumentsPage.doUpload` → `onRealDocsChange?.(next)` al subir un archivo
- Chat upload → `addDocToContext(norm)` → `setAppRealDocs(prev => [norm, ...prev])`

### `addDocToContext` (App)

Reemplaza `onAddDoc={toggle}` (que solo añadía el ID):

```js
const addDocToContext = (normOrId) => {
  if (typeof normOrId === 'string') {
    toggle(normOrId);
  } else {
    toggle(normOrId.id);
    setAppRealDocs(prev => prev.find(d => d.id === normOrId.id) ? prev : [normOrId, ...prev]);
  }
};
```

### Páginas actualizadas

| Página | Prop nueva | Uso |
|--------|-----------|-----|
| `GraphsPage` | `allRealDocs` | `[...documents, ...allRealDocs].filter(selected)` para nodos |
| `VisualizePage` | `allRealDocs` | panel izquierdo incluye docs reales seleccionados |
| `ChatPage` | `allRealDocs` | pills de contexto usan `allDocPool.find(id)` |

---

## 7. Sistema de colores extendido

Antes solo había colores para `pdf`, `xlsx` y `csv`. Ahora cubre todos los tipos:

| Tipo | `TYPE_COLOR` (UI) | `GRAPH_COLOR` (nodo) | Icono |
|------|-------------------|----------------------|-------|
| `pdf` | `#c0392b` rojo | `#ea4335` | `ti-file-text` |
| `xlsx`, `xls` | `#1a7a4a` verde | `#34a853` | `ti-table` |
| `csv` | `#2a7a4a` verde | `#34a853` | `ti-file-spreadsheet` |
| `docx`, `doc` | `#0078d4` azul | `#4285f4` | `ti-file-word` |
| `txt` | `#6b7280` gris | `#9aa0a6` | `ti-file-description` |

Los colores se aplican en: `TypeBadge`, iconos de árbol, cards de docs, nodos del grafo, pills de contexto.

### Extensiones aceptadas por el servidor

```js
const ALLOWED_EXT = new Set(['.pdf', '.txt', '.xlsx', '.xls', '.csv', '.docx', '.doc']);
```

---

## Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `server.js` | Banner v2, `/api/ping`, `ALLOWED_EXT` extendido, migración de tablas |
| `app.js` | `apiMoveFile`, `addDocToContext`, `onGoVisualize`, `InlinePdfViewer`, `VisualizePage` rediseñado, `GraphsPage`/`ChatPage` con `allRealDocs`, sección "Sin departamento", colores extendidos, limpieza de `PdfViewerModal` (dead code) |
| `documentacion/funcionalidades.md` | Secciones actualizadas: Upload, Visualize, Graphs, Chat, colores |
