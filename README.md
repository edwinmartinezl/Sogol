# Sogol (knowed / KnowLayer)

Plataforma de conocimiento empresarial: sube documentos (PDF, Excel, CSV, Word, TXT), se vectorizan automáticamente y se consultan mediante un chat con RAG (Retrieval-Augmented Generation) sobre un LLM local. Incluye organización jerárquica de documentos por empresa/departamento/grupo, visualización de grafos de relaciones entre documentos, visor inline de PDFs y un modelo conceptual de control de acceso por políticas.

> **Nombres del proyecto:** el paquete npm se llama `knowed`, la base de datos SQLite es `knowlayer.db` (nombre original del producto, *KnowLayer*) y la marca visible en la UI (login, título de la pestaña) es **Sogol**, producto de un rebrand posterior (ver [`colaboraciones/017-rebrand-sogol-login-animaciones.md`](colaboraciones/017-rebrand-sogol-login-animaciones.md)). Los tres nombres conviven en el código y se refieren al mismo proyecto.

---

## Tabla de contenidos

- [Stack técnico](#stack-técnico)
- [Inicio rápido](#inicio-rápido)
- [Variables de entorno](#variables-de-entorno)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Arquitectura](#arquitectura)
- [Modelo de datos (SQLite)](#modelo-de-datos-sqlite)
- [Referencia de API](#referencia-de-api)
- [Funcionalidades principales](#funcionalidades-principales)
- [Multi-tenant y almacenamiento en disco](#multi-tenant-y-almacenamiento-en-disco)
- [Seguridad — modelo de acceso](#seguridad--modelo-de-acceso)
- [Estado del prototipo — notas importantes](#estado-del-prototipo--notas-importantes)
- [Documentación adicional](#documentación-adicional)

---

## Stack técnico

| Capa | Tecnología |
|------|------------|
| UI | React 18 (UMD vía unpkg) + JSX transformado en el navegador con Babel Standalone — **sin paso de build** |
| Estilos | Tailwind CSS (CDN) + estilos inline en JS |
| Iconos | Tabler Icons Webfont (CDN) |
| Grafos | D3.js v7 (CDN) — force simulation 2D |
| Hojas de cálculo | SheetJS / `xlsx` (CDN en frontend, npm en backend) |
| Backend HTTP | Node.js nativo (`http`), sin framework (sin Express) |
| Base de datos | SQLite vía `better-sqlite3` (síncrono) |
| Subida de archivos | `busboy` (parser multipart) |
| Motor RAG | `rag.js` — Node.js nativo, embeddings Jina AI, vectores en SQLite, generación vía Ollama |
| Extracción de texto | `pdf-parse` (PDF), `xlsx` (Excel), `mammoth` (Word), lectura directa (TXT/CSV) |

No hay bundler, ni TypeScript, ni framework de testing configurado. El navegador descarga `app.js` directamente y Babel lo compila en tiempo de carga.

## Inicio rápido

Requisitos: Node.js (con soporte para `better-sqlite3`), y opcionalmente [Ollama](https://ollama.com) corriendo en local para que el chat genere respuestas.

```bash
npm install
node server.js
```

Esto levanta **un solo proceso Node.js** que sirve dos puertos:

| Puerto | Contenido |
|--------|-----------|
| `3000` | Frontend estático (`index.html`, `app.js`) |
| `3001` | API REST + motor RAG |

Abre `http://localhost:3000` en el navegador. El login es una pantalla demo sin contraseña ("Entrar como demo") — no valida credenciales contra el backend.

> `npm start` ejecuta lo mismo (`"start": "node server.js"` en `package.json`).

### RAG — requisitos para que el chat responda

El chat necesita dos servicios externos configurados vía `.env` (ver siguiente sección):

1. **Jina AI** — API de embeddings (`JINA_API_KEY`). Sin esta clave, la subida de archivos falla al vectorizar (`vectorized=2`, error).
2. **Ollama** corriendo en `OLLAMA_URL` con el modelo `OLLAMA_MODEL` descargado (`ollama pull <modelo>`). Sin Ollama disponible, `/api/chat/query` devuelve error 503.

Si el servidor Node no está corriendo, el frontend sigue funcionando en modo degradado: muestra un toast "Servidor offline" y no persiste nada.

## Variables de entorno

Definidas en `.env` en la raíz del proyecto (ver `.env.example`). Se cargan manualmente (sin dependencia `dotenv`) tanto en `server.js` como en `rag.js`.

| Variable | Default | Uso |
|----------|---------|-----|
| `JINA_API_KEY` | *(vacío)* | Autenticación contra `api.jina.ai` para generar embeddings (`jina-embeddings-v3`, 512 dims) |
| `OLLAMA_URL` | `http://localhost:11434` | Endpoint del servidor Ollama local |
| `OLLAMA_MODEL` | `minimax-m3:cloud` | Modelo usado en `/api/generate` de Ollama para responder preguntas del chat |

## Estructura del proyecto

```
knowed/
├── index.html            — shell HTML: carga React/Babel/D3/Tailwind/SheetJS por CDN + app.js
├── app.js                — toda la aplicación React en un solo archivo (~4900 líneas)
├── server.js              — servidor HTTP (API :3001 + estático :3000) + esquema SQLite
├── rag.js                 — motor RAG activo: extracción, chunking, embeddings, cosine search, Ollama
├── rag_service.py         — microservicio RAG alternativo (Python/FastAPI/ChromaDB) — ver nota de estado
├── knowlayer.db            — SQLite (se crea sola al primer arranque; ignorada por git)
├── data/mock.js            — datos de ejemplo históricos (ya no se siembran en app.js, ver más abajo)
├── clientes/               — archivos subidos físicamente, por cliente/empresa (ignorada por git)
│   └── CLI001/empresas/{slug}/files/
├── documentacion/          — documentación detallada de arquitectura y funcionalidades
│   ├── arquitectura.md
│   ├── funcionalidades.md
│   └── datos-mock.md
├── colaboraciones/         — bitácora cronológica de cambios, una entrada por feature/sesión
├── .env / .env.example     — credenciales y configuración del motor RAG
└── package.json
```

## Arquitectura

### Tres piezas en tiempo de ejecución

```
Navegador (http://localhost:3000)
   │  descarga index.html → CDN libs (React/Babel/D3/Tailwind/SheetJS) → app.js
   │
   ├─► Servidor estático (Node.js, dentro de server.js) ── puerto 3000
   │
   └─► API REST (Node.js, dentro de server.js) ── puerto 3001
           │
           ├─► SQLite knowlayer.db — metadatos (files, companies, departments,
           │                          groups, conversations, chat_messages, chunks)
           ├─► Disco — clientes/{client}/empresas/{empresa}/files/ (archivos originales)
           │
           └─► rag.js (in-process, sin puerto propio)
                   ├─► Jina AI API — embeddings
                   └─► Ollama (localhost:11434) — generación de respuestas
```

`server.js` arranca **dos** `http.createServer` en el mismo proceso: uno para la API (`server.listen(3001)`) y uno estático que sirve `index.html`/`app.js` (`staticServer.listen(3000)`). No hay proxy ni reverse-proxy entre ellos; el frontend llama a `http://localhost:3001/api/...` directamente (`API_BASE` en `app.js`), con CORS abierto (`Access-Control-Allow-Origin: *`).

### Motor RAG — `rag.js` (activo)

Todo el pipeline corre en el mismo proceso Node que la API, sin microservicio aparte:

```
Archivo subido
  → extractText()   pdf-parse / xlsx / mammoth / lectura directa según extensión
  → chunkText()      ventanas de 400 palabras, solape de 40
  → embed()           Jina AI, en batches de 32 (jina-embeddings-v3, 512 dims)
  → INSERT en tabla `chunks` (embedding serializado como JSON en columna TEXT)

Pregunta del chat
  → embed(question, task='retrieval.query')
  → cosine similarity contra los chunks de la empresa (y opcionalmente de los file_ids en contexto)
  → top 5 chunks → prompt con instrucciones "responde solo con estos documentos"
  → POST {OLLAMA_URL}/api/generate → { answer, sources }
```

La ingesta ocurre de forma asíncrona tras el `POST /api/upload` (`setImmediate`, no bloquea la respuesta HTTP). Mientras se vectoriza, `files.vectorized = 0`; al terminar pasa a `1` (éxito) o `2` (error).

### `rag_service.py` — implementación alternativa, actualmente no conectada

El repo también contiene un microservicio Python (FastAPI + ChromaDB, puerto 3002) que implementa el mismo pipeline de RAG con vectores persistidos en ChromaDB en vez de SQLite. `server.js` define un helper `callRag()` para hablarle por HTTP, pero las rutas activas (`/api/chat/query`, `/api/rag/status`, el ingest en `/api/upload`) llaman directamente a `rag.js` (`require('./rag')`), no a `callRag`. En la práctica **`rag_service.py` es código legado/paralelo que no se ejecuta como parte del flujo actual** — ver [`colaboraciones/023-rag-integration.md`](colaboraciones/023-rag-integration.md) para el diseño original con el que se construyó, y la nota en [Estado del prototipo](#estado-del-prototipo--notas-importantes).

### Frontend — SPA sin build

`app.js` es un único archivo React (sin módulos ES, sin JSX precompilado) cargado como `<script type="text/babel" src="./app.js">`. Babel lo transforma en el navegador antes de ejecutarlo. No hay `react-router`: la navegación es un estado `page` en el componente raíz `App()` que renderiza condicionalmente una de las páginas (`documents | visualize | graphs | chat | policies | settings`).

Estado global relevante en `App()`: `selected` (IDs de docs en contexto activo), `page`, `llm`, `docStats` (conteo de queries por doc, en memoria), `savedGraphs`, `companies`/`activeCo`, `conversations`/`activeConvId` (historial de chat persistido), `appRealDocs`/`appDepts`/`appGroups`/`appAssign` (árbol real cargado desde la API). Detalle completo del flujo de props en [`documentacion/arquitectura.md`](documentacion/arquitectura.md#flujo-de-datos).

## Modelo de datos (SQLite)

Todo vive en `knowlayer.db`, creada y migrada automáticamente al arrancar `server.js` (`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` envueltos en `try/catch` para ser idempotentes).

| Tabla | Creada en | Propósito |
|-------|-----------|-----------|
| `files` | `server.js` | Metadatos de cada documento subido: nombre, ruta en disco, tipo, tamaño, `dept_id`/`group_id`, `vectorized` (0=pendiente, 1=listo, 2=error), `chunks` |
| `companies` | `server.js` | Empresas (tenants) por cliente; `slug` generado del nombre |
| `departments` | `server.js` | Departamentos dentro de una empresa |
| `groups` | `server.js` | Grupos (carpetas) dentro de un departamento |
| `conversations` | `server.js` | Sesiones de chat por empresa, con título auto-generado del primer mensaje |
| `chat_messages` | `server.js` | Mensajes de cada conversación (`role`, `content`, `sources` como JSON) |
| `chunks` | `rag.js` (`initChunksTable`) | Fragmentos de texto + embedding (JSON) por documento, usados para la búsqueda RAG |

## Referencia de API

Base: `http://localhost:3001/api`. Todas las respuestas son JSON; CORS abierto (`*`).

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/upload` | Sube un archivo (multipart), lo guarda en disco + SQLite, dispara vectorización async |
| `GET` | `/files?client_id=&company_id=` | Lista archivos de una empresa |
| `PATCH` | `/files/:id/move` | Reasigna `dept_id`/`group_id` de un archivo |
| `DELETE` | `/files/:id` | Elimina archivo (disco + SQLite) y sus vectores (`chunks`) |
| `GET` | `/files/:id/view` | Sirve el archivo binario inline (usado por el visor de PDF) |
| `GET` | `/companies?client_id=` | Lista empresas de un cliente |
| `POST` | `/companies` | Crea una empresa (genera `slug`) |
| `GET` | `/departments?company_id=` | Lista departamentos de una empresa |
| `POST` | `/departments` | Crea un departamento |
| `GET` | `/groups?company_id=` | Lista grupos de una empresa |
| `POST` | `/groups` | Crea un grupo dentro de un departamento |
| `GET` | `/storage?company_id=` | Uso de almacenamiento agregado por tipo de archivo (para `SettingsPage`) |
| `GET` | `/conversations?company_id=` | Lista conversaciones de chat de una empresa |
| `POST` | `/conversations` | Crea una conversación |
| `PATCH` | `/conversations/:id` | Renombra / actualiza `updated_at` de una conversación |
| `DELETE` | `/conversations/:id` | Elimina una conversación y sus mensajes |
| `GET` | `/conversations/:id/messages` | Lista mensajes de una conversación |
| `POST` | `/conversations/:id/messages` | Guarda un mensaje (user o AI) con sus `sources` |
| `POST` | `/chat/query` | Consulta RAG: `{ company_id, file_ids, question }` → `{ answer, sources }` |
| `GET` | `/rag/status` | Health check del motor RAG (`{ ok, model, totalChunks, totalFiles }`) |
| `GET` | `/ping` | Health check general: versión, tablas SQLite, ruta de la DB |

## Funcionalidades principales

Resumen por sección; el detalle de comportamiento e interacciones está en [`documentacion/funcionalidades.md`](documentacion/funcionalidades.md).

| Sección | Qué hace |
|---------|----------|
| **Chat** | Página de inicio. Chat con RAG real: selecciona documentos como contexto, pregunta, y el motor RAG busca los chunks más relevantes y genera la respuesta con Ollama. Conversaciones persistidas en SQLite (historial en el sidebar). |
| **Documents** | Árbol de 4 niveles (Empresa → Departamento → Grupo → Documento), drag & drop, subida con previsualización (`UploadPreviewModal`) y animación de vectorización (`VectorizingModal`), menú contextual, eliminación con 3 niveles de confirmación según uso/relaciones, vistas grid/lista. |
| **Visualizar** | Panel de documentos en contexto + visor: PDFs reales se muestran inline vía blob URL (`InlinePdfViewer`), otros tipos muestran metadatos/preview (`DocPreview`, `SpreadsheetView`). |
| **Graphs** | Grafo 2D con D3 force-simulation; se construye solo con ≥3 documentos seleccionados. Nodos = documentos, aristas = co-ocurrencia en conversaciones. Grafos guardables/cargables. |
| **Policies** | Vista conceptual de control de acceso por rol/documento (full module / document only / temporal 24h). Actualmente sin persistencia backend — UI de demostración del modelo de seguridad. |
| **Configuración** | Plan activo, barra de uso de almacenamiento (límite 1 GB, `GET /api/storage`), desglose por tipo de archivo. |

## Multi-tenant y almacenamiento en disco

El frontend usa un `CLIENT_ID` fijo (`'CLI001'`, constante en `app.js`) — el modelo soporta múltiples clientes a nivel de datos pero la UI actual solo opera sobre uno. Dentro de un cliente puede haber varias **empresas** (`companies`), cada una con su propio árbol de departamentos/grupos y su propio directorio de archivos:

```
clientes/{client_id}/empresas/{company_slug}/files/{uuid}.{ext}
```

El `slug` de la empresa se genera al crearla (normalización de acentos + minúsculas + guiones). El servidor crea los directorios intermedios automáticamente en cada subida.

## Seguridad — modelo de acceso

Principio de diseño (implementado hoy solo como concepto en la página **Policies**, no forzado aún a nivel de API): el control de acceso se aplica en la **capa de datos**, no instruyendo al LLM. Un usuario con un rol determinado solo debería poder disparar búsquedas RAG sobre los documentos permitidos por su política activa — el LLM nunca recibe en su contexto vectores de documentos fuera de esa política. Ver el diagrama completo en [`documentacion/arquitectura.md`](documentacion/arquitectura.md#seguridad--modelo-basado-en-datos).

> **Nota:** en el estado actual del código, `/api/chat/query` no filtra por rol/política — cualquier `file_ids` de la empresa es consultable. El modelo de políticas es hoy un mockup de producto (`PoliciesPage`), no una restricción aplicada.

## Estado del prototipo — notas importantes

Cosas que vale la pena tener presentes antes de asumir que algo documentado en `documentacion/` sigue vigente al pie de la letra:

- **Sin datos mock sembrados:** las constantes `CHAT_HISTORY`, `CHAT_SESSIONS` y `POLICIES` en `app.js` están vacías (`[]`); no hay `MOCK_DOCS`. La app corre hoy 100% sobre datos reales de la API (`allRealDocs`, `conversations`, etc.). `documentacion/datos-mock.md` describe un set de datos de ejemplo histórico que ya no se inyecta en runtime.
- **Dos implementaciones de RAG conviven en el repo:** `rag.js` (Node.js + SQLite, activa) y `rag_service.py` (Python + ChromaDB, no conectada al flujo actual). Si vas a tocar el pipeline de RAG, el punto de entrada real es `rag.js`.
- **Sin autenticación real:** `LoginPage` es una animación de entrada sin validación de credenciales.
- **Sin control de acceso aplicado:** ver nota en la sección de seguridad arriba.
- **`docStats` (pesos de uso) vive en memoria del navegador** — no persiste entre recargas de página, a diferencia de conversaciones y archivos que sí están en SQLite.
- **`server.js` no usa ningún framework** (no Express) — todas las rutas son comparaciones manuales de `method`/`pathname` dentro de un único `http.createServer`.

## Documentación adicional

| Archivo | Contenido |
|---------|-----------|
| [`documentacion/arquitectura.md`](documentacion/arquitectura.md) | Design tokens, estructura de componentes, flujo de datos entre props, esquema de la vista Graphs |
| [`documentacion/funcionalidades.md`](documentacion/funcionalidades.md) | Comportamiento detallado de cada página y modal, campo por campo |
| [`documentacion/datos-mock.md`](documentacion/datos-mock.md) | Set de datos de ejemplo histórico (ver nota de estado arriba — ya no se siembra en runtime) |
| [`colaboraciones/`](colaboraciones/) | Bitácora cronológica: una entrada `NNN-descripcion.md` por feature/sesión de trabajo, desde el setup inicial hasta la integración de RAG |
