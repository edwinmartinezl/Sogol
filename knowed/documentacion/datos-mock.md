# Datos Mock — KnowLayer

Fuente canónica: `data/mock.js`. Los mismos datos están duplicados inline en `app.js` (sin módulos en el setup buildless).

## Documentos

| id | name | type | size | weight | links | graphs | queries | area | date |
|----|------|------|------|--------|-------|--------|---------|------|------|
| doc-001 | Ventas Q1 2026 | xlsx | 200 KB | 0.85 | 3 | 5 | 12 | Comercial | 2026-03-31 |
| doc-002 | Informe Financiero Anual | pdf | 1 MB | 0.92 | 7 | 8 | 20 | Finanzas | 2026-01-15 |
| doc-003 | Base Clientes 2025 | csv | 500 KB | 0.78 | 1 | 0 | 34 | Marketing | 2025-12-01 |
| doc-004 | Inventario Almacén | xlsx | 300 KB | 0.65 | 2 | 3 | 18 | Operaciones | 2026-04-10 |
| doc-005 | Reporte de Auditoría | pdf | 2 MB | 0.97 | 14 | 6 | 9 | Legal | 2026-02-28 |
| doc-006 | Métricas de Soporte | csv | 150 KB | 0.55 | 0 | 0 | 41 | Soporte | 2026-05-20 |
| doc-007 | Plan Estratégico 2026 | pdf | 3 MB | 0.99 | 22 | 11 | 5 | Dirección | 2026-01-02 |

### Campos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | Identificador único `doc-NNN` |
| `name` | string | Nombre legible del documento |
| `type` | `xlsx` \| `pdf` \| `csv` | Tipo de archivo |
| `size` | number (bytes) | Tamaño en bytes; UI muestra KB / MB |
| `weight` | number 0–1 | Relevancia/peso del documento en el corpus |
| `links` | number | Número de referencias externas al documento |
| `graphs` | number | Veces que aparece en grafos de conocimiento |
| `queries` | number | Número histórico de consultas que lo involucraron |
| `area` | string | Área de negocio dueña del documento |
| `date` | ISO date string | Fecha de carga/última modificación |

## CHAT_HISTORY

4 mensajes pre-seeded que simulan una sesión previa sobre correlación IT vs ventas:

```
user  → "¿Hay relación entre los gastos de IT y las caídas en ventas del Q1?"
AI    → correlación feb +38% IT / -22% ventas
        insight: "El pico de gasto en IT precede en 5 días la caída de ventas"
        sources: [doc-001, doc-002]

user  → "¿Qué mes tuvo mejor ratio ventas vs costo IT?"
AI    → "Enero fue el más eficiente — $8.40 en ventas por cada $1 de IT"
        sources: [doc-001, doc-002]
```

### Co-ocurrencias derivadas (GRAPH_EDGES)

Del CHAT_HISTORY se extrae que `doc-001` y `doc-002` aparecen juntos en `sources` de **2 mensajes AI**, generando:

```js
GRAPH_EDGES = [{ from:'doc-001', to:'doc-002', weight:2 }]
```

Esto produce 1 arista entre Ventas Q1 2026 e Informe Financiero Anual, con grosor 2px en el grafo.

## Secciones temporales del sidebar

El sidebar clasifica documentos como **This month** u **Older** comparando el campo `date` con el mes/año actuales.

Con `currentDate = 2026-06-10`:
- **This month**: Métricas de Soporte (`2026-05-20` no — mayo ≠ junio), ninguno
  - Todos en 2025–2026 pero ninguno en junio → aparecen todos en **Older**

> Nota: si se agrega un documento con `date` en el mes actual, aparecerá en la sección **This month**.
