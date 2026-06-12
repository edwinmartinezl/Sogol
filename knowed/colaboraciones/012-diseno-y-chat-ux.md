# 012 — Paleta de colores y rediseño del Chat

**Fecha:** 2026-06-11  
**Estado:** Completado

---

## Qué se construyó

Dos ejes de cambio:

1. **Sistema de diseño** — paleta cálida inspirada en Meris LVX, bordes más oscuros
2. **Chat UX** — modelo dentro del input, subida de archivos, estado vacío limpio, chat sessions con highlight naranja, autofocus al cargar

---

## 1. Paleta cálida — Meris LVX

### Tokens anteriores (azul Apple)

| Token | Valor anterior |
|-------|---------------|
| `bg` | `#ffffff` |
| `surface` | `#f5f5f7` |
| `border` | `0.5px solid #e5e5ea` |
| `accent` | `#0071e3` |

### Tokens nuevos (off-white cálido + naranja LED)

```js
const C = {
  bg:      '#f4f3f1',   // warm off-white
  surface: '#eae8e5',   // sidebar, headers
  border:  '0.5px solid #c4c0b8',  // más oscuro que antes
  text:    '#28261f',   // carbón cálido
  muted:   '#8a8780',   // secundario
  accent:  '#e8561c',   // naranja LED (Meris LVX)
  font:    "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
};
```

El acento naranja sustituye al azul Apple en: botones primarios, pills de selección, estados activos en nav, barras de progreso, badges y highlights de sesión de chat.

### Bordes oscurecidos

`C.border` cambió de `#e5e5ea` a `#c4c0b8`. El cambio aplica a todos los dividers, cards y inputs de la UI al ser una constante centralizada.

---

## 2. Chat UX — input rediseñado

### Estructura del input box

El textarea ya no ocupa toda la zona inferior. Ahora hay un contenedor rounded que agrupa:

```
┌─────────────────────────────────────────────────┐
│  [pills de archivos adjuntos si hay]            │
│  textarea (rows=1, sin borde propio)            │
│─────────────────────────────────────────────────│
│  [+]          [modelo ▾]  [🎤]  [⬆]            │
└─────────────────────────────────────────────────┘
```

- **`+` (izquierda)**: abre `fileRef` (hidden `<input type="file">`)
- **Selector de modelo (centro-derecha)**: Claude 3.5 / GPT-4o / Gemini / Llama
- **Micrófono**: botón icono (UI placeholder)
- **Enviar (⬆)**: naranja cuando hay texto, gris cuando vacío

El selector de modelo **desaparece del Topbar** cuando `page === 'chat'`:

```jsx
{page !== 'chat' && (
  <select value={llm} onChange={...}>…</select>
)}
```

### Subida de archivos

```js
const fileRef = useRef(null);
const [attachments, setAttachments] = useState([]);
```

`<input type="file" ref={fileRef} multiple accept=".pdf,.xlsx,.csv,.docx,.txt" style={{ display:'none' }} onChange={...} />`

Al seleccionar, los archivos se convierten en pills `{ name, size }` que aparecen dentro del input box (encima del textarea). Cada pill tiene botón `×` para eliminar.

### Textarea compacto

`rows={1}` + `padding:'12px 16px 4px'` — crece con el contenido si el texto es largo (resize: none, el browser no muestra scroll hasta overflow).

---

## 3. Estado vacío del chat

`messages` inicia en `[]` (sin mensajes pre-seeded). Cuando está vacío se muestra:

```
    ┌──────────────────────┐
    │  [icono mensaje]     │
    │  Ask anything        │
    │  Select documents…   │
    └──────────────────────┘
```

El texto contextual varía:
- Sin docs en contexto: "Select documents from the sidebar to add context, then ask your question."
- Con docs: "N document(s) in context. Ask a question about them."

---

## 4. Chat sessions — highlight naranja

### Estado

```js
const [activeSession, setActiveSession] = useState(null);
```

En `Sidebar`, se pasa `isActive={activeSession === session.id}` y `onActivate={() => setActiveSession(session.id)}` a cada `ChatSessionItem`.

### Estilos activos

```js
border:     isActive ? '1px solid '+C.accent+'55' : '0.5px solid transparent',
background: isActive ? C.accent+'0a' : 'transparent',
```

- Borde: `#e8561c` al 33% opacidad (suave, no saturado)
- Fondo: `#e8561c` al ~4% opacidad (apenas perceptible)
- Icono y texto del preview: `color: C.accent` cuando activo

### Comportamiento

`handleClick` en `ChatSessionItem`:

```js
const handleClick = () => {
  onActivate();
  session.docs.forEach(id => { if (!selected.includes(id)) onToggle(id); });
};
```

Click en el ítem → activa sesión (highlight) + añade todos sus docs al contexto global.  
Click en una pill dentro del ítem → `e.stopPropagation()` para no activar la sesión, solo toggle individual del doc.

---

## 5. Búsqueda de chats — posición y scope

### Posición

El input de búsqueda se movió **debajo de la etiqueta "Older"** (antes estaba sobre la lista "This month").

### Scope

Antes filtraba `documents` por nombre. Ahora filtra `CHAT_SESSIONS` por `preview`:

```js
const filteredSessions = CHAT_SESSIONS.filter(s =>
  s.preview.toLowerCase().includes(search.toLowerCase())
);
```

Placeholder cambiado a `"Search chats…"`.

---

## 6. Autofocus en el textarea del chat

```js
const inputRef = useRef(null);
useEffect(() => { inputRef.current?.focus(); }, []);
```

`ref={inputRef}` en el `<textarea>`. Al navegar a `/chat`, el cursor aparece directo en el textarea sin click previo.

---

## 7. Upload removido del sidebar

El botón "Upload" del footer del sidebar fue eliminado. La subida de archivos ahora vive exclusivamente dentro del input box del chat (botón `+`).

---

## Archivos modificados

| Acción | Archivo |
|--------|---------|
| Modificado | `app.js` — tokens C, ChatPage (input box, modelo dentro, fileRef, attachments, empty state, autofocus), Sidebar (búsqueda de chats, sin Upload), ChatSessionItem (isActive highlight), Topbar (oculta modelo en chat) |
| Modificado | `documentacion/funcionalidades.md` |
| Modificado | `documentacion/arquitectura.md` |
| Creado | `colaboraciones/012-diseno-y-chat-ux.md` |
