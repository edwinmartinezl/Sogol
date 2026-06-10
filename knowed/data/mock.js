export const documents = [
  {
    id: "doc-001",
    name: "Ventas Q1 2026",
    type: "xlsx",
    size: 204800,
    weight: 0.85,
    links: 3,
    graphs: 5,
    queries: 12,
    area: "Comercial",
    date: "2026-03-31"
  },
  {
    id: "doc-002",
    name: "Informe Financiero Anual",
    type: "pdf",
    size: 1048576,
    weight: 0.92,
    links: 7,
    graphs: 8,
    queries: 20,
    area: "Finanzas",
    date: "2026-01-15"
  },
  {
    id: "doc-003",
    name: "Base Clientes 2025",
    type: "csv",
    size: 512000,
    weight: 0.78,
    links: 1,
    graphs: 0,
    queries: 34,
    area: "Marketing",
    date: "2025-12-01"
  },
  {
    id: "doc-004",
    name: "Inventario Almacén",
    type: "xlsx",
    size: 307200,
    weight: 0.65,
    links: 2,
    graphs: 3,
    queries: 18,
    area: "Operaciones",
    date: "2026-04-10"
  },
  {
    id: "doc-005",
    name: "Reporte de Auditoría",
    type: "pdf",
    size: 2097152,
    weight: 0.97,
    links: 14,
    graphs: 6,
    queries: 9,
    area: "Legal",
    date: "2026-02-28"
  },
  {
    id: "doc-006",
    name: "Métricas de Soporte",
    type: "csv",
    size: 153600,
    weight: 0.55,
    links: 0,
    graphs: 0,
    queries: 41,
    area: "Soporte",
    date: "2026-05-20"
  },
  {
    id: "doc-007",
    name: "Plan Estratégico 2026",
    type: "pdf",
    size: 3145728,
    weight: 0.99,
    links: 22,
    graphs: 11,
    queries: 5,
    area: "Dirección",
    date: "2026-01-02"
  }
];

export const CHAT_HISTORY = [
  { role:'user', text:'¿Hay relación entre los gastos de IT y las caídas en ventas del Q1?' },
  { role:'ai',   text:'Sí, encontré una correlación importante. En febrero los costos de IT subieron 38%, coincidiendo con una caída del 22% en ventas ese mismo mes.', insight:'El pico de gasto en IT precede en 5 días la caída de ventas — posible downtime durante cierre de órdenes.', sources:['doc-001','doc-002'] },
  { role:'user', text:'¿Qué mes tuvo mejor ratio ventas vs costo IT?' },
  { role:'ai',   text:'Enero fue el más eficiente — $8.40 en ventas por cada $1 de IT. Marzo mejoró vs febrero pero no recuperó enero.', sources:['doc-001','doc-002'] },
];
