# 019 — Sistema de peso absoluto por consultas

**Fecha:** 2026-06-12  
**Estado:** Completado

---

## Resumen

El sistema de "peso" de los documentos fue rediseñado para trabajar con **contadores absolutos** en lugar de fracciones fijas. El peso de un documento es simplemente cuántas veces ha sido utilizado en una consulta real desde el chat.

---

## Lógica del peso

| Concepto | Valor |
|----------|-------|
| Peso de un doc | Número de consultas reales en que apareció |
| 100% de la barra | El doc con más consultas en la sesión |
| Barra de otros docs | Proporcional al máximo |
| Formato pantalla | `—` (0), `1`, `250`, `1.2k`, `10k` |

### Fórmula

```js
const docQ = doc => docStats?.[doc.id]?.queries || 0;
const maxQ = Math.max(1, ...allDocs.map(docQ));
const effW = doc => docQ(doc) / maxQ;          // 0-1 para barra
const fmtQ = n => n >= 1000
  ? (n/1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/,'') + 'k'
  : String(n || 0);
```

### Ejemplo

Si hay 4 docs con consultas `[1000, 250, 50, 0]`:
- Doc A → barra al 100% · muestra "1k"
- Doc B → barra al 25% · muestra "250"
- Doc C → barra al 5% · muestra "50"
- Doc D → barra vacía · muestra "—"

---

## Cambios en DocumentsPage

### Tabla (renderTable)
- Encabezados: `Weight` → `Uso` · `Queries` → `Consultas`
- Columna Uso: muestra `fmtQ(docQ(doc))` con número real
- Columna Consultas: ídem

### Cards (renderCard)
- Barra de progreso: `effW(doc) * 100 + '%'`, color `TYPE_COLOR[doc.type]`

### Modal de detalles (DocModal)
- Sección "Uso" muestra número grande (`18px bold`) + "consultas"
- Barra proporcional al máximo de la sesión
- Al abrir desde DocumentsPage se enriquece el doc:
  ```js
  const q = docStats?.[doc.id]?.queries || 0;
  setModalDoc({ ...doc, queries: q, weight: q / maxQ });
  ```

---

## Cambios en GraphsPage

Al hacer click en un nodo del grafo y abrir el DocModal:

```js
clickRef.current = d => {
  const base = allPool.find(doc => doc.id === d.id) || d;
  const q    = docStats?.[base.id]?.queries || 0;
  const maxQ = Math.max(1, ...selected.map(id => docStats?.[id]?.queries || 0));
  setModalDoc({ ...base, queries: q, weight: q / maxQ });
};
```

El máximo se calcula entre los docs **seleccionados actualmente** en el grafo, no entre todos los docs.

---

## Estado `docStats` (App)

```js
const [docStats, setDocStats] = useState({});
// { [docId]: { queries: number } }
```

`trackQuery(docIds)` — incrementa `queries` por 1 por cada doc en contexto cuando se envía una consulta desde el chat:

```js
const trackQuery = docIds => {
  setDocStats(prev => {
    const next = { ...prev };
    docIds.forEach(id => {
      next[id] = { queries: (prev[id]?.queries || 0) + 1 };
    });
    return next;
  });
};
```

> **Nota:** el peso es de sesión (en memoria). No persiste entre recargas.  
> Para persistencia futura: guardar en localStorage o en la tabla `files` del servidor.

---

## Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `app.js` | `docQ`, `maxQ`, `effW`, `fmtQ` en DocumentsPage · DocModal con contador real · GraphsPage enriquece doc al click |
