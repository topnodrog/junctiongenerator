# Junction Generator — Completion Roadmap

**Updated:** 2026-08-13 · **Owner:** James Gordon

Three components, one repo. Keep them distinct:

| Component | What it is | Status |
|---|---|---|
| **JGC coin** (`packages/jgc-node`) | Sovereign PoUC Layer-1 — the actual product | Consensus V3 testnet; independent Google and Fly.io seeds live; soak pending |
| **JGT token** (`contracts/`) | ERC-20 on Base (legacy) | Deployed; held, not promoted (no-sale stance) |
| **junctiongenerator.net** (`src/` + `api/`) | Public site + Cloudflare Worker backend | Worker live and verified; community-first site merged to `main` |

The strategy on record: fund via grants/donations, never JGT sales. JGC is
the product; the site is its shop window and node-runner recruiting funnel.

---

## Phase 0 — Ship what's already built (this week)

- [x] Hardened Worker deployed (2026-07-08): protected legacy/admin endpoints,
  PII masking, rate limits, restricted CORS, and the midnight digest.
- [x] Worker secrets and bindings confirmed: `API_SECRET`, `CRON_SECRET`,
  `TURSO_AUTH_TOKEN`, `EMAIL_SENDER`, `RATE_LIMITER`, `TURSO_URL`,
  `DIGEST_RECIPIENT`, and `AD_REWARD_JGT`.
- [x] `james_gordon@junctiongenerator.net` is a verified Cloudflare Email
  destination.
- [x] Midnight cron confirmed operational: `digest_state.last_sent_at`
  advanced to `2026-07-24 00:00:01`.
- [x] Immediate owner notifications added for newsletter signups and hire
  leads, with Turso storage first and the midnight digest as fallback.
- [x] Live synthetic hire-lead test stored successfully and Cloudflare tail
  logged `owner notification sent`; both synthetic rows were then deleted.
- [x] Community-first website refresh reviewed and pushed in commit `07cbe0a`.
- [x] Community-first site merged to `main` and deployed through Vercel.

## Phase 1 — Lock the doors (1–2 weeks)

Security/quality debt that should land before recruiting outside node runners.

- [x] **GitHub secret scanning + push protection enabled** on 2026-07-30.
  Dependabot security updates and vulnerability alerts are also enabled.
  GitHub still reports secret validity checks as disabled; retry if that
  control becomes available in repository settings.
- **Decide what a public repo should contain.** The Obsidian vault
  (fundraising strategy, ops notes) and any pitch material are world-readable
  here. Either make peace with building in public, or split vault/ and
  business docs into a private repo. The root-level fundraising drafts
  (`FUNDRAISING_ACTION_PLAN.md`, `PITCH_NARRATIVES_BY_INVESTOR.md`,
  `OUTREACH_EMAIL_TEMPLATES.md`, `JGC_TeamBios.md`, `VISIBLE_SETUP_GUIDE.md`,
  `WEEK1_QUICK_REFERENCE.md`, the .pptx) are untracked — do **not** commit
  them unless that decision is deliberate.
- [x] **CI**: website lint/build, Worker syntax, jgc-node tests/build,
  Rust/WASM verification, cross-platform jobs, and the Docker smoke topology
  run through GitHub Actions on relevant changes.
- **Turnstile (or equivalent) on the public forms** (subscribe / hire-lead /
  airdrop). Rate limiting is live but a bot check keeps the Turso bill and
  the digest signal clean.
- **CSP for the site**: build the `connect-src`/`img-src` allowlist for
  RainbowKit + WalletConnect relays and ship a tested Content-Security-Policy
  (deferred from the header work — needs verification against the wallet flow).
- **Clean `scripts/2BDeleted/`** after confirming nothing is still needed.

## Phase 2 — Public testnet (3–6 weeks)

The site already invites people to run a node; this phase makes that real.
Gate: do not open the P2P port to the internet before the first three items.

- [x] **Binary wire envelope + message checksums** — versioned frames now bind
  network magic, payload length, and SHA3-256 checksum while preserving
  BigInt-safe payload encoding.
- [x] **Peer misbehavior scoring**: per-peer message rate limits, host-stable
  ban scores, temporary bans, total connection caps, and per-host inbound caps
  now complement the existing 8 MiB frame bound. Real-network adversarial soak
  testing remains outstanding.
- [x] **Safe local testnet preset**: `npm run testnet` starts persistent state,
  loopback P2P, read-only status, and no default seed peers. Its receipt proof
  verifier is explicitly a **simnet-only** boundary; strict nodes fail closed
  instead of accepting those receipts.
- [x] **Consensus V3 portability foundation**: canonical byte ordering,
  integer work weights, versioned commitments, execution profiles, fail-safe
  replay, and heterogeneous back-checker roles are implemented and tested.
- [x] **Bounded strict-proof demonstration**: the real Rust/WASM Groth16 path
  completed a three-block, six-proof Conv1D run with ML-DSA identities. This is
  evidence that the strict path works, not yet a production-scale proving claim.
- [x] **Freeze the public-testnet identity**: canonical self-consistent genesis,
  chain ID, network magic, consensus version, and declared proof mode. Peers must
  reject every compatibility mismatch before exchanging chain data.
- [x] **Persistent block producer**: a designated producer assembles and
  broadcasts blocks continuously, survives restart, and exposes health state.
- [x] **Network-aware wallet + JGTC issuance**: mainnet-magic assumptions are
  removed, genesis has zero spendable supply, and test coins are created only
  by the same 144-block settlement path used by JGC monetary consensus.
