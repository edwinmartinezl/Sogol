# 021 — Selección masiva tipo Windows, contexto unificado y modal de directorio

**Fecha:** 2026-06-14  
**Estado:** Completado

---

## Resumen

Cuatro mejoras al sistema de selección de documentos:

1. **Drag masivo** — arrastrar un doc seleccionado mueve todos los seleccionados
2. **Selección unificada** — `localSel` eliminado; marquee y clicks usan directamente `selected` (el contexto de chat/RAG)
3. **Comportamiento Windows** — click simple = selecciona solo ese doc; Ctrl+click = toggle; click en área vacía = limpia; selección persiste al navegar entre departamentos
4. **SelDocsModal** — modal centrado y grande con el directorio completo de la empresa para agregar o quitar docs del contexto desde la sección Chat

---

## 1. Drag masivo

### Problema

Al arrastrar un documento a una carpeta, solo se movía ese documento, aunque hubiera varios seleccionados.

### Solución

En `handleDrop`, se revisa si el doc arrastrado (`dragDocId`) está en `selected`. Si sí, se mueven todos:

```js
const idsToMove = (selected.length > 0 && selected.includes(dragDocId))
  ? selected
  : [dragDocId];

setAssign(prev => {
  const next = { ...prev };
  idsToMove.forEach(id => { next[id] = { deptId: tDeptId, groupId: g }; });
  return next;
});
idsToMove.forEach(id => apiMoveFile(id, tDeptId, g).catch(() => {}));
if (idsToMove.length > 1) onSetSelected([]);
```

Los docs en `selected` también se muestran semitransparentes durante el drag:

```js
opacity: dragDocId && (dragDocId === doc.id || (selected.includes(doc.id) && selected.includes(dragDocId))) ? 0.35 : 1
```

---

## 2. Selección unificada — eliminar `localSel`

### Problema

Existían dos sistemas de selección paralelos:
- `selected` — contexto RAG/chat/grafos (App level)
- `localSel` — selección para operaciones de archivos (DocumentsPage)

El marquee actualizaba `localSel` pero no `selected`, por lo que los docs sombreados no aparecían en el chat ni en el grafo.

### Solución

Se eliminó `localSel` completamente. El marquee ahora llama `onSetSelected(sel)` directamente:

```js
// moveMarquee:
onSetSelected(sel);

// endMarquee (click sin arrastrar = limpiar):
if (!mDragRef.current) onSetSelected([]);
```

Se agregó `onSetSelected` como prop en DocumentsPage (desde App: `setSelected`).

### Estado eliminado

| Antes | Después |
|-------|---------|
| `const [localSel, setLocalSel] = useState([])` | eliminado |
| `const [moveBulkIds, setMoveBulkIds] = useState(null)` | reemplazado por `showBulkMove` boolean |
| `useEffect([nav.view, nav.deptId, nav.groupId, activeCo])` que limpiaba `localSel` | **eliminado** — la selección ahora persiste |

---

## 3. Comportamiento de selección estilo Windows

### Click en documento

```js
// Antes: toggle simple
onClick={e => { onToggle(doc.id); }}

// Ahora: Windows-style
onClick={e => { e.ctrlKey || e.metaKey ? onToggle(doc.id) : onSetSelected([doc.id]); }}
```

| Acción | Resultado |
|--------|-----------|
| Click simple en doc | Selecciona **solo ese** doc (deselecciona los demás) |
| Ctrl+Click en doc | Toggle individual (agrega o quita sin afectar los demás) |
| Arrastrar marquee | Reemplaza la selección con los docs que toca el rectángulo |
| Click en área vacía (sin arrastrar) | Limpia toda la selección |
| Navegar entre depts/grupos | La selección **persiste** |
| Navegar entre páginas (Documents → Chat → Documents) | La selección **persiste** (vive en App) |

### Selección persiste al navegar — `data-no-marquee`

El `startMarquee` arrancaba también al hacer click en carpetas de departamento y grupos (que son `<div>` sin `data-docid`), lo que causaba que `endMarquee` limpiara la selección al navegar.

Solución: se agregó `data-no-marquee` a esos elementos y se verifica en `startMarquee`:

```js
const startMarquee = e => {
  if (e.button !== 0 || !contentRef.current) return;
  const t = e.target;
  if (t.closest('[data-docid]') || t.closest('[data-no-marquee]') ||
      t.closest('button') || t.closest('input') ||
      t.tagName === 'TH' || t.tagName === 'TD') return;
  // ...inicia marquee
};
```

Elementos con `data-no-marquee`:
- Cards de departamento (`nav.view === 'all'`)
- Cards de grupo (`nav.view === 'dept'`)

---

## 4. SelDocsModal — directorio completo para gestionar contexto

### Motivación

Cuando hay más de 3 documentos seleccionados en la sección Chat, los chips individuales del topbar se vuelven difíciles de manejar. Se necesita una forma compacta de ver y gestionar el contexto.

### Chip colapsado en Topbar

```
≤ 3 docs → chips individuales (comportamiento anterior)
> 3 docs → [📄 5 documentos seleccionados ▼]
```

Click en el chip → abre `SelDocsModal`.

### SelDocsModal

Modal centrado (800px × 640px, responsive) con dos columnas:

**Columna izquierda — En contexto:**
- Lista de docs seleccionados con × para quitar individualmente
- Botón "Quitar todos" al pie

**Columna derecha — Directorio:**
- Buscador para filtrar dentro del árbol
- Árbol completo: Departamento → Grupo → Docs (todos expandidos por defecto)
- Click en cualquier doc: lo agrega (checkbox +) o lo quita (checkbox ✓) del contexto en tiempo real
- Sección "Sin departamento" al final

### Flujo de datos para el directorio

`departments`, `groups` y `assign` viven en DocumentsPage. Para poder pasarlos al modal (que se renderiza en Topbar → App), se subieron al App level con callbacks:

```
DocumentsPage
  useEffect([departments]) → onDeptsChange?.(departments) → App.setAppDepts
  useEffect([groups])      → onGroupsChange?.(groups)     → App.setAppGroups
  useEffect([assign])      → onAssignChange?.(assign)     → App.setAppAssign

App
  → Topbar: departments={appDepts} groups={appGroups} assign={appAssign}
  → SelDocsModal: departments, groups, assign
```

---

## Nuevos estados en App

| Estado | Tipo | Uso |
|--------|------|-----|
| `appDepts` | `Dept[]` | Departamentos de la empresa activa |
| `appGroups` | `Group[]` | Grupos de la empresa activa |
| `appAssign` | `Record<id, {deptId, groupId}>` | Asignación actual de docs |

## Nuevos props en DocumentsPage

| Prop | Desde | Uso |
|------|-------|-----|
| `onSetSelected` | App | Reemplazar toda la selección de golpe |
| `onDeptsChange` | App | Sincronizar departments hacia arriba |
| `onGroupsChange` | App | Sincronizar groups hacia arriba |
| `onAssignChange` | App | Sincronizar assign hacia arriba |

## Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `app.js` | `SelDocsModal` (nuevo), `Topbar` (chip colapsado + modal), `DocumentsPage` (selección unificada, data-no-marquee, sync effects, onSetSelected, drag masivo), `App` (appDepts/Groups/Assign) |
