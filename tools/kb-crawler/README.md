# kb-crawler

Scrapes crypto sources into the Obsidian vault as clean, LLM-friendly markdown
notes, using the forked [`crawl4ai`](https://github.com/topnodrog/crawl4ai)
(cloned at `C:\dev\crawl4ai`).

Output lands in `vault/13-Crypto-Knowledge-Base/<category>/<slug>.md` with
Obsidian frontmatter (title, source, category, tags, scrape date).

## One-time setup (already done on this machine)

```powershell
# from C:\dev\JunctionGenerator\tools\kb-crawler
uv venv --python 3.12 .venv
uv pip install --python .venv -e C:\dev\crawl4ai
.\.venv\Scripts\python.exe -m playwright install chromium
```

Requires [`uv`](https://docs.astral.sh/uv/) (already installed). No GPU needed —
crawl4ai is browser-driven, not ML-based.

## Usage

```powershell
# crawl every source in sources.yaml
.\.venv\Scripts\python.exe crawl_to_vault.py

# just the first N (quick test)
.\.venv\Scripts\python.exe crawl_to_vault.py --limit 2

# ad-hoc one-off URL into a category
.\.venv\Scripts\python.exe crawl_to_vault.py --url https://example.com/guide --category security
```

Add sources by editing `sources.yaml` (url + category per entry). Re-running
overwrites notes with the same title slug, so it's safe to run repeatedly.

## Notes

- **Respect each site's ToS and robots.txt.** The seed list is informational
  content only; Wikipedia (CC BY-SA) is used for the initial set and the source
  URL is always preserved for attribution.
- `marker` (PDF → markdown) was intentionally **deferred**: it needs PyTorch +
  OCR models and would run CPU-only on this machine's integrated GPU. Revisit it
  when there's a real PDF-ingestion need or better hardware. The fork is at
  `C:\dev\marker`.
- The `.venv/` is gitignored. The generated vault notes are committed.
