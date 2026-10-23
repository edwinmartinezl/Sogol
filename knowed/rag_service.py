#!/usr/bin/env python3
"""RAG microservice para Sogol — ChromaDB local + Jina AI embeddings + Ollama LLM"""
import os, sys
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR / '.env')

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import chromadb
import requests

# ── Config ────────────────────────────────────────────────────────────────────
JINA_KEY     = os.getenv('JINA_API_KEY', '')
OLLAMA_URL   = os.getenv('OLLAMA_URL',   'http://localhost:11434')
OLLAMA_MODEL = os.getenv('OLLAMA_MODEL', 'llama3.2')
CHROMA_PATH  = str(BASE_DIR / 'chromadb')
CHUNK_SIZE   = 400
CHUNK_OVERLAP= 40
TOP_K        = 5
EMB_DIM      = 512

app = FastAPI(title='Sogol RAG', version='1.0')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])

chroma = chromadb.PersistentClient(path=CHROMA_PATH)

# ── Extracción de texto ───────────────────────────────────────────────────────
def extract_pdf(path: str) -> str:
    try:
        import fitz
        doc = fitz.open(path)
        return '\n'.join(p.get_text() for p in doc)
    except ImportError:
        pass
    try:
        from pypdf import PdfReader
        r = PdfReader(path)
        return '\n'.join(p.extract_text() or '' for p in r.pages)
    except ImportError:
        pass
    try:
        from PyPDF2 import PdfReader
        r = PdfReader(path)
        return '\n'.join(p.extract_text() or '' for p in r.pages)
    except Exception:
        return ''

def extract_text(file_path: str) -> str:
    p   = Path(file_path)
    ext = p.suffix.lower()
    try:
        if ext == '.pdf':
            return extract_pdf(file_path)
        elif ext in ('.xlsx', '.xls'):
            import pandas as pd
            sheets = pd.read_excel(file_path, sheet_name=None)
            parts  = [f'[Hoja: {name}]\n{df.to_csv(index=False)}' for name, df in sheets.items()]
            return '\n\n'.join(parts)
        elif ext == '.csv':
            return p.read_text(encoding='utf-8', errors='ignore')
        elif ext == '.docx':
            from docx import Document
            return '\n'.join(para.text for para in Document(file_path).paragraphs if para.text.strip())
        elif ext == '.txt':
            return p.read_text(encoding='utf-8', errors='ignore')
    except Exception as e:
        print(f'[extract] {file_path}: {e}', file=sys.stderr)
    return ''

def chunk_text(text: str) -> list:
    words = text.split()
    step  = max(1, CHUNK_SIZE - CHUNK_OVERLAP)
    return [
        ' '.join(words[i:i + CHUNK_SIZE])
        for i in range(0, len(words), step)
        if words[i:i + CHUNK_SIZE]
    ]

# ── Embeddings — Jina AI ──────────────────────────────────────────────────────
def embed(texts: list, task: str = 'retrieval.passage') -> list:
    if not JINA_KEY:
        raise RuntimeError('JINA_API_KEY not configured')
    resp = requests.post(
        'https://api.jina.ai/v1/embeddings',
        headers={'Authorization': f'Bearer {JINA_KEY}', 'Content-Type': 'application/json'},
        json={'input': texts, 'model': 'jina-embeddings-v3', 'dimensions': EMB_DIM, 'task': task},
        timeout=60,
    )
    resp.raise_for_status()
    return [d['embedding'] for d in resp.json()['data']]

# ── ChromaDB helpers ──────────────────────────────────────────────────────────
def get_col(company_id: str):
    safe = company_id.replace('-', '_').replace('.', '_')
    return chroma.get_or_create_collection(
        f'co_{safe}',
        metadata={'hnsw:space': 'cosine'},
    )

# ── Modelos Pydantic ──────────────────────────────────────────────────────────
class IngestReq(BaseModel):
    file_id:    str
    file_path:  str
    company_id: str
    file_name:  str

class QueryReq(BaseModel):
    question:   str
    company_id: str
    file_ids:   list = []

# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get('/status')
def status():
    cols = [c.name for c in chroma.list_collections()]
    return {'ok': True, 'model': OLLAMA_MODEL, 'collections': cols}

@app.post('/ingest')
def ingest(req: IngestReq):
    text = extract_text(req.file_path)
    if not text.strip():
        return {'chunks': 0, 'warning': 'No se extrajo texto del archivo'}

    chunks = chunk_text(text)

    # Embeddings en batches de 32
    embeddings = []
    BATCH = 32
    for i in range(0, len(chunks), BATCH):
        embeddings.extend(embed(chunks[i:i + BATCH], task='retrieval.passage'))

    col = get_col(req.company_id)
    # Borrar chunks previos del mismo archivo (re-ingest)
    try:
        col.delete(where={'file_id': req.file_id})
    except Exception:
        pass

    col.add(
        ids        = [f'{req.file_id}_{i}' for i in range(len(chunks))],
        embeddings = embeddings,
        documents  = chunks,
        metadatas  = [{'file_id': req.file_id, 'file_name': req.file_name, 'chunk': i}
                      for i in range(len(chunks))],
    )
    print(f'[ingest] {req.file_name} → {len(chunks)} chunks → co_{req.company_id}')
    return {'chunks': len(chunks)}

@app.delete('/ingest/{file_id}')
def delete_vectors(file_id: str, company_id: str):
    col = get_col(company_id)
    try:
        col.delete(where={'file_id': file_id})
        print(f'[delete] vectors for {file_id} in co_{company_id}')
    except Exception:
        pass
    return {'deleted': file_id}

@app.post('/query')
def query(req: QueryReq):
    col   = get_col(req.company_id)
    count = col.count()

    if count == 0:
        return {
            'answer':  'No hay documentos vectorizados para esta empresa. Sube documentos desde la página Documents.',
            'sources': [],
        }

    q_emb = embed([req.question], task='retrieval.query')[0]

    where = {'file_id': {'$in': req.file_ids}} if req.file_ids else None

    results = col.query(
        query_embeddings = [q_emb],
        n_results        = min(TOP_K, count),
        where            = where,
        include          = ['documents', 'metadatas'],
    )

    docs   = results['documents'][0]
    metas  = results['metadatas'][0]

    if not docs:
        return {
            'answer':  'El documento seleccionado aún no tiene vectores en ChromaDB. '
                       'Espera a que termine la vectorización (badge VEC verde) y vuelve a preguntar.',
            'sources': [],
        }

    context = '\n\n---\n'.join(
        f'[{m["file_name"]}]\n{d}' for d, m in zip(docs, metas)
    )

    prompt = (
        'Eres un asistente empresarial experto. '
        'Responde en español basándote ÚNICAMENTE en los siguientes documentos de la empresa. '
        'Si la información no está en los documentos, dilo claramente. '
        'Sé conciso, preciso y usa viñetas cuando sea útil.\n\n'
        f'DOCUMENTOS:\n{context}\n\n'
        f'PREGUNTA: {req.question}\n\n'
        'RESPUESTA:'
    )

    try:
        r = requests.post(
            f'{OLLAMA_URL}/api/generate',
            json={'model': OLLAMA_MODEL, 'prompt': prompt, 'stream': False},
            timeout=180,
        )
        r.raise_for_status()
        payload = r.json()
        answer  = payload.get('response', '').strip()
        if not answer:
            # El modelo devolvió vacío — puede ser timeout del modelo cloud o error silencioso
            raise HTTPException(
                status_code=502,
                detail=f'Ollama devolvió respuesta vacía. Modelo: {OLLAMA_MODEL}. '
                       f'Verifica con: ollama run {OLLAMA_MODEL}'
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'No se pudo conectar a Ollama en {OLLAMA_URL}: {e}')

    sources = list({m['file_name'] for m in metas})
    return {'answer': answer, 'sources': sources}

if __name__ == '__main__':
    import uvicorn
    print(f'  ChromaDB → {CHROMA_PATH}')
    print(f'  Ollama   → {OLLAMA_URL} ({OLLAMA_MODEL})')
    uvicorn.run(app, host='127.0.0.1', port=3002, log_level='info')
