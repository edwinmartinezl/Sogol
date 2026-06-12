# 013 — Backend de archivos reales (Node.js + SQLite)

**Fecha:** 2026-06-11  
**Estado:** Completado

---

## Estructura en disco

```
knowed/
├── server.js                    ← servidor HTTP Node.js puro (puerto 3001)
├── knowlayer.db                 ← SQLite (creado automáticamente al iniciar)
├── package.json
├── node_modules/
│   ├── better-sqlite3/
│   └── busboy/
├── clientes/
│   └── CLI001/
│       └── empresas/
│           └── empresa-demo/
│               └── files/       ← archivos subidos van aquí
├── index.html
├── app.js
└── data/mock.js
```

---

## Servidor — `server.js`

**Runtime:** Node.js puro sin frameworks (solo módulos nativos + 2 dependencias).

| Módulo | Uso |
|--------|-----|
| `http` | Servidor HTTP |
| `fs` | Escritura de archivos al disco |
| `path` | Construcción de rutas |
| `crypto` | `randomUUID()` para IDs de archivos |
| `better-sqlite3` | ORM síncrono sobre SQLite |
| `busboy` | Parser de `multipart/form-data` |

**Instalación:**
```bash
npm init -y
npm install better-sqlite3 busboy
```

**Inicio:**
```bash
node server.js
# KnowLayer API  →  http://localhost:3001
# DB             →  /ruta/a/knowlayer.db
```

---

## SQLite — tabla `files`

```sql
CREATE TABLE IF NOT EXISTS files (
  id            TEXT PRIMARY KEY,
  client_id     TEXT NOT NULL,
  company_id    TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_name   TEXT NOT NULL,
  path_on_disk  TEXT NOT NULL,
  type          TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  dept_id       TEXT,
  group_id      TEXT,
  uploaded_at   TEXT NOT NULL
);
```

| Campo | Descripción |
|-------|-------------|
| `id` | UUID generado con `crypto.randomUUID()` |
| `client_id` | ID del cliente (siempre `CLI001` en esta versión) |
| `company_id` | Slug de la empresa (ej. `empresa-demo`) |
| `original_name` | Nombre original del archivo tal como lo subió el usuario |
| `stored_name` | Nombre en disco: `{uuid}.{ext}` — evita colisiones |
| `path_on_disk` | Ruta absoluta al archivo físico |
| `type` | Extensión sin punto: `pdf`, `txt`, `xlsx` |
| `size_bytes` | Tamaño en bytes |
| `dept_id` | ID del departamento asignado (null = sin asignar) |
| `group_id` | ID del grupo asignado (null = sin asignar) |
| `uploaded_at` | ISO-8601 UTC del momento de subida |

---

## Endpoints

### `POST /api/upload`

Sube un archivo y lo registra en SQLite.

**Request:** `multipart/form-data`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `client_id` | text | ID del cliente |
| `company_id` | text | Slug de la empresa |
| `file` | file | El archivo (`.pdf`, `.txt`, `.xlsx`) |

**Respuesta 201:**
```json
{
  "id": "9096b580-268b-463f-b9b3-e1c1ab0d6a78",
  "client_id": "CLI001",
  "company_id": "empresa-demo",
  "original_name": "ventas_Q1.xlsx",
  "stored_name": "9096b580-268b-463f-b9b3-e1c1ab0d6a78.xlsx",
  "path_on_disk": "...clientes/CLI001/empresas/empresa-demo/files/...",
  "type": "xlsx",
  "size_bytes": 204800,
  "dept_id": null,
  "group_id": null,
  "uploaded_at": "2026-06-11T14:24:33.616Z"
}
```

**Validaciones:**
- Extensión no permitida → 400 `{ error: "Extension not allowed: .zip" }`
- Falta `client_id` o `company_id` → 400

---

### `GET /api/files?client_id=CLI001&company_id=empresa-demo`

Devuelve todos los archivos de una empresa ordenados por `uploaded_at DESC`.

**Respuesta 200:** Array de registros del schema `files`.

---

### `PATCH /api/files/:id/move`

Asigna el archivo a un departamento/grupo.

