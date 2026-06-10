/* global React, ReactDOM */
const { useState } = React;
const { createRoot } = ReactDOM;

// ── Mock data (mirrors data/mock.js) ─────────────────────────────────────────

const documents = [
  { id:'doc-001', name:'Ventas Q1 2026',          type:'xlsx', size:204800,  weight:0.85, links:3,  graphs:5,  queries:12, area:'Comercial',  date:'2026-03-31' },
  { id:'doc-002', name:'Informe Financiero Anual', type:'pdf',  size:1048576, weight:0.92, links:7,  graphs:8,  queries:20, area:'Finanzas',    date:'2026-01-15' },
  { id:'doc-003', name:'Base Clientes 2025',       type:'csv',  size:512000,  weight:0.78, links:1,  graphs:0,  queries:34, area:'Marketing',   date:'2025-12-01' },
  { id:'doc-004', name:'Inventario Almacén',       type:'xlsx', size:307200,  weight:0.65, links:2,  graphs:3,  queries:18, area:'Operaciones', date:'2026-04-10' },
  { id:'doc-005', name:'Reporte de Auditoría',     type:'pdf',  size:2097152, weight:0.97, links:14, graphs:6,  queries:9,  area:'Legal',       date:'2026-02-28' },
  { id:'doc-006', name:'Métricas de Soporte',      type:'csv',  size:153600,  weight:0.55, links:0,  graphs:0,  queries:41, area:'Soporte',     date:'2026-05-20' },
  { id:'doc-007', name:'Plan Estratégico 2026',    type:'pdf',  size:3145728, weight:0.99, links:22, graphs:11, queries:5,  area:'Dirección',   date:'2026-01-02' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtSize = b => b >= 1048576 ? (b/1048576).toFixed(1)+' MB' : (b/1024).toFixed(0)+' KB';

const isThisMonth = dateStr => {
  const d = new Date(dateStr), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
};

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:      '#ffffff',
  surface: '#f5f5f7',
  border:  '0.5px solid #e0e0e5',
  text:    '#1d1d1f',
  muted:   '#86868b',
  accent:  '#0071e3',
  font:    "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
};

const TYPE_COLOR = { xlsx:'#1a7a4a', pdf:'#c0392b', csv:'#2563eb' };
const TYPE_ICON  = { xlsx:'ti-table', pdf:'ti-file-text', csv:'ti-file-spreadsheet' };

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

// ── Sidebar ───────────────────────────────────────────────────────────────────

const NAV = [
  { icon:'ti-files',        label:'Documents', key:'documents' },
  { icon:'ti-chart-bar',    label:'Graphs',    key:'graphs'    },
  { icon:'ti-terminal',     label:'Query',     key:'query'     },
  { icon:'ti-shield-check', label:'Policies',  key:'policies'  },
];

function DocItem({ doc, selected, onToggle }) {
  const isSel = selected.includes(doc.id);
  return (
    <div
      onClick={() => onToggle(doc.id)}
      style={{
        display:'flex', alignItems:'center', gap:'7px',
        padding:'5px 10px', margin:'1px 6px', borderRadius:'6px', cursor:'pointer',
        background: isSel ? C.accent+'12' : 'transparent',
        border: isSel ? '0.5px solid '+C.accent+'35' : '0.5px solid transparent',
      }}
    >
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

function Sidebar({ page, onNav, selected, onToggle }) {
  const [search, setSearch] = useState('');
  const filtered  = documents.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));
  const thisMonth = filtered.filter(d => isThisMonth(d.date));
  const older     = filtered.filter(d => !isThisMonth(d.date));

  return (
    <div style={{
      width:'210px', minWidth:'210px', height:'100vh',
      background:C.surface, borderRight:C.border,
      display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:C.font,
    }}>
      {/* Logo */}
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

      {/* Search */}
      <div style={{ padding:'8px 10px', borderBottom:C.border, flexShrink:0 }}>
        <div style={{ position:'relative' }}>
          <i className="ti ti-search" style={{
            position:'absolute', left:'8px', top:'50%', transform:'translateY(-50%)',
            fontSize:'13px', color:C.muted, pointerEvents:'none',
          }} />
          <input
            type="text"
            placeholder="Search docs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width:'100%', boxSizing:'border-box',
              padding:'5px 8px 5px 28px', fontSize:'12px',
              background:C.bg, border:C.border, borderRadius:'7px',
              color:C.text, outline:'none', fontFamily:C.font,
            }}
          />
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding:'6px 8px 0', flexShrink:0 }}>
        {NAV.map(item => (
          <div
            key={item.key}
            onClick={() => onNav(item.key)}
            style={{
              display:'flex', alignItems:'center', gap:'8px',
              padding:'6px 10px', borderRadius:'7px', marginBottom:'1px',
              cursor:'pointer', fontSize:'13px', fontFamily:C.font,
              fontWeight: page === item.key ? 500 : 400,
              color:      page === item.key ? C.accent : C.text,
              background: page === item.key ? C.accent+'14' : 'transparent',
            }}
          >
            <i className={'ti '+item.icon} style={{ fontSize:'15px' }} />
            {item.label}
          </div>
        ))}
      </nav>

      {/* Doc list */}
      <div style={{
        flex:1, overflow:'auto', paddingTop:'4px',
        borderTop:C.border, marginTop:'8px',
      }}>
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
        {older.length > 0 && (
          <>
            <div style={{
              fontSize:'10px', fontWeight:600, color:C.muted,
              textTransform:'uppercase', letterSpacing:'0.8px', padding:'10px 20px 3px',
            }}>Older</div>
            {older.map(doc => (
              <DocItem key={doc.id} doc={doc} selected={selected} onToggle={onToggle} />
            ))}
          </>
        )}
        {filtered.length === 0 && (
          <div style={{ textAlign:'center', padding:'24px 16px', color:C.muted, fontSize:'12px' }}>
            No results
          </div>
        )}
      </div>

      {/* Upload */}
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

