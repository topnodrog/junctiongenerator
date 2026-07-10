# kb-index

Turns the scraped crypto knowledge base into a **searchable vector store** so you
(and, later, the site's scam-check tool) can ask questions in natural language and
get back the most relevant passages with their sources.

Pipeline: `vault/13-Crypto-Knowledge-Base/*.md` → [chonkie](https://github.com/topnodrog/chonkie)
`RecursiveChunker` → [FastEmbed](https://github.com/qdrant/fastembed) embeddings
(ONNX, CPU-friendly) → **Qdrant** (local, on-disk, no server).

## One-time setup (already done on this machine)

```powershell
# from C:\dev\JunctionGenerator\tools\kb-index
uv venv --python 3.12 .venv
uv pip install --python .venv chonkie "qdrant-client[fastembed]" pyyaml
```

No GPU and no Docker required: Qdrant runs in embedded local mode and FastEmbed
uses ONNX on CPU. The first index run downloads the embedding model (~90 MB).

## Usage

```powershell
$py = ".\.venv\Scripts\python.exe"; $env:PYTHONIOENCODING = "utf-8"

& $py index_kb.py --reset                       # build/rebuild the index
& $py index_kb.py --stats                        # how many chunks are stored
& $py query_kb.py "how does a pig butchering scam work?"
& $py query_kb.py "what is a hardware wallet" --limit 3 --category security
```

Re-run `index_kb.py` after adding notes with the crawler. Chunk ids are
deterministic (`uuid5` of path + chunk index), so re-indexing upserts rather than
duplicating. Use `--reset` for a clean rebuild.

## Design notes

- **Qdrant collection:** `crypto_kb`, stored at `qdrant_data/` (gitignored).
- **Embedding model:** `BAAI/bge-small-en-v1.5` (384-dim). Keep index and query
  on the *same* model — both scripts hard-code it.
- **Going to a service later:** to let the Cloudflare Worker / website query this
  live, host Qdrant (Qdrant Cloud, or the forked server via Docker) and change
  `QdrantClient(path=...)` → `QdrantClient(url=..., api_key=...)`. The rest of the
  code is identical. The `topnodrog/qdrant` server fork is available for that; it
  is **not** needed for this local-mode setup.
- **chonkie** does light, offline recursive chunking (no ML). Semantic/neural
  chunkers exist in chonkie if you later want them, but they pull heavier deps.
