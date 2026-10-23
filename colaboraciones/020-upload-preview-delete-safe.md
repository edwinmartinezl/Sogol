# 020 — Upload preview, delete seguro y vectorización

**Fecha:** 2026-06-12  
**Estado:** Completado

---

## Resumen

Etapa 16. Tres mejoras al ciclo de vida de documentos:

1. **UploadPreviewModal** — previsualización de archivos antes de confirmar la subida
2. **DeleteDocModal** — eliminación con 3 niveles de confirmación según el impacto
3. **Columnas de vectorización** en servidor (`vectorized`, `chunks`) con migración segura

Principio de diseño de esta etapa: **en modo prototipo, todos los documentos subidos son considerados vectorizados de inmediato** — la barra de `VectorizingModal` es una animación, no un proceso real.

---

## 1. UploadPreviewModal

### Problema

Al hacer click en "Subir documento" el archivo se cargaba directamente sin confirmación. El usuario no podía cancelar ni verificar qué iba a subir.

### Solución

Se intercepta el `onChange` del `<input type="file">`:

```js
// Antes:
onChange={e => doUpload(e.target.files[0])}

// Ahora:
onChange={e => setPendingFiles(Array.from(e.target.files))}
```

`pendingFiles` dispara el `UploadPreviewModal`. Al confirmar, se llama `doUpload` normalmente.

### Comportamiento según cantidad

| Archivos | UI |
|----------|----|
| 1 | Preview completo: info + preview por tipo |
| 2–5 | Lista simple nombre + tamaño |
| 6+ | Cabecera naranja de advertencia masiva |

### Previews

| Tipo | Técnica |
|------|---------|
| PDF | `URL.createObjectURL(file)` → `<iframe>` 220px |
| CSV | `FileReader.readAsText` → tabla HTML 5 filas |
| TXT | `FileReader.readAsText` → `<pre>` 10 líneas |
| Otros | Placeholder con ícono del tipo |

---

## 2. DeleteDocModal — 3 niveles

### Lógica de nivel

```js
const inGraphs     = (savedGraphs||[]).filter(g => g.docIds.includes(doc.id));
const hasRelations = inGraphs.length > 0 || doc.links > 0;
const hasUsage     = (doc.queries || 0) > 0;
const level        = hasRelations ? 3 : hasUsage ? 2 : 1;
```

### Niveles

**Nivel 1 — Sin impacto**  
El documento no tiene consultas ni aparece en grafos.  
→ Botón `Eliminar` habilitado directamente.

**Nivel 2 — Tiene historial de uso**  
El documento ha sido consultado desde el chat.  
→ Muestra: chunks, número de consultas, porcentaje de peso RAG.  
→ Botón `Sí, eliminar` requiere confirmar.

**Nivel 3 — Tiene relaciones críticas**  
Está en uno o más grafos guardados, o tiene links hacia otros docs.  
→ Muestra: lista de grafos afectados.  
→ El usuario debe escribir `BORRAR` en un input para habilitar el botón.

### Flujo de eliminación

1. `apiDeleteFile(id)` → `DELETE /api/files/:id`
2. Servidor: `fs.unlinkSync(path_on_disk)` + `DELETE FROM files WHERE id=?`
3. Frontend: filtra `realDocs`, `assign`, `selected`

---

## 3. Vectorización en servidor

### Columnas nuevas

```sql
vectorized INTEGER DEFAULT 1   -- siempre 1 en prototipo
chunks     INTEGER DEFAULT 0   -- estimado: max(5, floor(size_bytes/1000))
```

### Migración segura (DBs existentes)

```js
try { db.exec(`ALTER TABLE files ADD COLUMN vectorized INTEGER DEFAULT 1`); } catch {}
try { db.exec(`ALTER TABLE files ADD COLUMN chunks INTEGER DEFAULT 0`);     } catch {}
```

`ALTER TABLE ADD COLUMN` falla si la columna ya existe — el `try/catch` hace el proceso idempotente.

### Cálculo de chunks al subir

```js
const size_bytes = fileData.buffer.length;
const chunks     = Math.max(5, Math.floor(size_bytes / 1000));
const record     = { ..., vectorized: 1, chunks };
```

Mínimo 5 chunks por archivo. Aproximación: ~1 chunk por KB.

---

## 4. Principio de prototipo

> **Todo documento en Sogol está vectorizado por definición.**

`VectorizingModal` existe para dar feedback visual al usuario, no para ejecutar una vectorización real. Cuando se integre un motor de embeddings (OpenAI, Cohere, etc.):

- `vectorized` pasará de `1` a `0` al subir, y a `1` solo cuando el proceso real termine
- `VectorizingModal` llamará al endpoint de vectorización real
- `chunks` se calculará desde el motor, no desde el tamaño en bytes

Por ahora, cualquier archivo válido se puede subir y usar en RAG inmediatamente.

---

## Nuevos estados en DocumentsPage

| Estado | Tipo | Uso |
|--------|------|-----|
| `pendingFiles` | `File[]` | Archivos pendientes de confirmar |
| `deleteDocId` | `string \| null` | ID del doc a eliminar |

## Props nuevos en DocumentsPage

| Prop | Desde | Uso |
|------|-------|-----|
| `savedGraphs` | App | Necesario para calcular nivel 3 del DeleteDocModal |

---

## Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `server.js` | Columnas `vectorized`/`chunks`, migración try/catch, cálculo de chunks en upload, endpoint `DELETE /api/files/:id` |
| `app.js` | `UploadPreviewModal`, `DeleteDocModal`, `apiDeleteFile`, `normalizeReal` actualizado, `DocumentsPage` con nuevos estados y handlers |
| `documentacion/arquitectura.md` | Sección "Principio fundamental de Sogol" |
| `documentacion/funcionalidades.md` | Sección "Ciclo de vida de un documento", `UploadPreviewModal`, `DeleteDocModal` |
