/* global React, ReactDOM */
const { useState, useRef, useEffect } = React;
const { createRoot } = ReactDOM;

// ── Data (mirrors data/mock.js) ───────────────────────────────────────────────

const documents = [
  { id:'doc-001', name:'Ventas Q1 2026',          type:'xlsx', size:204800,  weight:0.85, links:3,  graphs:5,  queries:12, area:'Comercial',  date:'2026-03-31' },
  { id:'doc-002', name:'Informe Financiero Anual', type:'pdf',  size:1048576, weight:0.92, links:7,  graphs:8,  queries:20, area:'Finanzas',    date:'2026-01-15' },
  { id:'doc-003', name:'Base Clientes 2025',       type:'csv',  size:512000,  weight:0.78, links:1,  graphs:0,  queries:34, area:'Marketing',   date:'2025-12-01' },
  { id:'doc-004', name:'Inventario Almacén',       type:'xlsx', size:307200,  weight:0.65, links:2,  graphs:3,  queries:18, area:'Operaciones', date:'2026-04-10' },
  { id:'doc-005', name:'Reporte de Auditoría',     type:'pdf',  size:2097152, weight:0.97, links:14, graphs:6,  queries:9,  area:'Legal',       date:'2026-02-28' },
  { id:'doc-006', name:'Métricas de Soporte',      type:'csv',  size:153600,  weight:0.55, links:0,  graphs:0,  queries:41, area:'Soporte',     date:'2026-05-20' },
  { id:'doc-007', name:'Plan Estratégico 2026',    type:'pdf',  size:3145728, weight:0.99, links:22, graphs:11, queries:5,  area:'Dirección',   date:'2026-01-02' },
];

const CHAT_HISTORY = [
  { role:'user', text:'¿Hay relación entre los gastos de IT y las caídas en ventas del Q1?' },
  { role:'ai',   text:'Sí, encontré una correlación importante. En febrero los costos de IT subieron 38%, coincidiendo con una caída del 22% en ventas ese mismo mes.', insight:'El pico de gasto en IT precede en 5 días la caída de ventas — posible downtime durante cierre de órdenes.', sources:['doc-001','doc-002'] },
  { role:'user', text:'¿Qué mes tuvo mejor ratio ventas vs costo IT?' },
  { role:'ai',   text:'Enero fue el más eficiente — $8.40 en ventas por cada $1 de IT. Marzo mejoró vs febrero pero no recuperó enero.', sources:['doc-001','doc-002'] },
  { role:'user', text:'¿Cómo se compara la base de clientes 2025 con las ventas del Q1?' },
  { role:'ai',   text:'La base de clientes creció un 12% respecto al año anterior, lo que correlaciona con el pico de ventas de enero. Los segmentos con mayor retención generaron el 68% del ingreso Q1.', sources:['doc-001','doc-003'] },
  { role:'user', text:'¿El informe financiero menciona el crecimiento de clientes?' },
  { role:'ai',   text:'Sí, la sección de ingresos cita un aumento del 15% en clientes activos como principal driver del resultado anual.', sources:['doc-002','doc-003'] },
  { role:'user', text:'¿Qué dice el reporte de auditoría sobre el inventario del almacén?' },
  { role:'ai',   text:'El reporte identificó un 3% de discrepancia en el inventario Q4. Se recomienda revisar los procesos de entrada de mercancía y cruzar con los registros de operaciones.', sources:['doc-004','doc-005'] },
  { role:'user', text:'¿El plan estratégico considera los hallazgos de la auditoría?' },
  { role:'ai',   text:'Sí, la sección de riesgos del plan 2026 cita explícitamente los hallazgos de auditoría como input para las iniciativas de mejora operacional del próximo año.', sources:['doc-005','doc-007'] },
  { role:'user', text:'¿Las métricas de soporte están alineadas con los objetivos del plan estratégico?' },
  { role:'ai',   text:'Parcialmente. El plan proyecta reducir el tiempo de resolución un 20%, pero las métricas actuales de soporte muestran una mejora de solo 8% — brecha significativa a cerrar en H2.', sources:['doc-006','doc-007'] },
  { role:'user', text:'¿Cómo afectan las roturas de stock a los resultados de ventas?' },
  { role:'ai',   text:'El análisis cruzado muestra que las roturas de stock en almacén explican el 15% de las oportunidades de venta perdidas en Q1.', sources:['doc-001','doc-004'] },
  { role:'user', text:'¿El inventario está alineado con la estrategia de crecimiento?' },
  { role:'ai',   text:'No completamente. El plan estratégico proyecta un crecimiento del 25% en volumen, pero la capacidad actual del almacén solo soporta un 18% adicional sin inversión.', sources:['doc-004','doc-007'] },
  { role:'user', text:'¿Qué relación hay entre el soporte y los clientes activos?' },
  { role:'ai',   text:'Los clientes con mayor índice de tickets de soporte tienen una tasa de retención 12% menor. Mejorar el soporte es clave para sostener el crecimiento de la base de clientes.', sources:['doc-003','doc-006'] },
];

const LLM_LABELS = { claude:'Claude 3.5', gpt4o:'GPT-4o', gemini:'Gemini', llama:'Llama' };

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtSize = b => b >= 1048576 ? (b/1048576).toFixed(1)+' MB' : (b/1024).toFixed(0)+' KB';

const isThisMonth = dateStr => {
  const d = new Date(dateStr), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
};

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:      '#f4f3f1',
  surface: '#eae8e5',
  border:  '0.5px solid #c4c0b8',
  text:    '#28261f',
  muted:   '#8a8780',
  accent:  '#e8561c',
  font:    "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
};

const TYPE_COLOR  = { xlsx:'#1a7a4a', pdf:'#c0392b', csv:'#2563eb' };
const TYPE_ICON   = { xlsx:'ti-table', pdf:'ti-file-text', csv:'ti-file-spreadsheet' };
const GRAPH_COLOR = { xlsx:'#34a853', pdf:'#ea4335', csv:'#4285f4' };

// ── Graph edge computation ────────────────────────────────────────────────────

const GRAPH_EDGES = (() => {
  const co = {};
  CHAT_HISTORY.forEach(msg => {
    if (!msg.sources || msg.sources.length < 2) return;
    for (let i = 0; i < msg.sources.length; i++)
      for (let j = i + 1; j < msg.sources.length; j++) {
        const k = [msg.sources[i], msg.sources[j]].sort().join('|');
        co[k] = (co[k] || 0) + 1;
      }
  });
  return Object.entries(co).map(([k, w]) => {
    const [a, b] = k.split('|');
    return { from: a, to: b, weight: w };
  });
})();

