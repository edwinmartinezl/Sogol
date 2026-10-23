'use strict';
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// Cargar .env antes de importar rag.js
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const [k, ...v] = line.trim().split('=');
      if (k && v.length && !process.env[k]) process.env[k] = v.join('=');
    });
  }
} catch {}

const rag = require('./rag');

let Database, busboy;
try { Database = require('better-sqlite3'); } catch {
  console.error('Run: npm install better-sqlite3 busboy'); process.exit(1);
}
try { busboy = require('busboy'); } catch {
  console.error('Run: npm install better-sqlite3 busboy'); process.exit(1);
}

const PORT        = 3001;
const ROOT        = __dirname;
const DB_PATH     = path.join(ROOT, 'knowlayer.db');
const ALLOWED_EXT = new Set(['.pdf', '.txt', '.xlsx', '.xls', '.csv', '.docx', '.doc']);

// ── Init SQLite ───────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
// Migration: add columns to existing DBs
try { db.exec(`ALTER TABLE files ADD COLUMN vectorized INTEGER DEFAULT 1`); } catch {}
try { db.exec(`ALTER TABLE files ADD COLUMN chunks INTEGER DEFAULT 0`);     } catch {}
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    title      TEXT NOT NULL DEFAULT 'Nueva conversación',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    sources         TEXT,
    created_at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_convs_co  ON conversations(company_id);
  CREATE INDEX IF NOT EXISTS idx_msgs_conv ON chat_messages(conversation_id);
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id            TEXT PRIMARY KEY,
    client_id     TEXT NOT NULL,
    company_id    TEXT NOT NULL,
    original_name TEXT NOT NULL,
    stored_name   TEXT NOT NULL,
    path_on_disk  TEXT NOT NULL,
    type          TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    dept_id       TEXT,
    group_id      TEXT,
    uploaded_at   TEXT NOT NULL,
    vectorized    INTEGER DEFAULT 1,
    chunks        INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS companies (
    id         TEXT PRIMARY KEY,
    client_id  TEXT NOT NULL,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS departments (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name       TEXT NOT NULL,
    icon       TEXT NOT NULL DEFAULT 'ti-folder',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS groups (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    dept_id    TEXT NOT NULL,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// ── Helpers ───────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    ...CORS_HEADERS,
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

// ── RAG microservice helper (port 3002) ───────────────────────────────────────

function callRag(method, ragPath, body) {
  return new Promise((resolve, reject) => {
    const data = (body && method !== 'GET' && method !== 'DELETE')
      ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1', port: 3002,
      path: ragPath, method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(opts, r => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch { resolve(null); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const urlObj   = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = urlObj.pathname;                       // e.g. /api/files
  const parts    = pathname.split('/').filter(Boolean);   // ['api','files','ID','move']
  const qp       = urlObj.searchParams;

  // ── POST /api/upload ──────────────────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/upload') {
    const fields   = {};
    let   fileData = null;
    let   uploadError = null;

    const bb = busboy({ headers: req.headers });

    bb.on('field', (name, val) => { fields[name] = val; });

    bb.on('file', (_field, stream, info) => {
      const { filename } = info;
      const ext = path.extname(filename).toLowerCase();

      if (!ALLOWED_EXT.has(ext)) {
        stream.resume();
        uploadError = `Extension not allowed: ${ext}. Accepted: .pdf .txt .xlsx`;
        return;
      }

      const chunks = [];
      stream.on('data',  d => chunks.push(d));
      stream.on('close', () => {
        fileData = { filename, ext, buffer: Buffer.concat(chunks) };
      });
    });

    bb.on('close', () => {
      if (uploadError) return sendJson(res, 400, { error: uploadError });
      if (!fields.client_id || !fields.company_id)
        return sendJson(res, 400, { error: 'client_id and company_id are required' });
      if (!fileData)
        return sendJson(res, 400, { error: 'No file received' });

      const { client_id, company_id } = fields;
      const dir = path.join(ROOT, 'clientes', client_id, 'empresas', company_id, 'files');
      fs.mkdirSync(dir, { recursive: true });

      const id          = crypto.randomUUID();
      const stored_name = `${id}${fileData.ext}`;
      const dest        = path.join(dir, stored_name);

      try {
        fs.writeFileSync(dest, fileData.buffer);
      } catch (e) {
        return sendJson(res, 500, { error: 'Could not write file: ' + e.message });
      }

      const size_bytes = fileData.buffer.length;
      const record = {
        id,
        client_id,
        company_id,
        original_name: fileData.filename,
        stored_name,
        path_on_disk:  dest,
        type:          fileData.ext.replace('.', ''),
        size_bytes,
        dept_id:       null,
        group_id:      null,
        uploaded_at:   new Date().toISOString(),
        vectorized:    0,
        chunks:        0,
      };

      db.prepare(`
        INSERT INTO files
          (id, client_id, company_id, original_name, stored_name, path_on_disk,
           type, size_bytes, dept_id, group_id, uploaded_at, vectorized, chunks)
        VALUES
          (@id, @client_id, @company_id, @original_name, @stored_name, @path_on_disk,
           @type, @size_bytes, @dept_id, @group_id, @uploaded_at, @vectorized, @chunks)
      `).run(record);

      console.log(`[upload] ${record.original_name} → ${stored_name}`);

      // Vectorización asíncrona — no bloquea la respuesta al cliente
      setImmediate(async () => {
        try {
          const result = await rag.ingest(db, {
            file_id:    id,
            file_path:  dest,
            company_id: fields.company_id,
            file_name:  fileData.filename,
          });
          const chunks = result?.chunks ?? 0;
          db.prepare('UPDATE files SET vectorized=?, chunks=? WHERE id=?')
            .run(chunks > 0 ? 1 : 2, chunks, id);
          console.log(`[rag]    ${fileData.filename} → ${chunks} chunks`);
        } catch (e) {
          db.prepare('UPDATE files SET vectorized=2 WHERE id=?').run(id);
          console.log(`[rag]    ${fileData.filename} → error: ${e.message}`);
        }
      });
      sendJson(res, 201, record);
    });

    req.pipe(bb);
    return;
  }

  // ── GET /api/files?client_id=&company_id= ────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/files') {
    const client_id  = qp.get('client_id');
    const company_id = qp.get('company_id');
    if (!client_id || !company_id)
      return sendJson(res, 400, { error: 'client_id and company_id are required' });

    const rows = db.prepare(
      'SELECT * FROM files WHERE client_id=? AND company_id=? ORDER BY uploaded_at DESC'
    ).all(client_id, company_id);

    return sendJson(res, 200, rows);
  }

  // ── PATCH /api/files/:id/move ─────────────────────────────────────────────
  if (req.method === 'PATCH' && parts.length === 4 && parts[3] === 'move') {
    const id = parts[2];
    let payload;
    try { payload = JSON.parse(await readBody(req)); }
    catch { return sendJson(res, 400, { error: 'Invalid JSON body' }); }

    const { dept_id = null, group_id = null } = payload;
    const result = db.prepare(
      'UPDATE files SET dept_id=?, group_id=? WHERE id=?'
    ).run(dept_id, group_id, id);

    if (result.changes === 0) return sendJson(res, 404, { error: 'File not found' });
    const row = db.prepare('SELECT * FROM files WHERE id=?').get(id);
    return sendJson(res, 200, row);
  }

  // ── DELETE /api/files/:id ─────────────────────────────────────────────────
  if (req.method === 'DELETE' && parts.length === 3 && parts[1] === 'files') {
    const id  = parts[2];
    const row = db.prepare('SELECT * FROM files WHERE id=?').get(id);
    if (!row) return sendJson(res, 404, { error: 'File not found' });

    try { fs.unlinkSync(row.path_on_disk); } catch { /* already gone */ }
    db.prepare('DELETE FROM files WHERE id=?').run(id);
    console.log(`[delete] ${row.original_name}`);
    // Borrar vectores de SQLite
    try { rag.deleteVectors(db, id); } catch {}
    return sendJson(res, 200, { deleted: id });
  }

  // ── GET /api/files/:id/view ───────────────────────────────────────────────
  if (req.method === 'GET' && parts.length === 4 && parts[1] === 'files' && parts[3] === 'view') {
    const id  = parts[2];
    const row = db.prepare('SELECT * FROM files WHERE id=?').get(id);
    if (!row) { res.writeHead(404, CORS_HEADERS); res.end('Not found'); return; }
    let data;
    try { data = fs.readFileSync(row.path_on_disk); } catch { res.writeHead(404, CORS_HEADERS); res.end('File not on disk'); return; }
    const ext = path.extname(row.stored_name).toLowerCase();
    const ct  = ext === '.pdf' ? 'application/pdf' : ext === '.txt' ? 'text/plain; charset=utf-8' : 'application/octet-stream';
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': ct, 'Content-Disposition': `inline; filename="${row.original_name}"`, 'Content-Length': data.length });
    res.end(data);
    return;
  }

  // ── GET /api/companies?client_id= ─────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/companies') {
    const client_id = qp.get('client_id');
    if (!client_id) return sendJson(res, 400, { error: 'client_id required' });
    const rows = db.prepare('SELECT * FROM companies WHERE client_id=? ORDER BY created_at ASC').all(client_id);
    return sendJson(res, 200, rows);
  }

  // ── POST /api/companies ───────────────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/companies') {
    let payload;
    try { payload = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const { client_id, name } = payload || {};
    if (!client_id || !name) return sendJson(res, 400, { error: 'client_id and name required' });
    const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'empresa';
    const id = crypto.randomUUID();
    const record = { id, client_id, name, slug, created_at: new Date().toISOString() };
    try {
      db.prepare('INSERT INTO companies (id, client_id, name, slug, created_at) VALUES (@id, @client_id, @name, @slug, @created_at)').run(record);
      console.log(`[company] created: ${name} (${slug})`);
      return sendJson(res, 201, record);
    } catch (e) { return sendJson(res, 500, { error: e.message }); }
  }

  // ── GET /api/departments?company_id= ──────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/departments') {
    const company_id = qp.get('company_id');
    if (!company_id) return sendJson(res, 400, { error: 'company_id required' });
    const rows = db.prepare('SELECT * FROM departments WHERE company_id=? ORDER BY created_at ASC').all(company_id);
    return sendJson(res, 200, rows);
  }

  // ── POST /api/departments ─────────────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/departments') {
    let payload;
    try { payload = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const { company_id, name, icon = 'ti-folder' } = payload || {};
    if (!company_id || !name) return sendJson(res, 400, { error: 'company_id and name required' });
    const id = crypto.randomUUID();
    const record = { id, company_id, name, icon, created_at: new Date().toISOString() };
    db.prepare('INSERT INTO departments (id, company_id, name, icon, created_at) VALUES (@id, @company_id, @name, @icon, @created_at)').run(record);
    console.log(`[dept] created: ${name} in ${company_id}`);
    return sendJson(res, 201, record);
  }

  // ── GET /api/groups?company_id= ───────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/groups') {
    const company_id = qp.get('company_id');
    if (!company_id) return sendJson(res, 400, { error: 'company_id required' });
    const rows = db.prepare('SELECT * FROM groups WHERE company_id=? ORDER BY created_at ASC').all(company_id);
    return sendJson(res, 200, rows);
  }

  // ── POST /api/groups ──────────────────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/groups') {
    let payload;
    try { payload = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const { company_id, dept_id, name } = payload || {};
    if (!company_id || !dept_id || !name) return sendJson(res, 400, { error: 'company_id, dept_id and name required' });
    const id = crypto.randomUUID();
    const record = { id, company_id, dept_id, name, created_at: new Date().toISOString() };
    db.prepare('INSERT INTO groups (id, company_id, dept_id, name, created_at) VALUES (@id, @company_id, @dept_id, @name, @created_at)').run(record);
    console.log(`[group] created: ${name} in ${company_id}/${dept_id}`);
    return sendJson(res, 201, record);
  }

  // ── GET /api/storage?company_id= ─────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/storage') {
    const company_id = qp.get('company_id');
    if (!company_id) return sendJson(res, 400, { error: 'company_id required' });

    const LIMIT = 1073741824; // 1 GB — plan free
    const rows = db.prepare(
      'SELECT type, COUNT(*) as count, SUM(size_bytes) as bytes FROM files WHERE company_id=? GROUP BY type'
    ).all(company_id);

    const byType = {};
    let totalBytes = 0;
    let totalDocs  = 0;
    rows.forEach(r => {
      byType[r.type] = { count: r.count, bytes: r.bytes || 0 };
      totalBytes += r.bytes || 0;
      totalDocs  += r.count;
    });

    return sendJson(res, 200, { totalBytes, limitBytes: LIMIT, byType, totalDocs });
  }

  // ── GET /api/conversations?company_id= ───────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/conversations') {
    const company_id = qp.get('company_id');
    if (!company_id) return sendJson(res, 400, { error: 'company_id required' });
    const rows = db.prepare(
      'SELECT * FROM conversations WHERE company_id=? ORDER BY updated_at DESC'
    ).all(company_id);
    return sendJson(res, 200, rows);
  }

  // ── POST /api/conversations ────────────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/conversations') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const { company_id, title = 'Nueva conversación' } = body || {};
    if (!company_id) return sendJson(res, 400, { error: 'company_id required' });
    const now = new Date().toISOString();
    const record = { id: crypto.randomUUID(), company_id, title, created_at: now, updated_at: now };
    db.prepare('INSERT INTO conversations (id,company_id,title,created_at,updated_at) VALUES (@id,@company_id,@title,@created_at,@updated_at)').run(record);
    return sendJson(res, 201, record);
  }

  // ── PATCH /api/conversations/:id ──────────────────────────────────────────
  if (req.method === 'PATCH' && /^\/api\/conversations\/[^/]+$/.test(pathname)) {
    const convId = pathname.split('/').pop();
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const now = new Date().toISOString();
    if (body.title) db.prepare('UPDATE conversations SET title=?,updated_at=? WHERE id=?').run(body.title, now, convId);
    else db.prepare('UPDATE conversations SET updated_at=? WHERE id=?').run(now, convId);
    return sendJson(res, 200, db.prepare('SELECT * FROM conversations WHERE id=?').get(convId) || {});
  }

  // ── DELETE /api/conversations/:id ─────────────────────────────────────────
  if (req.method === 'DELETE' && /^\/api\/conversations\/[^/]+$/.test(pathname)) {
    const convId = pathname.split('/').pop();
    db.prepare('DELETE FROM chat_messages WHERE conversation_id=?').run(convId);
    db.prepare('DELETE FROM conversations WHERE id=?').run(convId);
    return sendJson(res, 200, { deleted: convId });
  }

  // ── GET /api/conversations/:id/messages ───────────────────────────────────
  if (req.method === 'GET' && /^\/api\/conversations\/[^/]+\/messages$/.test(pathname)) {
    const convId = pathname.split('/')[3];
    const rows = db.prepare('SELECT * FROM chat_messages WHERE conversation_id=? ORDER BY created_at ASC').all(convId);
    return sendJson(res, 200, rows.map(r => ({ ...r, sources: r.sources ? JSON.parse(r.sources) : [] })));
  }

  // ── POST /api/conversations/:id/messages ──────────────────────────────────
  if (req.method === 'POST' && /^\/api\/conversations\/[^/]+\/messages$/.test(pathname)) {
    const convId = pathname.split('/')[3];
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const { role, content, sources = [] } = body || {};
    if (!role || !content) return sendJson(res, 400, { error: 'role and content required' });
    const now = new Date().toISOString();
    const record = { id: crypto.randomUUID(), conversation_id: convId, role, content, sources: JSON.stringify(sources), created_at: now };
    db.prepare('INSERT INTO chat_messages (id,conversation_id,role,content,sources,created_at) VALUES (@id,@conversation_id,@role,@content,@sources,@created_at)').run(record);
    db.prepare('UPDATE conversations SET updated_at=? WHERE id=?').run(now, convId);
    return sendJson(res, 201, { ...record, sources });
  }

  // ── POST /api/chat/query ─────────────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/chat/query') {
    let payload;
    try { payload = JSON.parse(await readBody(req)); }
    catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const { company_id, file_ids = [], question } = payload || {};
    if (!company_id || !question)
      return sendJson(res, 400, { error: 'company_id and question required' });
    try {
      const result = await rag.query(db, { company_id, file_ids, question });
      return sendJson(res, 200, result);
    } catch (e) {
      return sendJson(res, 503, { error: e.message });
    }
  }

  // ── GET /api/rag/status ────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/rag/status') {
    return sendJson(res, 200, rag.status(db));
  }

  // ── GET /api/ping ─────────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/ping') {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    return sendJson(res, 200, { version: 'v2', tables, db: DB_PATH });
  }

  sendJson(res, 404, { error: `No route: ${req.method} ${pathname}` });
});

const EXT_CT = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

const staticServer = http.createServer((req, res) => {
  const urlPath = new URL(req.url, 'http://localhost').pathname;
  const filePath = urlPath === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, urlPath);
  const ext = path.extname(filePath).toLowerCase();
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': EXT_CT[ext] || 'text/plain', 'Content-Length': Buffer.byteLength(data) });
    res.end(data);
  } catch {
    const idx = fs.readFileSync(path.join(ROOT, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(idx) });
    res.end(idx);
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     Sogol API  v2  (companies + depts)   ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`   API    →  http://localhost:${PORT}`);
  console.log(`   App    →  http://localhost:3000`);
  console.log(`   DB     →  ${DB_PATH}`);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  console.log(`   Tables: ${tables.join(', ')}`);
  console.log('');
});

staticServer.listen(3000);
