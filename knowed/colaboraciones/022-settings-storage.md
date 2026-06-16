# 022 — Settings: plan y almacenamiento

**Fecha:** 2026-06-14  
**Estado:** Completado

---

## Resumen

Nueva vista `/settings` (Configuración) accesible desde el sidebar. Muestra el plan activo y el uso de almacenamiento de la empresa seleccionada, con desglose por tipo de archivo al estilo Google Drive.

---

## 1. NAV — nuevo ítem

```js
{ icon:'ti-settings', label:'Configuración', key:'settings' }
```

Agregado al final del array `NAV`, que ahora tiene 6 ítems.

---

## 2. Endpoint `GET /api/storage` — `server.js`

```js
// GET /api/storage?company_id=<slug>
const LIMIT = 1073741824; // 1 GB — plan free
const rows = db.prepare(
  'SELECT type, COUNT(*) as count, SUM(size_bytes) as bytes FROM files WHERE company_id=? GROUP BY type'
).all(company_id);

const byType = {};
let totalBytes = 0, totalDocs = 0;
rows.forEach(r => {
  byType[r.type] = { count: r.count, bytes: r.bytes || 0 };
  totalBytes += r.bytes || 0;
  totalDocs  += r.count;
});

sendJson(res, 200, { totalBytes, limitBytes: LIMIT, byType, totalDocs });
```

Respuesta de ejemplo:
```json
{
  "totalBytes": 48234112,
  "limitBytes": 1073741824,
  "byType": {
    "pdf":  { "count": 12, "bytes": 30000000 },
    "xlsx": { "count": 8,  "bytes": 15000000 },
    "csv":  { "count": 3,  "bytes": 3234112 }
  },
  "totalDocs": 23
}
```

---

## 3. API helper — `app.js`

```js
async function apiGetStorage(companyId) {
  const res = await fetch(`${API_BASE}/storage?company_id=${encodeURIComponent(companyId)}`);
  return res.json();
}
```

---

## 4. `SettingsPage` — `app.js`

### Constantes de módulo nuevas

```js
const STORAGE_LIMIT = 1073741824; // 1 GB

const TYPE_LABELS = {
  pdf:'PDF', xlsx:'Excel', xls:'Excel', csv:'CSV',
  docx:'Word', doc:'Word', txt:'Texto',
};
```

### Props

```
SettingsPage({ activeCo, companies })
```

### Carga de datos

```js
useEffect(() => {
  if (!slug) return;
  setLoading(true);
  apiGetStorage(slug)
    .then(d => setStorage(d))
    .catch(() => setStorage(null))
    .finally(() => setLoading(false));
}, [activeCo]);
```

### `formatBytes(b)`

```js
const formatBytes = b => {
  if (!b) return '0 B';
  if (b >= 1073741824) return (b/1073741824).toFixed(1)+' GB';
  if (b >= 1048576)    return (b/1048576).toFixed(1)+' MB';
  if (b >= 1024)       return (b/1024).toFixed(1)+' KB';
  return b+' B';
};
```

### Lógica de la barra de progreso

```js
const pct       = Math.min(100, (totalBytes / STORAGE_LIMIT) * 100);
const overLimit = totalBytes > STORAGE_LIMIT;
const nearLimit = pct >= 90;
const barColor  = (overLimit || nearLimit) ? '#dc2626' : C.accent;
```

- `transition: width 0.4s ease` para animación suave al cargar
- Barra roja cuando ≥ 90% o supera el límite
- Banner de alerta si `overLimit`:
  ```
  ⚠ Has alcanzado el límite de tu plan
  ```

### Layout — dos secciones

**Plan:**
- Nombre del plan + badge "Activo"
- Características en texto
- Botón "Actualizar plan" (decorativo en prototipo)

**Almacenamiento:**
- Titular: `X MB de 1 GB usados`
- Barra de progreso global (10px de alto)
- Etiquetas: `X% utilizado` · `Y disponible`
- Separador
- Filas por tipo (ícono coloreado · nombre · count · mini-barra proporcional · tamaño)
- Footer: `Total: N documentos · X MB`

### Desglose por tipo — orden

Los tipos se ordenan de mayor a menor `bytes`:
```js
const typeEntries = Object.entries(byType).sort(([,a],[,b]) => b.bytes - a.bytes);
```

---

## 5. Routing en App

```jsx
{page === 'settings' && <SettingsPage activeCo={activeCo} companies={companies} />}
```

La página Settings muestra el Topbar (igual que Chat, Graphs, Policies). No necesita `selected` ni datos de grafos.

---

## Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `server.js` | Nuevo endpoint `GET /api/storage` |
| `app.js` | `apiGetStorage`, ítem `settings` en `NAV`, componente `SettingsPage`, constantes `STORAGE_LIMIT`/`TYPE_LABELS`, routing en App |
| `documentacion/funcionalidades.md` | Sección "Configuración y límites de almacenamiento", nav actualizado a 6 ítems |
