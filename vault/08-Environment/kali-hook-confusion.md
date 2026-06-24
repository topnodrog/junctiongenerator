---
name: kali-hook-confusion
description: "The misleading 'memory lives on Kali' SessionStart hook and why it should be updated"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 18c714bb-bc71-4e56-913b-8b161e98ff26
---

A `SessionStart` hook in `C:\Users\jgord\.claude\settings.json` prints a hardcoded note telling Claude to send the user to Kali ("JunctionGenerator's memory lives on the Kali side… run claude from inside Kali"). The user added it originally to avoid logging into the wrong place.

It is a **static echo, not detection** — it caused real confusion (2026-06-16) by insisting the project lived elsewhere when in fact the canonical home is now Windows `C:\dev\JunctionGenerator`. See [[project-layout]].

**RESOLVED 2026-06-16:** the user chose to remove the hook entirely. `C:\Users\jgord\.claude\settings.json` now contains only `theme` + `model`, no hooks. Project memory auto-loads when running in `C:\dev\JunctionGenerator`, so the hook is no longer needed. Kali WSL ("kali-linux") IS still installed and running for Linux tooling, but it is not the project home.
