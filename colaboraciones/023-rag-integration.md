# 023 — Integración RAG: vectores locales + LLM en Chat

**Fecha:** 2026-06-16  
**Estado:** Completado

---

## Resumen

Integración completa de RAG (Retrieval-Augmented Generation) en Sogol. Los documentos subidos se convierten automáticamente en vectores almacenados en **ChromaDB local**. El chat usa esos vectores para buscar contexto relevante y enviarlos a **Ollama (LLM local)** que genera la respuesta.

---

## Arquitectura de tres servicios

```
Browser (localhost:3000)
    │
    ├─► Static server (Node.js :3000) ─► app.js / index.html
    │
    └─► API server (Node.js :3001)
            │
            ├─► SQLite (knowlayer.db) — metadatos de archivos
            ├─► Disco (clientes/.../files/) — archivos originales
            │
            └─► RAG service (Python :3002)  ─── rag_service.py
                    │
                    ├─► ChromaDB (./chromadb/) — vectores locales persistentes
                    ├─► Jina AI API — embeddings (jina-embeddings-v3, 512 dims)
                    └─► Ollama (localhost:11434) — LLM para generación
```

---

## 1. `rag_service.py` — nuevo servicio Python

**Puerto:** 3002  
**Framework:** FastAPI + uvicorn  

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/status` | Health check, lista colecciones activas |
| POST | `/ingest` | Vectoriza un archivo y guarda en ChromaDB |
| DELETE | `/ingest/{file_id}?company_id=` | Borra los vectores de un archivo |
| POST | `/query` | Búsqueda RAG + respuesta del LLM |

### Pipeline de ingesta (`POST /ingest`)

```
archivo en disco
  → extract_text() — PDF/XLSX/CSV/DOCX/TXT
  → chunk_text()   — ventanas de 400 palabras, overlap 40
  → embed()        — Jina AI en batches de 32
  → ChromaDB.add() — colección co_{company_id}
```

### Pipeline de consulta (`POST /query`)

```
pregunta
  → embed_query()         — Jina AI (task: retrieval.query)
  → ChromaDB.query()      — TOP 5 chunks más similares (cosine)
  → prompt con contexto   — "Responde basándote SOLO en estos documentos..."
  → Ollama /api/generate  — LLM genera respuesta
  → { answer, sources }
```

### Extracción de texto por tipo

| Extensión | Librería |
|-----------|---------|
| `.pdf` | PyMuPDF (`fitz`) → pypdf → PyPDF2 (fallback) |
| `.xlsx` / `.xls` | pandas |
| `.csv` | lectura directa |
| `.docx` | python-docx |
| `.txt` | lectura directa |

### ChromaDB — colecciones

Una colección por empresa: `co_{company_id}` (donde `company_id` es el slug).  
Metadata por chunk: `{ file_id, file_name, chunk }`.  
Distancia: cosine similarity.

---

## 2. `.env` — configuración

```
JINA_API_KEY=...
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

---

## 3. `server.js` — cambios

### Helper `callRag(method, path, body)`

Función HTTP interna que comunica el API de Node.js con el RAG service en Python.  
Usa el módulo `http` nativo de Node.js (sin dependencias extra).

### Upload (`POST /api/upload`)

Antes: `vectorized=1` (mock), `chunks` estimado por tamaño.  
Ahora: `vectorized=0`, `chunks=0` → luego dispara ingest asíncrono:

```js
setImmediate(async () => {
  const result = await callRag('POST', '/ingest', { file_id, file_path, company_id, file_name });
  db.prepare('UPDATE files SET vectorized=?, chunks=? WHERE id=?')
    .run(result.chunks > 0 ? 1 : 2, result.chunks, id);
});
```

- `vectorized = 0` → pendiente
- `vectorized = 1` → listo
- `vectorized = 2` → error

### Delete (`DELETE /api/files/:id`)

Al eliminar un archivo también borra sus vectores:
```js
callRag('DELETE', `/ingest/${id}?company_id=${company_id}`).catch(() => {});
```

### Nuevo endpoint `POST /api/chat/query`

Proxy al RAG service. Recibe `{ company_id, file_ids, question }` y devuelve `{ answer, sources }`.

### Nuevo endpoint `GET /api/rag/status`

Health check del RAG service. Devuelve `{ ok, model, collections }`.

---

## 4. `app.js` — cambios

### `apiChatQuery(companyId, fileIds, question)`

Nueva función que llama a `POST /api/chat/query`.

### `normalizeReal(r)` — campos actualizados

```js
vectorized: r.vectorized ?? 0,   // estado real del DB (0/1/2)
chunks:     r.chunks || 0,       // chunks reales de ChromaDB
```

### `MessageBubble` — estado de carga y fuentes reales

- `msg.loading = true` → muestra animación de tres puntos (`ragdot`)
- `msg.sourceNames = ['archivo.pdf', ...]` → muestra pills con nombre de archivo e ícono

### `ChatPage.send()` — real RAG

Antes: respuesta mock hardcodeada.  
Ahora:

1. Filtra `selected` a solo docs reales (`allRealDocs`)
2. Si no hay docs reales seleccionados → mensaje de guía
3. Añade placeholder con `loading: true`
4. Llama `apiChatQuery(compSlug, realSel, text)`
5. Reemplaza placeholder con respuesta real + `sourceNames`
6. Botón de envío deshabilitado mientras carga (spinner `ti-loader-2`)

### `index.html` — keyframe `ragdot`

```css
@keyframes ragdot {
  0%, 60%, 100% { transform: translateY(0);    opacity: 0.35; }
  30%           { transform: translateY(-4px); opacity: 1;    }
}
```

---

## 5. Arranque del sistema

```bash
# Terminal 1 — API + Static (Node.js)
cd knowed/knowed
node server.js

# Terminal 2 — RAG service (Python)
cd knowed/knowed
python rag_service.py
```

O desde el directorio raíz con el `.bat`:

```batch
start "Sogol API" node knowed\server.js
start "Sogol RAG" python knowed\rag_service.py
```

---

## 6. Dependencias Python necesarias

```bash
pip install fastapi uvicorn chromadb python-dotenv requests pandas
# Para PDF:
pip install pymupdf
# Para DOCX:
pip install python-docx
```

---

## Archivos modificados / creados

| Archivo | Cambio |
|---------|--------|
| `rag_service.py` | **Nuevo** — microservicio RAG completo |
| `.env` | **Nuevo** — credenciales Jina AI + config Ollama |
| `server.js` | `callRag` helper, upload async, delete vectores, `/api/chat/query`, `/api/rag/status` |
| `app.js` | `apiChatQuery`, `normalizeReal` actualizado, `MessageBubble` con loading/sources, `ChatPage.send()` real |
| `index.html` | Keyframe `ragdot` para typing indicator |
