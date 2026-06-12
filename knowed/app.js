/* global React, ReactDOM */
const { useState, useRef, useEffect } = React;
const { createRoot } = ReactDOM;

// ── Data (mirrors data/mock.js) ───────────────────────────────────────────────

const documents = [];

const CHAT_HISTORY = [];

const LLM_LABELS = { claude:'Claude 3.5', gpt4o:'GPT-4o', gemini:'Gemini', llama:'Llama' };

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtSize = b => b >= 1048576 ? (b/1048576).toFixed(1)+' MB' : (b/1024).toFixed(0)+' KB';

const isThisMonth = dateStr => {
  const d = new Date(dateStr), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
};

// ── API ───────────────────────────────────────────────────────────────────────

const API_BASE  = 'http://localhost:3001/api';
const CLIENT_ID = 'CLI001';

const coSlug = (coId, coList) => {
  if (!coId) return null;
  if (coId === 'c1') return 'empresa-demo';
  const co = coList.find(c => c.id === coId);
  if (!co) return null;
  return co.slug || String(co.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
};

async function apiGetFiles(companyId) {
  const res = await fetch(`${API_BASE}/files?client_id=${CLIENT_ID}&company_id=${companyId}`);
  return res.json();
}

async function apiUpload(file, companyId) {
  const fd = new FormData();
  fd.append('client_id',  CLIENT_ID);
  fd.append('company_id', companyId);
  fd.append('file',       file);
  const res = await fetch(`${API_BASE}/upload`, { method:'POST', body:fd });
  return res.json();
}

async function apiGetCompanies() {
  const res = await fetch(`${API_BASE}/companies?client_id=${CLIENT_ID}`);
  return res.json();
}

async function apiCreateCompany(name) {
  const res = await fetch(`${API_BASE}/companies`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ client_id:CLIENT_ID, name }),
  });
  return res.json();
}

async function apiGetDepts(companySlug) {
  const res = await fetch(`${API_BASE}/departments?company_id=${encodeURIComponent(companySlug)}`);
  return res.json();
}

async function apiCreateDept(companySlug, name, icon) {
  const res = await fetch(`${API_BASE}/departments`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ company_id:companySlug, name, icon }),
  });
  return res.json();
}

async function apiGetGroups(companySlug) {
  const res = await fetch(`${API_BASE}/groups?company_id=${encodeURIComponent(companySlug)}`);
  return res.json();
}

async function apiCreateGroup(companySlug, deptId, name) {
  const res = await fetch(`${API_BASE}/groups`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ company_id:companySlug, dept_id:deptId, name }),
  });
  return res.json();
}

async function apiMoveFile(fileId, deptId, groupId) {
  await fetch(`${API_BASE}/files/${fileId}/move`, {
    method:'PATCH', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ dept_id: deptId || null, group_id: groupId || null }),
  });
}

const normalizeReal = r => ({
  id:       r.id,
  name:     r.original_name,
  type:     r.type,
  size:     r.size_bytes,
  weight:   0.5,
  links:    0,
  graphs:   0,
  queries:  0,
  area:     'Upload',
  date:     r.uploaded_at.slice(0, 10),
  isReal:   true,
  _deptId:  r.dept_id  || null,
  _groupId: r.group_id || null,
});

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:      '#f4f3f1',
  surface: '#eae8e5',
  border:  '0.5px solid #c4c0b8',
  text:    '#28261f',
  muted:   '#8a8780',
  accent:  '#2563eb',
  font:    "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
};

const TYPE_COLOR = {
  pdf:  '#c0392b',              // red
  xlsx: '#1a7a4a', xls: '#1a7a4a',  // excel green
  csv:  '#2a7a4a',              // csv green (slightly diff)
  docx: '#0078d4', doc: '#0078d4',  // word blue
  txt:  '#6b7280',              // neutral gray
};
const TYPE_ICON = {
  pdf:  'ti-file-text',
  xlsx: 'ti-table',    xls: 'ti-table',
  csv:  'ti-file-spreadsheet',
  docx: 'ti-file-word', doc: 'ti-file-word',
  txt:  'ti-file-description',
};
const GRAPH_COLOR = {
  pdf:  '#ea4335',
  xlsx: '#34a853',  xls: '#34a853',
  csv:  '#34a853',
  docx: '#4285f4',  doc: '#4285f4',
  txt:  '#9aa0a6',
};

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

const CHAT_SESSIONS = [];

// ── Sidebar ───────────────────────────────────────────────────────────────────

const NAV = [
  { icon:'ti-files',        label:'Documents',  key:'documents'  },
  { icon:'ti-eye',          label:'Visualizar', key:'visualize'  },
  { icon:'ti-chart-bar',    label:'Graphs',     key:'graphs'     },
  { icon:'ti-messages',     label:'Chat',       key:'chat'       },
  { icon:'ti-shield-check', label:'Policies',   key:'policies'   },
];

const DOC_COLS     = {};
const DOC_SECTIONS = {};

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

function ChatSessionItem({ session, selected, onToggle, isActive, onActivate }) {
  const sessionDocs = session.docs.map(id => documents.find(d => d.id === id)).filter(Boolean);
  const allSelected = session.docs.every(id => selected.includes(id));
  const fmt = d => new Date(d).toLocaleDateString('es-ES', { day:'2-digit', month:'short' });

  const handleClick = () => {
    onActivate();
    session.docs.forEach(id => { if (!selected.includes(id)) onToggle(id); });
  };

  return (
    <div onClick={handleClick} style={{
      margin:'1px 6px', padding:'8px 10px', borderRadius:'6px', cursor:'pointer',
      border: isActive ? '1px solid '+C.accent+'55' : '0.5px solid transparent',
      background: isActive ? C.accent+'0a' : 'transparent',
      transition:'background .12s, border-color .12s',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'5px' }}>
        <i className="ti ti-message-circle" style={{ fontSize:'12px', color: isActive ? C.accent : C.muted, flexShrink:0 }} />
        <span style={{
          fontSize:'11px', color: isActive ? C.accent : C.text, fontWeight: isActive ? 500 : 400, flex:1,
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
                onClick={e => { e.stopPropagation(); onToggle(doc.id); }}
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
  const [search,        setSearch]        = useState('');
  const [activeSession, setActiveSession] = useState(null);
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
            width:'26px', height:'26px', borderRadius:'50%', background:C.accent,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <i className="ti ti-world" style={{ color:'#fff', fontSize:'14px' }} />
          </div>
          <span style={{ fontWeight:600, fontSize:'14px', color:C.text, letterSpacing:'-0.2px' }}>
            Sogol
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
                <ChatSessionItem key={session.id} session={session} selected={selected} onToggle={onToggle} isActive={activeSession===session.id} onActivate={() => setActiveSession(session.id)} />
              ))
            : <div style={{ textAlign:'center', padding:'16px', color:C.muted, fontSize:'12px' }}>No chats found</div>
          }
        </>
      </div>

    </div>
  );
}

// ── Topbar ────────────────────────────────────────────────────────────────────

function Topbar({ selected, onRemove, onClearAll, llm, onLlmChange, page, companies, activeCo, onSwitchCo }) {
  const n  = selected.length;
  const ec = n >= 2 ? n * (n - 1) / 2 : 0;

  return (
    <div style={{
      height:'48px', flexShrink:0, background:C.bg, borderBottom:C.border,
      display:'flex', alignItems:'center', padding:'0 16px', gap:'8px', fontFamily:C.font,
    }}>
      {/* Company selector — visible on all non-documents pages when companies exist */}
      {(companies||[]).length > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <i className="ti ti-building" style={{ fontSize:'13px', color:C.muted }} />
          <select value={activeCo||''} onChange={e => onSwitchCo(e.target.value)} style={{
            fontSize:'12px', padding:'3px 8px', border:C.border, borderRadius:'6px',
            background:C.surface, color:C.text, outline:'none', cursor:'pointer', fontFamily:C.font,
          }}>
            {(companies||[]).map(co => <option key={co.id} value={co.id}>{co.name}</option>)}
          </select>
          <div style={{ width:'0.5px', height:'18px', background:'#e0e0e5' }} />
        </div>
      )}

      {/* Graphs info */}
      {page === 'graphs' && (
        <>
          <span style={{ fontSize:'13px', color:C.muted }}>{n} node{n!==1?'s':''}</span>
          <span style={{ color:C.muted }}>·</span>
          <span style={{ fontSize:'13px', color:C.muted }}>{ec} edge{ec!==1?'s':''}</span>
          {n >= 3 && (
            <div style={{ display:'flex', alignItems:'center', gap:'5px', background:C.accent+'12', border:'0.5px solid '+C.accent+'30', borderRadius:'7px', padding:'3px 10px', fontSize:'11px', fontWeight:600, color:C.accent }}>
              <i className="ti ti-vector-triangle" style={{ fontSize:'12px' }} />
              Graph ready
            </div>
          )}
        </>
      )}

      <div style={{ flex:1 }} />

      {n >= 3 && page === 'graphs' && (
        <span style={{ fontSize:'11px', color:'#c7c7cc' }}>Drag nodes · scroll to zoom · click for details</span>
      )}
    </div>
  );
}

// ── Tree structure ────────────────────────────────────────────────────────────

const TREE = {
  company:        { id:'c1', name:'Mi Empresa' },
  departments:    [],
  groups:         [],
  docAssignments: {},
};

// ── Context menu ─────────────────────────────────────────────────────────────

const CTX_ITEMS = {
  doc: [
    { icon:'ti-folder',          label:'Move to folder',    action:'move'                   },
    { icon:'ti-copy',            label:'Copy',              action:'copy'                   },
    { icon:'ti-link',            label:'Add to context',    action:'context'                },
    { icon:'ti-file-text',       label:'Ver PDF',           action:'viewpdf', onlyRealPdf:true },
    { icon:'ti-info-circle',     label:'Details',           action:'details'                },
    { sep:true },
    { icon:'ti-trash',           label:'Delete',            action:'delete', danger:true    },
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
    { sep:true },
    { icon:'ti-checkbox',        label:'Deseleccionar todo', action:'clearall', onlyIfSelected:true },
  ],
  blank_inner: [
    { icon:'ti-folder-plus',     label:'New folder',        action:'newfolder'  },
    { icon:'ti-upload',          label:'Upload document',   action:'upload'     },
  ],
};

