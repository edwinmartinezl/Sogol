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
  bg:      '#ffffff',
  surface: '#f5f5f7',
  border:  '0.5px solid #e0e0e5',
  text:    '#1d1d1f',
  muted:   '#86868b',
  accent:  '#0071e3',
  font:    "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
};

const TYPE_COLOR  = { xlsx:'#1a7a4a', pdf:'#c0392b', csv:'#2563eb' };
const TYPE_ICON   = { xlsx:'ti-table', pdf:'ti-file-text', csv:'ti-file-spreadsheet' };
const GRAPH_COLOR = { xlsx:'#34a853', pdf:'#ea4335', csv:'#4285f4' };

// ── 3D graph math ─────────────────────────────────────────────────────────────

const _rotY = (p, a) => ({
  x:  p.x * Math.cos(a) + p.z * Math.sin(a),
  y:  p.y,
  z: -p.x * Math.sin(a) + p.z * Math.cos(a),
});
const _rotX = (p, a) => ({
  x:  p.x,
  y:  p.y * Math.cos(a) - p.z * Math.sin(a),
  z:  p.y * Math.sin(a) + p.z * Math.cos(a),
});
const _proj = (p, cx, cy, fl = 480) => {
  const s = fl / (fl + p.z + 220);
  return { x: cx + p.x * s, y: cy + p.y * s, s };
};

const _fibSphere = (n, r) => {
  const pts = [], phi = Math.PI * (1 + Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y  = 1 - (i / Math.max(n - 1, 1)) * 2;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const t  = phi * i;
    pts.push({ x: Math.cos(t) * rr * r, y: y * r, z: Math.sin(t) * rr * r });
  }
  return pts;
};

const _computeEdges = () => {
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
};

const GRAPH_EDGES   = _computeEdges();
const GRAPH_BASE_3D = _fibSphere(documents.length, 160);

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

// ── Sidebar ───────────────────────────────────────────────────────────────────

const NAV = [
  { icon:'ti-files',        label:'Documents', key:'documents' },
  { icon:'ti-chart-bar',    label:'Graphs',    key:'graphs'    },
  { icon:'ti-messages',     label:'Chat',      key:'chat'      },
  { icon:'ti-shield-check', label:'Policies',  key:'policies'  },
];

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

      <div style={{ padding:'8px 10px', borderBottom:C.border, flexShrink:0 }}>
        <div style={{ position:'relative' }}>
          <i className="ti ti-search" style={{
            position:'absolute', left:'8px', top:'50%', transform:'translateY(-50%)',
            fontSize:'13px', color:C.muted, pointerEvents:'none',
          }} />
          <input type="text" placeholder="Search docs…" value={search}
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

function Topbar({ selected, onRemove, onClearAll, llm, onLlmChange }) {
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
      <div style={{ flex:1, display:'flex', alignItems:'center', gap:'6px', overflow:'hidden', minWidth:0 }}>
        {n === 0
          ? <span style={{ fontSize:'12px', color:C.muted }}>
              Select documents from the sidebar to cross-reference
            </span>
          : selDocs.map(doc => (
            <div key={doc.id} style={{
              display:'inline-flex', alignItems:'center', gap:'5px', flexShrink:0,
              background:C.accent+'12', border:'0.5px solid '+C.accent+'40',
              borderRadius:'20px', padding:'3px 8px 3px 10px',
              fontSize:'11px', color:C.accent, fontWeight:500, whiteSpace:'nowrap',
            }}>
              {doc.name}
              <span onClick={() => onRemove(doc.id)}
                style={{ cursor:'pointer', display:'flex', alignItems:'center', opacity:0.7 }}>
                <i className="ti ti-x" style={{ fontSize:'10px' }} />
              </span>
            </div>
          ))
        }
      </div>

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
    </div>
  );
}

// ── Documents page ────────────────────────────────────────────────────────────

