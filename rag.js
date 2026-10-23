'use strict';
/**
 * RAG engine — Node.js nativo
 * Embeddings: Jina AI API
 * Vectores:   SQLite (tabla chunks)
 * LLM:        Ollama HTTP
 */
const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const http    = require('http');

// ── Config ────────────────────────────────────────────────────────────────────
const JINA_KEY    = process.env.JINA_API_KEY  || '';
const OLLAMA_URL  = process.env.OLLAMA_URL    || 'http://localhost:11434';
const OLLAMA_MODEL= process.env.OLLAMA_MODEL  || 'minimax-m3:cloud';
const CHUNK_SIZE  = 400;   // palabras por chunk
const CHUNK_OVLP  = 40;
const TOP_K       = 5;
const EMB_DIM     = 512;

// ── Carga .env manualmente (sin dependencia dotenv) ───────────────────────────
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const [k, ...v] = line.trim().split('=');
      if (k && v.length && !process.env[k]) process.env[k] = v.join('=');
    });
  }
} catch {}

// Reasignar tras cargar .env
const cfg = () => ({
  jinaKey:    process.env.JINA_API_KEY   || JINA_KEY,
  ollamaUrl:  process.env.OLLAMA_URL     || OLLAMA_URL,
  ollamaModel:process.env.OLLAMA_MODEL   || OLLAMA_MODEL,
});

// ── SQLite init (tabla chunks) ────────────────────────────────────────────────
function initChunksTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id          TEXT PRIMARY KEY,
      file_id     TEXT NOT NULL,
      company_id  TEXT NOT NULL,
      file_name   TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content     TEXT NOT NULL,
      embedding   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_co   ON chunks(company_id);
  `);
}

// ── Extracción de texto ───────────────────────────────────────────────────────
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const buf = fs.readFileSync(filePath);
      const data = await pdfParse(buf);
      return data.text || '';
    }
    if (ext === '.xlsx' || ext === '.xls') {
      const XLSX = require('xlsx');
      const wb = XLSX.readFile(filePath);
      return wb.SheetNames.map(n => {
        const ws = wb.Sheets[n];
        return `[${n}]\n` + XLSX.utils.sheet_to_csv(ws);
      }).join('\n\n');
    }
    if (ext === '.csv') {
      return fs.readFileSync(filePath, 'utf8');
    }
    if (ext === '.docx' || ext === '.doc') {
      const mammoth = require('mammoth');
      const result  = await mammoth.extractRawText({ path: filePath });
      return result.value || '';
    }
    if (ext === '.txt') {
      return fs.readFileSync(filePath, 'utf8');
    }
  } catch (e) {
    console.error('[rag] extract error:', e.message);
  }
  return '';
}

function chunkText(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const step  = Math.max(1, CHUNK_SIZE - CHUNK_OVLP);
  const chunks = [];
  for (let i = 0; i < words.length; i += step) {
    const chunk = words.slice(i, i + CHUNK_SIZE).join(' ');
    if (chunk.trim()) chunks.push(chunk);
  }
  return chunks;
}

// ── HTTP helper genérico ──────────────────────────────────────────────────────
function httpPost(urlStr, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data  = JSON.stringify(body);
    const url   = new URL(urlStr);
    const mod   = url.protocol === 'https:' ? https : http;
    const opts  = {
      hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...extraHeaders },
    };
    const req = mod.request(opts, res => {
      const parts = [];
      res.on('data', c => parts.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(parts).toString())); }
        catch { reject(new Error('Invalid JSON from ' + urlStr)); }
      });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

// ── Jina AI embeddings ────────────────────────────────────────────────────────
async function embed(texts, task = 'retrieval.passage') {
  const { jinaKey } = cfg();
  if (!jinaKey) throw new Error('JINA_API_KEY no configurado en .env');
  const result = await httpPost(
    'https://api.jina.ai/v1/embeddings',
    { input: texts, model: 'jina-embeddings-v3', dimensions: EMB_DIM, task },
    { Authorization: `Bearer ${jinaKey}` }
  );
  if (result.error) throw new Error('Jina AI: ' + JSON.stringify(result.error));
  return result.data.map(d => d.embedding);
}

// ── Cosine similarity ─────────────────────────────────────────────────────────
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

// ── Ingest ────────────────────────────────────────────────────────────────────
async function ingest(db, { file_id, file_path, company_id, file_name }) {
  initChunksTable(db);

  const text = await extractText(file_path);
  if (!text.trim()) return { chunks: 0, warning: 'Sin texto extraído' };

  const chunks = chunkText(text);
  if (!chunks.length) return { chunks: 0, warning: 'Sin chunks generados' };

  // Embed en batches de 32
  const BATCH = 32;
  const embeddings = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = await embed(chunks.slice(i, i + BATCH), 'retrieval.passage');
    embeddings.push(...batch);
  }

  // Borrar chunks previos del mismo archivo
  db.prepare('DELETE FROM chunks WHERE file_id = ?').run(file_id);

  const insert = db.prepare(`
    INSERT INTO chunks (id, file_id, company_id, file_name, chunk_index, content, embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction(rows => { for (const r of rows) insert.run(...r); });

  insertMany(chunks.map((c, i) => [
    `${file_id}_${i}`,
    file_id, company_id, file_name, i,
    c,
    JSON.stringify(embeddings[i]),
  ]));

  console.log(`[rag] ingest ${file_name} → ${chunks.length} chunks`);
  return { chunks: chunks.length };
}