function Topbar({ selected, onRemove }) {
  const [llm, setLlm] = useState('claude');
  const selDocs = documents.filter(d => selected.includes(d.id));

  return (
    <div style={{
      height:'48px', flexShrink:0, background:C.bg,
      borderBottom:C.border, display:'flex', alignItems:'center',
      padding:'0 20px', gap:'8px', fontFamily:C.font,
    }}>
      <div style={{ flex:1, display:'flex', alignItems:'center', gap:'6px', overflow:'hidden' }}>
        {selDocs.length === 0
          ? <span style={{ fontSize:'12px', color:C.muted }}>
              Select documents from the sidebar to cross-reference
            </span>
          : selDocs.map(doc => (
            <div key={doc.id} style={{
              display:'inline-flex', alignItems:'center', gap:'5px',
              background:C.accent+'12', border:'0.5px solid '+C.accent+'40',
              borderRadius:'20px', padding:'3px 8px 3px 10px',
              fontSize:'11px', color:C.accent, fontWeight:500, whiteSpace:'nowrap',
            }}>
              {doc.name}
              <span
                onClick={() => onRemove(doc.id)}
                style={{ cursor:'pointer', display:'flex', alignItems:'center', opacity:0.7 }}
              >
                <i className="ti ti-x" style={{ fontSize:'10px' }} />
              </span>
            </div>
          ))
        }
      </div>

      <select
        value={llm}
        onChange={e => setLlm(e.target.value)}
        style={{
          fontSize:'12px', padding:'5px 10px',
          border:C.border, borderRadius:'7px',
          background:C.surface, color:C.text,
          outline:'none', cursor:'pointer', fontFamily:C.font,
        }}
      >
        <option value="claude">Claude 3.5</option>
        <option value="gpt4o">GPT-4o</option>
        <option value="gemini">Gemini</option>
        <option value="llama">Llama</option>
      </select>
    </div>
  );
}

// ── Documents page ────────────────────────────────────────────────────────────

