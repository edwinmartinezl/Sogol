# 010 — Menú contextual, drag de carpetas y multi-empresa

**Fecha:** 2026-06-11  
**Estado:** Completado

---

## Qué se construyó

Tres mejoras sobre la vista `/documents`:
1. Menú contextual con click derecho (docs, carpetas, espacio en blanco)
2. Drag & drop de grupos entre departamentos
3. Soporte multi-empresa con modal de creación

---

## 1. Componente `ContextMenu`

Definido **fuera** de `DocumentsPage` para evitar re-montajes.

### Constante `CTX_ITEMS`

```js
const CTX_ITEMS = {
  doc:    [ Move to folder, Copy, Add to context, Details, —, Delete ],
  folder: [ Rename, Move inside folder, —, Delete ],
  blank:  [ New folder, New department, Upload document ],
};
```

### Props

| Prop | Tipo | Descripción |
|------|------|-------------|
| `menu` | `{ visible, x, y, type, targetId }` | Estado del menú |
| `onClose` | function | Cierra el menú |
| `onAction` | function | Ejecuta acción por key |

### Posicionamiento

`position: fixed` en `{ x, y }` del mouse. Se detecta overflow:
- `flipX`: si `x + 196 > window.innerWidth` → posiciona a la izquierda del cursor
- `flipY`: si `y + N*32 > window.innerHeight` → posiciona arriba del cursor

### Cierre

```js
useEffect(() => {
  document.addEventListener('click', closeCtx);
  document.addEventListener('keydown', onKey); // Escape
  return cleanup;
}, [ctxMenu.visible]);
```

El propio menú hace `e.stopPropagation()` para no cerrarse al hacer click dentro.

### Acción funcional: `newfolder`

- En vista `dept`: crea grupo en el departamento activo (`id = 'g'+Date.now()`)
- En vista `all`: log en consola (placeholder)
- El resto de acciones: `console.log('[CTX]', action, targetId)`

---

## 2. Drag de grupos entre departamentos

### Nuevo estado

```js
const [dragGroupId, setDragGroupId] = useState(null);
```

### Comportamiento

- Cada folder card (grupo) tiene `draggable={true}` + `onDragStart` → `setDragGroupId(g.id)`
- `opacity: 0.4` durante el drag
- `handleDrop` diferencia entre doc drag y group drag:

```js
if (dragDocId) {
  // mueve doc → { deptId, groupId }
} else if (dragGroupId && !tGroupId) {
  // mueve grupo → cambia su deptId (solo a depts, no a grupos)
  setGroups(prev => prev.map(g => g.id === dragGroupId ? { ...g, deptId:tDeptId } : g));
}
```

**Regla:** grupos solo se mueven a departamentos (`!tGroupId`). No pueden anidarse dentro de otros grupos.

---

## 3. Multi-empresa

### Estado

```js
const [companies,  setCompanies]  = useState([{ id:'c1', name:'Empresa Demo' }]);
const [activeCo,   setActiveCo]   = useState('c1');
const [showNewCo,  setShowNewCo]  = useState(false);
const [newCoName,  setNewCoName]  = useState('');
```

### `switchCompany(coId)`

Cambia empresa activa y resetea el árbol:

```js
if (coId === 'c1') { setGroups([...TREE.groups]); setAssign({...TREE.docAssignments}); }
else               { setGroups([]); setAssign({}); }
```

Las empresas distintas de `c1` arrancan con árbol vacío. Los cambios de una empresa no persisten al cambiar de empresa.

### `createCompany()`

```js
const id = 'c'+Date.now();
setCompanies(prev => [...prev, { id, name:newCoName.trim() }]);
switchCompany(id);
```

### Modal de creación

- Overlay `rgba(0,0,0,0.18)`, card `340px`, `borderRadius: 16px`
- Input con `autoFocus`, `Enter` para crear
- Botones Cancel / Crear
- `zIndex: 1000`

### Selector de empresa

Barra superior (`C.surface`) con icono `ti-building` + `<select>` nativo + botón `+ New company`.

---

## Jerarquía contextual (summary)

| Nivel | `onContextMenu` type | Vista | Opciones disponibles |
|-------|---------------------|-------|----------------------|
| Documento | `'doc'` | cualquiera | Move, Copy, Add to context, Details, Delete |
| Carpeta (grupo/dept) | `'folder'` | cualquiera | Rename, Move inside folder, Delete |
| Espacio en blanco | `'blank'` | `all` (raíz) | New folder, New department, Upload document |
| Espacio en blanco | `'blank_inner'` | `dept`/`group`/`flat` | New folder, Upload document |

**Regla de contexto:** "New department" se oculta cuando el usuario ya está navegando dentro de un departamento. El tipo `'blank_inner'` se asigna cuando `nav.view !== 'all'`.

---

## Archivos modificados

| Acción | Archivo |
|--------|---------|
| Modificado | `app.js` — `CTX_ITEMS`, `ContextMenu`, expansión de `DocumentsPage` |
| Modificado | `documentacion/funcionalidades.md` — sección Organización de documentos |
| Creado | `colaboraciones/010-context-menu-y-empresas.md` |
