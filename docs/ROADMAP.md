# Junction Generator — Completion Roadmap

**Updated:** 2026-07-07 · **Owner:** James Gordon

Three components, one repo. Keep them distinct:

| Component | What it is | Status |
|---|---|---|
| **JGC coin** (`packages/jgc-node`) | Sovereign PoUC Layer-1 — the actual product | Local testnet live; 183 tests green |
| **JGT token** (`contracts/`) | ERC-20 on Base (legacy) | Deployed; held, not promoted (no-sale stance) |
| **junctiongenerator.net** (`src/` + `api/`) | Public site + Cloudflare Worker backend | Live; worker hardened, one deploy pending |

The strategy on record: fund via grants/donations, never JGT sales. JGC is
the product; the site is its shop window and node-runner recruiting funnel.

---

## Phase 0 — Ship what's already built (this week)

Everything here is finished code sitting undeployed. Order matters.

1. **Rotate the Cloudflare API token** (current one fails auth) with
   `Workers Scripts:Edit` + `Email Routing Addresses:Edit` + `Zone:Read`.
2. **Enable Email Routing** for junctiongenerator.net and verify the
   destination address (dashboard → Email → Email Routing). Blocks the
   digest's `EMAIL_SENDER` binding.
3. **Set the worker secrets**: `wrangler secret put API_SECRET` (newly
   enforced — legacy mining/admin endpoints 401 without it) and confirm
   `CRON_SECRET` + `TURSO_AUTH_TOKEN` are set.
4. **`cd api && wrangler deploy`** — ships the hardened worker: auth-gated
   legacy endpoints, PII masking, rate limiting, locked-down CORS, daily
   digest cron.
5. **Test the digest end-to-end**: `POST /api/digest/run` with the bearer
   token, submit a real signup on the site, run it again, confirm the email.
6. **Deploy the site** (Vercel) — picks up the new security headers.
7. **Push `junctioning` to GitHub** and merge to `main` — the branch now
   carries the security fixes and this roadmap.

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

- **Binary wire format + message checksums** (replacing dev JSON framing —
  `wire.ts` carries this exact production note). Include the >64-bit money
  field required by the 16-decimal reward divisibility decision.
- **Peer misbehavior scoring**: per-peer message rate limits, ban scores,
  connection caps (frame size is already bounded at 8 MiB).
- **Node packaging**: one-command install (npm bin or single binary), a
  `testnet` network preset with pinned genesis, seed nodes, and the model
  registry (model ID → params/digest) pinned so FLOP attestation can't be
  gamed by lying about the model.
- **Faucet + explorer-lite**: even a static page over the status server
  format is enough for runners to see their coins.
- **Node-runner guide**: prerequisites (Ollama + model pull), security
  defaults (P2P port exposure, status server stays loopback/tunneled),
  upgrade path.
- **Multi-machine soak test** before announcing: two junctioning miners +
  one challenger quorum across real networks, left running for days,
  reorgs and slashing observed in the wild.

## Phase 3 — Verification depth (L5) — ongoing research track

Current stack: deterministic replay + economic sampling/slashing +
multi-challenger quorum. Known open problems, in priority order:

1. **Cross-hardware determinism** — replay verification assumes bit-identical
   inference across verifier hardware. Different GPUs/drivers/quantizations
   break this. Options to evaluate: pinned quantized CPU reference path for
   challenged blocks, tolerance bands over logits, or vendor-pinned verifier
   pools. This is the single biggest threat to the verification model —
   resolve before mainnet talk.
2. **Verifier economics** — challenge frequency vs. reward budget; make
   griefing (mass frivolous challenges) strictly unprofitable.
3. **ZKML watch** — keep the Groth16/WASM verifier seam warm
   (`crypto/zkp.ts`); adopt proof-of-inference primitives when they get
   within an order of magnitude of practical.
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

With the testnet demo live and the worker/digest funnel working: submit the
Gitcoin/verifiable-compute grant applications using `JGC_OnePager.md` and the
financial projections; route interested parties to the site's node-runner
section. The pitch materials exist — the missing artifact has been a running
public testnet, which is Phase 2's deliverable.

---

### Done (for the record)

- Junctioning Layer-1 live locally: Ollama-backed inference mining, honest
  FLOP measurement, deterministic-replay + sampling/slashing + quorum
  verification, UTXO + reorg + persistence, encrypted wallet, 183 tests.
- JGT rescued to a clean wallet after the 2026-06 key compromise; no rogue
  minters on-chain; no-sale stance adopted.
- Worker API hardened (2026-07-07): server-authoritative rewards, auth-gated
  admin/legacy endpoints, PII closed, rate limits, timing-safe auth, CORS.
- Site security headers; secrets sweep of full git history — clean.
- Contracts: dispenser ownership-transfer fix; Market/Staking marked
  DO-NOT-DEPLOY with documented funds bugs; deploy script paths repaired.