function DocumentsPage({ selected, onToggle }) {
  return (
    <div style={{ padding:'28px', overflow:'auto', flex:1, fontFamily:C.font }}>
      <h1 style={{
        fontSize:'20px', fontWeight:600, color:C.text,
        marginBottom:'18px', letterSpacing:'-0.3px',
      }}>Documents</h1>

      <div style={{ border:C.border, borderRadius:'10px', overflow:'hidden', background:C.bg }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
          <thead>
            <tr>
              {['', 'Name', 'Type', 'Area', 'Date', 'Size', 'Weight', 'Links', 'Graphs', 'Queries'].map((h, i) => (
                <th key={i} style={{
                  padding:'8px 14px', fontSize:'11px', fontWeight:600,
                  color:C.muted, textAlign: i >= 5 ? 'right' : 'left',
                  letterSpacing:'0.3px', whiteSpace:'nowrap',
                  borderBottom:C.border, background:C.surface,
                  position:'sticky', top:0,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {documents.map((doc, i) => {
              const isSel = selected.includes(doc.id);
              return (
                <tr
                  key={doc.id}
                  onClick={() => onToggle(doc.id)}
                  style={{
                    background: isSel ? C.accent+'0a' : i % 2 === 0 ? C.bg : '#fafafa',
                    cursor:'pointer',
                    borderBottom: i < documents.length - 1 ? C.border : 'none',
                  }}
                >
                  <td style={{ padding:'10px 14px', width:'32px' }}>
                    <div style={{
                      width:'15px', height:'15px', borderRadius:'4px',
                      border: isSel ? 'none' : '0.5px solid #c7c7cc',
                      background: isSel ? C.accent : 'transparent',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}>
                      {isSel && <i className="ti ti-check" style={{ fontSize:'10px', color:'#fff' }} />}
                    </div>
                  </td>
                  <td style={{ padding:'10px 14px', color:C.text, fontWeight:500 }}>{doc.name}</td>
                  <td style={{ padding:'10px 14px' }}><TypeBadge type={doc.type} /></td>
                  <td style={{ padding:'10px 14px', color:C.muted }}>{doc.area}</td>
                  <td style={{ padding:'10px 14px', color:C.muted }}>{doc.date}</td>
                  <td style={{ padding:'10px 14px', color:C.muted, textAlign:'right' }}>{fmtSize(doc.size)}</td>
                  <td style={{ padding:'10px 14px', textAlign:'right' }}>
                    <span style={{ color: doc.weight >= 0.9 ? '#1a7a4a' : doc.weight >= 0.7 ? C.text : C.muted }}>
                      {(doc.weight * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td style={{ padding:'10px 14px', color:C.muted, textAlign:'right' }}>{doc.links}</td>
                  <td style={{ padding:'10px 14px', color:C.muted, textAlign:'right' }}>{doc.graphs}</td>
                  <td style={{ padding:'10px 14px', color:C.muted, textAlign:'right' }}>{doc.queries}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Placeholder pages ─────────────────────────────────────────────────────────

function PlaceholderPage({ title }) {
  return (
    <div style={{
      flex:1, display:'flex', alignItems:'center', justifyContent:'center',
      color:C.muted, fontSize:'14px', fontFamily:C.font,
    }}>
      {title} — coming soon
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [selected, setSelected] = useState([]);
  const [page,     setPage]     = useState('documents');

  const toggle = id =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const pageMap = {
    documents: <DocumentsPage selected={selected} onToggle={toggle} />,
    graphs:    <PlaceholderPage title="Graphs" />,
    query:     <PlaceholderPage title="Query" />,
    policies:  <PlaceholderPage title="Policies" />,
  };

  return (
    <div style={{
      display:'flex', height:'100vh', overflow:'hidden',
      fontFamily:C.font, background:C.bg, color:C.text,
    }}>
      <Sidebar page={page} onNav={setPage} selected={selected} onToggle={toggle} />
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <Topbar selected={selected} onRemove={toggle} />
        <div style={{ flex:1, overflow:'auto', display:'flex', flexDirection:'column' }}>
          {pageMap[page]}
        </div>
      </div>
    </div>
  );
}

// ── Mount ─────────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')).render(<App />);
