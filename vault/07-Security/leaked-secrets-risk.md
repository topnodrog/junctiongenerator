---
name: leaked-secrets-risk
description: Live secrets were pasted into past chat sessions and sit in transcript logs — must be rotated
metadata: 
  node_type: memory
  type: project
  originSessionId: 18c714bb-bc71-4e56-913b-8b161e98ff26
---

Past sessions (June 2026) contain **live secrets pasted in plaintext**, now stored in transcript `.jsonl` logs under `C:\Users\jgord\.claude\projects\...`:
- ≥2 Anthropic API keys (`sk-ant-api03-…`)
- ≥2 GitHub PATs (`github_pat_…`)

A recent commit also references a *"compromised wallet/token"* (JGT revenue-hub/staking widgets were removed for pointing at a compromised wallet).

**Audit 2026-06-16 across all transcripts:** exactly 2 Anthropic keys (user says revoked+deleted), 2 GitHub PATs, and 1 wallet **private key** `0x865f69f6983da672…f993372d`. The `0xFFFF…364141` hit is just the secp256k1 curve order constant, not a secret.

**Compromised wallet = the private key above.** It was hard-coded in deploy scripts and committed; it is in **public git history** on `origin/main` (commit `5d9e773 "Deploy JGT token + batch dispenser on Base"`; removed later by `c7a54a0`/`4f5cc95` but removal does NOT purge history). Repo: public `github.com/topnodrog/junctiongenerator`. The key is permanently burned — treat that wallet as dead. User already rotated to a fresh wallet. Current deploy scripts correctly read `process.env.PRIVATE_KEY`.

**How to apply:**
1. Anthropic keys — user reports revoked+deleted (2 total). ✅ if confirmed.
2. GitHub PATs — of the 2 in logs: `…gZTr7a` is REVOKED (the one in `.curlrc-gh`; "Bad credentials"), but `…7ukOEh` is still **LIVE/valid** (used it to open PR #3 on 2026-06-16) AND exposed in logs → ROTATE it too, then put a fresh token in `.curlrc-gh`. GitHub → Settings → Developer settings → PATs.
3. Compromised wallet — still holds 100,000,000 JGT (as of 2026-06-16) AND is the **JGTToken `owner`** (can mint up to 1B MAX_SUPPLY — a public key that can mint is a standing risk). JGTToken has NO permit()/ERC-2612, so tokens can only leave via a tx the holder signs+pays for (no "receiver-pays-gas" / no useful batching for a single transfer). Rescue tool written: `tools/jgt-rescue/rescue_jgt.js` (self-contained, own ethers install) — safe wallet funds minimal gas on Base, old wallet does one `transfer()`, optional `MOVE_OWNERSHIP=1` to also transferOwnership to the safe wallet. Keys load from gitignored `tools/jgt-rescue/.env.rescue`. Safe wallet needs a few cents of ETH on Base. After sweep: abandon the old key forever. JGT itself stays fundamentally untrustworthy (deployer key was public).
4. Git history rewrite (filter-repo/BFG + force-push) is OPTIONAL hygiene only — the key is already public/scraped, so it un-leaks nothing; the real protection is the abandoned wallet. Disruptive (rewrites all hashes); skip unless wanted.
Going forward: secrets in gitignored `.env`, passed via `! ` commands, never pasted into chat. Wallet *addresses* are public and fine.

Note (2026-06-16): `C:\dev\JunctionGenerator\.curlrc-gh` still holds a now-REVOKED GitHub PAT — GitHub API calls via `curl -K .curlrc-gh` fail with "Bad credentials". Update it with a current PAT (`repo` scope) before using curl-based GitHub ops. `git push` works regardless (uses Windows Credential Manager). `gh` CLI is not installed (Windows or Kali). PR creation fallback = the compare URL `…/compare/main...junctioning?expand=1`.
