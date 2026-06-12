# 011 — Mejoras UX en Vista Documents

**Fecha:** 2026-06-11  
**Estado:** Completado

---

## Qué se construyó

Cinco mejoras sobre la vista `/documents` y la estructura global:

1. Grafo — aristas entre todos los nodos seleccionados
2. Menú contextual en espacio en blanco (no solo en cards)
3. Toggle de vista tarjeta / lista
4. Tarjetas compactas con nombre truncado y tooltip
5. Modal para nombrar carpeta antes de crearla
6. Selector de empresa movido al Topbar

---

## 1. Aristas del grafo — todos los pares seleccionados

### Problema original

`GRAPH_EDGES` solo tenía co-ocurrencias para 3 documentos (doc-001 y doc-002), por lo que seleccionar otros docs no producía líneas.

### Solución

`GRAPH_EDGES` ahora se construye dinámicamente desde `CHAT_HISTORY`:

```js
const GRAPH_EDGES = (() => {
  const co = {};
  CHAT_HISTORY.forEach(msg => {
    if (!msg.sources || msg.sources.length < 2) return;
    for (let i = 0; i < msg.sources.length; i++)
      for (let j = i + 1; j < msg.sources.length; j++) {
        const k = [msg.sources[i], msg.sources[j]].sort().join('|');
        co[k] = (co[k] || 0) + 1;
      }
  });
  return Object.entries(co).map(([k, w]) => {
    const [a, b] = k.split('|');
    return { from:a, to:b, weight:w };
  });
})();
```

`CHAT_HISTORY` fue enriquecido con 6 mensajes AI adicionales que referencian todos los pares de doc-001 a doc-007.

En el `useEffect` de GraphsPage, la generación de links conecta **todos los pares** de `selDocs`:

```js
const edgeWeightMap = {};
GRAPH_EDGES.forEach(e => {
  edgeWeightMap[[e.from,e.to].sort().join('|')] = e.weight;
});
const links = [];
for (let i = 0; i < selDocs.length; i++)
  for (let j = i+1; j < selDocs.length; j++) {
    const k = [selDocs[i].id, selDocs[j].id].sort().join('|');
    links.push({ source:selDocs[i].id, target:selDocs[j].id, weight:edgeWeightMap[k]||1 });
  }
```

El fallback `weight:1` garantiza que cualquier combinación de ≥ 3 docs produce un grafo completamente conectado.

---

## 2. Menú contextual en espacio en blanco

### Problema original

El `onContextMenu` estaba en el div interior del contenido, pero el padding exterior del contenedor no propagaba los eventos hasta él.

### Solución

El handler se movió al **contenedor exterior** de contenido:

```jsx
<div style={{ flex:1, overflow:'auto', padding:'20px 24px' }}
  onContextMenu={e => openCtx(e, nav.view === 'all' ? 'blank' : 'blank_inner')}>
  {content}
</div>
```

Los handlers de docs y carpetas añaden `e.stopPropagation()` para no hacer burbujear al contenedor:

```js
onContextMenu={e => { e.stopPropagation(); openCtx(e, 'doc', doc.id); }}
```

### Tipo `blank_inner`

`CTX_ITEMS` tiene dos variantes para espacio en blanco:

```js
const CTX_ITEMS = {
  doc:         [ Move to folder, Copy, Add to context, Details, —, Delete ],
  folder:      [ Rename, Move inside folder, —, Delete ],
  blank:       [ New folder, New department, Upload document ],
  blank_inner: [ New folder, Upload document ],
};
```

`blank_inner` se usa cuando `nav.view !== 'all'` — dentro de un departamento o grupo no tiene sentido crear un nuevo departamento.

---

## 3. Toggle vista tarjeta / lista

Nuevo estado `viewMode` (`'grid'` | `'list'`) en `DocumentsPage`. El toolbar muestra dos botones:

```jsx
{['grid','list'].map(mode => (
  <button key={mode} onClick={() => setViewMode(mode)} style={{
    background: viewMode===mode ? C.accent+'14' : 'transparent',
    color:      viewMode===mode ? C.accent : C.muted,
  }}>
    <i className={'ti '+(mode==='grid' ? 'ti-layout-grid' : 'ti-list')} />
  </button>
))}
```

Funciones que delegan la vista:

| Función | Rol |
|---------|-----|
| `renderCard(doc, showLoc)` | Renderiza una tarjeta individual |
| `renderCards(docs, showLoc)` | Grid 4 columnas de tarjetas |
| `renderTable(docs, showLoc)` | Tabla con columnas estándar |
| `renderDocs(docs, showLoc)` | Delega a `renderCards` o `renderTable` según `viewMode` |

Todas son funciones internas (no componentes React) para evitar re-montajes.

---

## 4. Tarjetas compactas con tooltip

`renderCard` genera tarjetas compactas (padding `10px 12px`, grid 4 columnas, icono 18px). El nombre usa `overflow:hidden / textOverflow:ellipsis` y el atributo `title` para el tooltip nativo del browser:

```jsx
<span title={doc.name} style={{
  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
  fontSize:'11px', fontWeight:500, color:C.text,
}}>
  {doc.name}
</span>
```

La barra de peso tiene altura `2px` para mantener el card compacto.

---

## 5. Modal para nombre de carpeta

Antes `handleCtxAction('newfolder')` creaba la carpeta inmediatamente sin pedir nombre.

Ahora abre un modal con input + autoFocus:

```js
const [showNewFolder, setShowNewFolder] = useState(false);
const [newFolderName, setNewFolderName] = useState('');

const createFolder = () => {
  const name = newFolderName.trim();
  if (!name) return;
  if (nav.view === 'dept') {
    setGroups(prev => [...prev, { id:'g'+Date.now(), name, deptId:nav.deptId }]);
  }
  setShowNewFolder(false); setNewFolderName('');
};
```

El modal se cierra con Escape (click en backdrop) o Cancel. Enter dentro del input también crea la carpeta.

---

## 6. Selector de empresa en Topbar

### Problema original

`companies` y `activeCo` estaban en `DocumentsPage` pero el selector necesitaba aparecer en el `Topbar` (misma fila que el selector de modelo).

### Solución — state lift a App

```js
// App.js
const [companies, setCompanies] = useState([{ id:'c1', name:'Empresa Demo' }]);
const [activeCo,  setActiveCo]  = useState('c1');
```

`App` pasa `{ companies, activeCo, onSwitchCo:switchCo, onNewCo:() => setShowNewCo(true) }` a `Topbar`.

`Topbar` muestra el selector solo cuando `page === 'documents'`:

```jsx
{page === 'documents' && (
  <div>
    <i className="ti ti-building" />
    <select value={activeCo} onChange={e => onSwitchCo(e.target.value)}>
      {(companies||[]).map(co => <option key={co.id} value={co.id}>{co.name}</option>)}
    </select>
    <button onClick={onNewCo}>+ New company</button>
  </div>
)}
```

El modal de nueva empresa también vive en `App` (zIndex: 2000).

`DocumentsPage` recibe `activeCo` como prop y tiene un `useEffect([activeCo])` que resetea `groups` y `assign` cuando cambia la empresa.

---

## Archivos modificados

| Acción | Archivo |
|--------|---------|
| Modificado | `app.js` — GraphsPage edges, CTX_ITEMS, blank_inner, renderCard/Cards/Table/Docs, viewMode, showNewFolder modal, state lift companies → App, Topbar company selector |
| Modificado | `documentacion/funcionalidades.md` |
| Modificado | `documentacion/arquitectura.md` |
| Creado | `colaboraciones/011-documentos-ux.md` |
