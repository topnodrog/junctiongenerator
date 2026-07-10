"""
query_kb.py — semantic search over the crypto knowledge base.

Embeds your query with the same FastEmbed model used for indexing and returns the
most similar chunks from the local Qdrant collection, each with its source note.

Usage:
    uv run python query_kb.py "how does a pig butchering scam work?"
    uv run python query_kb.py "what is a hardware wallet" --limit 3
    uv run python query_kb.py "automated market maker" --category protocols
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from qdrant_client import QdrantClient
from qdrant_client import models as qm
from qdrant_client.models import Document

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

QDRANT_PATH = Path(__file__).resolve().parent / "qdrant_data"
COLLECTION = "crypto_kb"
EMBED_MODEL = "BAAI/bge-small-en-v1.5"


def main() -> int:
    ap = argparse.ArgumentParser(description="Semantic search over the crypto KB.")
    ap.add_argument("query", help="Natural-language query.")
    ap.add_argument("--limit", type=int, default=5, help="Number of results (default 5).")
    ap.add_argument("--category", default=None, help="Restrict to a category (scams/security/protocols/...).")
    args = ap.parse_args()

    if not QDRANT_PATH.exists():
        sys.exit(f"No index found at {QDRANT_PATH}. Run index_kb.py first.")

    client = QdrantClient(path=str(QDRANT_PATH))

    query_filter = None
    if args.category:
        query_filter = qm.Filter(
            must=[qm.FieldCondition(key="category", match=qm.MatchValue(value=args.category))]
        )

    hits = client.query_points(
        collection_name=COLLECTION,
        query=Document(text=args.query, model=EMBED_MODEL),
        query_filter=query_filter,
        limit=args.limit,
        with_payload=True,
    ).points

    if not hits:
        print("No results.")
        return 1

    print(f'\nTop {len(hits)} results for: "{args.query}"\n')
    for rank, h in enumerate(hits, 1):
        meta = h.payload or {}
        snippet = " ".join((meta.get("text") or "").split())[:280]
        print(f"{rank}. [{h.score:.3f}] {meta.get('title', '?')}  ({meta.get('category', '?')})")
        print(f"   source: {meta.get('source', '?')}")
        print(f"   {snippet}...\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
