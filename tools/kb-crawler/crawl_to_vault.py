"""
crawl_to_vault.py — scrape crypto sources into the Obsidian vault as clean notes.

Uses the forked crawl4ai (C:\\dev\\crawl4ai) to fetch pages, strip boilerplate,
and emit LLM-friendly markdown. Each page becomes one note under
    vault/13-Crypto-Knowledge-Base/<category>/<slug>.md
with Obsidian frontmatter (title, source, tags, scrape date).

Usage:
    # crawl everything listed in sources.yaml
    uv run python crawl_to_vault.py

    # crawl one or more ad-hoc URLs into a category
    uv run python crawl_to_vault.py --url https://example.com/article --category scams

    # limit how many sources.yaml entries to process (handy for a quick test)
    uv run python crawl_to_vault.py --limit 2

Respect each site's terms of service and robots.txt. The default seed list is
informational/educational content only.
"""
from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import re
import sys
from pathlib import Path

import yaml

# Windows consoles default to cp1252 and choke on the arrows/checkmarks below.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except Exception:
        pass

# Vault destination — resolved relative to this file so it works from anywhere.
REPO_ROOT = Path(__file__).resolve().parents[2]
KB_ROOT = REPO_ROOT / "vault" / "13-Crypto-Knowledge-Base"
SOURCES_FILE = Path(__file__).resolve().parent / "sources.yaml"


def slugify(text: str, fallback: str = "note") -> str:
    text = (text or "").strip().lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text).strip("-")
    return text[:80] or fallback


def yaml_escape(value: str) -> str:
    """Quote a scalar for YAML frontmatter."""
    return '"' + (value or "").replace("\\", "\\\\").replace('"', '\\"') + '"'


def build_note(title: str, source_url: str, category: str, body: str) -> str:
    today = dt.date.today().isoformat()
    frontmatter = "\n".join([
        "---",
        f"title: {yaml_escape(title)}",
        f"source: {yaml_escape(source_url)}",
        f"category: {yaml_escape(category)}",
        "tags: [crypto, knowledge-base, scraped]",
        f"scraped: {today}",
        "generator: crawl4ai",
        "---",
        "",
    ])
    header = f"# {title}\n\n> Source: [{source_url}]({source_url}) · scraped {today}\n\n"
    return frontmatter + header + body.strip() + "\n"


def extract_markdown(result) -> str:
    """crawl4ai's result.markdown may be a str or a MarkdownGenerationResult."""
    md = getattr(result, "markdown", None)
    if md is None:
        return ""
    # Prefer the boilerplate-pruned 'fit' markdown when available.
    for attr in ("fit_markdown", "raw_markdown"):
        val = getattr(md, attr, None)
        if val:
            return val
    return str(md)


async def crawl_one(crawler, run_cfg, url: str, category: str) -> Path | None:
    result = await crawler.arun(url=url, config=run_cfg)
    if not getattr(result, "success", False):
        print(f"  ✗ FAILED {url} :: {getattr(result, 'error_message', 'unknown error')}", file=sys.stderr)
        return None

    body = extract_markdown(result).strip()
    if not body:
        print(f"  ✗ EMPTY  {url} (no extractable content)", file=sys.stderr)
        return None

    meta = getattr(result, "metadata", None) or {}
    title = (meta.get("title") if isinstance(meta, dict) else None) or url
    title = title.strip()

    out_dir = KB_ROOT / slugify(category, "general")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{slugify(title, slugify(url))}.md"
    out_path.write_text(build_note(title, url, category, body), encoding="utf-8")
    print(f"  ✓ {out_path.relative_to(REPO_ROOT)}  ({len(body):,} chars)")
    return out_path


async def run(targets: list[dict]) -> int:
    # Imported here so --help works even before crawl4ai is installed.
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
    from crawl4ai.content_filter_strategy import PruningContentFilter
    from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

    browser_cfg = BrowserConfig(headless=True, verbose=False)
    run_cfg = CrawlerRunConfig(
        markdown_generator=DefaultMarkdownGenerator(
            content_filter=PruningContentFilter(threshold=0.48, threshold_type="fixed")
        ),
        page_timeout=60_000,
    )

    written = 0
    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        for t in targets:
            print(f"→ {t['url']}  [{t['category']}]")
            if await crawl_one(crawler, run_cfg, t["url"], t["category"]):
                written += 1
    print(f"\nDone. {written}/{len(targets)} notes written to {KB_ROOT.relative_to(REPO_ROOT)}")
    return 0 if written else 1


def load_targets(args) -> list[dict]:
    if args.url:
        return [{"url": u, "category": args.category} for u in args.url]
    if not SOURCES_FILE.exists():
        sys.exit(f"No --url given and {SOURCES_FILE} not found.")
    data = yaml.safe_load(SOURCES_FILE.read_text(encoding="utf-8")) or {}
    targets: list[dict] = []
    for entry in data.get("sources", []):
        targets.append({"url": entry["url"], "category": entry.get("category", "general")})
    if args.limit:
        targets = targets[: args.limit]
    return targets


def main() -> None:
    ap = argparse.ArgumentParser(description="Scrape crypto sources into the Obsidian vault.")
    ap.add_argument("--url", action="append", help="Ad-hoc URL to crawl (repeatable). Overrides sources.yaml.")
    ap.add_argument("--category", default="general", help="Category subfolder for --url targets.")
    ap.add_argument("--limit", type=int, default=0, help="Only process the first N sources.yaml entries.")
    args = ap.parse_args()

    targets = load_targets(args)
    if not targets:
        sys.exit("Nothing to crawl.")
    raise SystemExit(asyncio.run(run(targets)))


if __name__ == "__main__":
    main()
