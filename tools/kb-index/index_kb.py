"""
index_kb.py — chunk the crypto knowledge base and store it in Qdrant.

Pipeline: vault markdown notes  →  chonkie RecursiveChunker  →  FastEmbed
embeddings  →  local (embedded, on-disk) Qdrant collection `crypto_kb`.

Local Qdrant means zero infrastructure — the vectors persist to
tools/kb-index/qdrant_data/. To move to a hosted/Docker Qdrant later, swap the
QdrantClient(path=...) line for QdrantClient(url=...); nothing else changes.

Usage:
    uv run python index_kb.py            # incremental upsert (idempotent by id)
    uv run python index_kb.py --reset    # wipe the collection and rebuild
    uv run python index_kb.py --stats    # just print what's stored, index nothing
"""
from __future__ import annotations

import argparse
import sys
import uuid
from pathlib import Path

import yaml
from chonkie import RecursiveChunker
from qdrant_client import QdrantClient, models

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")  # Windows cp1252 guard
    except Exception:
        pass

REPO_ROOT = Path(__file__).resolve().parents[2]
KB_ROOT = REPO_ROOT / "vault" / "13-Crypto-Knowledge-Base"
QDRANT_PATH = Path(__file__).resolve().parent / "qdrant_data"
COLLECTION = "crypto_kb"
EMBED_MODEL = "BAAI/bge-small-en-v1.5"  # FastEmbed: ONNX, CPU-friendly
EMBED_DIM = 384                          # bge-small-en-v1.5 output dimension
NAMESPACE = uuid.UUID("6f4b2e10-0000-4000-8000-000000000001")  # stable ids across re-runs

# Notes that are navigation, not content.
SKIP_NAMES = {"_index.md", "_crawl-index.md"}


def parse_note(path: Path) -> tuple[dict, str]:
    """Return (frontmatter dict, body markdown)."""
    text = path.read_text(encoding="utf-8")
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            fm_block = text[3:end].strip()
            body = text[end + 4:].lstrip("\n")
            try:
                fm = yaml.safe_load(fm_block) or {}
            except yaml.YAMLError:
                fm = {}
            return (fm if isinstance(fm, dict) else {}), body
    return {}, text


def iter_notes():
    for path in sorted(KB_ROOT.rglob("*.md")):
        if path.name in SKIP_NAMES:
            continue
        yield path


def stats(client: QdrantClient) -> None:
    if client.collection_exists(COLLECTION):
        info = client.get_collection(COLLECTION)
        print(f"Collection '{COLLECTION}': {info.points_count} chunks stored at {QDRANT_PATH}")
    else:
        print(f"Collection '{COLLECTION}' does not exist yet at {QDRANT_PATH}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Index the crypto KB into Qdrant.")
    ap.add_argument("--reset", action="store_true", help="Delete the collection and rebuild from scratch.")
    ap.add_argument("--chunk-size", type=int, default=1200, help="Max characters per chunk (default 1200).")
    ap.add_argument("--stats", action="store_true", help="Print collection stats and exit.")
    args = ap.parse_args()

    if not KB_ROOT.exists():
        sys.exit(f"KB not found at {KB_ROOT}")

    client = QdrantClient(path=str(QDRANT_PATH))

    if args.stats:
        stats(client)
        return 0

    if args.reset and client.collection_exists(COLLECTION):
        client.delete_collection(COLLECTION)
        print(f"Reset: dropped existing '{COLLECTION}'.")
    if not client.collection_exists(COLLECTION):
        client.create_collection(
            COLLECTION,
            vectors_config=models.VectorParams(size=EMBED_DIM, distance=models.Distance.COSINE),
        )

    chunker = RecursiveChunker(chunk_size=args.chunk_size, min_characters_per_chunk=64)

    points: list[models.PointStruct] = []
    files = 0

    for path in iter_notes():
        fm, body = parse_note(path)
        if not body.strip():
            continue
        rel = path.relative_to(REPO_ROOT).as_posix()
        chunks = chunker.chunk(body)
        for i, ch in enumerate(chunks):
            text = ch.text.strip()
            if not text:
                continue
            points.append(models.PointStruct(
                id=str(uuid.uuid5(NAMESPACE, f"{rel}::{i}")),
                vector=models.Document(text=text, model=EMBED_MODEL),  # embedded locally on upsert
                payload={
                    "title": fm.get("title", path.stem),
                    "source": fm.get("source", ""),
                    "category": fm.get("category", path.parent.name),
                    "path": rel,
                    "chunk_index": i,
                    "text": text,
                },
            ))
        files += 1
        print(f"  {rel}  → {len(chunks)} chunks")

    if not points:
        print("Nothing to index.")
        return 1

    print(f"\nEmbedding + upserting {len(points)} chunks from {files} notes "
          f"(model {EMBED_MODEL}; first run downloads it)...")
    client.upsert(COLLECTION, points=points)

    stats(client)
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
