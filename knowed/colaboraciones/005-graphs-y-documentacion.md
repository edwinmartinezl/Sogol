# 005 — Graphs 3D y Documentación

**Fecha:** 2026-06-10  
**Estado:** Completado

---

## Qué se construyó

### Vista `/graphs` — grafo 3D en canvas

Reemplaza el `<PlaceholderPage title="Graphs" />` con un componente `GraphsPage` que renderiza un grafo 3D interactivo usando exclusivamente HTML5 Canvas + `requestAnimationFrame`. Sin librerías WebGL externas.

#### Matemática 3D

```
Fibonacci Sphere (7 nodos, radio 160px)
  ↓
rotY(p, ry)  — rotación eje Y (mouse dx)
rotX(p, rx)  — rotación eje X (mouse dy, clamp ±1.4 rad)
  ↓
Perspective projection (focal length 480, z offset +220)
  s = fl / (fl + p.z + 220)
  screen = { x: cx + p.x·s, y: cy + p.y·s, s }
```

#### Constantes de color (Graphs)

```js
const GRAPH_COLOR = { xlsx:'#34a853', pdf:'#ea4335', csv:'#4285f4' }
```

Separadas de `TYPE_COLOR` (usado en la tabla de documentos) para independencia visual entre vistas.

#### Aristas

Derivadas de `CHAT_HISTORY.sources` por co-ocurrencia:

```js
GRAPH_EDGES = [{ from:'doc-001', to:'doc-002', weight:2 }]
```

Un edge entre Ventas Q1 2026 e Informe Financiero Anual (aparecen juntos en 2 mensajes AI).

#### Interacción

| Gesto | Efecto |
|-------|--------|
| Drag | Rota la esfera 3D (dx→Y, dy→X) |
| Click (sin drag) | Toggle selección del nodo apuntado |
| Hover | Tooltip con nombre, weight%, area, links, queries |
| Sin drag | Auto-rotación eje Y (+0.004 rad/frame) |

#### Header de la página

```
7 nodes · 1 edge                [Graph ready]    Drag to rotate · click to select
                                 ↑ aparece cuando selected.length ≥ 3
```

#### Gestión de DPR (Retina)

```js
const resize = () => {
  const d = devicePixelRatio, r = canvas.getBoundingClientRect();
  canvas.width  = r.width  * d;
  canvas.height = r.height * d;
};
```

`ResizeObserver` en el elemento padre, sin `window.addEventListener('resize')`.

#### Patrón de refs (evitar closures stale)

```js
const selRef    = useRef(selected);
const toggleRef = useRef(onToggle);
useEffect(() => { selRef.current    = selected; }, [selected]);
useEffect(() => { toggleRef.current = onToggle; }, [onToggle]);
// render loop (useEffect con []) lee selRef.current — siempre fresco
```

---

### Carpeta `documentacion/`

| Archivo | Contenido |
|---------|-----------|
| `arquitectura.md` | Stack técnico, estructura de archivos, flujo de datos, detalle del renderer 3D |
| `funcionalidades.md` | Spec completa de cada vista y componente |
| `datos-mock.md` | Diccionario de datos, CHAT_HISTORY, GRAPH_EDGES, lógica de secciones temporales |

---

## Archivos modificados / creados

| Acción | Archivo |
|--------|---------|
| Modificado | `app.js` — completo rewrite con GraphsPage + GRAPH_COLOR + 3D helpers |
| Creado | `documentacion/arquitectura.md` |
| Creado | `documentacion/funcionalidades.md` |
| Creado | `documentacion/datos-mock.md` |
| Creado | `colaboraciones/005-graphs-y-documentacion.md` |

---

## Qué sigue (Etapa 6 — ideas)

- Vista `/policies` — reglas de acceso por documento o área
- Detalle de nodo al click (panel lateral con metadata completa)
- Aristas dinámicas: actualizar `GRAPH_EDGES` con los `queryStats` acumulados en sesión
- Labels de aristas con el peso de co-ocurrencia
- Zoom in/out con wheel en el canvas
