# JunctionGenerator Knowledge Vault

Welcome to the JunctionGenerator Obsidian vault — a searchable, linked knowledge base for James Gordon's crypto protocol work.

## Quick Links

### 👤 Who & Why
Understand the project founder and development approach.
- [[user-profile]] — James Gordon, senior protocol/cryptoeconomic engineer
- [[feedback-commit-as-you-go]] — Commit workflow preferences

### 🏗️ Project Structure
The three-part architecture and where everything lives.
- [[project-layout]] — Canonical home at `C:\dev\JunctionGenerator`
- [[project-architecture]] — JGC coin vs JGT token vs junctiongenerator.net
- [[session-folder-confusion]] — How memory got scattered (resolved)

### ⛓️ JGC Coin (PRIMARY FOCUS)
The Proof-of-Useful-Computation cryptocurrency.
- [[project-vision]] — JGC, JGT, junctioning explained
- [[project-jgc]] — Local-testnet wallet milestone (2026-06-15) and current
  consensus-v2 audit status
- [[jgc-reward-divisibility]] — 16 decimals, single-absorber dust policy (LOCKED)
- [[jgc-rust-build-env]] — Rust/WASM build constraints (Smart App Control blocker)

### 🔀 Junctioning (Layer 1)
Local inference + compression layer.
- [[junctioning-milestone]] — Gemma 4 via Ollama, honest FLOP measurement, and
  local replay/audit verification

### ✅ Verification (L5)
The trusted-compute verification model.
- [[project-jg-vision]] — Grand vision: PoUC closed loop, deterministic replay, hemisphere-triad agents
- [[trusted-compute-research]] — Survey of ZKML/TEE/replay/fraud-proof tradeoffs

### 🌐 Website & Backend
junctiongenerator.net infrastructure.
- [[project-website]] — Next.js site, Cloudflare/Turso backend, donation setup, NodeStatusPanel

### 🔐 Security
Incident tracking and remediation.
- [[leaked-secrets-risk]] — Secrets in transcripts, rotation steps
- [[compromised-wallet-7702-sweeper]] — JGT rescue via EIP-7702 (RESOLVED 2026-06-17)

### 💻 Environment
Machine constraints and tooling.
- [[machine-bsod-constraint]] — ISH.sys BSOD (FIXED 2026-06-12)
- [[kali-hook-confusion]] — Why the Kali hook is gone (RESOLVED 2026-06-16)

---

## Search This Vault

Use **Ctrl+Shift+F** (Obsidian global search) to find keywords across all notes. Linked references are bidirectional — hover over any `[[link]]` to see what else references it.

## Recent Updates

- **2026-07-24:** Community-first website refresh pushed to `junctioning`.
  Cloudflare notifications verified end to end: newsletter signups and hire
  leads are stored in Turso, trigger an immediate owner email, and remain
  covered by the midnight digest fallback.
- **2026-07-23:** JGC consensus v2: post-quantum ML-DSA identities/signatures,
  SHA3-256 wire checksums, delayed-beacon historical audits, and complete
  verdict evidence committed through `auditRoot`; 24 suites / 244 tests and a
  passing 31-block two-node sync demo. Slashing remains disabled pending a
  consensus-owned bonded validator registry.
- **2026-06-19:** NodeStatusPanel (real node status) live on junctiongenerator.net; grant polish (hero, milestones, recruitment)
- **2026-06-18:** Historical local prototype milestone: junctioning replay
  verification, sampling, experimental slashing logic, and multi-challenger
  quorum (183/183 tests green at that point)
- **2026-06-17:** JGT rescue complete via EIP-7702; 100M JGT + token ownership moved to safe wallet
- **2026-06-16:** Canonical home locked to `C:\dev\JunctionGenerator`; memory consolidated
- **2026-06-15:** Historical local-testnet milestone — wallet flow and a 7,200
  JGC simulated settlement were verified; no public chain was deployed

---

**Vault Location:** `C:\dev\JunctionGenerator\vault\`

**Canonical Source:** `C:\dev\JunctionGenerator` (Windows)

**Always start Claude Code from:** `C:\dev\JunctionGenerator`