function ContextMenu({ menu, onClose, onAction }) {
  if (!menu.visible) return null;
  const allItems = CTX_ITEMS[menu.type] || [];
  const items    = allItems.filter(item =>
    (!item.onlyRealPdf  || menu.docIsRealPdf) &&
    (!item.onlyIfSelected || menu.hasSelected)
  );
  const flipX    = menu.x + 196 > window.innerWidth;
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

function DocumentsPage({ selected, onToggle, onClearAll, activeCo, companies, onNewCo, onSwitchCo, search, onSearch, viewMode, onViewMode, onGlobalToast, onGoVisualize, onRealDocsChange, docStats }) {
  const [nav,         setNav]         = useState({ view:'all', deptId:null, groupId:null });
  const [assign,      setAssign]      = useState(TREE.docAssignments);
  const [groups,      setGroups]      = useState([...TREE.groups]);
  const [departments, setDepartments] = useState([...TREE.departments]);
  const [dragDocId,   setDragDocId]   = useState(null);
  const [dragGroupId, setDragGroupId] = useState(null);
  const [dragOverId,  setDragOverId]  = useState(null);
  const [ctxMenu,     setCtxMenu]     = useState({ visible:false, x:0, y:0, type:'blank', targetId:null });
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewDept,   setShowNewDept]   = useState(false);
  const [newDeptName,   setNewDeptName]   = useState('');
  const [realDocs,      setRealDocs]      = useState([]);
  const [toast,         setToast]         = useState(null);
  const [vecModal,      setVecModal]      = useState(null); // { file, resultReady, result, error }
  const [modalDoc,      setModalDoc]      = useState(null);
  const [moveDocId,     setMoveDocId]     = useState(null);
  const uploadRef = useRef(null);

  const allDocs      = [...documents, ...realDocs];
  const q            = search.toLowerCase();
  const effW = doc => {
    const q = docStats?.[doc.id]?.queries || 0;
    return q > 0 ? Math.min(1, q / 10) : doc.weight;
  };
  const docsForGroup = gId => allDocs.filter(d => assign[d.id]?.groupId === gId);
  const docsForDept  = dId => allDocs.filter(d => assign[d.id]?.deptId  === dId);
  const docsLoose    = dId => docsForDept(dId).filter(d => !assign[d.id]?.groupId);

  const curDept  = departments.find(d => d.id === nav.deptId) || null;
  const curGroup = groups.find(g => g.id === nav.groupId)          || null;

  const goTo     = (view, deptId = null, groupId = null) => { setNav({ view, deptId, groupId }); onSearch(''); };
  const closeCtx = () => setCtxMenu(m => ({ ...m, visible:false }));
  const openCtx  = (e, type, targetId = null) => {
    e.preventDefault(); e.stopPropagation();
    const allD = [...documents, ...realDocs];
    const doc  = type === 'doc' ? allD.find(d => d.id === targetId) : null;
    setCtxMenu({ visible:true, x:e.clientX, y:e.clientY, type, targetId, docIsRealPdf: !!(doc?.isReal && doc?.type === 'pdf'), hasSelected: selected.length > 0 });
  };
  const clearDrag = () => { setDragDocId(null); setDragGroupId(null); setDragOverId(null); };

  useEffect(() => {
    setNav({ view:'all', deptId:null, groupId:null });
    setDepartments([]); setGroups([]); setAssign({}); setRealDocs([]);
    const slug = coSlug(activeCo, companies);
    if (!slug) return;

    // Load depts and groups from API
    apiGetDepts(slug).then(rows => {
      if (Array.isArray(rows)) setDepartments(rows.map(r => ({ id:r.id, name:r.name, icon:r.icon || 'ti-folder' })));
    }).catch(() => {});
    apiGetGroups(slug).then(rows => {
      if (Array.isArray(rows)) setGroups(rows.map(r => ({ id:r.id, name:r.name, deptId:r.dept_id })));
    }).catch(() => {});

    // Load real files
    apiGetFiles(slug).then(rows => {
      if (!Array.isArray(rows)) return;
      const norm = rows.map(normalizeReal);
      setRealDocs(norm);
      onRealDocsChange?.(norm);
      setAssign(prev => {
        const next = { ...prev };
        norm.forEach(d => {
          if (!next[d.id]) next[d.id] = { deptId: d._deptId || null, groupId: d._groupId || null };
        });
        return next;
      });
    }).catch(() => {});
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
      const g = tGroupId || null;
      setAssign(prev => ({ ...prev, [dragDocId]: { deptId:tDeptId, groupId:g } }));
      apiMoveFile(dragDocId, tDeptId, g).catch(() => {});
      setDragDocId(null);
    } else if (dragGroupId && !tGroupId) {
      setGroups(prev => prev.map(g => g.id === dragGroupId ? { ...g, deptId:tDeptId } : g));
      setDragGroupId(null);
    }
    setDragOverId(null);
  };

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const doUpload = async (file, targetDeptId = null, targetGroupId = null) => {
    const slug = coSlug(activeCo, companies);
    if (!slug) { showToast('Selecciona una empresa primero'); return; }  // local toast OK here
    setVecModal({ file, resultReady:false, result:null, error:null });
    try {
      const result = await apiUpload(file, slug);
      if (result.error) {
        setVecModal(m => m ? { ...m, resultReady:true, error:result.error } : null);
        return;
      }
      const norm = normalizeReal(result);
      const assignDept  = targetDeptId  || nav.deptId  || null;
      const assignGroup = targetGroupId || nav.groupId || null;
      setRealDocs(prev => { const next = [norm, ...prev]; onRealDocsChange?.(next); return next; });
      setAssign(prev => ({ ...prev, [norm.id]: { deptId: assignDept, groupId: assignGroup } }));
      if (assignDept || assignGroup) apiMoveFile(norm.id, assignDept, assignGroup).catch(() => {});
      setVecModal(m => m ? { ...m, resultReady:true, result } : null);
    } catch {
      setVecModal(m => m ? { ...m, resultReady:true, error:'Server offline' } : null);
    }
  };

  const createDept = async () => {
    const name = newDeptName.trim();
    if (!name) return;
    const DEPT_ICONS = ['ti-building-bank','ti-cpu','ti-chart-bar','ti-users','ti-settings','ti-briefcase','ti-folder'];
    const icon = DEPT_ICONS[departments.length % DEPT_ICONS.length];
    setNewDeptName(''); setShowNewDept(false);
    const slug = coSlug(activeCo, companies);
    if (slug) {
      try {
        const r = await apiCreateDept(slug, name, icon);
        if (r?.id) { setDepartments(prev => [...prev, { id:r.id, name:r.name, icon:r.icon }]); return; }
        onGlobalToast?.('Error al guardar departamento: ' + (r?.error || 'sin respuesta'), 'warn');
      } catch {
        onGlobalToast?.('Servidor offline — departamento solo en memoria', 'warn');
      }
    }
    setDepartments(prev => [...prev, { id:'dep'+Date.now(), name, icon }]);
  };

  const handleCtxAction = (action, targetId) => {
    if (action === 'newfolder') {
      setNewFolderName(''); setShowNewFolder(true);
    } else if (action === 'newdept') {
      setNewDeptName(''); setShowNewDept(true);
    } else if (action === 'upload') {
      uploadRef.current?.click();
    } else if (action === 'viewpdf') {
      const doc = [...documents, ...realDocs].find(d => d.id === targetId);
      if (doc?.isReal && doc?.type === 'pdf') onGoVisualize?.(doc);
    } else if (action === 'details') {
      const doc = [...documents, ...realDocs].find(d => d.id === targetId);
      if (doc) setModalDoc(doc);
    } else if (action === 'move') {
      setMoveDocId(targetId);
    } else if (action === 'clearall') {
      onClearAll?.();
    }
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setNewFolderName(''); setShowNewFolder(false);
    if (nav.view !== 'dept' && nav.view !== 'group') return;
    const slug = coSlug(activeCo, companies);
    if (slug && nav.deptId) {
      try {
        const r = await apiCreateGroup(slug, nav.deptId, name);
        if (r?.id) { setGroups(prev => [...prev, { id:r.id, name:r.name, deptId:r.dept_id }]); return; }
        onGlobalToast?.('Error al guardar carpeta: ' + (r?.error || 'sin respuesta'), 'warn');
      } catch {
        onGlobalToast?.('Servidor offline — carpeta solo en memoria', 'warn');
      }
    }
    setGroups(prev => [...prev, { id:'g'+Date.now(), name, deptId: nav.deptId }]);
  };


  // ── row renderer ─────────────────────────────────────────────────────────

  const renderRow = (doc, i, total, showLoc) => {
    const isSel = selected.includes(doc.id);
    const a   = assign[doc.id];
    const dep = a ? departments.find(x => x.id === a.deptId) : null;
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
          {(() => { const w=effW(doc); return <span style={{ color:w>=0.9?'#1a7a4a':w>=0.7?C.text:C.muted }}>{(w*100).toFixed(0)}%</span>; })()}
        </td>
        <td style={{ padding:'9px 12px', color:C.muted, textAlign:'right' }}>{doc.links}</td>
        <td style={{ padding:'9px 12px', color:C.muted, textAlign:'right' }}>{doc.graphs}</td>
        <td style={{ padding:'9px 12px', color:C.muted, textAlign:'right' }}>{docStats?.[doc.id]?.queries || doc.queries}</td>
      </tr>
    );
  };

  const renderCard = (doc, showLoc = false) => {
    const isSel = selected.includes(doc.id);
    const a   = assign[doc.id];
    const dep = a ? departments.find(x => x.id === a.deptId) : null;
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
            {doc.isReal && <span style={{ fontSize:'9px', fontWeight:700, padding:'1px 5px', borderRadius:'4px', color:'#1a7a4a', background:'#1a7a4a18', textTransform:'uppercase', letterSpacing:'0.4px' }}>Real</span>}
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
          <div style={{ height:'100%', width:(effW(doc)*100)+'%', borderRadius:'2px',
            background: TYPE_COLOR[doc.type] || C.accent }} />
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

  const activeCoDef = companies.find(c => c.id === activeCo) || null;
  const crumbs = [{ label: activeCoDef?.name || '—', go: activeCo ? (nav.view === 'all' ? () => onSwitchCo(null) : () => goTo('all')) : null }];
  if (nav.view === 'flat') crumbs.push({ label:'All documents', go: null });
  if (nav.view === 'dept' || nav.view === 'group')
    crumbs.push({ label: curDept?.name, go: () => goTo('dept', nav.deptId) });
  if (nav.view === 'group')
    crumbs.push({ label: curGroup?.name, go: null });

  // ── content ───────────────────────────────────────────────────────────────

  let content;

  if (nav.view === 'flat') {
    const filt = d => !q || d.name.toLowerCase().includes(q);
    const unassigned = allDocs.filter(d => !assign[d.id]?.deptId && filt(d));

    const DeptHeader = ({ dept }) => (
      <div style={{
        display:'flex', alignItems:'center', gap:'10px',
        padding:'10px 0 10px', marginBottom:'4px',
        borderBottom:'2px solid '+C.accent+'30',
      }}>
        <div style={{
          width:'32px', height:'32px', borderRadius:'8px',
          background:C.accent+'12', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
        }}>
          <i className={'ti '+(dept.icon||'ti-building')} style={{ fontSize:'16px', color:C.accent }} />
        </div>
        <span style={{ fontSize:'16px', fontWeight:700, color:C.text, letterSpacing:'-0.2px' }}>{dept.name}</span>
        <span style={{
          fontSize:'10px', color:C.muted, background:C.surface,
          borderRadius:'20px', padding:'2px 8px', fontWeight:600,
        }}>{docsForDept(dept.id).filter(filt).length}</span>
      </div>
    );

    const GroupHeader = ({ grp, count }) => (
      <div style={{
        display:'flex', alignItems:'center', gap:'7px',
        padding:'8px 0 6px', marginTop:'12px', marginBottom:'2px',
      }}>
        <i className="ti ti-folder-filled" style={{ fontSize:'14px', color:'#92400e' }} />
        <span style={{ fontSize:'12px', fontWeight:600, color:'#78350f', textTransform:'uppercase', letterSpacing:'0.5px' }}>{grp.name}</span>
        <span style={{
          fontSize:'10px', color:C.muted, background:C.surface,
          borderRadius:'20px', padding:'1px 6px', fontWeight:600,
        }}>{count}</span>
      </div>
    );

    const sectionDepts = departments.filter(dep => {
      if (docsForDept(dep.id).filter(filt).length > 0) return true;
      if (!q) return true;
      return false;
    });

    content = (
      <div style={{ display:'flex', flexDirection:'column', gap:'28px' }}>
        {sectionDepts.map(dept => {
          const deptGroups = groups.filter(g => g.deptId === dept.id);
          const deptGroupsWithDocs = deptGroups.filter(g => docsForGroup(g.id).filter(filt).length > 0);
          const loose = docsLoose(dept.id).filter(filt);
          if (q && deptGroupsWithDocs.length === 0 && loose.length === 0) return null;
          return (
            <div key={dept.id}>
              <DeptHeader dept={dept} />
              {deptGroupsWithDocs.map(grp => {
                const grpDocs = docsForGroup(grp.id).filter(filt);
                return (
                  <div key={grp.id} style={{ marginLeft:'16px' }}>
                    <GroupHeader grp={grp} count={grpDocs.length} />
                    <div style={{ marginLeft:'4px' }}>{renderDocs(grpDocs, false)}</div>
                  </div>
                );
              })}
              {loose.length > 0 && (
                <div style={{ marginLeft:'16px' }}>
                  {deptGroupsWithDocs.length > 0 && (
                    <div style={{ display:'flex', alignItems:'center', gap:'7px', padding:'8px 0 6px', marginTop:'12px', marginBottom:'2px' }}>
                      <i className="ti ti-folder" style={{ fontSize:'14px', color:C.muted }} />
                      <span style={{ fontSize:'12px', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'0.5px' }}>Sin carpeta</span>
                      <span style={{ fontSize:'10px', color:C.muted, background:C.surface, borderRadius:'20px', padding:'1px 6px', fontWeight:600 }}>{loose.length}</span>
                    </div>
                  )}
                  <div style={{ marginLeft:'4px' }}>{renderDocs(loose, false)}</div>
                </div>
              )}
            </div>
          );
        })}

        {unassigned.length > 0 && (
          <div>
            <div style={{
              display:'flex', alignItems:'center', gap:'10px',
              padding:'10px 0 10px', marginBottom:'4px',
              borderBottom:'2px solid #c4c0b830',
            }}>
              <div style={{
                width:'32px', height:'32px', borderRadius:'8px',
                background:C.surface, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
              }}>
                <i className="ti ti-inbox" style={{ fontSize:'16px', color:C.muted }} />
              </div>
              <span style={{ fontSize:'16px', fontWeight:700, color:C.muted }}>Sin departamento</span>
              <span style={{ fontSize:'10px', color:C.muted, background:C.surface, borderRadius:'20px', padding:'2px 8px', fontWeight:600 }}>{unassigned.length}</span>
            </div>
            {renderDocs(unassigned, false)}
          </div>
        )}

        {sectionDepts.length === 0 && unassigned.length === 0 && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'200px', gap:'8px', color:C.muted }}>
            <i className="ti ti-files-off" style={{ fontSize:'32px' }} />
            <span style={{ fontSize:'13px' }}>No hay documentos{q ? ` para "${q}"` : ''}</span>
          </div>
        )}
      </div>
    );
  }
  else if (nav.view === 'all') {
    if (!activeCo) {
      // ── Company cards (or empty state if none exist) ──────────────────────
      if (companies.length === 0) {
        content = (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:'12px', userSelect:'none' }}>
            <div style={{ width:'64px', height:'64px', borderRadius:'20px', background:C.surface, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'4px' }}>
              <i className="ti ti-building" style={{ fontSize:'30px', color:'#c4c0b8' }} />
            </div>
            <div style={{ fontSize:'16px', fontWeight:600, color:C.text }}>Sin empresas</div>
            <div style={{ fontSize:'13px', color:C.muted, textAlign:'center', maxWidth:'280px', lineHeight:'1.7' }}>
              Crea tu primera empresa para empezar a organizar documentos, departamentos y equipos.
            </div>
            <button onClick={onNewCo} style={{ marginTop:'4px', display:'flex', alignItems:'center', gap:'7px', padding:'9px 22px', fontSize:'13px', fontWeight:600, color:'#fff', background:C.accent, border:'none', borderRadius:'10px', cursor:'pointer', fontFamily:C.font }}>
              <i className="ti ti-plus" style={{ fontSize:'14px' }} /> New company
            </button>
          </div>
        );
      } else {
        const coFiltered = companies.filter(co => !q || co.name.toLowerCase().includes(q));
        content = (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'12px' }}>
            {coFiltered.map(co => (
              <div key={co.id}
                onClick={() => onSwitchCo(co.id)}
                style={{ background:C.bg, cursor:'pointer', border:C.border, borderRadius:'12px', padding:'20px', transition:'all .1s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = C.accent+'08'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.background = C.bg; }}
              >
                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'14px' }}>
                  <div style={{ width:'36px', height:'36px', borderRadius:'9px', background:C.accent+'14', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <i className="ti ti-building" style={{ fontSize:'18px', color:C.accent }} />
                  </div>
                  <span style={{ fontSize:'14px', fontWeight:600, color:C.text }}>{co.name}</span>
                </div>
                <div style={{ fontSize:'11px', color:C.muted }}>Click para entrar</div>
              </div>
            ))}
            <div onClick={onNewCo}
              style={{ cursor:'pointer', border:'0.5px dashed #c4c0b8', borderRadius:'12px', padding:'20px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'96px', gap:'8px', color:C.muted, transition:'all .1s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#c4c0b8'; e.currentTarget.style.color = C.muted; }}
            >
              <i className="ti ti-plus" style={{ fontSize:'20px' }} />
              <div style={{ fontSize:'12px', fontWeight:500 }}>Nueva empresa</div>
            </div>
          </div>
        );
      }
    } else {
      // ── Department cards ──────────────────────────────────────────────────
      const depts = departments.filter(dep =>
        !q || dep.name.toLowerCase().includes(q) || docsForDept(dep.id).some(d => d.name.toLowerCase().includes(q))
      );
      const unassigned = allDocs.filter(d => !assign[d.id]?.deptId && (!q || d.name.toLowerCase().includes(q)));
      const deptGrid = (
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
      if (depts.length === 0 && unassigned.length === 0) {
        content = (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:'12px', userSelect:'none' }}>
            <div style={{ width:'64px', height:'64px', borderRadius:'20px', background:C.surface, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'4px' }}>
              <i className="ti ti-layout-grid" style={{ fontSize:'30px', color:'#c4c0b8' }} />
            </div>
            <div style={{ fontSize:'16px', fontWeight:600, color:C.text }}>Sin departamentos</div>
            <div style={{ fontSize:'13px', color:C.muted, textAlign:'center', maxWidth:'280px', lineHeight:'1.7' }}>
              Crea tu primer departamento para organizar documentos y equipos.
            </div>
            <button onClick={() => { setNewDeptName(''); setShowNewDept(true); }} style={{ marginTop:'4px', display:'flex', alignItems:'center', gap:'7px', padding:'9px 22px', fontSize:'13px', fontWeight:600, color:'#fff', background:C.accent, border:'none', borderRadius:'10px', cursor:'pointer', fontFamily:C.font }}>
              <i className="ti ti-plus" style={{ fontSize:'14px' }} /> New department
            </button>
          </div>
        );
      } else {
        content = (
          <div>
            {depts.length > 0 && deptGrid}
            {unassigned.length > 0 && (
              <div style={{ marginTop: depts.length > 0 ? '28px' : 0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
                  <span style={{ fontSize:'11px', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'0.6px' }}>Sin departamento</span>
                  <span style={{ fontSize:'10px', color:C.muted, background:C.surface, borderRadius:'4px', padding:'1px 6px' }}>{unassigned.length}</span>
                </div>
                {renderDocs(unassigned)}
              </div>
            )}
          </div>
        );
      }
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
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', minHeight:'320px', gap:'12px', userSelect:'none' }}>
            <div style={{ width:'64px', height:'64px', borderRadius:'20px', background:C.surface, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'4px' }}>
              <i className="ti ti-folder" style={{ fontSize:'30px', color:'#c4c0b8' }} />
            </div>
            <div style={{ fontSize:'16px', fontWeight:600, color:C.text }}>Departamento vacío</div>
            <div style={{ fontSize:'13px', color:C.muted, textAlign:'center', maxWidth:'280px', lineHeight:'1.7' }}>
              Crea una carpeta para organizar documentos o sube archivos directamente.
            </div>
            <div style={{ display:'flex', gap:'10px', marginTop:'4px' }}>
              <button onClick={() => { setNewFolderName(''); setShowNewFolder(true); }} style={{ display:'flex', alignItems:'center', gap:'7px', padding:'9px 20px', fontSize:'13px', fontWeight:600, color:'#fff', background:C.accent, border:'none', borderRadius:'10px', cursor:'pointer', fontFamily:C.font }}>
                <i className="ti ti-folder-plus" style={{ fontSize:'14px' }} /> New folder
              </button>
              <button onClick={() => uploadRef.current?.click()} style={{ display:'flex', alignItems:'center', gap:'7px', padding:'9px 20px', fontSize:'13px', fontWeight:500, color:C.text, background:'transparent', border:C.border, borderRadius:'10px', cursor:'pointer', fontFamily:C.font }}>
                <i className="ti ti-upload" style={{ fontSize:'14px' }} /> Upload document
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
  else if (nav.view === 'group') {
    const docs = docsForGroup(nav.groupId).filter(d => !q || d.name.toLowerCase().includes(q));
    content = docs.length === 0 ? (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', minHeight:'320px', gap:'12px', userSelect:'none' }}>
        <div style={{ width:'64px', height:'64px', borderRadius:'20px', background:C.surface, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'4px' }}>
          <i className="ti ti-file-upload" style={{ fontSize:'30px', color:'#c4c0b8' }} />
        </div>
        <div style={{ fontSize:'16px', fontWeight:600, color:C.text }}>Carpeta vacía</div>
        <div style={{ fontSize:'13px', color:C.muted, textAlign:'center', maxWidth:'280px', lineHeight:'1.7' }}>
          Sube documentos a <strong style={{ color:C.text }}>{curGroup?.name}</strong> para empezar.
        </div>
        <button onClick={() => uploadRef.current?.click()} style={{ marginTop:'4px', display:'flex', alignItems:'center', gap:'7px', padding:'9px 22px', fontSize:'13px', fontWeight:600, color:'#fff', background:C.accent, border:'none', borderRadius:'10px', cursor:'pointer', fontFamily:C.font }}>
          <i className="ti ti-upload" style={{ fontSize:'14px' }} /> Upload document
        </button>
      </div>
    ) : <div>{renderDocs(docs)}</div>;
  }

  // ── shell ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:C.font }}>

      {/* Combined header — one bar */}
      <div style={{ height:'48px', flexShrink:0, background:C.bg, borderBottom:C.border, display:'flex', alignItems:'center', padding:'0 16px', gap:'8px', fontFamily:C.font }}>

        {/* Company selector */}
        <i className="ti ti-building" style={{ fontSize:'13px', color:C.muted, flexShrink:0 }} />
        {companies.length > 0 && (
          <select value={activeCo||''} onChange={e => onSwitchCo(e.target.value)} style={{ fontSize:'12px', padding:'3px 8px', border:C.border, borderRadius:'6px', background:C.surface, color:C.text, outline:'none', cursor:'pointer', fontFamily:C.font, flexShrink:0 }}>
            {companies.map(co => <option key={co.id} value={co.id}>{co.name}</option>)}
          </select>
        )}

        {/* Breadcrumb */}
        {activeCo && (
          <>
            <div style={{ width:'0.5px', height:'18px', background:'#e0e0e5', flexShrink:0 }} />
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color:'#c7c7cc', fontSize:'13px', padding:'0 2px' }}>›</span>}
                <span onClick={c.go || undefined} style={{ fontSize:'13px', fontWeight: i===crumbs.length-1?600:400, color: c.go?C.accent:C.text, cursor: c.go?'pointer':'default', whiteSpace:'nowrap' }}>{c.label}</span>
              </React.Fragment>
            ))}
            {nav.view === 'all' && (
              <>
                <span style={{ color:'#c7c7cc', fontSize:'13px', padding:'0 4px' }}>·</span>
                <span onClick={() => goTo('flat')} style={{ fontSize:'12px', color:C.muted, cursor:'pointer', textDecoration:'underline', whiteSpace:'nowrap' }}>All documents</span>
              </>
            )}
          </>
        )}

        <div style={{ flex:1 }} />

        {/* Right: doc count + search + view toggles */}
        {activeCo && (
          <>
            {selected.length > 0 && (
              <button onClick={onClearAll} style={{
                display:'flex', alignItems:'center', gap:'5px', padding:'5px 10px',
                fontSize:'11px', fontWeight:600, border:C.border, borderRadius:'7px',
                background:C.surface, color:C.muted, cursor:'pointer', fontFamily:C.font, flexShrink:0,
              }}>
                <i className="ti ti-square-x" style={{ fontSize:'12px' }} />
                {selected.length} seleccionado{selected.length!==1?'s':''} · Deseleccionar
              </button>
            )}
            <span style={{ fontSize:'11px', color:C.muted, flexShrink:0 }}>{allDocs.length} docs</span>
            <div style={{ position:'relative', flexShrink:0 }}>
              <i className="ti ti-search" style={{ position:'absolute', left:'8px', top:'50%', transform:'translateY(-50%)', fontSize:'12px', color:C.muted, pointerEvents:'none' }} />
              <input type="text" placeholder="Search…" value={search} onChange={e => onSearch(e.target.value)} style={{ padding:'5px 10px 5px 26px', fontSize:'12px', width:'160px', border:C.border, borderRadius:'7px', background:C.surface, color:C.text, outline:'none', fontFamily:C.font }} />
            </div>
            {['grid','list'].map(mode => (
              <button key={mode} onClick={() => onViewMode(mode)} style={{ width:'30px', height:'30px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'7px', cursor:'pointer', border:C.border, background: viewMode===mode?C.accent+'14':'transparent', color: viewMode===mode?C.accent:C.muted, flexShrink:0 }}>
                <i className={'ti '+(mode==='grid'?'ti-layout-grid':'ti-list')} style={{ fontSize:'14px' }} />
              </button>
            ))}
          </>
        )}
      </div>


      {/* Content */}
      <div style={{ flex:1, overflow:'auto', padding:'20px 24px', display:'flex', flexDirection:'column' }} onContextMenu={e => openCtx(e, nav.view === 'all' ? 'blank' : 'blank_inner')}>{content}</div>

      {/* Context menu */}
      <ContextMenu menu={ctxMenu} onClose={closeCtx} onAction={handleCtxAction} />

      {/* Hidden upload input */}
      <input ref={uploadRef} type="file" accept=".pdf,.txt,.xlsx" style={{ display:'none' }}
        onChange={e => { const f = e.target.files[0]; if (f) doUpload(f); e.target.value = ''; }}
      />

      {/* Toast */}
      {toast && (
        <div style={{
          position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)',
          background:C.text, color:'#fff', borderRadius:'10px', padding:'8px 18px',
          fontSize:'12px', fontWeight:500, zIndex:3000,
          boxShadow:'0 4px 20px rgba(0,0,0,0.15)', pointerEvents:'none',
        }}>{toast}</div>
      )}

      {/* New folder modal */}
      {showNewFolder && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.18)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setShowNewFolder(false)}>
          <div style={{ background:C.bg, borderRadius:'16px', padding:'28px', width:'340px', boxShadow:'0 8px 40px rgba(0,0,0,0.15)', fontFamily:C.font }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:'15px', fontWeight:600, color:C.text, marginBottom:'6px' }}>New folder</div>
            <div style={{ fontSize:'12px', color:C.muted, marginBottom:'18px' }}>Agrupa documentos dentro de {curDept?.name || 'este departamento'}.</div>
            <input type="text" placeholder="Ej. Cierres Q1, Pipeline, Nómina…" value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key==='Enter' && createFolder()}
              autoFocus
              style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', fontSize:'13px', border:C.border, borderRadius:'8px', outline:'none', fontFamily:C.font, color:C.text }}
            />
            <div style={{ display:'flex', gap:'8px', marginTop:'16px', justifyContent:'flex-end' }}>
              <button onClick={() => setShowNewFolder(false)} style={{ padding:'7px 16px', fontSize:'12px', border:C.border, borderRadius:'8px', cursor:'pointer', background:'transparent', fontFamily:C.font, color:C.muted }}>Cancel</button>
              <button onClick={createFolder} style={{ padding:'7px 16px', fontSize:'12px', background:C.accent, color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontFamily:C.font, fontWeight:500 }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* New department modal */}
      {showNewDept && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.18)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setShowNewDept(false)}>
          <div style={{ background:C.bg, borderRadius:'16px', padding:'28px', width:'340px', boxShadow:'0 8px 40px rgba(0,0,0,0.15)', fontFamily:C.font }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:'15px', fontWeight:600, color:C.text, marginBottom:'6px' }}>New department</div>
            <div style={{ fontSize:'12px', color:C.muted, marginBottom:'18px' }}>Organiza documentos y equipos dentro de {activeCoDef?.name || 'esta empresa'}.</div>
            <input type="text" placeholder="Ej. Finanzas, IT, Ventas…" value={newDeptName}
              onChange={e => setNewDeptName(e.target.value)}
              onKeyDown={e => e.key==='Enter' && createDept()}
              autoFocus
              style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', fontSize:'13px', border:C.border, borderRadius:'8px', outline:'none', fontFamily:C.font, color:C.text }}
            />
            <div style={{ display:'flex', gap:'8px', marginTop:'16px', justifyContent:'flex-end' }}>
              <button onClick={() => setShowNewDept(false)} style={{ padding:'7px 16px', fontSize:'12px', border:C.border, borderRadius:'8px', cursor:'pointer', background:'transparent', fontFamily:C.font, color:C.muted }}>Cancel</button>
              <button onClick={createDept} style={{ padding:'7px 16px', fontSize:'12px', background:C.accent, color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontFamily:C.font, fontWeight:500 }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Vectorizing modal */}
      {vecModal && (
        <VectorizingModal
          file={vecModal.file}
          resultReady={vecModal.resultReady}
          result={vecModal.result}
          error={vecModal.error}
          onClose={() => setVecModal(null)}
          onViewPdf={r => {
            setVecModal(null);
            const doc = realDocs.find(d => d.id === r.id) || normalizeReal(r);
            onGoVisualize?.(doc);
          }}
        />
      )}

      {/* Details modal */}
      {modalDoc && (
        <DocModal doc={modalDoc} onClose={() => setModalDoc(null)} onRemove={onToggle} />
      )}

      {/* Move to folder modal */}
      {moveDocId && (
        <MoveToModal
          doc={[...documents, ...realDocs].find(d => d.id === moveDocId)}
          departments={departments}
          groups={groups}
          currentAssign={assign[moveDocId]}
          onMove={(deptId, groupId) => {
            setAssign(prev => ({ ...prev, [moveDocId]: { deptId, groupId } }));
            apiMoveFile(moveDocId, deptId, groupId).catch(() => {});
            setMoveDocId(null);
          }}
          onClose={() => setMoveDocId(null)}
        />
      )}

    </div>
  );
}

