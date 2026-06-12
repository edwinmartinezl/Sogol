# 015 — Persistencia SQLite completa, modal de vectorización y visor PDF

**Fecha:** 2026-06-11  
**Estado:** Completado

---

## Resumen

Tres mejoras clave en esta etapa: persistencia completa en SQLite para empresas, departamentos y carpetas; modal animado de vectorización al subir archivos; y visor de PDF inline.

---

## 1. SQLite — nuevas tablas en `server.js`

| Tabla | Campos clave |
|-------|-------------|
| `companies` | id, client_id, name, slug, created_at |
| `departments` | id, company_id, name, icon, created_at |
| `groups` | id, company_id, dept_id, name, created_at |

### Nuevos endpoints

| Método | Ruta | Función |
|--------|------|---------|
| `GET` | `/api/companies?client_id=CLI001` | Lista empresas del cliente |
| `POST` | `/api/companies` | Crea empresa, genera slug automático |
| `GET` | `/api/departments?company_id=<slug>` | Lista departamentos |
| `POST` | `/api/departments` | Crea departamento |
| `GET` | `/api/groups?company_id=<slug>` | Lista grupos/carpetas |
| `POST` | `/api/groups` | Crea grupo |
| `GET` | `/api/files/:id/view` | Sirve archivo con `Content-Type` correcto para iframe |

### Slug de empresa

El server genera el slug a partir del nombre: normaliza acentos, convierte a minúsculas y reemplaza caracteres no alfanuméricos por `-`.

---

## 2. Integración frontend ↔ nuevas API

### App — carga inicial de empresas

`useEffect([], ...)` en `App` llama `apiGetCompanies()` al montar. Las empresas retornadas tienen `{ id, name, slug }`. El slug se usa en adelante para todos los endpoints de ese recurso.

### DocumentsPage — carga de depts y grupos desde API

`useEffect([activeCo])` ahora llama `apiGetDepts(slug)` y `apiGetGroups(slug)` en lugar de leer solo los datos mock. Los resultados se normalizan al formato del UI:

```
API dept:  { id, company_id, name, icon, created_at }
UI dept:   { id, name, icon }

API group: { id, company_id, dept_id, name, created_at }
UI group:  { id, name, deptId }
```

### Creación con persistencia

| Acción | Antes | Ahora |
|--------|-------|-------|
| Nueva empresa | Solo estado local | POST /api/companies → usa ID y slug del server |
| Nuevo departamento | Solo estado local | POST /api/departments → usa ID del server |
| Nueva carpeta | Solo estado local | POST /api/groups → usa ID del server |

En todos los casos hay fallback a creación local si el server no está disponible.

---

## 3. Modal de vectorización (`VectorizingModal`)

Componente modal `position: fixed`, centrado, `zIndex: 3000`. Backdrop oscuro `rgba(0,0,0,0.45)`.

### Estructura visual

```
┌──── Header naranja (C.accent 48px) ─────────────┐
│  ⬡ KnowLayer · Procesando archivo               │
├──────────────────────────────────────────────────┤
│  📄 nombre-del-archivo.pdf                       │
│                                                  │
│  Extrayendo texto...                    40%      │
│  ████████████████░░░░░░░░░░░░░ (barra animada)  │
│                                                  │
│  Por favor espera...                             │
└──────────────────────────────────────────────────┘
```

### Pasos de animación

| % | Texto | Duración |
|---|-------|---------|
| 0% | Subiendo documento... | 500ms |
| 20% | Extrayendo texto... | 800ms |
| 40% | Dividiendo en chunks... | 800ms |
| 60% | Generando embeddings... | 900ms |
| 80% | Guardando vectores... | 600ms |
| 100% | ¡Vectorización completa! | 400ms |

La barra usa `transition: width 0.4s ease` para animación suave.

### Pantalla de éxito

Cuando `animDone && resultReady`:
- Checkmark verde en círculo
- Grid 2×2: Nombre, Chunks, Vectores, Modelo
- Botón **"Ver documento"** (solo para PDFs reales) → abre `PdfViewerModal`
- Botón **Cerrar**

Chunks simulados: `clamp(5, Math.floor(fileSize / 1000), 80)`

### Pantalla de error

Si `error` está presente: icono de alerta roja + mensaje de error + botón Cerrar.

---

## 4. Visor de PDF inline (`PdfViewerModal`)

Modal fullscreen `position: fixed inset: 0`, `zIndex: 2500`.

Header oscuro (`#2a2a2a`) con:
- Nombre del archivo
- Botón Download (link `<a download>`)
- Botón cerrar × / Escape

Cuerpo: `<iframe src="/api/files/:id/view">` — sin bordes, `flex: 1`.

### Acceso al visor

1. Desde pantalla de éxito del VectorizingModal → botón "Ver documento" (solo PDFs)
2. Desde menú contextual en documentos → opción "Ver PDF" (solo docs `isReal && type === 'pdf'`)

La opción "Ver PDF" en el menú contextual solo aparece cuando el doc es real y PDF (`onlyRealPdf: true` en `CTX_ITEMS.doc`; `ContextMenu` filtra usando `menu.docIsRealPdf`).

---

## 5. Upload desde Chat con selector de destino (`UploadDestModal`)

Cuando el usuario presiona `+` en el input del Chat y existen empresas:

1. Se abre `UploadDestModal` con 3 selectores: Empresa / Departamento / Carpeta
2. Los departamentos y carpetas se cargan dinámicamente desde la API según la empresa elegida
3. Al confirmar → abre el file picker
4. Al seleccionar un archivo → `apiUpload(file, slug)` → `VectorizingModal`
5. Al completar → el doc se agrega automáticamente al contexto activo del chat (`onAddDoc`)

Si no hay empresas, el `+` abre el file picker directamente (flujo de adjunto simple anterior).

**Props nuevas en `ChatPage`:** `companies`, `activeCo`, `onAddDoc`

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `server.js` | Tablas companies/departments/groups; 7 nuevos endpoints |
| `app.js` | API helpers, VectorizingModal, PdfViewerModal, UploadDestModal, DocumentsPage carga desde API, ChatPage upload flow |
| `documentacion/funcionalidades.md` | Sección backend y upload actualizadas |
| `colaboraciones/015-vectorizing-modal-pdf-viewer.md` | Este archivo |