// ── Delete vectors ────────────────────────────────────────────────────────────
function deleteVectors(db, file_id) {
  initChunksTable(db);
  db.prepare('DELETE FROM chunks WHERE file_id = ?').run(file_id);
  console.log(`[rag] deleted vectors for ${file_id}`);
}

// ── Query RAG ─────────────────────────────────────────────────────────────────
async function query(db, { company_id, file_ids = [], question }) {
  initChunksTable(db);

  // Buscar chunks relevantes
  const allChunks = file_ids.length > 0
    ? db.prepare(`SELECT * FROM chunks WHERE company_id=? AND file_id IN (${file_ids.map(()=>'?').join(',')})`)
        .all(company_id, ...file_ids)
    : db.prepare('SELECT * FROM chunks WHERE company_id=?').all(company_id);

  if (!allChunks.length) {
    return {
      answer: 'El documento aún no está vectorizado. Espera el badge VEC verde y vuelve a preguntar.',
      sources: [],
    };
  }

  // Embedding de la consulta
  const [qEmb] = await embed([question], 'retrieval.query');

  // Cosine similarity + top-K
  const scored = allChunks.map(c => ({
    ...c, score: cosine(qEmb, JSON.parse(c.embedding)),
  })).sort((a, b) => b.score - a.score).slice(0, TOP_K);

  const context = scored.map(c => `[${c.file_name}]\n${c.content}`).join('\n\n---\n');
  const sources = [...new Set(scored.map(c => c.file_name))];

  const prompt = [
    'Eres un asistente empresarial. Responde en español basándote ÚNICAMENTE en los siguientes documentos.',
    'Si la información no está en los documentos, dilo claramente. Sé conciso y preciso.',
    '',
    'DOCUMENTOS:',
    context,
    '',
    `PREGUNTA: ${question}`,
    '',
    'RESPUESTA:',
  ].join('\n');

  // Ollama
  const { ollamaUrl, ollamaModel } = cfg();
  let answer;
  try {
    const result = await httpPost(`${ollamaUrl}/api/generate`, {
      model: ollamaModel, prompt, stream: false,
    });
    answer = (result.response || '').trim();
    if (!answer) throw new Error('Ollama devolvió respuesta vacía');
  } catch (e) {
    throw new Error(`Ollama (${ollamaModel}): ${e.message}`);
  }

  return { answer, sources };
}

// ── Status ────────────────────────────────────────────────────────────────────
function status(db) {
  initChunksTable(db);
  const { ollamaModel, ollamaUrl } = cfg();
  const total  = db.prepare('SELECT COUNT(*) as c FROM chunks').get().c;
  const files  = db.prepare('SELECT COUNT(DISTINCT file_id) as c FROM chunks').get().c;
  return { ok: true, model: ollamaModel, ollamaUrl, totalChunks: total, totalFiles: files };
}

module.exports = { initChunksTable, ingest, deleteVectors, query, status };
