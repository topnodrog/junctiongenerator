---
name: project-layout
description: "Where JunctionGenerator lives on disk, the canonical home, and what each location is"
metadata: 
  node_type: memory
  type: project
  originSessionId: 18c714bb-bc71-4e56-913b-8b161e98ff26
---

Canonical home (decided 2026-06-16): **`C:\dev\JunctionGenerator` on the Windows side** — do NOT move it. Work from here. It holds the real Next.js app, contracts, db, deploy scripts, and live git history.

The project is spread across 4 locations but is ONE project:
- `C:\dev\JunctionGenerator` (Win) = `/mnt/c/dev/JunctionGenerator` (Kali) — the real repo. Same bytes from either side.
- ~~`/home/Kali/projects/headroom`~~ — RETIRED 2026-06-16, then REMOVED entirely 2026-06-18. The wrapper was briefly folded into `packages/headroom/` but later removed as the wrong layer (cloud API meter, not local compute) — moved to `scripts/2BDeleted/headroom`. See [[junctioning-milestone]]. (Kali backup: `/home/Kali/headroom-retired-20260616.tar.gz`.)
- `C:\Users\jgord\Documents\jg` (Win) — scratch/staging: old setup scripts + `_monorepo-*` / `_mono_rust*` backups.
- `/home/Kali/.headroom-venv`, `/home/Kali/.hermes` — supporting venv/runtime on Kali.

**Verifier status update (2026-07-23):** the Rust crate `jgc_verifier` at
`packages\jgc-node\rust\` is the legacy Groth16/BN254 verifier and remains for
reference. It is no longer on the live consensus, wallet, or mining path.
Current consensus uses the post-quantum hash-based proof implementation in
`src/crypto/pq-zkp.ts` through `src/crypto/pq.ts`; audit observations use
ML-DSA signatures and are committed through `auditRoot`. The Rust crate is
location-independent, but rebuilding it is not required to run the current
post-quantum node.

Caveat: the Git Bash / bash tool is broken on the Windows side (Cygwin `dofork` fork errors). Use PowerShell for git/node, or run from Kali if a real bash is needed.
