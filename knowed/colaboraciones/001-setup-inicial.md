# 001 — Setup Inicial

**Fecha:** 2026-06-10  
**Estado:** Completado

---

## Qué se creó

Estructura base del proyecto `knowed/` con los siguientes archivos:

```
knowed/
├── index.html               ← Shell HTML con todas las dependencias CDN
├── app.js                   ← Entry point del módulo JS (stub)
├── data/
│   └── mock.js              ← 7 documentos de prueba exportados como ES module
└── colaboraciones/
    └── 001-setup-inicial.md ← Este archivo
```

### `index.html`
- Tailwind CSS vía CDN (`cdn.tailwindcss.com`)
- Tabler Icons vía CDN (`@tabler/icons-webfont`)
- Import map con React 18 y react-router-dom 6 desde `esm.sh`
- `<div id="root">` como mount point
- `<script type="module" src="./app.js">`

### `data/mock.js`
7 documentos con campos:

| Campo     | Tipo    | Descripción                          |
|-----------|---------|--------------------------------------|
| `id`      | string  | Identificador único (`doc-001`…)     |
| `name`    | string  | Nombre del documento                 |
| `type`    | string  | `xlsx` / `pdf` / `csv`               |
| `size`    | number  | Tamaño en bytes                      |
| `weight`  | number  | Peso/relevancia 0–1                  |
| `links`   | number  | Vínculos a otros documentos          |
| `graphs`  | number  | Gráficos embebidos                   |
| `queries` | number  | Consultas realizadas sobre él        |
| `area`    | string  | Área de negocio                      |
| `date`    | string  | Fecha ISO `YYYY-MM-DD`               |

---

## Cómo servir

```bash
cd knowed
python3 -m http.server 3000
# Abre http://localhost:3000
```

---

## Qué sigue (Etapa 2)

- Montar React + react-router-dom en `app.js`
- Crear layout base con sidebar y área de contenido
- Ruta `/` → vista de lista de documentos usando `data/mock.js`