// ── Type badge ────────────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  const color = TYPE_COLOR[type] || C.muted;
  return (
    <span style={{
      fontSize:'10px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px',
      color, background:color+'18', borderRadius:'4px', padding:'2px 6px',
    }}>{type}</span>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }) {
  const isUser  = msg.role === 'user';
  const srcDocs = msg.sources
    ? msg.sources.map(id => documents.find(d => d.id === id)).filter(Boolean)
    : [];

  return (
    <div style={{
      display:'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      padding: isUser ? '4px 0 4px 80px' : '4px 80px 4px 0',
      marginBottom:'6px',
    }}>
      <div style={{ maxWidth:'100%' }}>
        <div style={{
          padding:'10px 14px', fontSize:'13px', lineHeight:'1.6',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: isUser ? C.accent : C.surface,
          color: isUser ? '#fff' : C.text,
        }}>
          {msg.text}
          {msg.insight && (
            <div style={{
              marginTop:'10px', padding:'10px 12px',
              background:C.bg, border:C.border, borderRadius:'8px',
            }}>
              <div style={{
                fontSize:'10px', fontWeight:600, color:C.accent,
                textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'5px',
              }}>Emergent insight</div>
              <div style={{ fontSize:'12px', color:C.text, lineHeight:'1.5' }}>{msg.insight}</div>
            </div>
          )}
        </div>
        {srcDocs.length > 0 && (
          <div style={{ display:'flex', gap:'4px', marginTop:'6px', flexWrap:'wrap' }}>
            {srcDocs.map(doc => (
              <span key={doc.id} style={{
                fontSize:'10px', padding:'2px 8px', borderRadius:'10px',
                background:C.surface, border:C.border, color:C.muted, whiteSpace:'nowrap',
              }}>{doc.name}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Chat sessions (historial) ─────────────────────────────────────────────────

const CHAT_SESSIONS = [
  {
    id: 'cs-001',
    date: '2026-06-05',
    preview: '¿Hay relación entre los gastos de IT y las caídas en ventas del Q1?',
    docs: ['doc-001', 'doc-002'],
  },
  {
    id: 'cs-002',
    date: '2026-05-20',
    preview: '¿Cómo se compara la base de clientes 2025 con las ventas del Q1?',
    docs: ['doc-001', 'doc-003'],
  },
  {
    id: 'cs-003',
    date: '2026-04-14',
    preview: '¿Qué riesgos identifica el reporte de auditoría para este año?',
    docs: ['doc-005', 'doc-007'],
  },
  {
    id: 'cs-004',
    date: '2026-03-02',
    preview: '¿Cuáles son los KPIs de soporte más críticos según métricas?',
    docs: ['doc-006', 'doc-002'],
  },
];

// ── Sidebar ───────────────────────────────────────────────────────────────────

const NAV = [
  { icon:'ti-files',        label:'Documents',  key:'documents'  },
  { icon:'ti-eye',          label:'Visualizar', key:'visualize'  },
  { icon:'ti-chart-bar',    label:'Graphs',     key:'graphs'     },
  { icon:'ti-messages',     label:'Chat',       key:'chat'       },
  { icon:'ti-shield-check', label:'Policies',   key:'policies'   },
];

// Column names for spreadsheet previews
const DOC_COLS = {
  'doc-001': ['Mes',      'Ventas ($)',  'Target ($)', '∆%'],
  'doc-003': ['ID',       'Segmento',   'Región',     'LTV ($)'],
  'doc-004': ['SKU',      'Producto',   'Stock',      'Ubicación'],
  'doc-006': ['Ticket #', 'Categoría',  'Tiempo (h)', 'Estado'],
};

// Section titles for PDF previews
const DOC_SECTIONS = {
  'doc-002': ['Resumen Ejecutivo',   'Análisis de Ingresos',  'Estructura de Gastos',  'Balance y Proyección'],
  'doc-005': ['Alcance de Auditoría','Hallazgos Principales', 'Análisis de Riesgos',   'Recomendaciones'],
  'doc-007': ['Visión Estratégica',  'Objetivos 2026',        'Iniciativas Clave',     'Métricas de Éxito'],
};

function DocItem({ doc, selected, onToggle }) {
  const isSel = selected.includes(doc.id);
  return (
    <div onClick={() => onToggle(doc.id)} style={{
      display:'flex', alignItems:'center', gap:'7px',
      padding:'5px 10px', margin:'1px 6px', borderRadius:'6px', cursor:'pointer',
      background: isSel ? C.accent+'12' : 'transparent',
      border: isSel ? '0.5px solid '+C.accent+'35' : '0.5px solid transparent',
    }}>
      <i className={'ti '+(TYPE_ICON[doc.type]||'ti-file')}
         style={{ fontSize:'13px', color:TYPE_COLOR[doc.type]||C.muted, flexShrink:0 }} />
      <span style={{
        fontSize:'12px', color:C.text,
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1,
      }}>{doc.name}</span>
      {isSel && <i className="ti ti-check" style={{ fontSize:'11px', color:C.accent, flexShrink:0 }} />}
    </div>
  );
}

function ChatSessionItem({ session, selected, onToggle }) {
  const sessionDocs = session.docs.map(id => documents.find(d => d.id === id)).filter(Boolean);
  const allSelected = session.docs.every(id => selected.includes(id));
  const fmt = d => new Date(d).toLocaleDateString('es-ES', { day:'2-digit', month:'short' });

  return (
    <div style={{
      margin:'1px 6px', padding:'8px 10px', borderRadius:'6px',
      border: allSelected ? '0.5px solid '+C.accent+'35' : '0.5px solid transparent',
      background: allSelected ? C.accent+'08' : 'transparent',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'5px' }}>
        <i className="ti ti-message-circle" style={{ fontSize:'12px', color:C.muted, flexShrink:0 }} />
        <span style={{
          fontSize:'11px', color:C.text, flex:1,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        }}>{session.preview}</span>
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
          {sessionDocs.map(doc => {
            const isSel = selected.includes(doc.id);
            return (
              <div
                key={doc.id}
                onClick={() => onToggle(doc.id)}
                title={doc.name}
                style={{
                  display:'inline-flex', alignItems:'center', gap:'3px',
                  padding:'2px 6px', borderRadius:'10px', cursor:'pointer',
                  fontSize:'10px', fontWeight:500,
                  color:      isSel ? C.accent    : C.muted,
                  background: isSel ? C.accent+'14' : C.surface,
                  border:     isSel ? '0.5px solid '+C.accent+'40' : C.border,
                }}
              >
                <i className={'ti '+(TYPE_ICON[doc.type]||'ti-file')}
                   style={{ fontSize:'10px', color: TYPE_COLOR[doc.type] }} />
                {doc.name.length > 14 ? doc.name.slice(0,13)+'…' : doc.name}
              </div>
            );
          })}
        </div>
        <span style={{ fontSize:'10px', color:C.muted, flexShrink:0, marginLeft:'6px' }}>
          {fmt(session.date)}
        </span>
      </div>
    </div>
  );
}

function Sidebar({ page, onNav, selected, onToggle }) {
  const [search, setSearch] = useState('');
  const thisMonth       = documents.filter(d => isThisMonth(d.date));
  const filteredSessions = CHAT_SESSIONS.filter(s =>
    s.preview.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{
      width:'210px', minWidth:'210px', height:'100vh',
      background:C.surface, borderRight:C.border,
      display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:C.font,
    }}>
      <div style={{ padding:'16px 14px 12px', borderBottom:C.border, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <div style={{
            width:'26px', height:'26px', borderRadius:'7px', background:C.accent,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <i className="ti ti-layers-intersect" style={{ color:'#fff', fontSize:'14px' }} />
          </div>
          <span style={{ fontWeight:600, fontSize:'14px', color:C.text, letterSpacing:'-0.2px' }}>
            KnowLayer
          </span>
        </div>
      </div>

      <nav style={{ padding:'6px 8px 0', flexShrink:0 }}>
        {NAV.map(item => (
          <div key={item.key} onClick={() => onNav(item.key)} style={{
            display:'flex', alignItems:'center', gap:'8px',
            padding:'6px 10px', borderRadius:'7px', marginBottom:'1px',
            cursor:'pointer', fontSize:'13px', fontFamily:C.font,
            fontWeight: page === item.key ? 500 : 400,
            color:      page === item.key ? C.accent : C.text,
            background: page === item.key ? C.accent+'14' : 'transparent',
          }}>
            <i className={'ti '+item.icon} style={{ fontSize:'15px' }} />
            {item.label}
          </div>
        ))}
      </nav>

      <div style={{ flex:1, overflow:'auto', paddingTop:'4px', borderTop:C.border, marginTop:'8px' }}>
        {thisMonth.length > 0 && (
          <>
            <div style={{
              fontSize:'10px', fontWeight:600, color:C.muted,
              textTransform:'uppercase', letterSpacing:'0.8px', padding:'10px 20px 3px',
            }}>This month</div>
            {thisMonth.map(doc => (
              <DocItem key={doc.id} doc={doc} selected={selected} onToggle={onToggle} />
            ))}
          </>
        )}
        <>
          <div style={{
            fontSize:'10px', fontWeight:600, color:C.muted,
            textTransform:'uppercase', letterSpacing:'0.8px', padding:'10px 20px 3px',
          }}>Older</div>
          <div style={{ padding:'4px 10px 6px', position:'relative' }}>
            <i className="ti ti-search" style={{
              position:'absolute', left:'18px', top:'50%', transform:'translateY(-50%)',
              fontSize:'12px', color:C.muted, pointerEvents:'none',
            }} />
            <input type="text" placeholder="Search chats…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width:'100%', boxSizing:'border-box',
                padding:'4px 8px 4px 26px', fontSize:'11px',
                background:C.bg, border:C.border, borderRadius:'6px',
                color:C.text, outline:'none', fontFamily:C.font,
              }}
            />
          </div>
          {filteredSessions.length > 0
            ? filteredSessions.map(session => (
                <ChatSessionItem key={session.id} session={session} selected={selected} onToggle={onToggle} />
              ))
            : <div style={{ textAlign:'center', padding:'16px', color:C.muted, fontSize:'12px' }}>No chats found</div>
          }
        </>
      </div>

      <div style={{ padding:'10px', borderTop:C.border, flexShrink:0 }}>
        <button style={{
          width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
          padding:'7px', background:C.bg, border:C.border, borderRadius:'8px',
          cursor:'pointer', fontSize:'12px', fontWeight:500, color:C.text, fontFamily:C.font,
        }}>
          <i className="ti ti-upload" style={{ fontSize:'14px' }} />
          Upload
        </button>
      </div>
    </div>
  );
}

// ── Topbar ────────────────────────────────────────────────────────────────────

function Topbar({ selected, onRemove, onClearAll, llm, onLlmChange, page, companies, activeCo, onSwitchCo, onNewCo }) {
  const n       = selected.length;
  const selDocs = documents.filter(d => selected.includes(d.id));
  const badge   = n === 0 ? null
    : n < 3
      ? { label:`${n} doc${n>1?'s':''} selected`, color:C.muted,  bg:C.surface,     icon:null }
      : { label:`Graph ready · ${n} docs`,         color:C.accent, bg:C.accent+'12', icon:'ti-vector-triangle' };

  return (
    <div style={{
      height:'48px', flexShrink:0, background:C.bg, borderBottom:C.border,
      display:'flex', alignItems:'center', padding:'0 16px', gap:'8px', fontFamily:C.font,
    }}>
      {page === 'documents' && (
        <div style={{ display:'flex', alignItems:'center', gap:'6px', marginRight:'4px' }}>
          <i className="ti ti-building" style={{ fontSize:'13px', color:C.muted }} />
          <select value={activeCo} onChange={e => onSwitchCo(e.target.value)} style={{
            fontSize:'12px', padding:'3px 8px', border:C.border, borderRadius:'6px',
            background:C.surface, color:C.text, outline:'none', cursor:'pointer', fontFamily:C.font,
          }}>
            {(companies||[]).map(co => <option key={co.id} value={co.id}>{co.name}</option>)}
          </select>
          <button onClick={onNewCo} style={{
            display:'flex', alignItems:'center', gap:'4px', padding:'3px 10px',
            fontSize:'11px', fontWeight:500, color:C.accent,
            background:C.accent+'12', border:'0.5px solid '+C.accent+'35',
            borderRadius:'6px', cursor:'pointer', fontFamily:C.font,
          }}>
            <i className="ti ti-plus" style={{ fontSize:'11px' }} /> New company
          </button>
          <div style={{ width:'0.5px', height:'18px', background:'#e0e0e5', margin:'0 4px' }} />
        </div>
      )}
      <div style={{ flex:1 }} />

      {n >= 2 && (
        <button onClick={onClearAll} style={{
          flexShrink:0, padding:'4px 10px', fontSize:'11px', fontWeight:500,
          color:C.muted, background:'transparent', border:C.border,
          borderRadius:'7px', cursor:'pointer', fontFamily:C.font,
        }}>Clear all</button>
      )}

      {badge && (
        <div style={{
          flexShrink:0, display:'flex', alignItems:'center', gap:'5px',
          padding:'4px 10px', borderRadius:'7px', fontSize:'11px', fontWeight:500,
          color:badge.color, background:badge.bg,
          border: n >= 3 ? '0.5px solid '+C.accent+'30' : C.border,
        }}>
          {badge.icon && <i className={'ti '+badge.icon} style={{ fontSize:'12px' }} />}
          {badge.label}
        </div>
      )}

      {page !== 'chat' && (
        <select value={llm} onChange={e => onLlmChange(e.target.value)} style={{
          flexShrink:0, fontSize:'12px', padding:'5px 10px',
          border:C.border, borderRadius:'7px',
          background:C.surface, color:C.text,
          outline:'none', cursor:'pointer', fontFamily:C.font,
        }}>
          <option value="claude">Claude 3.5</option>
          <option value="gpt4o">GPT-4o</option>
          <option value="gemini">Gemini</option>
          <option value="llama">Llama</option>
        </select>
      )}
    </div>
  );
}

// ── Tree structure ────────────────────────────────────────────────────────────

const TREE = {
  company: { id:'c1', name:'Empresa Demo' },
  departments: [
    { id:'dep1', name:'Finanzas',    icon:'ti-building-bank' },
    { id:'dep2', name:'IT',          icon:'ti-cpu'           },
    { id:'dep3', name:'Ventas',      icon:'ti-chart-bar'     },
    { id:'dep4', name:'RRHH',        icon:'ti-users'         },
    { id:'dep5', name:'Operaciones', icon:'ti-settings'      },
  ],
  groups: [
    { id:'g1', name:'Cierres Q1',       deptId:'dep1' },
    { id:'g2', name:'Presupuesto 2024', deptId:'dep1' },
    { id:'g3', name:'Infraestructura',  deptId:'dep2' },
    { id:'g4', name:'Pipeline Ventas',  deptId:'dep3' },
    { id:'g5', name:'Nómina 2023',      deptId:'dep4' },
  ],
  docAssignments: {
    'doc-001': { deptId:'dep3', groupId:'g4'  },
    'doc-002': { deptId:'dep2', groupId:'g3'  },
    'doc-003': { deptId:'dep1', groupId:'g1'  },
    'doc-004': { deptId:'dep4', groupId:'g5'  },
    'doc-005': { deptId:'dep3', groupId:'g4'  },
    'doc-006': { deptId:'dep1', groupId:'g2'  },
    'doc-007': { deptId:'dep5', groupId:null  },
  },
};

// ── Context menu ─────────────────────────────────────────────────────────────

const CTX_ITEMS = {
  doc: [
    { icon:'ti-folder',          label:'Move to folder',    action:'move'       },
    { icon:'ti-copy',            label:'Copy',              action:'copy'       },
    { icon:'ti-link',            label:'Add to context',    action:'context'    },
    { icon:'ti-info-circle',     label:'Details',           action:'details'    },
    { sep:true },
    { icon:'ti-trash',           label:'Delete',            action:'delete', danger:true },
  ],
  folder: [
    { icon:'ti-pencil',          label:'Rename',            action:'rename'     },
    { icon:'ti-folder-symlink',  label:'Move inside folder',action:'movefolder' },
    { sep:true },
    { icon:'ti-trash',           label:'Delete',            action:'delete', danger:true },
  ],
  blank: [
    { icon:'ti-folder-plus',     label:'New folder',        action:'newfolder'  },
    { icon:'ti-building',        label:'New department',    action:'newdept'    },
    { icon:'ti-upload',          label:'Upload document',   action:'upload'     },
  ],
  blank_inner: [
    { icon:'ti-folder-plus',     label:'New folder',        action:'newfolder'  },
    { icon:'ti-upload',          label:'Upload document',   action:'upload'     },
  ],
};

function ContextMenu({ menu, onClose, onAction }) {
  if (!menu.visible) return null;
  const items   = CTX_ITEMS[menu.type] || [];
  const flipX   = menu.x + 196 > window.innerWidth;
  const flipY   = menu.y + items.length * 32 + 24 > window.innerHeight;
  return (
    <div onClick={e => e.stopPropagation()} style={{
      position:'fixed',
      top:  flipY ? menu.y - items.length*32 - 16 : menu.y,
      left: flipX ? menu.x - 196 : menu.x,
      zIndex:2000, background:C.bg,
      border:'0.5px solid #e0e0e5', borderRadius:'10px',
      boxShadow:'0 4px 20px rgba(0,0,0,0.12)',
      padding:'4px', minWidth:'196px', fontFamily:C.font,
    }}>
      {items.map((item, i) => item.sep
        ? <div key={i} style={{ height:'1px', background:'#e5e5ea', margin:'3px 0' }} />
        : (
          <div key={i}
            onClick={() => { onAction(item.action, menu.targetId); onClose(); }}
            style={{ display:'flex', alignItems:'center', gap:'8px', padding:'0 10px', height:'32px', borderRadius:'7px', fontSize:'13px', cursor:'pointer', color: item.danger ? '#c0392b' : C.text }}
            onMouseEnter={e => e.currentTarget.style.background = item.danger ? '#fdf2f2' : C.surface}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <i className={'ti '+item.icon} style={{ fontSize:'14px', color: item.danger ? '#c0392b' : C.muted, flexShrink:0 }} />
            {item.label}
          </div>
        )
      )}
    </div>
  );
}

// ── Documents page ────────────────────────────────────────────────────────────

function DocumentsPage({ selected, onToggle, activeCo, companies }) {
  const [nav,         setNav]         = useState({ view:'all', deptId:null, groupId:null });
  const [assign,      setAssign]      = useState(TREE.docAssignments);
  const [groups,      setGroups]      = useState([...TREE.groups]);
  const [viewMode,    setViewMode]    = useState('grid');
  const [search,      setSearch]      = useState('');
  const [dragDocId,   setDragDocId]   = useState(null);
  const [dragGroupId, setDragGroupId] = useState(null);
  const [dragOverId,  setDragOverId]  = useState(null);
  const [ctxMenu,     setCtxMenu]     = useState({ visible:false, x:0, y:0, type:'blank', targetId:null });
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const q = search.toLowerCase();
  const docsForGroup = gId => documents.filter(d => assign[d.id]?.groupId === gId);
  const docsForDept  = dId => documents.filter(d => assign[d.id]?.deptId  === dId);
  const docsLoose    = dId => docsForDept(dId).filter(d => !assign[d.id]?.groupId);

  const curDept  = TREE.departments.find(d => d.id === nav.deptId) || null;
  const curGroup = groups.find(g => g.id === nav.groupId)          || null;

  const goTo     = (view, deptId = null, groupId = null) => { setNav({ view, deptId, groupId }); setSearch(''); };
  const closeCtx = () => setCtxMenu(m => ({ ...m, visible:false }));
  const openCtx  = (e, type, targetId = null) => {
    e.preventDefault(); e.stopPropagation();
    setCtxMenu({ visible:true, x:e.clientX, y:e.clientY, type, targetId });
  };
  const clearDrag = () => { setDragDocId(null); setDragGroupId(null); setDragOverId(null); };

  useEffect(() => {
    setNav({ view:'all', deptId:null, groupId:null });
    if (activeCo === 'c1') { setGroups([...TREE.groups]); setAssign({ ...TREE.docAssignments }); }
    else                   { setGroups([]); setAssign({}); }
  }, [activeCo]);

  useEffect(() => {
    if (!ctxMenu.visible) return;
    const onKey = e => { if (e.key === 'Escape') closeCtx(); };
    document.addEventListener('click', closeCtx);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', closeCtx); document.removeEventListener('keydown', onKey); };
  }, [ctxMenu.visible]);

  const handleDrop = (e, tDeptId, tGroupId) => {
    e.preventDefault();
    if (dragDocId) {
      setAssign(prev => ({ ...prev, [dragDocId]: { deptId:tDeptId, groupId:tGroupId||null } }));
      setDragDocId(null);
    } else if (dragGroupId && !tGroupId) {
      setGroups(prev => prev.map(g => g.id === dragGroupId ? { ...g, deptId:tDeptId } : g));
      setDragGroupId(null);
    }
    setDragOverId(null);
  };

  const handleCtxAction = (action, targetId) => {
    if (action === 'newfolder') {
      setNewFolderName(''); setShowNewFolder(true);
    } else {
      console.log('[CTX]', action, targetId);
    }
  };

  const createFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    if (nav.view === 'dept' || nav.view === 'group') {
      setGroups(prev => [...prev, { id:'g'+Date.now(), name, deptId: nav.deptId }]);
    }
    setNewFolderName(''); setShowNewFolder(false);
  };


  // ── row renderer ─────────────────────────────────────────────────────────

  const renderRow = (doc, i, total, showLoc) => {
    const isSel = selected.includes(doc.id);
    const a   = assign[doc.id];
    const dep = a ? TREE.departments.find(x => x.id === a.deptId) : null;
    const grp = a?.groupId ? groups.find(x => x.id === a.groupId) : null;
    const loc = dep ? (grp ? `${dep.name} › ${grp.name}` : dep.name) : '—';
    return (
      <tr key={doc.id}
        draggable
        onDragStart={e => { e.stopPropagation(); setDragDocId(doc.id); }}
        onDragEnd={clearDrag}
        onClick={() => onToggle(doc.id)}
        onContextMenu={e => { e.stopPropagation(); openCtx(e, 'doc', doc.id); }}
        style={{
          background: isSel ? C.accent+'0a' : i%2===0 ? C.bg : '#fafafa',
          cursor:'pointer', borderBottom: i<total-1 ? C.border : 'none',
          opacity: dragDocId===doc.id ? 0.35 : 1,
        }}
      >
        <td style={{ padding:'9px 12px', width:'32px' }}>
          <div style={{
            width:'15px', height:'15px', borderRadius:'4px',
            border: isSel ? 'none' : '0.5px solid #c7c7cc',
            background: isSel ? C.accent : 'transparent',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            {isSel && <i className="ti ti-check" style={{ fontSize:'10px', color:'#fff' }} />}
          </div>
        </td>
        <td style={{ padding:'9px 12px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
            <i className={'ti '+(TYPE_ICON[doc.type]||'ti-file')} style={{ fontSize:'13px', color:TYPE_COLOR[doc.type], flexShrink:0 }} />
            <span style={{ color:C.text, fontWeight:500 }}>{doc.name}</span>
          </div>
        </td>
        <td style={{ padding:'9px 12px' }}><TypeBadge type={doc.type} /></td>
        {showLoc && <td style={{ padding:'9px 12px', color:C.muted, fontSize:'12px' }}>{loc}</td>}
        <td style={{ padding:'9px 12px', color:C.muted }}>{doc.date}</td>
        <td style={{ padding:'9px 12px', color:C.muted, textAlign:'right' }}>{fmtSize(doc.size)}</td>
        <td style={{ padding:'9px 12px', textAlign:'right' }}>
          <span style={{ color:doc.weight>=0.9?'#1a7a4a':doc.weight>=0.7?C.text:C.muted }}>
            {(doc.weight*100).toFixed(0)}%
          </span>
        </td>
        <td style={{ padding:'9px 12px', color:C.muted, textAlign:'right' }}>{doc.links}</td>
        <td style={{ padding:'9px 12px', color:C.muted, textAlign:'right' }}>{doc.graphs}</td>
        <td style={{ padding:'9px 12px', color:C.muted, textAlign:'right' }}>{doc.queries}</td>
      </tr>
    );
  };

  const renderCard = (doc, showLoc = false) => {
    const isSel = selected.includes(doc.id);
    const a   = assign[doc.id];
    const dep = a ? TREE.departments.find(x => x.id === a.deptId) : null;
    const grp = a?.groupId ? groups.find(x => x.id === a.groupId) : null;
    const loc = dep ? (grp ? `${dep.name} › ${grp.name}` : dep.name) : '—';
    return (
      <div key={doc.id}
        draggable
        onDragStart={e => { e.stopPropagation(); setDragDocId(doc.id); }}
        onDragEnd={clearDrag}
        onClick={() => onToggle(doc.id)}
        onContextMenu={e => { e.stopPropagation(); openCtx(e, 'doc', doc.id); }}
        style={{
          background: isSel ? C.accent+'0a' : C.bg,
          border: isSel ? '1px solid '+C.accent+'50' : C.border,
          borderRadius:'10px', padding:'10px 12px', cursor:'pointer',
          display:'flex', flexDirection:'column', gap:'6px',
          opacity: dragDocId===doc.id ? 0.35 : 1,
          transition:'border-color .15s, background .15s',
        }}
      >
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <i className={'ti '+(TYPE_ICON[doc.type]||'ti-file')} style={{ fontSize:'18px', color:TYPE_COLOR[doc.type] }} />
          <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
            <TypeBadge type={doc.type} />
            <div style={{
              width:'14px', height:'14px', borderRadius:'3px', flexShrink:0,
              border: isSel ? 'none' : '0.5px solid #c7c7cc',
              background: isSel ? C.accent : 'transparent',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              {isSel && <i className="ti ti-check" style={{ fontSize:'9px', color:'#fff' }} />}
            </div>
          </div>
        </div>
        <div title={doc.name} style={{ fontSize:'12px', fontWeight:600, color:C.text, lineHeight:'1.3', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {doc.name}
        </div>
        <div style={{ fontSize:'11px', color:C.muted }}>{doc.area} · {fmtSize(doc.size)}</div>
        {showLoc && <div style={{ fontSize:'11px', color:C.muted, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={loc}>{loc}</div>}
        <div style={{ fontSize:'11px', color:C.muted }}>{doc.date}</div>
        <div style={{ height:'2px', background:'#e5e5ea', borderRadius:'2px', overflow:'hidden', marginTop:'1px' }}>
          <div style={{ height:'100%', width:(doc.weight*100)+'%', borderRadius:'2px',
            background: doc.weight>=0.9?'#1a7a4a':doc.weight>=0.7?C.accent:'#f0a830' }} />
        </div>
      </div>
    );
  };

  const renderCards = (docs, showLoc = false) => {
    if (docs.length === 0) return (
      <div style={{ textAlign:'center', padding:'48px', color:C.muted, fontSize:'13px' }}>No documents</div>
    );
    return (
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'10px' }}>
        {docs.map(doc => renderCard(doc, showLoc))}
      </div>
    );
  };

  const renderDocs = (docs, showLoc = false) =>
    viewMode === 'grid' ? renderCards(docs, showLoc) : renderTable(docs, showLoc);

  const renderTable = (docs, showLoc = false) => {
    const heads   = ['','Name','Type',...(showLoc?['Location']:[]),'Date','Size','Weight','Links','Graphs','Queries'];
    const rightAt = showLoc ? 4 : 3;
    return (
      <div style={{ border:C.border, borderRadius:'10px', overflow:'hidden', background:C.bg }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
          <thead>
            <tr>
              {heads.map((h,i) => (
                <th key={i} style={{
                  padding:'8px 12px', fontSize:'11px', fontWeight:600, color:C.muted,
                  textAlign: i>=rightAt ? 'right' : 'left', letterSpacing:'0.3px', whiteSpace:'nowrap',
                  borderBottom:C.border, background:C.surface,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {docs.length === 0
              ? <tr><td colSpan={heads.length} style={{ padding:'32px', textAlign:'center', color:C.muted }}>No documents</td></tr>
              : docs.map((doc,i) => renderRow(doc, i, docs.length, showLoc))
            }
          </tbody>
        </table>
      </div>
    );
  };

  // ── breadcrumb ────────────────────────────────────────────────────────────

  const activeCoDef = companies.find(c => c.id === activeCo) || companies[0];
  const crumbs = [{ label: activeCoDef.name, go: () => goTo('all') }];
  if (nav.view === 'flat') crumbs.push({ label:'All documents', go: null });
  if (nav.view === 'dept' || nav.view === 'group')
    crumbs.push({ label: curDept?.name, go: () => goTo('dept', nav.deptId) });
  if (nav.view === 'group')
    crumbs.push({ label: curGroup?.name, go: null });

  // ── content ───────────────────────────────────────────────────────────────

  let content;

  if (nav.view === 'flat') {
    content = renderDocs(documents.filter(d => !q || d.name.toLowerCase().includes(q)), true);
  }
  else if (nav.view === 'all') {
    if (activeCo !== 'c1') {
      content = (
        <div style={{ textAlign:'center', padding:'60px', color:C.muted, fontSize:'13px' }}>
          <i className="ti ti-building" style={{ fontSize:'40px', color:'#e0e0e5', display:'block', marginBottom:'12px' }} />
          Esta empresa no tiene departamentos. Click derecho para crear uno.
        </div>
      );
    } else {
      const depts = TREE.departments.filter(dep =>
        !q || dep.name.toLowerCase().includes(q) || docsForDept(dep.id).some(d => d.name.toLowerCase().includes(q))
      );
      content = (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'12px' }}>
          {depts.map(dep => {
            const dDocs   = docsForDept(dep.id);
            const dGroups = groups.filter(g => g.deptId === dep.id);
            const isOver  = dragOverId === dep.id;
            return (
              <div key={dep.id}
                onClick={() => goTo('dept', dep.id)}
                onContextMenu={e => { e.stopPropagation(); openCtx(e, 'folder', dep.id); }}
                onDragOver={e => { e.preventDefault(); setDragOverId(dep.id); }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={e => handleDrop(e, dep.id, null)}
                style={{
                  background: isOver ? C.accent+'12' : C.bg, cursor:'pointer',
                  border: isOver ? '1px solid '+C.accent : C.border,
                  borderRadius:'12px', padding:'20px', transition:'all .1s',
                }}
              >
                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'14px' }}>
                  <div style={{ width:'36px', height:'36px', borderRadius:'9px', background:C.accent+'14', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <i className={'ti '+dep.icon} style={{ fontSize:'18px', color:C.accent }} />
                  </div>
                  <span style={{ fontSize:'14px', fontWeight:600, color:C.text }}>{dep.name}</span>
                </div>
                <div style={{ display:'flex', gap:'20px' }}>
                  <div>
                    <div style={{ fontSize:'20px', fontWeight:700, color:C.text, lineHeight:1 }}>{dDocs.length}</div>
                    <div style={{ fontSize:'10px', color:C.muted, textTransform:'uppercase', letterSpacing:'0.4px', marginTop:'2px' }}>Docs</div>
                  </div>
                  <div>
                    <div style={{ fontSize:'20px', fontWeight:700, color:C.text, lineHeight:1 }}>{dGroups.length}</div>
                    <div style={{ fontSize:'10px', color:C.muted, textTransform:'uppercase', letterSpacing:'0.4px', marginTop:'2px' }}>Groups</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    }
  }
  else if (nav.view === 'dept') {
    const depGroups = groups.filter(g => g.deptId === nav.deptId);
    const fGroups   = depGroups.filter(g =>
      !q || g.name.toLowerCase().includes(q) || docsForGroup(g.id).some(d => d.name.toLowerCase().includes(q))
    );
    const loose = docsLoose(nav.deptId).filter(d => !q || d.name.toLowerCase().includes(q));
    content = (
      <div>
        {fGroups.length > 0 && (
          <div style={{ marginBottom:'24px' }}>
            <div style={{ fontSize:'11px', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:'10px' }}>Groups</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'10px' }}>
              {fGroups.map(g => {
                const gDocs  = docsForGroup(g.id);
                const isOver = dragOverId === g.id;
                return (
                  <div key={g.id}
                    draggable
                    onClick={() => goTo('group', nav.deptId, g.id)}
                    onContextMenu={e => { e.stopPropagation(); openCtx(e, 'folder', g.id); }}
                    onDragStart={e => { e.stopPropagation(); setDragGroupId(g.id); }}
                    onDragEnd={clearDrag}
                    onDragOver={e => { e.preventDefault(); setDragOverId(g.id); }}
                    onDragLeave={() => setDragOverId(null)}
                    onDrop={e => handleDrop(e, nav.deptId, g.id)}
                    style={{
                      background: isOver ? C.accent+'12' : C.surface,
                      border: isOver ? '1px solid '+C.accent : C.border,
                      borderRadius:'10px', padding:'14px 16px', cursor:'pointer',
                      display:'flex', alignItems:'center', gap:'10px', transition:'all .1s',
                      opacity: dragGroupId===g.id ? 0.4 : 1,
                    }}
                  >
                    <i className="ti ti-folder-filled" style={{ fontSize:'22px', color:'#f0a830', flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'13px', fontWeight:500, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.name}</div>
                      <div style={{ fontSize:'11px', color:C.muted }}>{gDocs.length} doc{gDocs.length!==1?'s':''}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {loose.length > 0 && (
          <div>
            <div style={{ fontSize:'11px', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:'10px' }}>Documents (sin grupo)</div>
            {renderDocs(loose)}
          </div>
        )}
        {fGroups.length === 0 && loose.length === 0 && (
          <div style={{ textAlign:'center', padding:'48px', color:C.muted, fontSize:'13px' }}>No hay contenido en este departamento</div>
        )}
      </div>
    );
  }
  else if (nav.view === 'group') {
    const docs = docsForGroup(nav.groupId).filter(d => !q || d.name.toLowerCase().includes(q));
    content = <div>{renderDocs(docs)}</div>;
  }

  // ── shell ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:C.font }}>

      {/* Breadcrumb */}
      <div style={{ padding:'10px 24px', borderBottom:C.border, flexShrink:0, display:'flex', alignItems:'center', gap:'2px' }}>
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color:'#c7c7cc', fontSize:'13px', padding:'0 6px' }}>›</span>}
            <span onClick={c.go || undefined} style={{ fontSize:'13px', fontWeight: i===crumbs.length-1?600:400, color: c.go?C.accent:C.text, cursor: c.go?'pointer':'default' }}>{c.label}</span>
          </React.Fragment>
        ))}
        {nav.view === 'all' && (
          <>
            <span style={{ color:'#c7c7cc', fontSize:'13px', padding:'0 8px' }}>·</span>
            <span onClick={() => goTo('flat')} style={{ fontSize:'12px', color:C.muted, cursor:'pointer', textDecoration:'underline' }}>All documents</span>
          </>
        )}
        <div style={{ flex:1 }} />
        <span style={{ fontSize:'11px', color:C.muted }}>{documents.length} docs</span>
      </div>

      {/* Toolbar */}
      <div style={{ padding:'8px 24px', borderBottom:C.border, flexShrink:0, display:'flex', alignItems:'center', gap:'8px' }}>
        <button onClick={() => handleCtxAction('newfolder', null)} style={{ display:'flex', alignItems:'center', gap:'5px', padding:'5px 12px', fontSize:'11px', fontWeight:500, color:C.muted, background:'transparent', border:C.border, borderRadius:'7px', cursor:'pointer', fontFamily:C.font }}>
          <i className="ti ti-folder-plus" style={{ fontSize:'13px' }} /> New folder
        </button>
        <div style={{ flex:1 }} />
        <div style={{ position:'relative' }}>
          <i className="ti ti-search" style={{ position:'absolute', left:'8px', top:'50%', transform:'translateY(-50%)', fontSize:'12px', color:C.muted, pointerEvents:'none' }} />
          <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding:'5px 10px 5px 26px', fontSize:'12px', width:'180px', border:C.border, borderRadius:'7px', background:C.surface, color:C.text, outline:'none', fontFamily:C.font }} />
        </div>
        {['grid','list'].map(mode => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{ width:'30px', height:'30px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'7px', cursor:'pointer', border:C.border, background: viewMode===mode?C.accent+'14':'transparent', color: viewMode===mode?C.accent:C.muted }}>
            <i className={'ti '+(mode==='grid'?'ti-layout-grid':'ti-list')} style={{ fontSize:'14px' }} />
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflow:'auto', padding:'20px 24px' }} onContextMenu={e => openCtx(e, nav.view === 'all' ? 'blank' : 'blank_inner')}>{content}</div>

      {/* Context menu */}
      <ContextMenu menu={ctxMenu} onClose={closeCtx} onAction={handleCtxAction} />

      {/* New folder modal */}
      {showNewFolder && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.18)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setShowNewFolder(false)}>
          <div style={{ background:C.bg, borderRadius:'16px', padding:'28px', width:'340px', boxShadow:'0 8px 40px rgba(0,0,0,0.15)', fontFamily:C.font }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:'15px', fontWeight:600, color:C.text, marginBottom:'16px' }}>Nueva carpeta</div>
            <input type="text" placeholder="Nombre de la carpeta…" value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key==='Enter' && createFolder()}
              autoFocus
              style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', fontSize:'13px', border:C.border, borderRadius:'8px', outline:'none', fontFamily:C.font, color:C.text }}
            />
            <div style={{ display:'flex', gap:'8px', marginTop:'16px', justifyContent:'flex-end' }}>
              <button onClick={() => setShowNewFolder(false)} style={{ padding:'7px 16px', fontSize:'12px', border:C.border, borderRadius:'8px', cursor:'pointer', background:'transparent', fontFamily:C.font }}>Cancel</button>
              <button onClick={createFolder} style={{ padding:'7px 16px', fontSize:'12px', background:C.accent, color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontFamily:C.font, fontWeight:500 }}>Crear</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Chat page ─────────────────────────────────────────────────────────────────

function ChatPage({ selected, onRemove, llm, onLlmChange, onTrackQuery }) {
  const [messages,   setMessages]   = useState([]);
  const [input,      setInput]      = useState('');
  const [attachments, setAttachments] = useState([]);
  const bottomRef  = useRef(null);
  const fileRef    = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const n = selected.length;
    const aiText = n > 0
      ? `Analizando ${n} documento${n!==1?'s':''} en contexto… he encontrado patrones relevantes.`
      : 'No tengo documentos en contexto. Selecciona documentos desde la página Documents para hacer preguntas específicas sobre tu información.';
    setMessages(prev => [
      ...prev,
      { role:'user', text },
      { role:'ai', text:aiText, sources: n > 0 ? [...selected] : [] },
    ]);
    if (n > 0) onTrackQuery([...selected]);
    setInput(''); setAttachments([]);
  };

  const onKeyDown = e => {
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div style={{
      flex:1, display:'flex', flexDirection:'column', overflow:'hidden',
      background:C.bg, fontFamily:C.font,
    }}>
      {/* Context band */}
      <div style={{
        padding:'8px 20px', borderBottom:C.border, flexShrink:0,
        display:'flex', alignItems:'center', gap:'8px', overflowX:'auto',
      }}>
        <span style={{ fontSize:'11px', color:C.muted, flexShrink:0 }}>Context:</span>
        {selected.length === 0 && (
          <span style={{ fontSize:'11px', color:'#c7c7cc', fontStyle:'italic' }}>
            No documents — go to Documents to add context
          </span>
        )}
        {selected.map(id => {
          const doc = documents.find(d => d.id === id);
          if (!doc) return null;
          return (
            <div key={id} style={{
              display:'inline-flex', alignItems:'center', gap:'5px', flexShrink:0,
              background:C.accent+'12', border:'0.5px solid '+C.accent+'40',
              borderRadius:'20px', padding:'3px 8px 3px 10px',
              fontSize:'11px', color:C.accent, fontWeight:500, whiteSpace:'nowrap',
            }}>
              <i className={'ti '+(TYPE_ICON[doc.type]||'ti-file')} style={{ fontSize:'11px' }} />
              {doc.name}
              <span onClick={() => onRemove(id)}
                style={{ cursor:'pointer', display:'flex', alignItems:'center', opacity:0.7, marginLeft:'1px' }}>
                <i className="ti ti-x" style={{ fontSize:'10px' }} />
              </span>
            </div>
          );
        })}
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflow:'auto', padding:'28px 20px 12px' }}>
        <div style={{ maxWidth:'720px', margin:'0 auto' }}>
          {messages.length === 0 ? (
            <div style={{
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              minHeight:'300px', gap:'12px', userSelect:'none',
            }}>
              <div style={{
                width:'48px', height:'48px', borderRadius:'14px', background:C.surface,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                <i className="ti ti-message-circle" style={{ fontSize:'24px', color:'#c7c7cc' }} />
              </div>
              <div style={{ fontSize:'15px', fontWeight:600, color:C.text }}>Ask anything</div>
              <div style={{ fontSize:'13px', color:C.muted, textAlign:'center', maxWidth:'320px', lineHeight:'1.5' }}>
                {selected.length === 0
                  ? 'Select documents from the sidebar to add context, then ask your question.'
                  : `${selected.length} document${selected.length !== 1 ? 's' : ''} in context. Ask a question about them.`
                }
              </div>
            </div>
          ) : (
            messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div style={{ padding:'12px 20px 20px', flexShrink:0 }}>
        <div style={{ maxWidth:'720px', margin:'0 auto' }}>
          <input
            ref={fileRef} type="file" multiple
            accept=".pdf,.xlsx,.csv,.docx,.txt"
            style={{ display:'none' }}
            onChange={e => {
              const files = Array.from(e.target.files);
              setAttachments(prev => [...prev, ...files.map(f => ({ name:f.name, size:f.size }))]);
              e.target.value = '';
            }}
          />
          <div style={{
            border: C.border, borderRadius:'16px', background:C.bg,
            boxShadow:'0 2px 12px rgba(0,0,0,0.06)',
          }}>
            {attachments.length > 0 && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', padding:'10px 12px 0' }}>
                {attachments.map((f, i) => (
                  <div key={i} style={{
                    display:'inline-flex', alignItems:'center', gap:'5px',
                    background:C.surface, border:C.border,
                    borderRadius:'20px', padding:'3px 8px',
                    fontSize:'11px', color:C.text, maxWidth:'180px',
                  }}>
                    <i className="ti ti-paperclip" style={{ fontSize:'11px', color:C.muted, flexShrink:0 }} />
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</span>
                    <span onClick={() => setAttachments(prev => prev.filter((_,j) => j!==i))}
                      style={{ cursor:'pointer', color:C.muted, flexShrink:0, display:'flex', alignItems:'center' }}>
                      <i className="ti ti-x" style={{ fontSize:'10px' }} />
                    </span>
                  </div>
                ))}
              </div>
            )}
            <textarea rows={1} value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about these documents…"
              style={{
                width:'100%', boxSizing:'border-box',
                padding:'12px 16px 4px',
                border:'none', outline:'none', background:'transparent',
                fontSize:'14px', lineHeight:'1.5', resize:'none',
                color:C.text, fontFamily:C.font,
              }}
            />
            <div style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'8px 10px 10px',
            }}>
              <button onClick={() => fileRef.current?.click()} style={{
                width:'30px', height:'30px', borderRadius:'8px', border:C.border,
                background:'transparent', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', color:C.muted,
              }}>
                <i className="ti ti-plus" style={{ fontSize:'15px' }} />
              </button>
              <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                <select value={llm} onChange={e => onLlmChange(e.target.value)} style={{
                  fontSize:'12px', padding:'4px 8px',
                  border:C.border, borderRadius:'7px',
                  background:C.surface, color:C.text,
                  outline:'none', cursor:'pointer', fontFamily:C.font,
                }}>
                  <option value="claude">Claude 3.5</option>
                  <option value="gpt4o">GPT-4o</option>
                  <option value="gemini">Gemini</option>
                  <option value="llama">Llama</option>
                </select>
                <button style={{
                  width:'30px', height:'30px', borderRadius:'8px', border:C.border,
                  background:'transparent', cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', color:C.muted,
                }}>
                  <i className="ti ti-microphone" style={{ fontSize:'14px' }} />
                </button>
                <button onClick={send} disabled={!input.trim()} style={{
                  width:'32px', height:'32px', borderRadius:'50%', border:'none',
                  background: input.trim() ? C.accent : '#d1d1d6',
                  cursor: input.trim() ? 'pointer' : 'default',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  transition:'background .15s',
                }}>
                  <i className="ti ti-arrow-up" style={{ fontSize:'14px', color:'#fff' }} />
                </button>
              </div>
            </div>
          </div>
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'center', gap:'5px',
            padding:'8px 0 0', fontSize:'11px', color:'#c7c7cc',
          }}>
            <i className="ti ti-lock" style={{ fontSize:'11px' }} />
            {selected.length} doc{selected.length!==1?'s':''} in context · vectors stored on your server
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Doc modal ─────────────────────────────────────────────────────────────────

function DocModal({ doc, onClose, onRemove }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const rows = [
    { label:'Area',    value: doc.area },
    { label:'Date',    value: doc.date },
    { label:'Size',    value: fmtSize(doc.size) },
    { label:'Links',   value: doc.links },
    { label:'Graphs',  value: doc.graphs },
    { label:'Queries', value: doc.queries },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position:'fixed', inset:0, zIndex:1000,
        background:'rgba(0,0,0,0.18)',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontFamily:C.font,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background:C.bg, borderRadius:'16px', padding:'24px',
        width:'380px', maxWidth:'calc(100vw - 32px)',
        boxShadow:'0 20px 60px rgba(0,0,0,0.14)', border:C.border,
      }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:'12px', marginBottom:'20px' }}>
          <div style={{ flex:1 }}>
            <TypeBadge type={doc.type} />
            <div style={{ fontSize:'16px', fontWeight:600, color:C.text, marginTop:'8px', lineHeight:'1.3' }}>
              {doc.name}
            </div>
          </div>
          <button onClick={onClose} style={{
            flexShrink:0, width:'28px', height:'28px',
            display:'flex', alignItems:'center', justifyContent:'center',
            border:C.border, borderRadius:'8px', background:C.surface,
            cursor:'pointer', color:C.muted,
          }}>
            <i className="ti ti-x" style={{ fontSize:'13px' }} />
          </button>
        </div>

        {/* Weight bar */}
        <div style={{ marginBottom:'16px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'5px' }}>
            <span style={{ fontSize:'10px', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'0.5px' }}>
              Weight
            </span>
            <span style={{ fontSize:'12px', fontWeight:600, color:C.text }}>
              {(doc.weight * 100).toFixed(0)}%
            </span>
          </div>
          <div style={{ height:'5px', background:C.surface, borderRadius:'3px', overflow:'hidden' }}>
            <div style={{ width:`${doc.weight * 100}%`, height:'100%', background:C.accent, borderRadius:'3px' }} />
          </div>
        </div>

        {/* Fields grid */}
        <div style={{
          display:'grid', gridTemplateColumns:'1fr 1fr',
          border:C.border, borderRadius:'10px', overflow:'hidden',
          marginBottom:'20px',
        }}>
          {rows.map((row, i) => (
            <div key={row.label} style={{
              padding:'10px 14px',
              borderBottom: i < rows.length - 2 ? C.border : 'none',
              borderRight:  i % 2 === 0 ? C.border : 'none',
            }}>
              <div style={{ fontSize:'10px', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'3px' }}>
                {row.label}
              </div>
              <div style={{ fontSize:'13px', color:C.text }}>{row.value}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:'8px' }}>
          <button
            onClick={() => { onRemove(doc.id); onClose(); }}
            style={{
              flex:1, padding:'9px', fontSize:'12px', fontWeight:500,
              color:'#c0392b', background:'#fdf2f2', border:'0.5px solid #f5c6cb',
              borderRadius:'9px', cursor:'pointer', fontFamily:C.font,
              display:'flex', alignItems:'center', justifyContent:'center', gap:'5px',
            }}
          >
            <i className="ti ti-trash" style={{ fontSize:'13px' }} />
            Remove from context
          </button>
          <button
            onClick={onClose}
            style={{
              padding:'9px 18px', fontSize:'12px', fontWeight:500,
              color:C.text, background:C.surface, border:C.border,
              borderRadius:'9px', cursor:'pointer', fontFamily:C.font,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Graphs page (D3 force layout 2D) ─────────────────────────────────────────

function GraphsPage({ selected, onToggle }) {
  const svgRef    = useRef(null);
  const simRef    = useRef(null);
  const toggleRef = useRef(onToggle);
  const clickRef  = useRef(null);
  const [tip,      setTip]      = useState(null);
  const [modalDoc, setModalDoc] = useState(null);

  useEffect(() => { toggleRef.current = onToggle; }, [onToggle]);

  // Updated every render — opens modal with clean doc data
  clickRef.current = d => setModalDoc(documents.find(doc => doc.id === d.id) || d);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    setTip(null);

    if (selected.length < 3) return;

    const W = svgEl.clientWidth  || 800;
    const H = svgEl.clientHeight || 600;

    const selDocs  = documents.filter(d => selected.includes(d.id));
    const nodes    = selDocs.map(d => ({ ...d }));
    // Build edge-weight map from co-occurrence data
    const edgeWeightMap = {};
    GRAPH_EDGES.forEach(e => { edgeWeightMap[[e.from, e.to].sort().join('|')] = e.weight; });
    // Connect every pair of selected docs; use co-occurrence weight when available
    const links = [];
    for (let i = 0; i < selDocs.length; i++)
      for (let j = i + 1; j < selDocs.length; j++) {
        const k = [selDocs[i].id, selDocs[j].id].sort().join('|');
        links.push({ source: selDocs[i].id, target: selDocs[j].id, weight: edgeWeightMap[k] || 1 });
      }

    const nodeR = d => 8 + d.weight * 16;

    // Zoom / pan
    const g = svg.append('g');
    svg.call(
      d3.zoom().scaleExtent([0.2, 5]).on('zoom', ev => g.attr('transform', ev.transform))
    ).on('dblclick.zoom', null);

    // Links
    const linkSel = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#c7c7cc')
      .attr('stroke-width', d => 1 + (d.weight || 1))
      .attr('stroke-linecap', 'round');

    // Link weight label (only when weight > 1)
    const linkLblSel = g.append('g')
      .selectAll('text')
      .data(links.filter(l => (l.weight || 1) > 1))
      .join('text')
      .text(d => d.weight + '×')
      .attr('font-size', '10px')
      .attr('font-family', "-apple-system, sans-serif")
      .attr('fill', '#86868b')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('pointer-events', 'none');

    // Nodes
    const nodeSel = g.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', nodeR)
      .attr('fill', d => GRAPH_COLOR[d.type] || '#888')
      .attr('fill-opacity', 0.9)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2.5)
      .attr('cursor', 'pointer')
      .on('mouseenter', (event, d) => {
        const rc = svgEl.getBoundingClientRect();
        setTip({ x: event.clientX - rc.left + 14, y: event.clientY - rc.top - 8, doc: d });
        d3.select(event.currentTarget).attr('stroke', C.accent).attr('stroke-width', 3);
      })
      .on('mousemove', event => {
        const rc = svgEl.getBoundingClientRect();
        setTip(p => p ? { ...p, x: event.clientX - rc.left + 14, y: event.clientY - rc.top - 8 } : null);
      })
      .on('mouseleave', event => {
        setTip(null);
        d3.select(event.currentTarget).attr('stroke', '#ffffff').attr('stroke-width', 2.5);
      })
      .on('click', (event, d) => { event.stopPropagation(); clickRef.current(d); })
      .call(
        d3.drag()
          .on('start', (event, d) => {
            if (!event.active) simRef.current.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on('end',   (event, d) => {
            if (!event.active) simRef.current.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
      );

    // Node labels
    const labelSel = g.append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .text(d => d.name.length > 18 ? d.name.slice(0, 17) + '…' : d.name)
      .attr('font-size', '11px')
      .attr('font-family', "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif")
      .attr('fill', '#1d1d1f')
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none');

    // Simulation
    const sim = d3.forceSimulation(nodes)
      .force('link',      d3.forceLink(links).id(d => d.id).distance(180).strength(0.7))
      .force('charge',    d3.forceManyBody().strength(-600))
      .force('center',    d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(d => nodeR(d) + 10))
      .on('tick', () => {
        linkSel
          .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y);

        linkLblSel
          .attr('x', d => (d.source.x + d.target.x) / 2)
          .attr('y', d => (d.source.y + d.target.y) / 2);

        nodeSel.attr('cx', d => d.x).attr('cy', d => d.y);

        labelSel
          .attr('x', d => d.x)
          .attr('y', d => d.y + nodeR(d) + 14);
      });

    simRef.current = sim;

    return () => {
      sim.stop();
      svg.on('.zoom', null);
    };
  }, [selected]);

  const n  = selected.length;
  const ec = n >= 2 ? n * (n - 1) / 2 : 0;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:C.font }}>
      <div style={{
        padding:'10px 24px', borderBottom:C.border, flexShrink:0,
        display:'flex', alignItems:'center', gap:'12px', background:C.bg,
      }}>
        <span style={{ fontSize:'13px', color:C.muted }}>{n} node{n !== 1 ? 's' : ''}</span>
        <span style={{ color:C.muted }}>·</span>
        <span style={{ fontSize:'13px', color:C.muted }}>{ec} edge{ec !== 1 ? 's' : ''}</span>
        {n >= 3 && (
          <div style={{
            display:'flex', alignItems:'center', gap:'5px',
            background:C.accent+'12', border:'0.5px solid '+C.accent+'30',
            borderRadius:'7px', padding:'3px 10px',
            fontSize:'11px', fontWeight:600, color:C.accent,
          }}>
            <i className="ti ti-vector-triangle" style={{ fontSize:'12px' }} />
            Graph ready
          </div>
        )}
        {n >= 3 && (
          <span style={{ marginLeft:'auto', fontSize:'11px', color:'#c7c7cc' }}>
            Drag nodes · scroll to zoom · click for details
          </span>
        )}
      </div>

      <div style={{ flex:1, position:'relative', overflow:'hidden', background:C.bg }}>
        {n < 3 && (
          <div style={{
            position:'absolute', inset:0, zIndex:1, pointerEvents:'none',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            gap:'10px',
          }}>
            <i className="ti ti-circles-relation" style={{ fontSize:'42px', color:'#e0e0e5' }} />
            <span style={{ fontSize:'13px', color:C.muted }}>
              Selecciona al menos 3 documentos para construir el grafo
            </span>
            {n > 0 && (
              <span style={{ fontSize:'11px', color:'#c7c7cc' }}>
                {n} de 3 seleccionado{n !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        <svg ref={svgRef} style={{ width:'100%', height:'100%', display:'block' }} />

        {tip && (
          <div style={{
            position:'absolute', left:tip.x, top:tip.y, zIndex:10,
            background:C.bg, border:C.border, borderRadius:'10px',
            padding:'10px 14px', minWidth:'150px',
            boxShadow:'0 4px 20px rgba(0,0,0,0.09)',
            pointerEvents:'none',
          }}>
            <div style={{ fontSize:'12px', fontWeight:600, color:C.text, marginBottom:'3px' }}>
              {tip.doc.name}
            </div>
            <div style={{ fontSize:'11px', color:C.muted }}>
              Click para ver detalles
            </div>
          </div>
        )}
      </div>

      {modalDoc && (
        <DocModal
          doc={modalDoc}
          onClose={() => setModalDoc(null)}
          onRemove={onToggle}
        />
      )}
    </div>
  );
}

// ── Visualize page ────────────────────────────────────────────────────────────

function SpreadsheetView({ doc }) {
  const cols = DOC_COLS[doc.id] || ['Col A', 'Col B', 'Col C', 'Col D'];
  const widths = [78, 62, 88, 54, 72, 84, 58, 68, 76, 50];
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
        <thead>
          <tr style={{ background:C.surface }}>
            <th style={{ padding:'8px 14px', color:C.muted, fontWeight:600, borderBottom:C.border, textAlign:'left', fontSize:'11px', width:'36px' }}>#</th>
            {cols.map(col => (
              <th key={col} style={{ padding:'8px 14px', color:C.muted, fontWeight:600, borderBottom:C.border, textAlign:'left', fontSize:'11px', whiteSpace:'nowrap' }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length:9 }, (_, row) => (
            <tr key={row} style={{ borderBottom: row < 8 ? C.border : 'none', background: row%2===0 ? C.bg : C.surface+'80' }}>
              <td style={{ padding:'8px 14px', color:C.muted, fontSize:'11px' }}>{row+1}</td>
              {cols.map((col, j) => (
                <td key={col} style={{ padding:'9px 14px' }}>
                  <div style={{ height:'9px', borderRadius:'3px', background:'#e5e5ea', width:`${widths[(row*cols.length+j) % widths.length]}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PdfView({ doc }) {
  const sections = DOC_SECTIONS[doc.id] || ['Introducción', 'Desarrollo', 'Conclusiones', 'Anexos'];
  const lineGroups = [[88,82,90,76,85,45],[90,84,88,92,38],[86,90,78,88,91,68],[84,90,85,44]];
  return (
    <div style={{ padding:'28px 32px', maxWidth:'560px', margin:'0 auto' }}>
      {/* Document title block */}
      <div style={{ marginBottom:'28px', paddingBottom:'20px', borderBottom:C.border }}>
        <div style={{ height:'16px', background:'#1d1d1f', borderRadius:'4px', width:'72%', marginBottom:'10px' }} />
        <div style={{ height:'10px', background:'#c7c7cc', borderRadius:'3px', width:'42%', marginBottom:'6px' }} />
        <div style={{ height:'10px', background:'#e5e5ea', borderRadius:'3px', width:'28%' }} />
      </div>
      {/* Sections */}
      {sections.map((title, si) => (
        <div key={si} style={{ marginBottom:'28px' }}>
          <div style={{ fontSize:'11px', fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:'10px' }}>
            {title}
          </div>
          {lineGroups[si % lineGroups.length].map((w, li) => (
            <div key={li} style={{ height:'9px', background:'#e5e5ea', borderRadius:'3px', width:`${w}%`, marginBottom:'7px' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function DocPreview({ doc, isSelected, onToggle }) {
  const isSpreadsheet = doc.type === 'xlsx' || doc.type === 'csv';
  return (
    <div style={{
      background:C.bg, borderRadius:'12px', border:C.border,
      boxShadow:'0 2px 24px rgba(0,0,0,0.07)', width:'100%', maxWidth:'700px',
      overflow:'hidden',
    }}>
      {/* Header */}
      <div style={{ padding:'22px 28px', borderBottom:C.border }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:'12px' }}>
          <div style={{
            width:'40px', height:'40px', borderRadius:'10px', flexShrink:0,
            background:TYPE_COLOR[doc.type]+'18',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <i className={'ti '+(TYPE_ICON[doc.type]||'ti-file')} style={{ fontSize:'20px', color:TYPE_COLOR[doc.type] }} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'5px', flexWrap:'wrap' }}>
              <span style={{ fontSize:'16px', fontWeight:600, color:C.text }}>{doc.name}</span>
              <TypeBadge type={doc.type} />
            </div>
            <div style={{ display:'flex', gap:'12px', fontSize:'12px', color:C.muted, flexWrap:'wrap' }}>
              <span>{doc.area}</span>
              <span>·</span>
              <span>{doc.date}</span>
              <span>·</span>
              <span>{fmtSize(doc.size)}</span>
            </div>
          </div>
          <button
            onClick={() => onToggle(doc.id)}
            style={{
              flexShrink:0, padding:'6px 14px', fontSize:'11px', fontWeight:500,
              color:        isSelected ? '#c0392b'      : C.accent,
              background:   isSelected ? '#fdf2f2'      : C.accent+'12',
              border:       isSelected ? '0.5px solid #f5c6cb' : '0.5px solid '+C.accent+'35',
              borderRadius:'8px', cursor:'pointer', fontFamily:C.font,
              display:'flex', alignItems:'center', gap:'5px', whiteSpace:'nowrap',
            }}
          >
            <i className={'ti '+(isSelected?'ti-minus':'ti-plus')} style={{ fontSize:'12px' }} />
            {isSelected ? 'Remove context' : 'Add to context'}
          </button>
        </div>

        {/* Weight bar */}
        <div style={{ marginTop:'16px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'5px' }}>
            <span style={{ fontSize:'10px', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'0.5px' }}>Weight</span>
            <span style={{ fontSize:'11px', fontWeight:600, color:C.text }}>{(doc.weight*100).toFixed(0)}%</span>
          </div>
          <div style={{ height:'4px', background:C.surface, borderRadius:'2px', overflow:'hidden' }}>
            <div style={{ width:`${doc.weight*100}%`, height:'100%', background:C.accent, borderRadius:'2px' }} />
          </div>
        </div>

        {/* Stats chips */}
        <div style={{ display:'flex', gap:'8px', marginTop:'14px', flexWrap:'wrap' }}>
          {[
            { label:'Links',   value:doc.links   },
            { label:'Graphs',  value:doc.graphs  },
            { label:'Queries', value:doc.queries },
          ].map(s => (
            <div key={s.label} style={{
              padding:'3px 10px', borderRadius:'20px', fontSize:'11px',
              background:C.surface, border:C.border, color:C.muted,
            }}>
              <span style={{ color:C.text, fontWeight:600 }}>{s.value}</span> {s.label}
            </div>
          ))}
        </div>
      </div>

      {/* Content preview */}
      {isSpreadsheet ? <SpreadsheetView doc={doc} /> : <PdfView doc={doc} />}
    </div>
  );
}

function VisualizePage({ selected, onToggle }) {
  const [search,  setSearch]  = useState('');
  const [viewId,  setViewId]  = useState(null);

  const selDocs  = documents.filter(d => selected.includes(d.id));
  const filtered = selDocs.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));
  const viewDoc  = selDocs.find(d => d.id === viewId) || null;

  if (selected.length === 0) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:C.font }}>
      <div style={{ textAlign:'center' }}>
        <i className="ti ti-eye" style={{ fontSize:'44px', color:'#e0e0e5', display:'block', marginBottom:'12px' }} />
        <span style={{ fontSize:'13px', color:C.muted }}>Marca documentos en el sidebar para visualizarlos</span>
      </div>
    </div>
  );

  return (
    <div style={{ flex:1, display:'flex', overflow:'hidden', fontFamily:C.font }}>

      {/* ── Left panel: doc list ── */}
      <div style={{
        width:'268px', minWidth:'268px', borderRight:C.border,
        display:'flex', flexDirection:'column', overflow:'hidden', background:C.bg,
      }}>
        {/* Search */}
        <div style={{ padding:'12px', borderBottom:C.border, flexShrink:0 }}>
          <div style={{ position:'relative' }}>
            <i className="ti ti-search" style={{
              position:'absolute', left:'9px', top:'50%', transform:'translateY(-50%)',
              fontSize:'13px', color:C.muted, pointerEvents:'none',
            }} />
            <input
              type="text" placeholder="Search documents…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width:'100%', boxSizing:'border-box',
                padding:'7px 8px 7px 30px', fontSize:'12px',
                border:C.border, borderRadius:'8px', background:C.surface,
                color:C.text, outline:'none', fontFamily:C.font,
              }}
            />
          </div>
        </div>

        {/* Doc list */}
        <div style={{ flex:1, overflow:'auto', padding:'6px' }}>
          {filtered.length === 0 && (
            <div style={{ padding:'20px', textAlign:'center', fontSize:'12px', color:C.muted }}>No results</div>
          )}
          {filtered.map(doc => {
            const isActive = viewId === doc.id;
            return (
              <div key={doc.id} onClick={() => setViewId(doc.id)} style={{
                padding:'10px 12px', borderRadius:'8px', cursor:'pointer', marginBottom:'2px',
                background: isActive ? C.accent+'12' : 'transparent',
                border:     isActive ? '0.5px solid '+C.accent+'35' : '0.5px solid transparent',
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <i className={'ti '+(TYPE_ICON[doc.type]||'ti-file')}
                     style={{ fontSize:'15px', color:TYPE_COLOR[doc.type], flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'12px', fontWeight:500, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {doc.name}
                    </div>
                    <div style={{ fontSize:'10px', color:C.muted, marginTop:'2px' }}>
                      {doc.area} · {fmtSize(doc.size)}
                    </div>
                  </div>
                  <TypeBadge type={doc.type} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer count */}
        <div style={{ padding:'10px 14px', borderTop:C.border, flexShrink:0, fontSize:'11px', color:C.muted }}>
          {filtered.length} document{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── Right panel: viewer ── */}
      <div style={{
        flex:1, overflow:'auto', background:C.surface,
        display:'flex', alignItems:'flex-start', justifyContent:'center',
        padding:'32px 28px',
      }}>
        {!viewDoc ? (
          <div style={{
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            height:'100%', gap:'12px', pointerEvents:'none',
          }}>
            <i className="ti ti-eye" style={{ fontSize:'44px', color:'#e0e0e5' }} />
            <span style={{ fontSize:'13px', color:C.muted }}>Selecciona un documento para visualizarlo</span>
          </div>
        ) : (
          <DocPreview
            doc={viewDoc}
            isSelected={selected.includes(viewDoc.id)}
            onToggle={onToggle}
          />
        )}
      </div>
    </div>
  );
}

// ── Policies data ─────────────────────────────────────────────────────────────

const POLICIES = [
  { id:'p1', name:'Cierre Mensual',    docs:['doc-001','doc-002','doc-006'], roles:['CEO','CFO','Contador'],  status:'active', created:'2024-03-01' },
  { id:'p2', name:'Auditoría Externa', docs:['doc-002','doc-004','doc-005'], roles:['Auditor'],               status:'active', created:'2024-02-15' },
  { id:'p3', name:'Análisis IT',       docs:['doc-002','doc-007'],           roles:['CTO','IT Manager'],      status:'draft',  created:'2024-03-10' },
  { id:'p4', name:'Vista RRHH',        docs:['doc-004'],                     roles:['RRHH'],                  status:'active', created:'2024-01-20' },
];

const ACCESS_LEVELS = [
  { key:'full',    icon:'ti-layout-grid',   label:'Full module',      desc:'Acceso completo a todos los vectores del documento' },
  { key:'doc',     icon:'ti-file-text',     label:'Document only',    desc:'Solo el documento, sin metadatos ni relaciones' },
  { key:'temp',    icon:'ti-clock',         label:'Temporary (24h)',  desc:'Acceso expira automáticamente en 24 horas' },
];

function PoliciesPage() {
  const [selId,    setSelId]    = useState(null);
  const [accessLv, setAccessLv] = useState('full');

  const policy = POLICIES.find(p => p.id === selId) || null;

  return (
    <div style={{ flex:1, display:'flex', overflow:'hidden', fontFamily:C.font }}>

      {/* ── Left panel: policy list ── */}
      <div style={{
        width:'320px', minWidth:'320px', borderRight:C.border,
        display:'flex', flexDirection:'column', overflow:'hidden', background:C.bg,
      }}>
        {/* Header */}
        <div style={{
          padding:'16px 16px 12px', borderBottom:C.border, flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'space-between',
        }}>
          <span style={{ fontSize:'13px', fontWeight:600, color:C.text }}>Policies</span>
          <button style={{
            display:'flex', alignItems:'center', gap:'5px',
            padding:'5px 12px', fontSize:'11px', fontWeight:500,
            color:C.accent, background:C.accent+'12',
            border:'0.5px solid '+C.accent+'35', borderRadius:'8px',
            cursor:'pointer', fontFamily:C.font,
          }}>
            <i className="ti ti-plus" style={{ fontSize:'12px' }} />
            New policy
          </button>
        </div>

        {/* List */}
        <div style={{ flex:1, overflow:'auto', padding:'8px' }}>
          {POLICIES.map(p => {
            const pDocs   = p.docs.map(id => documents.find(d => d.id === id)).filter(Boolean);
            const isActive = p.id === selId;
            return (
              <div key={p.id} onClick={() => { setSelId(p.id); setAccessLv('full'); }} style={{
                padding:'12px 14px', borderRadius:'8px', cursor:'pointer', marginBottom:'4px',
                background: isActive ? C.accent+'10' : C.surface,
                border: isActive ? '0.5px solid '+C.accent+'40' : C.border,
              }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'6px' }}>
                  <span style={{ fontSize:'13px', fontWeight:500, color:C.text }}>{p.name}</span>
                  <span style={{
                    fontSize:'10px', fontWeight:600, padding:'2px 7px', borderRadius:'10px',
                    color:      p.status === 'active' ? '#1a7a4a' : C.muted,
                    background: p.status === 'active' ? '#1a7a4a18' : C.surface,
                    border:     p.status === 'active' ? '0.5px solid #1a7a4a30' : C.border,
                    textTransform:'uppercase', letterSpacing:'0.4px',
                  }}>{p.status}</span>
                </div>
                <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', marginBottom:'6px' }}>
                  {pDocs.map(doc => (
                    <span key={doc.id} style={{
                      fontSize:'10px', padding:'1px 6px', borderRadius:'8px',
                      background:C.bg, border:C.border, color:C.muted,
                      display:'inline-flex', alignItems:'center', gap:'3px',
                    }}>
                      <i className={'ti '+(TYPE_ICON[doc.type]||'ti-file')}
                         style={{ fontSize:'10px', color:TYPE_COLOR[doc.type] }} />
                      {doc.name.length > 18 ? doc.name.slice(0,17)+'…' : doc.name}
                    </span>
                  ))}
                </div>
                <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                  {p.roles.map(r => (
                    <span key={r} style={{
                      fontSize:'10px', padding:'1px 6px', borderRadius:'8px',
                      background:C.accent+'10', color:C.accent, border:'0.5px solid '+C.accent+'25',
                      display:'inline-flex', alignItems:'center', gap:'3px',
                    }}>
                      <i className="ti ti-user" style={{ fontSize:'10px' }} />
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right panel: detail ── */}
      <div style={{ flex:1, overflow:'auto', background:C.surface, padding:'28px' }}>
        {!policy ? (
          <div style={{
            height:'100%', display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center', gap:'12px',
          }}>
            <i className="ti ti-shield-check" style={{ fontSize:'44px', color:'#e0e0e5' }} />
            <span style={{ fontSize:'13px', color:C.muted }}>Selecciona una política para ver su detalle</span>
          </div>
        ) : (
          <div style={{ maxWidth:'640px', margin:'0 auto' }}>

            {/* Policy header */}
            <div style={{
              background:C.bg, borderRadius:'12px', border:C.border,
              padding:'20px 24px', marginBottom:'16px',
              display:'flex', alignItems:'center', justifyContent:'space-between',
            }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'4px' }}>
                  <span style={{ fontSize:'17px', fontWeight:600, color:C.text }}>{policy.name}</span>
                  <span style={{
                    fontSize:'10px', fontWeight:600, padding:'2px 8px', borderRadius:'10px',
                    color:      policy.status === 'active' ? '#1a7a4a' : C.muted,
                    background: policy.status === 'active' ? '#1a7a4a18' : C.surface,
                    border:     policy.status === 'active' ? '0.5px solid #1a7a4a30' : C.border,
                    textTransform:'uppercase', letterSpacing:'0.4px',
                  }}>{policy.status}</span>
                </div>
                <span style={{ fontSize:'11px', color:C.muted }}>
                  Creada el {new Date(policy.created).toLocaleDateString('es-ES', { day:'2-digit', month:'long', year:'numeric' })}
                </span>
              </div>
              <button style={{
                padding:'7px 16px', fontSize:'12px', fontWeight:500,
                color:C.accent, background:C.accent+'12',
                border:'0.5px solid '+C.accent+'35', borderRadius:'8px',
                cursor:'pointer', fontFamily:C.font,
              }}>Edit policy</button>
            </div>

            {/* Documents */}
            <div style={{
              background:C.bg, borderRadius:'12px', border:C.border,
              padding:'18px 24px', marginBottom:'12px',
            }}>
              <div style={{ fontSize:'11px', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'12px' }}>
                Documents in policy
              </div>
              <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                {policy.docs.map(id => {
                  const doc = documents.find(d => d.id === id);
                  if (!doc) return null;
                  return (
                    <div key={id} style={{
                      display:'inline-flex', alignItems:'center', gap:'6px',
                      padding:'6px 12px', borderRadius:'8px',
                      background:C.surface, border:C.border,
                    }}>
                      <i className={'ti '+(TYPE_ICON[doc.type]||'ti-file')}
                         style={{ fontSize:'14px', color:TYPE_COLOR[doc.type] }} />
                      <div>
                        <div style={{ fontSize:'12px', fontWeight:500, color:C.text }}>{doc.name}</div>
                        <div style={{ fontSize:'10px', color:C.muted }}>{doc.area} · {doc.type.toUpperCase()}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Roles */}
            <div style={{
              background:C.bg, borderRadius:'12px', border:C.border,
              padding:'18px 24px', marginBottom:'12px',
            }}>
              <div style={{ fontSize:'11px', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'12px' }}>
                Access roles
              </div>
              <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                {policy.roles.map(r => (
                  <div key={r} style={{
                    display:'inline-flex', alignItems:'center', gap:'6px',
                    padding:'6px 14px', borderRadius:'8px',
                    background:C.accent+'10', border:'0.5px solid '+C.accent+'30',
                  }}>
                    <i className="ti ti-user" style={{ fontSize:'14px', color:C.accent }} />
                    <span style={{ fontSize:'12px', fontWeight:500, color:C.accent }}>{r}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Access level */}
            <div style={{
              background:C.bg, borderRadius:'12px', border:C.border,
              padding:'18px 24px',
            }}>
              <div style={{ fontSize:'11px', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'12px' }}>
                Access level
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'8px' }}>
                {ACCESS_LEVELS.map(lv => {
                  const isOn = accessLv === lv.key;
                  return (
                    <div key={lv.key} onClick={() => setAccessLv(lv.key)} style={{
                      padding:'14px 14px', borderRadius:'10px', cursor:'pointer',
                      background: isOn ? C.accent+'12' : C.surface,
                      border: isOn ? '0.5px solid '+C.accent+'50' : C.border,
                      transition:'all .15s',
                    }}>
                      <i className={'ti '+lv.icon} style={{
                        fontSize:'20px', color: isOn ? C.accent : C.muted,
                        display:'block', marginBottom:'8px',
                      }} />
                      <div style={{ fontSize:'12px', fontWeight:600, color: isOn ? C.accent : C.text, marginBottom:'3px' }}>
                        {lv.label}
                      </div>
                      <div style={{ fontSize:'10px', color:C.muted, lineHeight:'1.4' }}>{lv.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Security note */}
            <p style={{ marginTop:'14px', fontSize:'11px', color:'#aeaeb2', lineHeight:'1.5', textAlign:'center' }}>
              El LLM solo accede a vectores de los documentos permitidos por esta política.
              El control se aplica en la capa de datos, no en el modelo.
            </p>

          </div>
        )}
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [selected,   setSelected]   = useState([]);
  const [page,       setPage]       = useState('chat');
  const [llm,        setLlm]        = useState('claude');
  const [queryStats, setQueryStats] = useState({});
  const [companies,  setCompanies]  = useState([{ id:'c1', name:'Empresa Demo' }]);
  const [activeCo,   setActiveCo]   = useState('c1');
  const [showNewCo,  setShowNewCo]  = useState(false);
  const [newCoName,  setNewCoName]  = useState('');

  const switchCo = coId => setActiveCo(coId);
  const createCo = () => {
    const name = newCoName.trim();
    if (!name) return;
    const id = 'c' + Date.now();
    setCompanies(prev => [...prev, { id, name }]);
    setActiveCo(id);
    setNewCoName(''); setShowNewCo(false);
  };

  const toggle   = id => setSelected(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );
  const clearAll = () => setSelected([]);

  const trackQuery = docIds => {
    const now = new Date().toISOString();
    setQueryStats(prev => {
      const next = { ...prev };
      docIds.forEach(id => {
        next[id] = { count: (prev[id]?.count || 0) + 1, lastAt: now };
      });
      return next;
    });
  };

  return (
    <div style={{
      display:'flex', height:'100vh', overflow:'hidden',
      fontFamily:C.font, background:C.bg, color:C.text,
    }}>
      <Sidebar page={page} onNav={setPage} selected={selected} onToggle={toggle} />

      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <Topbar
          selected={selected} onRemove={toggle} onClearAll={clearAll}
          llm={llm} onLlmChange={setLlm}
          page={page}
          companies={companies} activeCo={activeCo} onSwitchCo={switchCo}
          onNewCo={() => setShowNewCo(true)}
        />
        {showNewCo && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.18)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={() => setShowNewCo(false)}>
            <div style={{ background:C.bg, borderRadius:'16px', padding:'28px', width:'340px', boxShadow:'0 8px 40px rgba(0,0,0,0.15)', fontFamily:C.font }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize:'15px', fontWeight:600, color:C.text, marginBottom:'16px' }}>Nueva empresa</div>
              <input type="text" placeholder="Nombre de la empresa…" value={newCoName}
                onChange={e => setNewCoName(e.target.value)}
                onKeyDown={e => e.key==='Enter' && createCo()}
                autoFocus
                style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', fontSize:'13px', border:C.border, borderRadius:'8px', outline:'none', fontFamily:C.font, color:C.text }}
              />
              <div style={{ display:'flex', gap:'8px', marginTop:'16px', justifyContent:'flex-end' }}>
                <button onClick={() => setShowNewCo(false)} style={{ padding:'7px 16px', fontSize:'12px', border:C.border, borderRadius:'8px', cursor:'pointer', background:'transparent', fontFamily:C.font }}>Cancel</button>
                <button onClick={createCo} style={{ padding:'7px 16px', fontSize:'12px', background:C.accent, color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontFamily:C.font, fontWeight:500 }}>Crear</button>
              </div>
            </div>
          </div>
        )}
        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
          {page === 'documents' && (
            <DocumentsPage selected={selected} onToggle={toggle} activeCo={activeCo} companies={companies} />
          )}
          {page === 'visualize' && (
            <VisualizePage selected={selected} onToggle={toggle} />
          )}
          {page === 'graphs' && (
            <GraphsPage selected={selected} onToggle={toggle} />
          )}
          {page === 'chat' && (
            <ChatPage
              selected={selected} onRemove={toggle}
              llm={llm} onLlmChange={setLlm} onTrackQuery={trackQuery}
            />
          )}
          {page === 'policies' && <PoliciesPage />}
        </div>
      </div>
    </div>
  );
}

// ── Mount ─────────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')).render(<App />);
