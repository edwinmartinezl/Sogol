# 002 — Layout Base

**Fecha:** 2026-06-10  
**Estado:** Completado

---

## Qué se construyó

Layout completo de tres zonas en `app.js` (~270 líneas), sin archivos externos adicionales. React montado con `htm` (tagged template literals) para evitar compilación JSX.

---

## Dependencias agregadas

| Paquete | Versión | Uso |
|---------|---------|-----|
| `htm`   | 3.x     | JSX-sin-build via tagged templates |

`index.html` actualizado: `htm` agregado al importmap, body simplificado a `margin:0`.

---

## Arquitectura del archivo

```
app.js
├── Helpers           — formatSize, isThisMonth
├── Design tokens     — objeto C (bg, surface, border, text, muted, accent, font)
├── TYPE_COLOR/ICON   — mapas de tipo de documento a color e ícono
├── TypeBadge         — badge coloreado por tipo
├── SectionLabel      — encabezado de sección en sidebar
├── DocItem           — ítem clickeable del sidebar
├── Sidebar           — sidebar completo (logo, search, nav, lista, upload)
├── Topbar            — pills de selección + selector LLM
├── TH                — celda de encabezado de tabla (sticky)
├── DocumentsPage     — tabla de 7 documentos con checkbox de selección
├── PlaceholderPage   — página vacía para rutas no implementadas
└── App               — root con BrowserRouter + estado global `selected`
```

---

## Estado global

```js
const [selected, setSelected] = useState([]);  // array de doc ids
const toggle = (id) => setSelected(prev =>
  prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
);
```

- Click en ítem del sidebar → toggle
- Click en fila de tabla → toggle (mismo array)
- Topbar pills → muestra docs seleccionados, X remueve

---

## Zonas del layout

### Sidebar (210px fijo)
- Logo KnowLayer con ícono `ti-layers-intersect` azul
- Buscador filtrado en tiempo real (filtra nombre)
- Nav 4 items con `NavLink` activo: Documents `/`, Graphs `/graphs`, Query `/query`, Policies `/policies`
- Lista de documentos agrupados: **This month** / **Older** (basado en mes actual)
- Botón Upload al fondo

### Topbar (48px)
- Pills azules para cada doc seleccionado (con X para deseleccionar)
- Placeholder text cuando no hay selección
- `<select>` con 4 LLMs: Claude 3.5, GPT-4o, Gemini, Llama

### Área principal — ruta `/`
- Título "Documents"
- Tabla con bordes redondeados, 10 columnas: checkbox, Name, Type, Area, Date, Size, Weight, Links, Graphs, Queries
- Headers sticky con `position: sticky; top: 0`
- Filas alternadas, fila seleccionada con fondo azul tenue
- TypeBadge coloreado por tipo (verde xlsx, rojo pdf, azul csv)
- Weight coloreado: ≥90% verde, ≥70% normal, <70% muted

---

## Design tokens aplicados

```
bg:      #ffffff   — fondo principal
surface: #f5f5f7   — sidebar, headers de tabla
border:  0.5px solid #e0e0e5
text:    #1d1d1f
muted:   #86868b
accent:  #0071e3
font:    -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif
```

---

## Qué sigue (Etapa 3)

- Panel de detalle al hacer click en una fila (drawer o split view)
- Lógica de cross-reference cuando hay 2+ documentos seleccionados
- Vista `/query` con input de consulta libre sobre los documentos seleccionados
