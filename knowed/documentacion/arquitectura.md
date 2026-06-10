# Arquitectura — KnowLayer

## Stack técnico

| Capa | Tecnología |
|------|------------|
| UI | React 18 (UMD via unpkg) |
| JSX | Babel Standalone (`@babel/standalone`) |
| Estilos | Tailwind CSS CDN + CSS-in-JS inline |
| Iconos | Tabler Icons Webfont CDN |
| Servidor dev | `npx serve` (Node.js) |
| Build | Ninguno — carga directa en browser |

## Sin paso de compilación

El proyecto corre como SPA sin bundler. El browser descarga:

1. `react.development.js` y `react-dom.development.js` (UMD globals `window.React`, `window.ReactDOM`)
2. `babel.min.js` — transforma JSX en runtime
3. `app.js` cargado como `<script type="text/babel" data-presets="react">`

Babel intercepta el script y lo compila antes de ejecutarlo.

## Estructura de archivos

```
knowed/
├── index.html          — shell HTML con CDN scripts
├── app.js              — toda la aplicación React (single file)
├── data/
│   └── mock.js         — ES module (fuente de verdad para backend futuro)
├── documentacion/
│   ├── arquitectura.md
│   ├── funcionalidades.md
│   └── datos-mock.md
└── colaboraciones/
    ├── 001-setup-inicial.md
    ├── 002-layout-base.md
    ├── 003-chat-panel.md
    ├── 004-query-page.md
    └── 005-graphs-y-documentacion.md
```

## Flujo de datos

```
App (estado global)
├── selected: string[]      — IDs de documentos activos
├── page: string            — ruta actual (documents | graphs | chat | policies)
├── llm: string             — modelo LLM seleccionado
└── queryStats: Record      — { [docId]: { count, lastAt } }

App → Sidebar   (selected, onToggle, page, onNav)
App → Topbar    (selected, onRemove, onClearAll, llm, onLlmChange)
App → *Page     (selected, onToggle / onRemove)
```

## Navegación

Estado `page` en `App`. Sin react-router-dom ni URLs. Cada valor de `page` renderiza un componente dentro del área principal:

```
page === 'documents' → <DocumentsPage />
page === 'graphs'    → <GraphsPage />
page === 'chat'      → <ChatPage />
page === 'policies'  → <PlaceholderPage />
```

## Vista Graphs — renderer 3D

- Canvas HTML5 puro, sin librerías WebGL
- Layout: distribución Fibonacci Sphere de 7 nodos en radio 160px
- Transformación: matrices `rotX`, `rotY` + proyección perspectiva (focal length 480)
- Renderizado: `requestAnimationFrame` loop continuo a 60fps
- Auto-rotación eje Y cuando no hay drag activo
- DPR awareness: `canvas.width = rect.width * devicePixelRatio`
- Aristas: co-ocurrencia de documentos en `sources` de mensajes AI
- Interacción: mousedown → drag rota globo / click (sin drag) → toggle selección
