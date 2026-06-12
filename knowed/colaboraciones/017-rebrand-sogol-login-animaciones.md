# 017 — Rebrand Sogol, login con partículas y animaciones

**Fecha:** 2026-06-12  
**Estado:** Completado

---

## Resumen

Esta etapa realizó tres grupos de cambios visuales sobre la sesión anterior:

1. **Rebrand completo** KnowLayer → Sogol (nombre, ícono, color de acento)
2. **LoginPage** con animación de partículas que forman el texto "Sogol" y transición al card de login
3. **Red de partículas de fondo** animada infinitamente en el login (efecto universo de datos)
4. **Animación orbital infinita** en GraphsPage con D3 force sim manual

---

## 1. Rebrand KnowLayer → Sogol

### Cambios de identidad

| Elemento | Antes | Después |
|----------|-------|---------|
| Título HTML | `KnowLayer` | `Sogol` |
| Sidebar logo | Texto "KnowLayer" | Círculo azul + ícono `ti-world` + "Sogol" |
| Color acento (`C.accent`) | `#e8561c` (naranja) | `#2563eb` (azul) |
| Banner servidor | `KnowLayer API v2` | `Sogol API v2` |

```js
const C = {
  accent: '#2563eb',  // antes '#e8561c'
  // resto igual
};
```

Sidebar:
```jsx
<div style={{ borderRadius:'50%', background:C.accent, ... }}>
  <i className="ti ti-world" style={{ color:'#fff' }} />
</div>
<span>Sogol</span>
```

---

## 2. LoginPage — animación de partículas de texto

### Flujo de fases

```
'forming' → partículas viajan hacia el texto "Sogol"
'ready'   → canvas se desvanece, aparece texto sólido + card
'exit'    → toda la pantalla sale por arriba (translateY -100vh)
```

### Técnica: canvas off-screen

1. Se renderiza "Sogol" en un canvas off-screen (`fontSize: 52px`)
2. Se muestrean píxeles con alpha > 128 como targets
3. Cada partícula parte de posición aleatoria y usa easing hacia su target:

```js
p.vx = (p.vx + (p.tx - p.x) * p.ease) * 0.86;
// ease: 0.018–0.032 | damping: 0.86
```

4. Cuando todas las partículas están a < 2px de su target → `setPhase('ready')` tras 350ms

### Transición partículas → texto sólido

El canvas (partículas) y el `<div>` "Sogol" son elementos independientes:
- Canvas: `opacity 1 → 0` en 0.55s cuando phase = 'ready'
- Div "Sogol": `opacity 0 → 1` con delay 0.22s, `top: 20%`
- Login card: slide-in desde +24px, `top: 50% / translate(-50%,-50%)`

---

## 3. Red de partículas de fondo (017)

Canvas separado (`bgCanvasRef`) con loop rAF independiente. Corre de forma permanente sin interferir con la animación de texto.

### Parámetros

| Parámetro | Valor |
|-----------|-------|
| Cantidad | `max(55, W*H/13000)` (~80 en 1080p) |
| Velocidad | ±0.48 px/frame |
| Conexión máxima | 155 px |
| Opacidad partículas | 0.16–0.38 |
| Opacidad líneas | 0–0.11 (fade por distancia) |

### Paleta muted

```js
const PALETTE = [
  [37,  99,  235],  // blue-600
  [99,  102, 241],  // indigo-500
  [100, 116, 139],  // slate-500
  [59,  130, 246],  // blue-400
  [71,  85,  105],  // slate-600
  [148, 163, 184],  // slate-400
];
```

### Loop

```js
// Mover + rebotar en bordes
p.x += p.vx;
if (p.x < 0 || p.x > W) p.vx *= -1;

// Líneas entre partículas cercanas
if (dist < 155) {
  const a = (1 - dist / 155) * 0.11;
  ctx.strokeStyle = `rgba(37,99,235,${a})`;
  ctx.stroke();
}
```

### Orden de capas en el DOM

```
bgCanvas (red de partículas)   ← fondo, siempre visible
canvas   (partículas "Sogol")  ← encima, se desvanece al 'ready'
div      ("Sogol" texto sólido)
div      (login card)
```

---

## 4. Animación orbital en GraphsPage

### Arquitectura: rAF + D3 manual

D3 force sim se crea con `.stop()` para que no tenga su propio loop. Un único `requestAnimationFrame` controla todo:

```js
const loop = (ts) => {
  if (!isOrbiting) {
    sim.tick();                         // avanza simulación manualmente
    if (sim.alpha() < sim.alphaMin()) { // converge → cambia a modo órbita
      isOrbiting = true;
      nodes.forEach(d => { d.rx = d.x; d.ry = d.y; /* guardar posición base */ });
    }
  } else {
    const θ = currentT * 0.16;         // ~40s por vuelta completa
    nodes.forEach(d => {
      const rotX = cos(θ)*dx - sin(θ)*dy;  // rotación global
      d.x = cx + rotX + cos(t*drift)*r;    // + deriva individual
      d.y = cy + rotY + sin(t*drift)*r;
    });
  }
  animFrameRef.current = requestAnimationFrame(loop);
};
requestAnimationFrame(loop);           // arranca inmediato al entrar a la página
```

### Drag durante órbita

Al soltar un nodo arrastrado se reverse-rota su posición para calcular el nuevo `rx/ry` (posición base de órbita):

```js
d.rx = cx + cos(-θ)*dx - sin(-θ)*dy;
d.ry = cy + sin(-θ)*dx + cos(-θ)*dy;
```

---

## 5. DocPreview unificado

Panel derecho de VisualizePage usa un solo componente `DocPreview` para todos los tipos:

| Tipo | Renderer |
|------|----------|
| `pdf` real | `InlinePdfViewer` (blob URL + iframe) |
| `xlsx`, `xls`, `csv` | `SpreadsheetView` |
| resto (`doc`, `txt`, …) | `PdfView` (texto plano / placeholder) |

---

## Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `app.js` | LoginPage completo, GraphsPage orbital, DocPreview unificado, rebrand tokens |
| `index.html` | `<title>Sogol</title>` |
| `server.js` | Banner "Sogol API v2" |
| `documentacion/funcionalidades.md` | Secciones login, graphs, visualize |
| `documentacion/arquitectura.md` | Canvas layers, rAF architecture |
