# 009 — Vista Documents: árbol de carpetas

**Fecha:** 2026-06-11  
**Estado:** Completado

---

## Qué se construyó

Rediseño completo de la vista `/documents` con navegación jerárquica tipo Google Drive.

---

## Jerarquía

```
Empresa Demo
└── Departamento  (Finanzas, IT, Ventas, RRHH, Operaciones)
    └── Grupo     (Cierres Q1, Pipeline Ventas, …)
        └── Documento  (ventas_Q1.xlsx, reporte.pdf, …)
```

4 niveles navegables. Los documentos viven en el nivel más bajo (dentro de un grupo) o sueltos en un departamento.

---

## Constante `TREE`

Definida a nivel de módulo en `app.js`:

```js
const TREE = {
  company: { id:'c1', name:'Empresa Demo' },
  departments: [ { id:'dep1', name:'Finanzas', icon:'ti-building-bank' }, … ],
  groups: [ { id:'g1', name:'Cierres Q1', deptId:'dep1' }, … ],
  docAssignments: {
    'doc-001': { deptId:'dep3', groupId:'g4' },
    // …
  },
};
```

`docAssignments` es inmutable (fuente de datos). El estado local `assign` es su copia mutable (permite drag & drop sin persistencia).

---

## Estado local (`DocumentsPage`)

| State | Tipo | Descripción |
|-------|------|-------------|
| `nav` | `{ view, deptId, groupId }` | Nivel de navegación actual |
| `assign` | object | Copia mutable de `TREE.docAssignments` |
| `viewMode` | `'grid' \| 'list'` | Toggle UI (visual) |
| `search` | string | Filtro en el nivel actual |
| `dragDocId` | string \| null | Documento siendo arrastrado |
| `dragOverId` | string \| null | Carpeta con hover activo |

### Valores de `nav.view`

| Value | Vista |
|-------|-------|
| `'all'` | Grid de departamentos (nivel raíz) |
| `'dept'` | Grupos + docs sueltos de un departamento |
| `'group'` | Docs de un grupo (tabla) |
| `'flat'` | Tabla plana de todos los docs con columna Location |

---

## Breadcrumb

```
Empresa Demo  ›  Ventas  ›  Pipeline Ventas
[click → all]   [click → dept]  [current — no click]
```

- Cada segmento excepto el último es clickeable
- En vista `all`: aparece enlace `· All documents` que lleva a `'flat'`
- En vista `flat`: breadcrumb muestra `Empresa Demo › All documents`

---

## Vistas

### `'all'` — Grid de departamentos

Cards en grid 3 columnas. Cada card:
- Icono del departamento + nombre
- Conteo de docs y grupos dentro
- Drop target: soltar un doc aquí lo asigna al departamento (sin grupo)

### `'dept'` — Grupos + docs sueltos

**Sección Groups:** carpetas en grid 3×N
- Icono `ti-folder-filled` naranja
- Nombre + conteo de docs
- Drop target: soltar un doc lo asigna al grupo

**Sección "Documents (sin grupo)":** tabla con los docs del departamento sin grupo asignado

### `'group'` — Tabla de documentos

Tabla estándar con columnas: Name, Type, Date, Size, Weight, Links, Graphs, Queries.
Misma tabla que la etapa anterior, sin columna Location.

### `'flat'` — Todos los documentos

Tabla completa con columna `Location` extra:
```
Ventas › Pipeline Ventas
Finanzas › Cierres Q1
Operaciones  ← (sin grupo)
```

---

## Drag & drop

Implementado con HTML5 Drag & Drop API nativo (sin librería).

```
Doc row draggable={true}
  onDragStart → setDragDocId(doc.id)
  onDragEnd   → clear drag state

Folder card / Dept card
  onDragOver  → e.preventDefault() + setDragOverId(targetId)
  onDragLeave → setDragOverId(null)
  onDrop      → handleDrop(e, deptId, groupId)
```

`handleDrop` actualiza `assign` en estado local:
```js
setAssign(prev => ({ ...prev, [dragDocId]: { deptId, groupId: groupId || null } }));
```

Sin persistencia — los cambios viven en memoria hasta recargar la página.

**Indicador visual:** la carpeta que recibe el hover cambia a `background: C.accent+'12'` y `border: 1px solid C.accent`.

---

## Renderizado sin componentes internos

Las funciones `renderRow` y `renderTable` son **funciones** (no componentes React) definidas dentro de `DocumentsPage`. Devuelven JSX directamente y se invocan como `{renderTable(docs)}`, no como `<DocTable />`.

Esto evita que React desmonte/remonte el subárbol en cada render (problema conocido con componentes definidos dentro de otros componentes).

---

## Toolbar

- **New folder** — botón UI, no funcional
- **Search** — filtra en el nivel actual (depts por nombre o docs contenidos, grupos por nombre o docs, tabla por nombre de doc)
- **Grid / List toggle** — cambia `viewMode`, resalta botón activo

---

## Archivos modificados

| Acción | Archivo |
|--------|---------|
| Modificado | `app.js` — constante `TREE`, reemplazo completo de `DocumentsPage` |
| Modificado | `documentacion/arquitectura.md` — sección jerarquía de organización |
| Creado | `colaboraciones/009-documents-tree.md` |