// ── Move to modal ──────────────────────────────────────────────────────────────

function MoveToModal({ doc, departments, groups, currentAssign, onMove, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!doc) return null;

  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.18)', zIndex:2000,
      display:'flex', alignItems:'center', justifyContent:'center', fontFamily:C.font,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background:C.bg, borderRadius:'16px', padding:'24px', width:'360px',
        maxHeight:'70vh', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,0.14)', border:C.border,
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
          <div>
            <div style={{ fontSize:'14px', fontWeight:600, color:C.text }}>Mover documento</div>
            <div style={{ fontSize:'11px', color:C.muted, marginTop:'2px', maxWidth:'260px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.name}</div>
          </div>
          <button onClick={onClose} style={{ width:'28px', height:'28px', borderRadius:'8px', border:C.border, background:C.surface, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:C.muted, flexShrink:0 }}>
            <i className="ti ti-x" style={{ fontSize:'13px' }} />
          </button>
        </div>

        <div style={{ overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:'4px' }}>
          {/* Sin departamento */}
          <button onClick={() => onMove(null, null)} style={{
            display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px',
            borderRadius:'8px', border: !currentAssign?.deptId ? '1px solid '+C.accent : C.border,
            background: !currentAssign?.deptId ? C.accent+'0e' : 'transparent',
            cursor:'pointer', textAlign:'left', fontFamily:C.font, width:'100%',
          }}>
            <i className="ti ti-inbox" style={{ fontSize:'14px', color:C.muted }} />
            <span style={{ fontSize:'12px', color:C.muted, fontWeight:500 }}>Sin departamento</span>
          </button>

          {departments.map(dept => {
            const deptGroups = groups.filter(g => g.deptId === dept.id);
            const isInDept = currentAssign?.deptId === dept.id;
            return (
              <div key={dept.id}>
                {/* Dept row — move to dept root (no group) */}
                <button onClick={() => onMove(dept.id, null)} style={{
                  display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px',
                  borderRadius:'8px', border: isInDept && !currentAssign?.groupId ? '1px solid '+C.accent : C.border,
                  background: isInDept && !currentAssign?.groupId ? C.accent+'0e' : 'transparent',
                  cursor:'pointer', textAlign:'left', fontFamily:C.font, width:'100%', marginTop:'2px',
                }}>
                  <i className={'ti '+(dept.icon||'ti-building')} style={{ fontSize:'14px', color:C.accent }} />
                  <span style={{ fontSize:'12px', fontWeight:600, color:C.text }}>{dept.name}</span>
                </button>

                {/* Groups within dept */}
                {deptGroups.map(grp => {
                  const isHere = currentAssign?.deptId === dept.id && currentAssign?.groupId === grp.id;
                  return (
                    <button key={grp.id} onClick={() => onMove(dept.id, grp.id)} style={{
                      display:'flex', alignItems:'center', gap:'8px', padding:'7px 10px 7px 28px',
                      borderRadius:'8px', border: isHere ? '1px solid '+C.accent : 'transparent',
                      background: isHere ? C.accent+'0e' : 'transparent',
                      cursor:'pointer', textAlign:'left', fontFamily:C.font, width:'100%',
                    }}>
                      <i className="ti ti-folder-filled" style={{ fontSize:'12px', color:'#92400e' }} />
                      <span style={{ fontSize:'12px', color:C.muted, fontWeight:500 }}>{grp.name}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Chat page ─────────────────────────────────────────────────────────────────

function ChatPage({ selected, onRemove, llm, onLlmChange, onTrackQuery, companies, activeCo, onAddDoc, allRealDocs, onGoVisualize }) {
  const [messages,      setMessages]      = useState([]);
  const [input,         setInput]         = useState('');
  const [attachments,   setAttachments]   = useState([]);
  const [showUploadDest, setShowUploadDest] = useState(false);
  const [uploadDest,    setUploadDest]    = useState(null);
  const [chatVecModal,  setChatVecModal]  = useState(null);
  const bottomRef       = useRef(null);
  const fileRef         = useRef(null);
  const inputRef        = useRef(null);
  const bgChatCanvasRef = useRef(null);
  const bgChatAnimRef   = useRef(null);

  const allDocPool = [...documents, ...(allRealDocs||[])];

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const canvas = bgChatCanvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const resize = () => {
      canvas.width  = parent.offsetWidth;
      canvas.height = parent.offsetHeight;
    };
    resize();
    const W = () => canvas.width;
    const H = () => canvas.height;
    const ctx = canvas.getContext('2d');

    const PALETTE = [
      [37,  99,  235],
      [99,  102, 241],
      [100, 116, 139],
      [59,  130, 246],
      [71,  85,  105],
      [148, 163, 184],
    ];

    const makeParticles = () => {
      const n = Math.max(40, Math.floor(W() * H() / 13000));
      return Array.from({ length: n }, () => {
        const [r, g, b] = PALETTE[Math.floor(Math.random() * PALETTE.length)];
        return {
          x: Math.random() * W(), y: Math.random() * H(),
          vx: (Math.random() - 0.5) * 0.48,
          vy: (Math.random() - 0.5) * 0.48,
          radius: 1.4 + Math.random() * 1.8,
          alpha:  0.16 + Math.random() * 0.22,
          cr: r, cg: g, cb: b,
        };
      });
    };
    let pts = makeParticles();

    const loop = () => {
      ctx.clearRect(0, 0, W(), H());
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0)    { p.x = 0;    p.vx *= -1; }
        if (p.x > W())  { p.x = W();  p.vx *= -1; }
        if (p.y < 0)    { p.y = 0;    p.vy *= -1; }
        if (p.y > H())  { p.y = H();  p.vy *= -1; }
      }
      ctx.lineWidth = 0.75;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 155) {
            ctx.strokeStyle = `rgba(37,99,235,${((1 - dist/155)*0.11).toFixed(3)})`;
            ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
          }
        }
      }
      for (const p of pts) {
        ctx.fillStyle = `rgba(${p.cr},${p.cg},${p.cb},${p.alpha})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill();
      }
      bgChatAnimRef.current = requestAnimationFrame(loop);
    };
    bgChatAnimRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(bgChatAnimRef.current);
  }, []);

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
      background:C.bg, fontFamily:C.font, position:'relative',
    }}>
      <canvas ref={bgChatCanvasRef} style={{
        position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none',
      }} />
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
          const doc = allDocPool.find(d => d.id === id);
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
            onChange={async e => {
              const files = Array.from(e.target.files);
              e.target.value = '';
              if (!files.length) return;
              if (uploadDest) {
                // Real upload flow — save dest before clearing so assignment survives async
                const dest = uploadDest;
                const file = files[0];
                const co   = (companies||[]).find(c => c.id === dest.coId);
                const slug = co?.slug || String(co?.name||dest.coId).toLowerCase().replace(/[^a-z0-9]+/g, '-');
                setChatVecModal({ file, resultReady:false, result:null, error:null });
                setUploadDest(null);
                try {
                  const result = await apiUpload(file, slug);
                  if (result.error) {
                    setChatVecModal(m => m ? { ...m, resultReady:true, error:result.error } : null);
                  } else {
                    // Persist dept/group assignment in DB
                    if (dest.deptId || dest.groupId)
                      apiMoveFile(result.id, dest.deptId||null, dest.groupId||null).catch(() => {});
                    const norm = { ...normalizeReal(result), _deptId: dest.deptId||null, _groupId: dest.groupId||null };
                    if (onAddDoc) onAddDoc(norm);
                    setChatVecModal(m => m ? { ...m, resultReady:true, result } : null);
                  }
                } catch {
                  setChatVecModal(m => m ? { ...m, resultReady:true, error:'Server offline' } : null);
                }
              } else {
                setAttachments(prev => [...prev, ...files.map(f => ({ name:f.name, size:f.size }))]);
              }
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
            <textarea ref={inputRef} rows={1} value={input}
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
              <button onClick={() => { if ((companies||[]).length > 0) setShowUploadDest(true); else fileRef.current?.click(); }} style={{
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

      {showUploadDest && (companies||[]).length > 0 && (
        <UploadDestModal
          companies={companies}
          activeCo={activeCo}
          onConfirm={dest => { setUploadDest(dest); setShowUploadDest(false); fileRef.current?.click(); }}
          onClose={() => setShowUploadDest(false)}
        />
      )}

      {chatVecModal && (
        <VectorizingModal
          file={chatVecModal.file}
          resultReady={chatVecModal.resultReady}
          result={chatVecModal.result}
          error={chatVecModal.error}
          onClose={() => setChatVecModal(null)}
          onViewPdf={r => {
            setChatVecModal(null);
            const doc = (allRealDocs||[]).find(d => d.id === r.id) || normalizeReal(r);
            onGoVisualize?.(doc);
          }}
        />
      )}
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

// ── Vectorizing modal ─────────────────────────────────────────────────────────

function VectorizingModal({ file, resultReady, result, error, onClose, onViewPdf }) {
  const [progress,  setProgress]  = useState(0);
  const [stepLabel, setStepLabel] = useState('Preparando...');
  const [animDone,  setAnimDone]  = useState(false);
  const doneRef = useRef(false);

  const STEPS = [
    { pct:  0, label:'Subiendo documento...',   ms: 500 },
    { pct: 20, label:'Extrayendo texto...',      ms: 800 },
    { pct: 40, label:'Dividiendo en chunks...', ms: 800 },
    { pct: 60, label:'Generando embeddings...', ms: 900 },
    { pct: 80, label:'Guardando vectores...',   ms: 600 },
    { pct:100, label:'¡Vectorización completa!',ms: 400 },
  ];

  useEffect(() => {
    let i = 0;
    const tick = () => {
      if (doneRef.current) return;
      if (i >= STEPS.length) { setAnimDone(true); return; }
      const { pct, label, ms } = STEPS[i++];
      setProgress(pct); setStepLabel(label);
      setTimeout(tick, ms);
    };
    tick();
    return () => { doneRef.current = true; };
  }, []);

  const chunks      = Math.min(80, Math.max(5, Math.floor((file?.size || 0) / 1000)));
  const showSuccess = animDone && resultReady && !error;
  const showError   = resultReady && !!error;
  const fileIcon    = file?.name?.endsWith('.pdf') ? 'ti-file-text' : file?.name?.endsWith('.xlsx') ? 'ti-table' : 'ti-file';

  return (
    <div style={{ position:'fixed', inset:0, zIndex:3000, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:C.font }}>
      <div style={{ width:'480px', maxWidth:'calc(100vw - 32px)', background:C.bg, borderRadius:'16px', overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,0.25)' }}>
        <div style={{ height:'48px', background:C.accent, display:'flex', alignItems:'center', padding:'0 20px', gap:'10px' }}>
          <i className="ti ti-world" style={{ fontSize:'17px', color:'#fff' }} />
          <span style={{ fontSize:'13px', fontWeight:600, color:'#fff' }}>Sogol · Procesando archivo</span>
        </div>
        <div style={{ padding:'28px 28px 24px' }}>
          {showSuccess ? (
            <>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'14px', padding:'8px 0 12px' }}>
                <div style={{ width:'56px', height:'56px', borderRadius:'50%', background:'#1a7a4a18', border:'2px solid #1a7a4a40', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className="ti ti-check" style={{ fontSize:'28px', color:'#1a7a4a' }} />
                </div>
                <div style={{ fontSize:'16px', fontWeight:600, color:C.text }}>Documento listo para consultar</div>
              </div>
              <div style={{ background:C.surface, borderRadius:'10px', padding:'14px 18px', marginBottom:'20px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                {[
                  { k:'Nombre',   v: result?.original_name || file?.name || '—' },
                  { k:'Chunks',   v: chunks },
                  { k:'Vectores', v: chunks },
                  { k:'Modelo',   v: 'text-embedding-3-small' },
                ].map(({ k, v }) => (
                  <div key={k}>
                    <div style={{ fontSize:'10px', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'2px' }}>{k}</div>
                    <div style={{ fontSize:'12px', color:C.text, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
                {result?.type === 'pdf' && onViewPdf && (
                  <button onClick={() => onViewPdf(result)} style={{ padding:'8px 18px', fontSize:'12px', fontWeight:600, background:C.accent, color:'#fff', border:'none', borderRadius:'9px', cursor:'pointer', fontFamily:C.font, display:'flex', alignItems:'center', gap:'6px' }}>
                    <i className="ti ti-file-text" style={{ fontSize:'13px' }} /> Ver documento
                  </button>
                )}
                <button onClick={onClose} style={{ padding:'8px 18px', fontSize:'12px', fontWeight:500, color:C.text, background:C.surface, border:C.border, borderRadius:'9px', cursor:'pointer', fontFamily:C.font }}>Cerrar</button>
              </div>
            </>
          ) : showError ? (
            <>
              <div style={{ textAlign:'center', padding:'16px 0 20px' }}>
                <i className="ti ti-alert-circle" style={{ fontSize:'40px', color:'#c0392b', display:'block', marginBottom:'12px' }} />
                <div style={{ fontSize:'14px', fontWeight:600, color:C.text, marginBottom:'6px' }}>Error al subir</div>
                <div style={{ fontSize:'12px', color:C.muted }}>{error}</div>
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <button onClick={onClose} style={{ padding:'8px 18px', fontSize:'12px', color:C.text, background:C.surface, border:C.border, borderRadius:'9px', cursor:'pointer', fontFamily:C.font }}>Cerrar</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'18px', overflow:'hidden' }}>
                <i className={'ti '+fileIcon} style={{ fontSize:'15px', color:C.muted, flexShrink:0 }} />
                <span style={{ fontSize:'13px', fontWeight:500, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{file?.name}</span>
              </div>
              <div style={{ marginBottom:'10px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
                  <span style={{ fontSize:'11px', color:C.muted }}>{stepLabel}</span>
                  <span style={{ fontSize:'11px', fontWeight:600, color:C.accent }}>{progress}%</span>
                </div>
                <div style={{ height:'6px', background:C.surface, borderRadius:'3px', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:progress+'%', background:C.accent, borderRadius:'3px', transition:'width 0.4s ease' }} />
                </div>
              </div>
              <div style={{ fontSize:'11px', color: progress === 100 ? C.accent : '#c7c7cc', textAlign:'center', marginTop:'10px' }}>
                {progress === 100 ? 'Finalizando…' : 'Por favor espera mientras procesamos tu archivo…'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PDF viewer modal ───────────────────────────────────────────────────────────

function PdfViewerModal({ fileId, fileName, onClose }) {
  const rawSrc  = `${API_BASE}/files/${fileId}/view`;
  const [blobUrl, setBlobUrl] = useState(null);
  const [status,  setStatus]  = useState('loading'); // loading | ok | error

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setStatus('loading');
    let url = null;
    fetch(rawSrc)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then(blob => {
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [fileId]);

  return (
    <div style={{ position:'fixed', inset:0, zIndex:2500, background:'#1a1a1a', display:'flex', flexDirection:'column', fontFamily:C.font }}>
      <div style={{ height:'48px', background:'#2a2a2a', display:'flex', alignItems:'center', padding:'0 16px', gap:'10px', flexShrink:0, borderBottom:'1px solid #333' }}>
        <i className="ti ti-file-text" style={{ fontSize:'15px', color:'#888' }} />
        <span style={{ flex:1, fontSize:'13px', fontWeight:500, color:'#eee', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fileName}</span>
        <a href={rawSrc} target="_blank" rel="noopener" style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', color:'#aaa', textDecoration:'none', padding:'5px 12px', border:'1px solid #555', borderRadius:'6px', whiteSpace:'nowrap' }}>
          <i className="ti ti-external-link" style={{ fontSize:'12px' }} /> Nueva pestaña
        </a>
        <button onClick={onClose} style={{ width:'28px', height:'28px', background:'transparent', border:'none', cursor:'pointer', color:'#888', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'6px' }}>
          <i className="ti ti-x" style={{ fontSize:'16px' }} />
        </button>
      </div>
      {status === 'loading' && (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'12px' }}>
          <i className="ti ti-loader" style={{ fontSize:'28px', color:'#555' }} />
          <span style={{ fontSize:'12px', color:'#666' }}>Cargando PDF…</span>
        </div>
      )}
      {status === 'error' && (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'12px' }}>
          <i className="ti ti-alert-circle" style={{ fontSize:'28px', color:'#c0392b' }} />
          <span style={{ fontSize:'13px', color:'#aaa' }}>No se pudo cargar el PDF.</span>
          <span style={{ fontSize:'11px', color:'#666' }}>Asegúrate de que el servidor está corriendo (<code>node server.js</code>).</span>
          <a href={rawSrc} target="_blank" rel="noopener" style={{ marginTop:'8px', padding:'7px 18px', background:C.accent, color:'#fff', borderRadius:'8px', textDecoration:'none', fontSize:'12px', fontWeight:500 }}>
            Intentar en nueva pestaña
          </a>
        </div>
      )}
      {status === 'ok' && blobUrl && (
        <iframe src={blobUrl} title={fileName} style={{ flex:1, width:'100%', border:'none', background:'#fff' }} />
      )}
    </div>
  );
}

// ── Upload destination modal (chat) ───────────────────────────────────────────

function UploadDestModal({ companies, activeCo, onConfirm, onClose }) {
  const [selCo,    setSelCo]    = useState(activeCo || companies[0]?.id || '');
  const [depts,    setDepts]    = useState([]);
  const [groups,   setGroups]   = useState([]);
  const [selDept,  setSelDept]  = useState('');
  const [selGroup, setSelGroup] = useState('');

  useEffect(() => {
    if (!selCo) return;
    const co   = companies.find(c => c.id === selCo);
    const slug = co?.slug || String(co?.name || selCo).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    Promise.all([apiGetDepts(slug), apiGetGroups(slug)])
      .then(([ds, gs]) => {
        const d = Array.isArray(ds) ? ds : [];
        const g = Array.isArray(gs) ? gs : [];
        setDepts(d); setGroups(g);
        setSelDept(d[0]?.id || '');
        setSelGroup('');
      })
      .catch(() => { setDepts([]); setGroups([]); });
  }, [selCo]);

  useEffect(() => { setSelGroup(''); }, [selDept]);

  const filteredGroups = groups.filter(g => g.dept_id === selDept);

  return (
    <div style={{ position:'fixed', inset:0, zIndex:3100, background:'rgba(0,0,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:C.font }}
      onClick={onClose}>
      <div style={{ background:C.bg, borderRadius:'14px', padding:'24px', width:'360px', boxShadow:'0 12px 40px rgba(0,0,0,0.15)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:'14px', fontWeight:600, color:C.text, marginBottom:'18px' }}>¿Dónde guardar el documento?</div>
        <div style={{ display:'flex', flexDirection:'column', gap:'12px', marginBottom:'20px' }}>
          {[
            { label:'Empresa', value:selCo, onChange:e=>setSelCo(e.target.value), opts: companies.map(c=>({v:c.id,l:c.name})), disabled:false },
            { label:'Departamento', value:selDept, onChange:e=>setSelDept(e.target.value), opts: depts.map(d=>({v:d.id,l:d.name})), disabled:depts.length===0, placeholder:'— Sin departamentos —' },
            { label:'Carpeta (opcional)', value:selGroup, onChange:e=>setSelGroup(e.target.value), opts: filteredGroups.map(g=>({v:g.id,l:g.name})), disabled:filteredGroups.length===0, placeholder:'— Sin carpeta —' },
          ].map(({ label, value, onChange, opts, disabled, placeholder }) => (
            <div key={label}>
              <div style={{ fontSize:'11px', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:'5px' }}>{label}</div>
              <select value={value} onChange={onChange} disabled={disabled} style={{ width:'100%', padding:'8px 10px', fontSize:'12px', border:C.border, borderRadius:'7px', background: disabled ? C.surface : C.bg, color:C.text, outline:'none', fontFamily:C.font }}>
                {placeholder && <option value="">{placeholder}</option>}
                {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'7px 16px', fontSize:'12px', border:C.border, borderRadius:'8px', cursor:'pointer', background:'transparent', fontFamily:C.font, color:C.muted }}>Cancelar</button>
          <button onClick={() => selCo && onConfirm({ coId:selCo, deptId:selDept||null, groupId:selGroup||null })} style={{ padding:'7px 16px', fontSize:'12px', background:C.accent, color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontFamily:C.font, fontWeight:500 }}>Continuar</button>
        </div>
      </div>
    </div>
  );
}

// ── Graphs page (D3 force layout 2D) ─────────────────────────────────────────

function GraphsPage({ selected, onToggle, allRealDocs, docStats, savedGraphs, onSaveGraph, onDeleteGraph, onLoadGraph }) {
  const svgRef       = useRef(null);
  const simRef       = useRef(null);
  const animFrameRef = useRef(null);
  const toggleRef    = useRef(onToggle);
  const clickRef     = useRef(null);
  const [tip,        setTip]        = useState(null);
  const [modalDoc,   setModalDoc]   = useState(null);
  const [showSave,   setShowSave]   = useState(false);
  const [saveName,   setSaveName]   = useState('');
  const [saveComment,setSaveComment]= useState('');

  const allPool = [...documents, ...(allRealDocs||[])];

  useEffect(() => { toggleRef.current = onToggle; }, [onToggle]);

  // Updated every render — opens modal with clean doc data
  clickRef.current = d => setModalDoc(allPool.find(doc => doc.id === d.id) || d);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    setTip(null);

    if (selected.length < 3) return;

    const W = svgEl.clientWidth  || 800;
    const H = svgEl.clientHeight || 600;

    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }

    const pool    = [...documents, ...(allRealDocs||[])];
    const selDocs = pool.filter(d => selected.includes(d.id));
    const nodes   = selDocs.map(d => ({ ...d }));
    const edgeWeightMap = {};
    GRAPH_EDGES.forEach(e => { edgeWeightMap[[e.from, e.to].sort().join('|')] = e.weight; });
    const links = [];
    for (let i = 0; i < selDocs.length; i++)
      for (let j = i + 1; j < selDocs.length; j++) {
        const k = [selDocs[i].id, selDocs[j].id].sort().join('|');
        links.push({ source: selDocs[i].id, target: selDocs[j].id, weight: edgeWeightMap[k] || 1 });
      }

    const nodeR = d => 8 + d.weight * 16;

    let isOrbiting = false;
    let currentT   = 0;

    const g = svg.append('g');
    svg.call(
      d3.zoom().scaleExtent([0.2, 5]).on('zoom', ev => g.attr('transform', ev.transform))
    ).on('dblclick.zoom', null);

    const linkSel = g.append('g')
      .selectAll('line').data(links).join('line')
      .attr('stroke', '#c7c7cc')
      .attr('stroke-width', d => 1 + (d.weight || 1))
      .attr('stroke-linecap', 'round');

    const linkLblSel = g.append('g')
      .selectAll('text').data(links.filter(l => (l.weight || 1) > 1)).join('text')
      .text(d => d.weight + '×')
      .attr('font-size', '10px').attr('font-family', "-apple-system, sans-serif")
      .attr('fill', '#86868b').attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle').attr('pointer-events', 'none');

    const nodeSel = g.append('g')
      .selectAll('circle').data(nodes).join('circle')
      .attr('r', nodeR)
      .attr('fill', d => GRAPH_COLOR[d.type] || '#888')
      .attr('fill-opacity', 0.9)
      .attr('stroke', '#ffffff').attr('stroke-width', 2.5)
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
            if (isOrbiting) {
              d.isDragging = true;
            } else {
              d.fx = d.x; d.fy = d.y;
            }
          })
          .on('drag', (event, d) => {
            if (isOrbiting) {
              d.x = event.x; d.y = event.y;
              updatePositions();
            } else {
              d.fx = event.x; d.fy = event.y;
            }
          })
          .on('end', (event, d) => {
            if (isOrbiting) {
              const θ = currentT * 0.16;
              const dx = d.x - W / 2, dy = d.y - H / 2;
              d.rx = W / 2 + Math.cos(-θ) * dx - Math.sin(-θ) * dy;
              d.ry = H / 2 + Math.sin(-θ) * dx + Math.cos(-θ) * dy;
              d.isDragging = false;
            } else {
              d.fx = null; d.fy = null;
            }
          })
      );

    const labelSel = g.append('g')
      .selectAll('text').data(nodes).join('text')
      .text(d => d.name.length > 18 ? d.name.slice(0, 17) + '…' : d.name)
      .attr('font-size', '11px')
      .attr('font-family', "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif")
      .attr('fill', '#1d1d1f').attr('text-anchor', 'middle').attr('pointer-events', 'none');

    const updatePositions = () => {
      linkSel
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      linkLblSel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);
      nodeSel.attr('cx', d => d.x).attr('cy', d => d.y);
      labelSel.attr('x', d => d.x).attr('y', d => d.y + nodeR(d) + 14);
    };

    // Create sim stopped — we drive ticks manually from the rAF loop so animation is immediate
    let sim;
    let startTs = null;

    const loop = (ts) => {
      if (!startTs) startTs = ts;
      currentT = (ts - startTs) / 1000;

      if (!isOrbiting) {
        // Advance simulation one step per frame
        if (sim) sim.tick();
        if (sim && sim.alpha() < sim.alphaMin()) {
          // Sim converged — switch to orbit mode
          isOrbiting = true;
          nodes.forEach((d, i) => {
            d.rx = d.x; d.ry = d.y;
            d.driftPhase  = (i / nodes.length) * Math.PI * 2 + Math.random();
            d.driftSpeed  = 0.35 + Math.random() * 0.35;
            d.driftRadius = 8 + Math.random() * 14;
          });
        }
      } else {
        const θ = currentT * 0.16; // global rotation ~40 s per turn
        nodes.forEach(d => {
          if (d.isDragging) return;
          const dx = d.rx - W / 2, dy = d.ry - H / 2;
          const rotX = Math.cos(θ) * dx - Math.sin(θ) * dy;
          const rotY = Math.sin(θ) * dx + Math.cos(θ) * dy;
          d.x = W / 2 + rotX + Math.cos(currentT * d.driftSpeed + d.driftPhase) * d.driftRadius;
          d.y = H / 2 + rotY + Math.sin(currentT * d.driftSpeed + d.driftPhase) * d.driftRadius;
        });
      }

      updatePositions();
      animFrameRef.current = requestAnimationFrame(loop);
    };

    // Start the loop immediately — visible animation from frame 1
    animFrameRef.current = requestAnimationFrame(loop);

    sim = d3.forceSimulation(nodes)
      .alphaDecay(0.04)
      .force('link',      d3.forceLink(links).id(d => d.id).distance(180).strength(0.7))
      .force('charge',    d3.forceManyBody().strength(-600))
      .force('center',    d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(d => nodeR(d) + 10))
      .stop(); // ticks driven manually by rAF loop above

    simRef.current = sim;

    return () => {
      if (sim) sim.stop();
      if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
      svg.on('.zoom', null);
    };
  }, [selected]);

  const n  = selected.length;
  const ec = n >= 2 ? n * (n - 1) / 2 : 0;

  const pool    = [...documents, ...(allRealDocs||[])];
  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric' }) : '';

  return (
    <div style={{ flex:1, display:'flex', overflow:'hidden', fontFamily:C.font }}>

      {/* ── Saved graphs panel ── */}
      <div style={{
        width:'230px', flexShrink:0, borderRight:C.border, background:C.surface,
        display:'flex', flexDirection:'column', overflow:'hidden',
      }}>
        <div style={{ padding:'14px 16px 10px', borderBottom:C.border, flexShrink:0 }}>
          <div style={{ fontSize:'11px', fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.6px' }}>
            Grafos guardados
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'8px' }}>
          {(savedGraphs||[]).length === 0 ? (
            <div style={{ padding:'24px 8px', textAlign:'center' }}>
              <i className="ti ti-circles-relation" style={{ fontSize:'28px', color:'#ddd', display:'block', marginBottom:'8px' }} />
              <div style={{ fontSize:'11px', color:C.muted, lineHeight:1.5 }}>
                Selecciona ≥3 docs y guarda combinaciones aquí
              </div>
            </div>
          ) : (savedGraphs||[]).map(g => {
            const docs = g.docIds.map(id => pool.find(d => d.id === id)).filter(Boolean);
            const isActive = g.docIds.length === selected.length && g.docIds.every(id => selected.includes(id));
            return (
              <div key={g.id} style={{
                borderRadius:'10px', padding:'10px', marginBottom:'4px', cursor:'pointer',
                border: isActive ? '1px solid '+C.accent+'60' : C.border,
                background: isActive ? C.accent+'08' : C.bg,
                transition:'background .15s',
              }} onClick={() => onLoadGraph?.(g.docIds)}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'4px' }}>
                  <div style={{ fontSize:'12px', fontWeight:600, color:C.text, lineHeight:1.3, flex:1 }}>{g.name}</div>
                  <button onClick={e => { e.stopPropagation(); onDeleteGraph?.(g.id); }} style={{
                    width:'18px', height:'18px', borderRadius:'4px', border:'none', background:'transparent',
                    cursor:'pointer', color:C.muted, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, padding:0,
                  }}>
                    <i className="ti ti-x" style={{ fontSize:'10px' }} />
                  </button>
                </div>
                {g.comment && (
                  <div style={{ fontSize:'10px', color:C.muted, marginTop:'4px', lineHeight:1.4, fontStyle:'italic' }}>{g.comment}</div>
                )}
                <div style={{ display:'flex', flexWrap:'wrap', gap:'3px', marginTop:'7px' }}>
                  {docs.slice(0,4).map(d => (
                    <span key={d.id} style={{
                      fontSize:'9px', padding:'1px 5px', borderRadius:'4px',
                      background: (TYPE_COLOR[d.type]||C.accent)+'18',
                      color: TYPE_COLOR[d.type]||C.accent, fontWeight:600,
                      maxWidth:'80px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                    }}>{d.name.replace(/\.[^.]+$/,'')}</span>
                  ))}
                  {docs.length > 4 && <span style={{ fontSize:'9px', color:C.muted }}>+{docs.length-4}</span>}
                </div>
                <div style={{ fontSize:'10px', color:C.muted, marginTop:'5px' }}>
                  {g.docIds.length} docs · {fmtDate(g.createdAt)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Save button */}
        <div style={{ padding:'10px', borderTop:C.border, flexShrink:0 }}>
          {n < 3 ? (
            <div style={{ fontSize:'11px', color:C.muted, textAlign:'center', padding:'4px 0' }}>
              Selecciona ≥3 docs para guardar
            </div>
          ) : (
            <button onClick={() => { setSaveName(''); setSaveComment(''); setShowSave(true); }} style={{
              width:'100%', padding:'8px', fontSize:'12px', fontWeight:600,
              background:C.accent, color:'#fff', border:'none', borderRadius:'8px',
              cursor:'pointer', fontFamily:C.font, display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
            }}>
              <i className="ti ti-device-floppy" style={{ fontSize:'13px' }} />
              Guardar grafo ({n} docs)
            </button>
          )}
        </div>
      </div>

      {/* ── Graph canvas ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ flex:1, position:'relative', overflow:'hidden', background:C.bg }}>
          {n < 3 && (
            <div style={{
              position:'absolute', inset:0, zIndex:1, pointerEvents:'none',
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'10px',
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
              boxShadow:'0 4px 20px rgba(0,0,0,0.09)', pointerEvents:'none',
            }}>
              <div style={{ fontSize:'12px', fontWeight:600, color:C.text, marginBottom:'3px' }}>{tip.doc.name}</div>
              <div style={{ fontSize:'11px', color:C.muted }}>Click para ver detalles</div>
            </div>
          )}
        </div>
      </div>

      {modalDoc && (
        <DocModal doc={modalDoc} onClose={() => setModalDoc(null)} onRemove={onToggle} />
      )}

      {/* Save graph modal */}
      {showSave && (
        <div onClick={() => setShowSave(false)} style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.18)', zIndex:2000,
          display:'flex', alignItems:'center', justifyContent:'center', fontFamily:C.font,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background:C.bg, borderRadius:'16px', padding:'28px', width:'380px',
            boxShadow:'0 20px 60px rgba(0,0,0,0.15)', border:C.border,
          }}>
            <div style={{ fontSize:'15px', fontWeight:600, color:C.text, marginBottom:'4px' }}>Guardar grafo</div>
            <div style={{ fontSize:'12px', color:C.muted, marginBottom:'20px' }}>
              {n} documentos · combinación de conocimiento
            </div>

            <div style={{ marginBottom:'12px' }}>
              <div style={{ fontSize:'11px', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'6px' }}>Nombre</div>
              <input
                autoFocus
                type="text"
                placeholder={`Grafo ${(savedGraphs||[]).length + 1}`}
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && setShowSave(false)}
                style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', fontSize:'13px', border:C.border, borderRadius:'8px', outline:'none', fontFamily:C.font, color:C.text, background:C.bg }}
              />
            </div>

            <div style={{ marginBottom:'20px' }}>
              <div style={{ fontSize:'11px', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'6px' }}>Comentario <span style={{ fontWeight:400, textTransform:'none' }}>(opcional)</span></div>
              <textarea
                placeholder="Describe el propósito de esta combinación…"
                value={saveComment}
                onChange={e => setSaveComment(e.target.value)}
                rows={2}
                style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', fontSize:'13px', border:C.border, borderRadius:'8px', outline:'none', fontFamily:C.font, color:C.text, resize:'none', background:C.bg }}
              />
            </div>

            {/* Doc chips preview */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:'4px', marginBottom:'20px' }}>
              {selected.map(id => {
                const d = pool.find(x => x.id === id);
                if (!d) return null;
                return (
                  <span key={id} style={{
                    fontSize:'10px', padding:'2px 7px', borderRadius:'5px',
                    background:(TYPE_COLOR[d.type]||C.accent)+'18',
                    color:TYPE_COLOR[d.type]||C.accent, fontWeight:600,
                  }}>{d.name.replace(/\.[^.]+$/,'')}</span>
                );
              })}
            </div>

            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button onClick={() => setShowSave(false)} style={{ padding:'8px 16px', fontSize:'12px', border:C.border, borderRadius:'8px', cursor:'pointer', background:'transparent', fontFamily:C.font, color:C.muted }}>
                Cancelar
              </button>
              <button onClick={() => {
                onSaveGraph?.({ name: saveName, comment: saveComment });
                setShowSave(false);
              }} style={{ padding:'8px 20px', fontSize:'12px', background:C.accent, color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontFamily:C.font, fontWeight:600 }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
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
  const isSpreadsheet = ['xlsx', 'xls', 'csv'].includes(doc.type);
  const isRealPdf     = doc.isReal && doc.type === 'pdf';
  return (
    <div style={{
      background:C.bg, borderRadius:'12px', border:C.border,
      boxShadow:'0 2px 24px rgba(0,0,0,0.07)', width:'100%', maxWidth:'700px',
      overflow:'hidden',
      ...(isRealPdf ? { display:'flex', flexDirection:'column' } : {}),
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
      {isRealPdf
        ? <div style={{ flex:1, minHeight:'64vh', display:'flex', flexDirection:'column', background:'#fff' }}>
            <InlinePdfViewer fileId={doc.id} fileName={doc.name} />
          </div>
        : isSpreadsheet
          ? <SpreadsheetView doc={doc} />
          : <PdfView doc={doc} />
      }
    </div>
  );
}

// ── Inline PDF viewer (blob URL to avoid CORS / Google restrictions) ──────────

function InlinePdfViewer({ fileId, fileName }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [status,  setStatus]  = useState('loading');

  useEffect(() => {
    let url = null;
    setStatus('loading'); setBlobUrl(null);
    fetch(`${API_BASE}/files/${fileId}/view`)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then(blob => { url = URL.createObjectURL(blob); setBlobUrl(url); setStatus('ok'); })
      .catch(() => setStatus('error'));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [fileId]);

  if (status === 'loading') return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'14px' }}>
      <div style={{ width:'32px', height:'32px', borderRadius:'50%', border:'3px solid '+C.surface, borderTopColor:C.accent, animation:'spin 0.8s linear infinite' }} />
      <span style={{ fontSize:'12px', color:C.muted, fontFamily:C.font }}>Cargando PDF…</span>
    </div>
  );
  if (status === 'error') return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'12px' }}>
      <i className="ti ti-alert-circle" style={{ fontSize:'32px', color:'#c0392b' }} />
      <span style={{ fontSize:'13px', color:C.muted, fontFamily:C.font }}>No se pudo cargar el PDF</span>
      <a href={`${API_BASE}/files/${fileId}/view`} target="_blank" rel="noopener noreferrer"
         style={{ fontSize:'12px', color:C.accent, fontFamily:C.font }}>Abrir en nueva pestaña ↗</a>
    </div>
  );
  return (
    <iframe src={blobUrl} title={fileName}
      style={{ width:'100%', height:'100%', border:'none', display:'block' }} />
  );
}

// ── Visualize page ────────────────────────────────────────────────────────────

function VisualizePage({ selected, onToggle, focusDoc, allRealDocs }) {
  const [search,  setSearch]  = useState('');
  const [viewId,  setViewId]  = useState(null);

  // Auto-select focusDoc when it changes (from right-click "Ver PDF")
  useEffect(() => {
    if (focusDoc?.id) setViewId(focusDoc.id);
  }, [focusDoc?.id]);

  // Merge mock docs + real docs, dedup by id
  const realPool = Array.isArray(allRealDocs) ? allRealDocs : [];
  const allPool  = [...documents, ...realPool.filter(r => !documents.find(d => d.id === r.id))];
  // Show in left panel: selected docs + focusDoc (if not already selected)
  const selDocs  = allPool.filter(d => selected.includes(d.id));
  const extra    = focusDoc && !selDocs.find(d => d.id === focusDoc.id) ? [focusDoc] : [];
  const panelDocs = [...extra, ...selDocs];
  const filtered  = panelDocs.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));
  const viewDoc   = panelDocs.find(d => d.id === viewId) || null;

  if (panelDocs.length === 0) return (
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
      {!viewDoc ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'12px', background:C.surface }}>
          <i className="ti ti-eye" style={{ fontSize:'44px', color:'#e0e0e5' }} />
          <span style={{ fontSize:'13px', color:C.muted, fontFamily:C.font }}>Selecciona un documento para visualizarlo</span>
        </div>
      ) : (
        <div style={{ flex:1, overflow:'auto', background:C.surface, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'32px 28px' }}>
          <DocPreview
            doc={viewDoc}
            isSelected={selected.includes(viewDoc.id)}
            onToggle={onToggle}
          />
        </div>
      )}
    </div>
  );
}

// ── Policies data ─────────────────────────────────────────────────────────────

const POLICIES = [];

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

// ── Login page ────────────────────────────────────────────────────────────────

function LoginPage({ onLogin }) {
  const canvasRef   = useRef(null);
  const animRef     = useRef(null);
  const bgCanvasRef = useRef(null);
  const bgAnimRef   = useRef(null);
  const [phase, setPhase] = useState('forming'); // 'forming' | 'ready' | 'exit'

  // ── Background particle network ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    const W = canvas.width  = window.innerWidth;
    const H = canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    const PALETTE = [
      [37,  99,  235],  // blue-600
      [99,  102, 241],  // indigo-500
      [100, 116, 139],  // slate-500
      [59,  130, 246],  // blue-400
      [71,  85,  105],  // slate-600
      [148, 163, 184],  // slate-400
    ];

    const N   = Math.max(55, Math.floor(W * H / 13000));
    const pts = Array.from({ length: N }, () => {
      const [r, g, b] = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      return {
        x:  Math.random() * W,
        y:  Math.random() * H,
        vx: (Math.random() - 0.5) * 0.48,
        vy: (Math.random() - 0.5) * 0.48,
        radius: 1.4 + Math.random() * 1.8,
        alpha:  0.16 + Math.random() * 0.22,
        cr: r, cg: g, cb: b,
      };
    });

    const MAX_DIST = 155;

    const loop = () => {
      ctx.clearRect(0, 0, W, H);

      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0)  { p.x = 0;  p.vx *= -1; }
        if (p.x > W)  { p.x = W;  p.vx *= -1; }
        if (p.y < 0)  { p.y = 0;  p.vy *= -1; }
        if (p.y > H)  { p.y = H;  p.vy *= -1; }
      }

      ctx.lineWidth = 0.75;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx   = pts[i].x - pts[j].x;
          const dy   = pts[i].y - pts[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MAX_DIST) {
            const a = ((1 - dist / MAX_DIST) * 0.11).toFixed(3);
            ctx.strokeStyle = `rgba(37,99,235,${a})`;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
      }

      for (const p of pts) {
        ctx.fillStyle = `rgba(${p.cr},${p.cg},${p.cb},${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      bgAnimRef.current = requestAnimationFrame(loop);
    };
    bgAnimRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(bgAnimRef.current);
  }, []);

  // ── Sogol text particle animation ────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width  = window.innerWidth;
    const H = canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    // Render "Sogol" off-screen — small title above login card
    const fontSize = 52;
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const octx = off.getContext('2d');
    octx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif`;
    octx.fillStyle = '#fff';
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillText('Sogol', W / 2, H * 0.22);
    const data = octx.getImageData(0, 0, W, H).data;
    const gap  = Math.max(3, Math.floor(W / 220));
    const targets = [];
    for (let y = 0; y < H; y += gap)
      for (let x = 0; x < W; x += gap)
        if (data[(y * W + x) * 4 + 3] > 128) targets.push({ x, y });

    // Shuffle so particles arrive from mixed directions
    for (let i = targets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [targets[i], targets[j]] = [targets[j], targets[i]];
    }

    const COLORS = ['#2563eb', '#3b82f6', '#1d4ed8', '#2563eb', '#60a5fa'];
    const particles = targets.map(t => ({
      x: Math.random() * W, y: Math.random() * H,
      tx: t.x, ty: t.y,
      vx: 0, vy: 0,
      ease:  0.018 + Math.random() * 0.014,
      size:  1.2 + Math.random() * 1.1,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));

    let settled = false;
    let settleTimer = null;
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      let allClose = true;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.vx = (p.vx + (p.tx - p.x) * p.ease) * 0.86;
        p.vy = (p.vy + (p.ty - p.y) * p.ease) * 0.86;
        p.x += p.vx; p.y += p.vy;
        if (Math.abs(p.tx - p.x) > 2 || Math.abs(p.ty - p.y) > 2) allClose = false;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      if (allClose && !settled) {
        settled = true;
        settleTimer = setTimeout(() => setPhase('ready'), 350);
        return; // leave particles painted in final position
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(animRef.current); clearTimeout(settleTimer); };
  }, []);

  const handleLogin = () => { setPhase('exit'); setTimeout(onLogin, 650); };

  const font = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1000, background:'#fff', overflow:'hidden',
      transform: phase === 'exit' ? 'translateY(-100vh)' : 'translateY(0)',
      transition: phase === 'exit' ? 'transform 0.65s cubic-bezier(0.4,0,0.6,1)' : 'none',
    }}>
      {/* Background: infinite particle network */}
      <canvas ref={bgCanvasRef} style={{
        display:'block', position:'absolute', inset:0, width:'100%', height:'100%',
        pointerEvents:'none',
      }} />

      {/* Canvas: Sogol text particle animation — fades out once settled */}
      <canvas ref={canvasRef} style={{
        display:'block', position:'absolute', inset:0, width:'100%', height:'100%',
        opacity: phase === 'forming' ? 1 : 0,
        transition: 'opacity 0.55s ease',
        pointerEvents:'none',
      }} />

      {/* "Sogol" — above the card, small title */}
      <div style={{
        position:'absolute', top:'20%', left:'50%',
        transform: phase === 'forming'
          ? 'translateX(-50%) translateY(-10px)'
          : 'translateX(-50%) translateY(0)',
        opacity: phase === 'forming' ? 0 : 1,
        transition: 'opacity 0.55s ease 0.22s, transform 0.65s cubic-bezier(0.34,1.3,0.64,1) 0.22s',
        pointerEvents:'none', whiteSpace:'nowrap',
        fontSize:'52px', fontWeight:900,
        color:'#2563eb', letterSpacing:'-0.02em', lineHeight:1, fontFamily:font,
        userSelect:'none',
      }}>
        Sogol
      </div>

      {/* Login card — centered on screen */}
      <div style={{
        position:'absolute', top:'50%', left:'50%',
        transform: phase === 'forming'
          ? 'translate(-50%, calc(-50% + 24px))'
          : 'translate(-50%, -50%)',
        opacity: phase === 'forming' ? 0 : 1,
        transition: 'opacity 0.55s ease 0.22s, transform 0.65s cubic-bezier(0.34,1.3,0.64,1) 0.22s',
        pointerEvents: phase === 'forming' ? 'none' : 'auto',
        width:'300px', background:'#fff',
        border:'1px solid #e5e7eb', borderRadius:'20px',
        boxShadow:'0 20px 70px rgba(37,99,235,0.14), 0 4px 20px rgba(0,0,0,0.06)',
        padding:'32px 28px', fontFamily:font, textAlign:'center',
      }}>
        <div style={{
          width:'46px', height:'46px', borderRadius:'50%', background:'#2563eb',
          display:'flex', alignItems:'center', justifyContent:'center',
          margin:'0 auto 14px', boxShadow:'0 4px 16px rgba(37,99,235,0.35)',
        }}>
          <i className="ti ti-world" style={{ fontSize:'20px', color:'#fff' }} />
        </div>
        <div style={{ fontSize:'20px', fontWeight:700, color:'#111827', marginBottom:'5px', letterSpacing:'-0.3px' }}>
          Bienvenido
        </div>
        <div style={{ fontSize:'12px', color:'#6b7280', marginBottom:'24px', lineHeight:1.5 }}>
          Conocimiento empresarial para agentes de IA.
        </div>
        <button
          onClick={handleLogin}
          style={{
            width:'100%', padding:'11px', fontSize:'13px', fontWeight:600,
            color:'#fff', background:'#2563eb', border:'none', borderRadius:'11px',
            cursor:'pointer', fontFamily:font,
            boxShadow:'0 4px 12px rgba(37,99,235,0.3)',
            transition:'transform 0.1s, box-shadow 0.1s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 6px 18px rgba(37,99,235,0.38)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='0 4px 12px rgba(37,99,235,0.3)'; }}
        >
          Entrar como demo
        </button>
        <div style={{ fontSize:'11px', color:'#9ca3af', marginTop:'14px' }}>Demo · Sin contraseña</div>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [loggedIn,   setLoggedIn]   = useState(false);
  const [selected,   setSelected]   = useState([]);
  const [page,       setPage]       = useState('chat');
  const [llm,        setLlm]        = useState('claude');
  const [docStats,     setDocStats]     = useState({}); // { [id]: { queries, context } }
  const [savedGraphs,  setSavedGraphs]  = useState([]);
  const [companies,    setCompanies]    = useState([]);
  const [activeCo,     setActiveCo]     = useState(null);
  const [showNewCo,    setShowNewCo]    = useState(false);
  const [newCoName,    setNewCoName]    = useState('');
  const [docSearch,    setDocSearch]    = useState('');
  const [docViewMode,  setDocViewMode]  = useState('grid');
  const [appToast,          setAppToast]          = useState(null);
  const [serverOnline,      setServerOnline]      = useState(null); // null=unknown, true, false
  const [visualizeFocusDoc, setVisualizeFocusDoc] = useState(null);
  const [appRealDocs,       setAppRealDocs]       = useState([]);

  const showAppToast = (msg, type = 'info') => {
    setAppToast({ msg, type });
    setTimeout(() => setAppToast(null), 4000);
  };

  useEffect(() => {
    apiGetCompanies()
      .then(rows => {
        setServerOnline(true);
        if (Array.isArray(rows)) setCompanies(rows.map(r => ({ id:r.id, name:r.name, slug:r.slug })));
      })
      .catch(() => {
        setServerOnline(false);
        showAppToast('Servidor offline — los datos no se guardarán. Ejecuta: node server.js', 'warn');
      });
  }, []);

  const switchCo = coId => setActiveCo(coId);

  const addDocToContext = (normOrId) => {
    if (typeof normOrId === 'string') {
      toggle(normOrId);
    } else {
      toggle(normOrId.id);
      setAppRealDocs(prev => prev.find(d => d.id === normOrId.id) ? prev : [normOrId, ...prev]);
    }
  };

  const onGoVisualize = doc => {
    if (!selected.includes(doc.id)) addDocToContext(doc);
    setVisualizeFocusDoc(doc);
    setPage('visualize');
  };
  const createCo = async () => {
    const name = newCoName.trim();
    if (!name) return;
    setNewCoName(''); setShowNewCo(false);
    try {
      const r = await apiCreateCompany(name);
      if (r?.id) {
        const co = { id:r.id, name:r.name, slug:r.slug };
        setCompanies(prev => [...prev, co]);
        setActiveCo(r.id);
        setServerOnline(true);
        return;
      }
      // Server responded but with an error body
      showAppToast('Error al crear empresa: ' + (r?.error || 'respuesta inesperada'), 'error');
    } catch {
      showAppToast('Servidor offline — empresa creada solo en memoria (se perderá al recargar)', 'warn');
    }
    // Fallback: local only
    const id = 'c' + Date.now();
    setCompanies(prev => [...prev, { id, name }]);
    setActiveCo(id);
  };

  const toggle   = id => setSelected(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );
  const clearAll = () => setSelected([]);

  if (!loggedIn) return <LoginPage onLogin={() => setLoggedIn(true)} />;

  const trackQuery = docIds => {
    setDocStats(prev => {
      const next = { ...prev };
      docIds.forEach(id => {
        next[id] = { queries: (prev[id]?.queries || 0) + 1 };
      });
      return next;
    });
  };

  const saveGraph = ({ name, comment } = {}) => {
    if (selected.length < 3) return;
    const g = {
      id:        'g' + Date.now(),
      name:      (name||'').trim() || `Grafo ${savedGraphs.length + 1}`,
      comment:   (comment||'').trim(),
      docIds:    [...selected],
      createdAt: new Date().toISOString(),
    };
    setSavedGraphs(prev => [g, ...prev]);
  };

  const deleteGraph = id => setSavedGraphs(prev => prev.filter(g => g.id !== id));

  return (
    <div style={{
      display:'flex', height:'100vh', overflow:'hidden',
      fontFamily:C.font, background:C.bg, color:C.text,
    }}>
      {/* Global toast */}
      {appToast && (
        <div style={{
          position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)',
          zIndex:9999, borderRadius:'10px', padding:'10px 18px',
          fontSize:'12px', fontWeight:500, fontFamily:C.font,
          maxWidth:'460px', textAlign:'center', pointerEvents:'none',
          background: appToast.type === 'error' ? '#c0392b' : appToast.type === 'warn' ? '#e8a020' : C.text,
          color:'#fff', boxShadow:'0 4px 20px rgba(0,0,0,0.2)',
        }}>{appToast.msg}</div>
      )}
      {/* Server offline badge */}
      {serverOnline === false && (
        <div style={{
          position:'fixed', top:'10px', right:'16px', zIndex:9000,
          display:'flex', alignItems:'center', gap:'6px', padding:'5px 12px',
          background:'#e8a020', borderRadius:'8px', fontSize:'11px', fontWeight:600, color:'#fff',
          boxShadow:'0 2px 8px rgba(0,0,0,0.15)',
        }}>
          <i className="ti ti-wifi-off" style={{ fontSize:'13px' }} />
          Servidor offline
        </div>
      )}
      <Sidebar page={page} onNav={setPage} selected={selected} onToggle={toggle} />
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {page !== 'documents' && (
          <Topbar
            selected={selected} onRemove={toggle} onClearAll={clearAll}
            llm={llm} onLlmChange={setLlm}
            page={page}
            companies={companies} activeCo={activeCo} onSwitchCo={switchCo}
          />
        )}
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
            <DocumentsPage selected={selected} onToggle={toggle} onClearAll={clearAll} activeCo={activeCo} companies={companies} onNewCo={() => setShowNewCo(true)} onSwitchCo={switchCo} search={docSearch} onSearch={setDocSearch} viewMode={docViewMode} onViewMode={setDocViewMode} onGlobalToast={showAppToast} onGoVisualize={onGoVisualize} onRealDocsChange={setAppRealDocs} docStats={docStats} />
          )}
          {page === 'visualize' && (
            <VisualizePage selected={selected} onToggle={toggle} focusDoc={visualizeFocusDoc} allRealDocs={appRealDocs} />
          )}
          {page === 'graphs' && (
            <GraphsPage selected={selected} onToggle={toggle} allRealDocs={appRealDocs} docStats={docStats} savedGraphs={savedGraphs} onSaveGraph={saveGraph} onDeleteGraph={deleteGraph} onLoadGraph={ids => setSelected(ids)} />
          )}
          {page === 'chat' && (
            <ChatPage
              selected={selected} onRemove={toggle}
              llm={llm} onLlmChange={setLlm} onTrackQuery={trackQuery}
              companies={companies} activeCo={activeCo} onAddDoc={addDocToContext}
              allRealDocs={appRealDocs} onGoVisualize={onGoVisualize}
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