- [x] **Public node packaging and CI foundation**: a two-node container preset,
  pinned Node/Rust/WASM toolchains, Windows/Linux/macOS builds, Node 20/22, and
  deterministic consensus-vector checks. Native ARM execution remains an
  expansion of the matrix, not a completed claim.
- [x] **Seed and transport deployment**: Google Seed A and independent Fly.io
  Seed B are live behind TLS/WSS. Fresh external validator/back-checkers have
  completed compatibility handshakes with both public endpoints. The Google
  seed uses a dedicated custom VPC with public 443 only; the Fly seed uses an
  encrypted 10 GB volume and exposes only its WSS service. Monitoring and
  recovery exercises passed the 23-check readiness gate. See
  [`PUBLIC_SEED_DEPLOYMENT.md`](PUBLIC_SEED_DEPLOYMENT.md).
- [x] **Local operations-model evaluation**: gemma4:e2b and gemma4:e4b were
  benchmarked on 2026-08-03. Neither passed the operations safety gate; both are
  restricted to sanitized, non-authoritative drafting and summaries. See
  docs/LOCAL_MODEL_BENCHMARK.md.
- [x] **Storage hardening**: versioned data format, atomic/fsynced writes,
  migration rules, corrupt-tail recovery, and explicit V2-to-V3 refusal.
- [x] **JGTC explorer-lite**: canonical node state supplies height, blocks,
  health, participation, balances, pending issuance, and the next settlement.
  There is no genesis faucet or premine. Seed reset and site deployment remain.
- [x] **Node-runner guide**:
  `packages/jgc-node/docs/RUN-A-NODE.md` provides a Node.js quick start, a
  one-command Docker runner, two live seed connections, status checks, updates,
  safe network defaults, troubleshooting, and recovery links. Ollama is not a
  prerequisite for the current validator/back-checker role.
- **Multi-machine soak test** before announcing: two junctioning miners +
  one audit committee across real networks, left running for days, with reorgs,
  signed audit verdicts, restart recovery, and adversarial traffic observed.
  Slashing is deliberately out of scope until bonded validator state is
  consensus-owned.

- [x] **Consensus-owned validator-bond foundation**: tagged, spendable bond
  outputs derive the roster and stake snapshot from active-chain UTXOs; when a
  snapshot is non-empty, verdict validation reconstructs committee sortition
  from the beacon-height chain rather than trusting supplied identities.
  Mandatory activation and reward/slash state transitions remain separate work.

## Phase 3 — Verification depth (L5) — ongoing research track

Current stack: deterministic replay + delayed-beacon sampling +
multi-validator signed quorum, with full verdict evidence committed through
the Consensus V3 `auditRoot`. The older `StakeLedger`/slashing coordinator is
an economic prototype, not an active consensus funds transition. Known open
problems, in priority order:

1. **Cross-hardware verification** — Consensus V3 now separates producer,
   full verifier, deterministic reference replay, and receipt-only observer
   roles. Incompatible/slow machines can provide useful back-checking, but a
   result only becomes consensus evidence through a pinned execution profile
   and fail-closed proof verifier. Continue expanding cross-architecture test
   vectors and reference-runtime coverage before mainnet talk.
2. **Verifier economics** — challenge frequency vs. reward budget; make
   griefing (mass frivolous challenges) strictly unprofitable.
3. **Post-quantum proof scaling / ZKML watch** — extend the current
   hash-based transparent proof path toward production-scale inference
   proving as practical primitives mature. The Groth16/WASM implementation is
   retained as a bounded strict-proof research path; simnet receipts must never
   be accepted by a strict public network.
4. Keep the L5 design notes private until solved (standing decision);
   publish the parts that recruit collaborators without handing over the
   attack map.

## Phase 4 — Mainnet preconditions (not before the above)

- External security review of consensus + P2P (fund via grant).
- Emission/economics audit against the published whitepaper numbers.
- Key-management runbook for any protocol-owned keys (the JGT episode is
  the cautionary tale: fresh keys, hardware-backed, never in a repo dir).
- Governance/upgrade story: how a consensus bug gets fixed post-genesis.

## Funding track (parallel, gated on Phase 0)

With the local testnet demo working and the worker/digest funnel working: submit the
Gitcoin/verifiable-compute grant applications using `JGC_OnePager.md` and the
financial projections; route interested parties to the site's node-runner
section. The pitch materials exist — the missing artifact has been a running
public testnet, which is Phase 2's deliverable.

---

### Done (for the record)

- Junctioning Layer-1 working locally: Ollama-backed inference mining, honest
  FLOP measurement, deterministic replay, delayed-beacon audit scheduling,
  signed quorum evidence, UTXO + reorg + persistence, encrypted wallet, and
  Consensus V3 audit commitments.
- Post-quantum node path: ML-DSA identities/signatures, SHA3-256 wire
  checksums, PQ wallet integration, strict proof verification, and documented
  quantum-readiness boundaries.
- Audit evidence survives mining, peer sync, restart, and reorg; forged votes
  and replayed verdicts are rejected. Full suite: 30 suites / 286 tests, plus
  a passing 31-block two-node sync demo and a real six-proof strict WASM demo.
- JGT rescued to a clean wallet after the 2026-06 key compromise; no rogue
  minters on-chain; no-sale stance adopted.
- Worker API hardened (2026-07-07): server-authoritative rewards, auth-gated
  admin/legacy endpoints, PII closed, rate limits, timing-safe auth, CORS.
- Site security headers; secrets sweep of full git history — clean.
- Contracts: dispenser ownership-transfer fix; Market/Staking marked
  DO-NOT-DEPLOY with documented funds bugs; deploy script paths repaired.
