---
name: session-folder-confusion
description: Root cause of scattered memory — sessions started from 4 different folders; resolved 2026-06-18
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c068aa4-5366-42b6-b8f5-01e71bf2c4a0
---

**What happened:** After the 2026-06-16 BSOD (see [[machine-bsod-constraint]]) interrupted a major context-building session, subsequent Claude Code sessions were started from different working directories. Each folder got its own Claude project context and memory files, fragmenting the project knowledge across 4 locations:

- `C:\dev\JunctionGenerator` — canonical repo (Windows)
- `C:\Users\jgord\Documents\jg` — old scratch/staging folder
- `/home/Kali/projects/headroom` — now retired standalone headroom folder
- `/home/Kali` — Kali WSL home

The result: important decisions (junctioning test, JGC testnet milestone, reward divisibility, architecture decisions, grand vision) were documented in the wrong project's memory and invisible to sessions started from the canonical location.

**Resolution (2026-06-18):** All memory from the 3 non-canonical folders consolidated into `C:\dev\JunctionGenerator` memory. **Always start Claude Code from `C:\dev\JunctionGenerator` on Windows** — this is the one canonical location. The headroom standalone folder is retired. The Documents/jg folder is scratch only.

**Why:** Claude's auto-memory is scoped per working directory. Same project, wrong folder = new blank slate every time.