**Body JSON:**
```json
{ "dept_id": "dep1", "group_id": "g1" }
```

**Respuesta 200:** El registro actualizado.

---

### `DELETE /api/files/:id`

Elimina el registro de SQLite y el archivo físico del disco.

**Respuesta 200:** `{ "deleted": "uuid" }`

---

## CORS

Todos los endpoints responden con:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,POST,PATCH,DELETE,OPTIONS
Access-Control-Allow-Headers: Content-Type
```

Las preflight OPTIONS devuelven 204 sin body.

---

## Integración en `app.js`

### Funciones de API (módulo global)

```js
const API_BASE  = 'http://localhost:3001/api';
const CLIENT_ID = 'CLI001';

const coSlug = (coId, coList) =>
  coId === 'c1' ? 'empresa-demo'
  : (coList.find(c => c.id === coId)?.name || coId)
      .toLowerCase().replace(/[^a-z0-9]+/g, '-');

async function apiGetFiles(companyId) { ... }
async function apiUpload(file, companyId) { ... }
const normalizeReal = r => ({ id, name, type, size, weight:0.5, ..., isReal:true });
```

### Cambios en `DocumentsPage`

| Cambio | Descripción |
|--------|-------------|
| `realDocs` state | Lista de docs reales normalizados desde la API |
| `allDocs` | `[...documents, ...realDocs]` — mezcla mock + reales |
| `toast` state | Mensaje temporal (3s): "Uploading…" / "Done — nombre" / "Server offline" |
| `uploadRef` | Ref al `<input type="file" hidden>` |
| `docsForGroup` / `docsForDept` / `docsLoose` | Actualizados para usar `allDocs` |
| `flat` view | Ahora muestra `allDocs` |
| Doc count en breadcrumb | Muestra `allDocs.length` |

### Carga inicial de reales

```js
useEffect(() => {
  // ... reset nav, groups, assign ...
  setRealDocs([]);
  apiGetFiles(slug).then(rows => {
    const norm = rows.map(normalizeReal);
    setRealDocs(norm);
    setAssign(prev => { /* add unassigned entries */ });
  }).catch(() => {});
}, [activeCo]);
```

Si el servidor no está corriendo, el `catch` silencia el error — los docs mock siguen apareciendo normalmente.

### Acción `upload` en menú contextual

`handleCtxAction('upload')` → `uploadRef.current?.click()` → abre el file picker del OS → `doUpload(file)` → llamada a `apiUpload` → inserta en `realDocs` + `assign`.

### Badge "Real"

Los docs reales muestran un badge verde `REAL` junto al TypeBadge en la vista de tarjetas (`renderCard`).

---

## Cómo correr en desarrollo

**Terminal 1 — Backend:**
```bash
cd knowed/
node server.js
```

**Terminal 2 — Frontend:**
```bash
cd knowed/
python3 -m http.server 3000
# o en Windows:
python -m http.server 3000
```

Abrir `http://localhost:3000` en el browser.

---

## Verificación manual

1. Ir a Documents → click derecho en espacio en blanco → "Upload document"
2. Seleccionar un `.pdf`, `.txt` o `.xlsx`
3. Toast "Uploading…" → toast "Done — nombre.ext"
4. El doc aparece en la vista con badge verde "Real"
5. En "All documents" (vista flat) el doc real aparece mezclado con los mock
6. Verificar en disco: `clientes/CLI001/empresas/empresa-demo/files/` tiene el archivo
7. Verificar en SQLite: `node -e "const D=require('better-sqlite3')('knowlayer.db'); console.log(D.prepare('SELECT * FROM files').all())"`

---

## Archivos modificados / creados

| Acción | Archivo |
|--------|---------|
| Creado | `server.js` |
| Creado | `package.json` + `node_modules/` |
| Creado | `knowlayer.db` (auto) |
| Creado | `clientes/CLI001/empresas/empresa-demo/files/` |
| Modificado | `app.js` — funciones API, `DocumentsPage` (realDocs, upload, toast, allDocs) |
| Modificado | `documentacion/arquitectura.md` |
| Creado | `colaboraciones/013-backend-upload.md` |