function DocumentsPage({ selected, onToggle }) {
  return (
    <div style={{ padding:'24px 28px', overflow:'auto', flex:1, fontFamily:C.font }}>
      <h1 style={{
        fontSize:'20px', fontWeight:600, color:C.text,
        marginBottom:'16px', letterSpacing:'-0.3px',
      }}>Documents</h1>
      <div style={{ border:C.border, borderRadius:'10px', overflow:'hidden', background:C.bg }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
          <thead>
            <tr>
              {['','Name','Type','Area','Date','Size','Weight','Links','Graphs','Queries'].map((h,i) => (
                <th key={i} style={{
                  padding:'8px 12px', fontSize:'11px', fontWeight:600, color:C.muted,
                  textAlign:i>=5?'right':'left', letterSpacing:'0.3px', whiteSpace:'nowrap',
                  borderBottom:C.border, background:C.surface, position:'sticky', top:0,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {documents.map((doc, i) => {
              const isSel = selected.includes(doc.id);
              return (
                <tr key={doc.id} onClick={() => onToggle(doc.id)} style={{
                  background: isSel ? C.accent+'0a' : i%2===0 ? C.bg : '#fafafa',
                  cursor:'pointer',
                  borderBottom: i < documents.length-1 ? C.border : 'none',
                }}>
                  <td style={{ padding:'9px 12px', width:'32px' }}>
                    <div style={{
                      width:'15px', height:'15px', borderRadius:'4px',
                      border: isSel?'none':'0.5px solid #c7c7cc',
                      background: isSel?C.accent:'transparent',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}>
                      {isSel && <i className="ti ti-check" style={{ fontSize:'10px', color:'#fff' }} />}
                    </div>
                  </td>
                  <td style={{ padding:'9px 12px', color:C.text, fontWeight:500 }}>{doc.name}</td>
                  <td style={{ padding:'9px 12px' }}><TypeBadge type={doc.type} /></td>
                  <td style={{ padding:'9px 12px', color:C.muted }}>{doc.area}</td>
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
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Chat page ─────────────────────────────────────────────────────────────────

function ChatPage({ selected, onRemove, llm, onTrackQuery }) {
  const [messages, setMessages] = useState([...CHAT_HISTORY]);
  const [input,    setInput]    = useState('');
  const bottomRef = useRef(null);

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
    setInput('');
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
          {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div style={{ padding:'12px 20px 20px', flexShrink:0 }}>
        <div style={{ maxWidth:'720px', margin:'0 auto' }}>
          <div style={{ position:'relative' }}>
            <textarea rows={1} value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about these documents…"
              style={{
                width:'100%', boxSizing:'border-box',
                padding:'13px 52px 13px 16px',
                borderRadius:'14px', border:C.border,
                fontSize:'14px', lineHeight:'1.5', resize:'none',
                outline:'none', background:C.bg,
                color:C.text, fontFamily:C.font,
              }}
            />
            <button onClick={send} disabled={!input.trim()} style={{
              position:'absolute', right:'10px', bottom:'10px',
              width:'32px', height:'32px', borderRadius:'50%', border:'none',
              background: input.trim() ? C.accent : '#d1d1d6',
              cursor: input.trim() ? 'pointer' : 'default',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <i className="ti ti-arrow-up" style={{ fontSize:'14px', color:'#fff' }} />
            </button>
          </div>
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'center', gap:'5px',
            padding:'8px 0 0', fontSize:'11px', color:C.muted,
          }}>
            <i className="ti ti-lock" style={{ fontSize:'12px' }} />
            {selected.length} doc{selected.length!==1?'s':''} in context · vectors stored on your server
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Graphs page (3D canvas) ───────────────────────────────────────────────────

function GraphsPage({ selected, onToggle }) {
  const canvasRef  = useRef(null);
  const selRef     = useRef(selected);
  const toggleRef  = useRef(onToggle);
  const projRef    = useRef([]);
  const st         = useRef({ ry:0.5, rx:0.2, drag:null, hover:null, dragged:false });

  useEffect(() => { selRef.current    = selected; }, [selected]);
  useEffect(() => { toggleRef.current = onToggle; }, [onToggle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf;

    const dpr    = () => window.devicePixelRatio || 1;
    const resize = () => {
      const d = dpr(), r = canvas.getBoundingClientRect();
      canvas.width  = r.width  * d;
      canvas.height = r.height * d;
    };

    const draw = () => {
      const d   = dpr();
      const ctx = canvas.getContext('2d');
      const W   = canvas.width, H = canvas.height;
      const cx  = W / 2, cy = H / 2;
      ctx.clearRect(0, 0, W, H);

      // Gentle auto-rotation when idle
      if (!st.current.drag) st.current.ry += 0.004;

      // Transform 3D positions
      const t  = GRAPH_BASE_3D.map(p => _rotX(_rotY(p, st.current.ry), st.current.rx));
      const pr = t.map(p => _proj(p, cx, cy));
      projRef.current = pr;

      // Draw order: back → front
      const ord = documents.map((_, i) => i).sort((a, b) => t[a].z - t[b].z);

      // Edges
      GRAPH_EDGES.forEach(e => {
        const ai = documents.findIndex(d => d.id === e.from);
        const bi = documents.findIndex(d => d.id === e.to);
        if (ai < 0 || bi < 0) return;
        ctx.beginPath();
        ctx.moveTo(pr[ai].x, pr[ai].y);
        ctx.lineTo(pr[bi].x, pr[bi].y);
        ctx.strokeStyle = '#d1d1d6';
        ctx.lineWidth   = (e.weight + 0.5) * d;
        ctx.stroke();
      });

      // Nodes
      const sel = selRef.current;
      ord.forEach(i => {
        const doc   = documents[i];
        const p     = pr[i];
        const depth = Math.min(1, Math.max(0, (t[i].z + 200) / 400));
        const r     = (20 + doc.weight * 20) * p.s * d;
        const isSel = sel.includes(doc.id);
        const isHov = st.current.hover === i;

        // Fill
        ctx.globalAlpha = 0.5 + depth * 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = GRAPH_COLOR[doc.type] || '#888888';
        ctx.fill();

        // Selection / hover ring
        if (isSel || isHov) {
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 3 * d, 0, Math.PI * 2);
          ctx.strokeStyle = isSel ? '#0071e3' : '#555555';
          ctx.lineWidth   = 2 * d;
          ctx.stroke();
        }

        // Label
        const lbl = doc.name.length > 14 ? doc.name.slice(0, 13) + '…' : doc.name;
        const fs  = Math.max(9 * d, Math.round(11 * p.s * d));
        ctx.globalAlpha = 0.45 + depth * 0.55;
        ctx.font        = `${fs}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign   = 'center';
        ctx.fillStyle   = '#1d1d1f';
        ctx.fillText(lbl, p.x, p.y + r + 13 * d);
        ctx.globalAlpha = 1;
      });

      // Tooltip
      const hi = st.current.hover;
      if (hi !== null) {
        const doc  = documents[hi];
        const p    = pr[hi];
        const pd   = 10 * d, lh = 16 * d;
        const tw   = 180 * d, th = 76 * d;
        const nr   = (20 + doc.weight * 20) * p.s * d;
        let tx = p.x + nr + 10 * d;
        let ty = p.y - th / 2;
        if (tx + tw > W - 8 * d) tx = p.x - nr - tw - 10 * d;
        if (ty < 8 * d) ty = 8 * d;
        if (ty + th > H - 8 * d) ty = H - th - 8 * d;

        // Card background
        ctx.fillStyle   = 'rgba(255,255,255,0.97)';
        ctx.strokeStyle = '#e0e0e5';
        ctx.lineWidth   = d;
        const rr = 8 * d;
        ctx.beginPath();
        ctx.moveTo(tx + rr, ty);
        ctx.arcTo(tx + tw, ty,      tx + tw, ty + th, rr);
        ctx.arcTo(tx + tw, ty + th, tx,      ty + th, rr);
        ctx.arcTo(tx,      ty + th, tx,      ty,      rr);
        ctx.arcTo(tx,      ty,      tx + tw, ty,      rr);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Card text
        ctx.textAlign   = 'left';
        ctx.fillStyle   = '#1d1d1f';
        ctx.font        = `bold ${11 * d}px -apple-system, sans-serif`;
        const nameStr   = doc.name.length > 22 ? doc.name.slice(0, 21) + '…' : doc.name;
        ctx.fillText(nameStr, tx + pd, ty + pd + lh * 0.8);
        ctx.font        = `${10 * d}px -apple-system, sans-serif`;
        ctx.fillStyle   = '#86868b';
        ctx.fillText(`Weight: ${(doc.weight * 100).toFixed(0)}%  ·  Area: ${doc.area}`, tx + pd, ty + pd + lh * 1.9);
        ctx.fillText(`Links: ${doc.links}  ·  Queries: ${doc.queries}`, tx + pd, ty + pd + lh * 2.9);
      }

      raf = requestAnimationFrame(draw);
    };

    // Mouse handlers
    const onDown = e => {
      st.current.drag    = { x: e.clientX, y: e.clientY };
      st.current.dragged = false;
    };
    const onMove = e => {
      const d  = dpr();
      const rc = canvas.getBoundingClientRect();
      const mx = (e.clientX - rc.left) * d;
      const my = (e.clientY - rc.top)  * d;

      if (st.current.drag) {
        const dx = e.clientX - st.current.drag.x;
        const dy = e.clientY - st.current.drag.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) st.current.dragged = true;
        st.current.ry += dx * 0.006;
        // Clamp X rotation to avoid flipping
        st.current.rx = Math.max(-1.4, Math.min(1.4, st.current.rx + dy * 0.006));
        st.current.drag = { x: e.clientX, y: e.clientY };
      }

      // Hit test
      let found = null;
      for (let i = documents.length - 1; i >= 0; i--) {
        const p  = projRef.current[i];
        if (!p) continue;
        const r  = (20 + documents[i].weight * 20) * p.s * d;
        const dx = mx - p.x, dy = my - p.y;
        if (dx * dx + dy * dy <= r * r) { found = i; break; }
      }
      st.current.hover         = found;
      canvas.style.cursor      = found !== null ? 'pointer' : (st.current.drag ? 'grabbing' : 'grab');
    };
    const onUp = () => {
      if (!st.current.dragged && st.current.hover !== null)
        toggleRef.current(documents[st.current.hover].id);
      st.current.drag    = null;
      st.current.dragged = false;
    };
    const onLeave = () => { st.current.drag = null; st.current.hover = null; };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement || canvas);
    resize();
    draw();

    canvas.addEventListener('mousedown',  onDown);
    canvas.addEventListener('mousemove',  onMove);
    canvas.addEventListener('mouseup',    onUp);
    canvas.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('mousedown',  onDown);
      canvas.removeEventListener('mousemove',  onMove);
      canvas.removeEventListener('mouseup',    onUp);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  const n  = selected.length;
  const ec = GRAPH_EDGES.length;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:C.font }}>
      <div style={{
        padding:'10px 24px', borderBottom:C.border, flexShrink:0,
        display:'flex', alignItems:'center', gap:'12px', background:C.bg,
      }}>
        <span style={{ fontSize:'13px', color:C.muted }}>{documents.length} nodes</span>
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
        <span style={{ marginLeft:'auto', fontSize:'11px', color:'#c7c7cc' }}>
          Drag to rotate · click to select
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ flex:1, width:'100%', display:'block', cursor:'grab', background:C.bg }}
      />
    </div>
  );
}

// ── Placeholder ───────────────────────────────────────────────────────────────

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
  const [selected,   setSelected]   = useState([]);
  const [page,       setPage]       = useState('chat');
  const [llm,        setLlm]        = useState('claude');
  const [queryStats, setQueryStats] = useState({});

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
          selected={selected} onRemove={toggle}
          onClearAll={clearAll}
          llm={llm} onLlmChange={setLlm}
        />
        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
          {page === 'documents' && (
            <DocumentsPage selected={selected} onToggle={toggle} />
          )}
          {page === 'graphs' && (
            <GraphsPage selected={selected} onToggle={toggle} />
          )}
          {page === 'chat' && (
            <ChatPage
              selected={selected} onRemove={toggle}
              llm={llm} onTrackQuery={trackQuery}
            />
          )}
          {page === 'policies' && <PlaceholderPage title="Policies" />}
        </div>
      </div>
    </div>
  );
}

// ── Mount ─────────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')).render(<App />);
