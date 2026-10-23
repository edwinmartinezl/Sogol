# 003 — Chat Panel

**Fecha:** 2026-06-10  
**Estado:** Completado

---

## Qué se construyó

Panel de chat contextual que aparece a la derecha (40%) cuando hay ≥1 documento seleccionado. La tabla de documentos se comprime al 60% izquierdo. Sin docs seleccionados, la tabla ocupa el 100%.

---

## Cambios en archivos

### `data/mock.js`
Agregado `CHAT_HISTORY` — 4 mensajes pre-seeded (2 user + 2 AI) sobre correlación gastos IT vs ventas.

### `app.js`
- `useRef`, `useEffect` agregados al destructuring de React
- `CHAT_HISTORY` y `LLM_LABELS` definidos como constantes en el módulo
- Estado `llm` movido de `Topbar` a `App` (prop drilling: `llm` + `onLlmChange` a Topbar)
- Nuevos componentes: `MessageBubble`, `ChatPanel`
- `App`: lógica `showChat = page === 'documents' && selected.length > 0` controla el split

---

## Estructura del ChatPanel

```
ChatPanel
├── Header      — "[N] docs in context"  ·  badge LLM activo
├── Messages    — lista scrollable de MessageBubble
│   └── ref al último mensaje → auto-scroll en cada envío
└── Input area
    ├── Textarea (Enter = send, Shift+Enter = newline)
    ├── Botón enviar (flecha, activo solo si hay texto)
    └── Footer — "N docs in context · vectors stored on your server" + ícono candado
```

## Estructura de MessageBubble

| Campo del mensaje | Renderiza |
|-------------------|-----------|
| `role: 'user'`    | Burbuja azul (`#0071e3`), alineada a la derecha |
| `role: 'ai'`      | Burbuja gris (`#f5f5f7`), alineada a la izquierda |
| `msg.insight`     | Card blanca con borde dentro de la burbuja AI, label "EMERGENT INSIGHT" en azul |
| `msg.sources`     | Pills con nombre del documento debajo de la burbuja AI |

---

## Lógica de envío

```js
send() {
  // 1. Push mensaje del usuario
  { role: 'user', text: input }
  
  // 2. Push respuesta AI simulada
  {
    role: 'ai',
    text: `Analizando N documentos en contexto… he encontrado patrones relevantes.`,
    sources: [...selected],   // ids de docs en contexto al momento del envío
  }
}
```

---

## Layout split

```
[Sidebar 210px] │ [Topbar]
                  ├─────────────────────────────────────┤
                  │ DocumentsPage (60%) │ ChatPanel (40%) │  ← cuando selected ≥ 1
                  │ DocumentsPage (100%)                 │  ← cuando selected = 0
```

Controlado por `showChat` boolean en App; no hay animación CSS — transición inmediata.

---

## Qué sigue (Etapa 4)

- Vista `/graphs` con visualización de relaciones entre documentos (nodos + aristas)
- O bien: mejoras al chat (streaming simulado, timestamps, avatar del modelo)
- Panel de detalle al hacer click en una fila de la tabla
