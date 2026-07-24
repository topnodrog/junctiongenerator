# Junction Generator — Completion Roadmap

**Updated:** 2026-07-24 · **Owner:** James Gordon

Three components, one repo. Keep them distinct:

| Component | What it is | Status |
|---|---|---|
| **JGC coin** (`packages/jgc-node`) | Sovereign PoUC Layer-1 — the actual product | Local/private testnet validated; consensus v2; 244 tests green |
| **JGT token** (`contracts/`) | ERC-20 on Base (legacy) | Deployed; held, not promoted (no-sale stance) |
| **junctiongenerator.net** (`src/` + `api/`) | Public site + Cloudflare Worker backend | Worker live and verified; community-first site refresh pushed to `junctioning` |

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
- [ ] Merge `junctioning` to `main` to deploy the refreshed site through
  Vercel.

## Phase 1 — Lock the doors (1–2 weeks)

Security/quality debt that should land before recruiting outside node runners.

- **Enable GitHub secret scanning + push protection** on the repo (free for
  public repos; Settings → Code security). The repo history is verified
  clean today — keep it that way mechanically.
- **Decide what a public repo should contain.** The Obsidian vault
  (fundraising strategy, ops notes) and any pitch material are world-readable
  here. Either make peace with building in public, or split vault/ and
  business docs into a private repo. The root-level fundraising drafts
  (`FUNDRAISING_ACTION_PLAN.md`, `PITCH_NARRATIVES_BY_INVESTOR.md`,
  `OUTREACH_EMAIL_TEMPLATES.md`, `JGC_TeamBios.md`, `VISIBLE_SETUP_GUIDE.md`,
  `WEEK1_QUICK_REFERENCE.md`, the .pptx) are untracked — do **not** commit
  them unless that decision is deliberate.
- **CI**: GitHub Actions workflow running `next build`, `tsc --noEmit`, and
  the jgc-node jest suite on every push. The suite runs in ~15 s; there is
  no excuse to merge red.
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
- **Peer misbehavior scoring**: per-peer message rate limits, ban scores,
  connection caps (frame size is already bounded at 8 MiB).
- [x] **Safe local testnet preset**: `npm run testnet` starts strict
  post-quantum verification, persistent state, loopback P2P, and read-only
  status with no default seed peers.
- **Public node packaging**: one-command install (npm bin or single binary),
  public seed nodes, and a consensus-pinned model registry
  (model ID → params/digest) so FLOP attestation cannot be gamed.
- **Faucet + explorer-lite**: even a static page over the status server
  format is enough for runners to see their coins.
- [x] **Initial node-runner guide**: `packages/jgc-node/README.md` documents
  the safe preset, loopback defaults, seeds, and verification commands.
  Expand it with Ollama/model prerequisites and upgrade/migration procedures
  before public recruitment.
- **Multi-machine soak test** before announcing: two junctioning miners +
  one audit committee across real networks, left running for days, with reorgs,
  signed audit verdicts, restart recovery, and adversarial traffic observed.
  Slashing is deliberately out of scope until bonded validator state is
  consensus-owned.

## Phase 3 — Verification depth (L5) — ongoing research track

Current stack: deterministic replay + delayed-beacon sampling +
multi-validator signed quorum, with full verdict evidence committed through
the consensus-v2 `auditRoot`. The older `StakeLedger`/slashing coordinator is
an economic prototype, not an active consensus funds transition. Known open
problems, in priority order:

1. **Cross-hardware determinism** — replay verification assumes bit-identical
   inference across verifier hardware. Different GPUs/drivers/quantizations
   break this. Options to evaluate: pinned quantized CPU reference path for
   challenged blocks, tolerance bands over logits, or vendor-pinned verifier
   pools. This is the single biggest threat to the verification model —
   resolve before mainnet talk.
2. **Verifier economics** — challenge frequency vs. reward budget; make
   griefing (mass frivolous challenges) strictly unprofitable.
3. **Post-quantum proof scaling / ZKML watch** — extend the current
   hash-based transparent proof path toward production-scale inference
   proving as practical primitives mature. Keep the Groth16/WASM code as
   legacy research only; do not reintroduce it into live consensus.
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
  consensus-v2 audit commitments.
- Post-quantum node path: ML-DSA identities/signatures, SHA3-256 wire
  checksums, PQ wallet integration, strict proof verification, and documented
  quantum-readiness boundaries.
- Audit evidence survives mining, peer sync, restart, and reorg; forged votes
  and replayed verdicts are rejected. Full suite: 24 suites / 244 tests, plus
  a passing 31-block two-node sync demo.
- JGT rescued to a clean wallet after the 2026-06 key compromise; no rogue
  minters on-chain; no-sale stance adopted.
- Worker API hardened (2026-07-07): server-authoritative rewards, auth-gated
  admin/legacy endpoints, PII closed, rate limits, timing-safe auth, CORS.
- Site security headers; secrets sweep of full git history — clean.
- Contracts: dispenser ownership-transfer fix; Market/Staking marked
  DO-NOT-DEPLOY with documented funds bugs; deploy script paths repaired.
