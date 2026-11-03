# Junction Generator

**Make Mining Useful**

Junction Generator is building a community-owned Proof-of-Useful-Compute
network where everyday devices contribute verifiable local AI inference.

**Live site:** [junctiongenerator.net](https://junctiongenerator.net)
**Repo:** [topnodrog/junctiongenerator](https://github.com/topnodrog/junctiongenerator) (GitHub repository)

---

## Public Site

The community-first site is deployed from `main`. It leads with the
useful-compute mission, separates working evidence from open research, recruits
early contributors, and keeps the interactive demos in a clearly labeled
prototype lab. The hire-James flow remains prominent because client work funds
development.

---

## JGC Sovereign Node

The primary protocol product lives in `packages/jgc-node`; it is separate from
the legacy JGT token on Base.

Current node verification (2026-11-03; see
[`docs/mainnet/RESECURE_REPORT.md`](docs/mainnet/RESECURE_REPORT.md)):

- Consensus V3 underlies the zero-premine `jgtc-testnet-v2` identity and rejects incompatible
  peers before chain data is exchanged;
- canonical encodings, bounded integer work, execution profiles, and
  fail-closed verification provide the portability foundation;
- historical compute is selected through delayed-beacon audit windows and
  verified by ML-DSA-signed committees derived from consensus-owned bonds when
  a bonded roster exists;
- a persistent designated producer, network-aware wallet/explorer path, and
  two-node container topology are implemented;
- bootstrap peers are operator-supplied through `JGC_SEEDS`; no Google Cloud or
  Fly.io hostname is embedded in the release;
- the status/API surface is hardened (exact CORS allowlist, no PNA reflection,
  private `/status` disabled on public binds, bounded inbound sockets), and a
  signed M-of-N launch gate plus reviewed-proof-registry check keep mainnet
  fail-closed;
- versioned, network-bound, checksum-protected storage now recovers torn tails,
  quarantines bad snapshots, and refuses incompatible data;
- **57 suites / 496 tests**, `npm run release:check`, the provider-neutral
  `infra:guard`, the blocked `mainnet:launch` gate, website/Worker tests, a
  24-block / 3-node local soak rehearsal and the Docker Compose smoke in CI
  all pass. This is engineering verification, not an independent security
  review.

The node is early, valueless testnet software. The historic pilot used two
bootstrap seeds on Google Cloud and Fly.io; **those deployments are retired and
archived**, not a current mainnet path. New deployments are provider-neutral
and operator-owned — see
[`packages/jgc-node/deploy/selfhosted/README.md`](packages/jgc-node/deploy/selfhosted/README.md).
Runner commands read `JGC_SEEDS` from the environment instead of embedding a
cloud hostname. Mainnet remains fail-closed; see
[`docs/mainnet/LAUNCH_PLAN.md`](docs/mainnet/LAUNCH_PLAN.md). Historical pilot
evidence (not current): after the v1 soak exposed non-unique settlement
transaction IDs, the repaired chain was isolated as `jgtc-testnet-v2` on
2026-08-26; a 2026-09-02 UTC snapshot at height 878 passed all ten soak checks,
including six settlements and exact supply conservation. That evidence came
from owner-operated machines and does not satisfy the independent-review or
multi-host soak gates. No JGC mainnet has been deployed.
JGTC is valueless. Production rewards and slashing remain disabled until
mandatory bonded-validator activation and an economics/security review.

To run a node, follow
[`packages/jgc-node/docs/RUN-A-NODE.md`](packages/jgc-node/docs/RUN-A-NODE.md).
For protocol details, see [`packages/jgc-node/README.md`](packages/jgc-node/README.md) and
[`packages/jgc-node/docs/AUDIT-PROTOCOL.md`](packages/jgc-node/docs/AUDIT-PROTOCOL.md).

---

## What's Deployed On-Chain (Base Network)

| Contract | Address | Status |
|----------|---------|--------|
| JGT Token (ERC-20) | `0x7Fe...c587` | Deployed legacy token; current owner/minters require live verification |
| Legacy dispenser | `0x6afF...f9C7` | Historical deployment; do not use as the current faucet without code/state review |
| JGTMarket | reference only | **Do not deploy or fund**; no-sale stance and known funds bugs |
| JGTBatchDispenser | legacy/reference | **Do not deploy**; failed mints can be marked processed |
| JGTClaimDispenser | source only | Optional 2-JGT/24h minting faucet draft; not compiled, reviewed, deployed, or authorized |
| JGTStaking | reference only | **Do not deploy**; known principal-lock and reward-accounting bugs |

The optional [`/jgt-faucet`](docs/JGT_FAUCET.md) route stays inactive until the minting dispenser is reviewed and deployed, the verified clean current token owner authorizes it as a minter, and its address, runtime-code hash, and expected clean-owner address are configured. It is not prefunded and does not use the retired Worker airdrop pipeline. The original token-deployer wallet is compromised: never use it.

**Original deployer wallet (COMPROMISED — DO NOT USE):** `0x5f89d06E0D4dBe3C125a49FD9213624aD8a991d4`
**Token:** 100M initial mint, 1B max supply, 18 decimals

---

## Backend Infrastructure

| Service | Endpoint | Status |
|---------|----------|--------|
| Cloudflare Worker API | `jgt-mining-api.james-gordon.workers.dev` | Live |
| Turso Database | `jgt-mining-topnodrog.aws-us-east-2.turso.io` | Live |
| Vercel Frontend | `junctiongenerator.net` | Live |

> **Vercel Hobby function budget:** Cloudflare Worker source lives in
> [`worker/`](worker/DEPLOY.md), **not** in a root `api/` directory. Vercel
> auto-deploys every source file in root `api/` as a Serverless Function and
> the Hobby plan allows 12; the 11 Worker files (helpers, tests and migration
> scripts included) were silently consuming that budget and caused preview
> deployments to fail. CI enforces zero root-`api` functions via
> `scripts/vercel-function-budget.mjs`. See
> [`docs/VERCEL_FUNCTION_BUDGET.md`](docs/VERCEL_FUNCTION_BUDGET.md). No HTTP
> route changed.

**Worker API access model (repository code):** The 2026-09-26 security changes
below have not been deployed. The live Worker was last verified on 2026-09-05;
see [`worker/DEPLOY.md`](worker/DEPLOY.md) before relying on production behavior.

- Public writes: `POST /api/subscribe`, `/api/hire-lead`, `/api/community/join`,
  and `/api/community/activate`. These are rate-limited and require server-verified
  Turnstile tokens bound to their form action and hostname.
- Public reads: `GET /api/user`, `/api/referral`, `/api/community/scoreboard`,
  `/api/ads/campaigns`, and `/api/health`.
- Owner bearer (`API_SECRET`): legacy `POST /api/ad-view`, `/api/referral/claim`,
  `/api/ads/campaigns`, `/api/community/funding`, `/api/community/weekly-metrics`,
  and `GET /api/pending-rewards`.
- Automation bearer (`CRON_SECRET`): `POST /api/dispense` and `/api/digest/run`.
- Legacy `POST /api/airdrop/register` and `GET /api/airdrop/status` return HTTP 410.

The ad-view and batch-reward routes are legacy record-preparation paths, not a
live public ad-reward program: `POST /api/ad-view` requires owner authentication,
and `/api/dispense` now returns a read-only legacy preview. It does **not**
change claim rows, submit a blockchain transaction, or pay JGT. Campaign
creation is owner-authenticated, not self-serve. Current deployment evidence is
in [`worker/DEPLOY.md`](worker/DEPLOY.md).

New newsletter and hire submissions are stored in Turso before owner
notification is attempted. The midnight-UTC digest provides a fallback. The
live path was verified end-to-end on 2026-07-24; synthetic rows were removed
afterward.

**DB tables:** users, sessions, ad_views, pending_claims, dispense_batches,
airdrop_registrations, referrals, ad_campaigns, newsletter_subscribers,
hire_leads, digest_state

---

## Funding stance

JGC development is funded through grants, donations, sponsorships, and paid
client work. JGT is a legacy Base token and is not being sold or promoted.
Marketplace, staking, ad-reward, and referral code is historical/reference
material, not the current launch strategy. The current testnet has **no
premine**; a proposed genesis allocation to fund independent review and future
bug bounties is explicitly under review and is not implemented — see
[`docs/mainnet/PREMINE_FUNDING_DECISION.md`](docs/mainnet/PREMINE_FUNDING_DECISION.md).

## Get involved (independent review)

JGC is a zero-value testnet candidate with ten open mainnet gates. The
lowest-friction way to help is the ten-minute reproducible-build challenge;
you can also run an independent seed on your own hardware/VPS or review one
specific gate. Start with the
[review pack](docs/mainnet/REVIEW_PACK.md), the
[shareable one-pager](docs/public/JGC_INDEPENDENT_REVIEW_PROGRAM.md), the
[public gate snapshot](docs/mainnet/gate-status.json) and the GitHub issue
templates. See [`SECURITY.md`](SECURITY.md) for safe harbor.

---

## What needs doing now

The active launch plan is [`docs/mainnet/LAUNCH_PLAN.md`](docs/mainnet/LAUNCH_PLAN.md)
(secure → prepare → resecure → launch, without Fly.io or Google Cloud), with
gate evidence contracts in
[`docs/mainnet/GATE_CLOSURE_PROTOCOL.md`](docs/mainnet/GATE_CLOSURE_PROTOCOL.md)
and the current machine-readable state in
[`docs/mainnet/gate-status.json`](docs/mainnet/gate-status.json).
`docs/NEXT_STEPS_PLAN.md` is an archived 2026-09 plan, not the current path.
Work is sequenced behind explicit gates:

The [v0.1.0 prerelease](https://github.com/topnodrog/junctiongenerator/releases/tag/jgc-node-v0.1.0)
and checksum were published on 2026-09-02. The pending node foundations and
release rehearsal fixes are merged in PR #46. The current v2 difficulty rules
are preserved for compatibility with installed nodes.

1. Close the ten remaining gates with signed, reproducible evidence per gate
   contract — starting with a real reviewed Groth16 registry, end-to-end PQ
   security and shielded payments.
2. Recruit independent operators and an external security reviewer through the
   [review funnel](docs/mainnet/REVIEW_PACK.md); owner-only rehearsal is not
   independent decentralization evidence.
3. Run a measured multi-host soak across three independent failure domains and
   publish signed, immutable evidence.
4. Publish only claims supported by that evidence. A proposed 3–5 week premine
   to fund review/bounties is an **open, unreviewed governance decision**, not
   consensus code — see
   [`docs/mainnet/PREMINE_FUNDING_DECISION.md`](docs/mainnet/PREMINE_FUNDING_DECISION.md).

Neither evaluated local model passed the operations safety gate. They may help
with sanitized, non-authoritative drafts and summaries; they do not receive
secrets or decide, execute, or verify live operations.

Website protections are merged in PR #47: server-verified Turnstile, a tested
Content Security Policy, error isolation, clear demo labels, and phone layout
fixes. PR #66 adds an exact browser-origin allowlist to the Worker API; that
change is in review and is **not deployed** yet. See
[security and deployment notes](docs/WEBSITE_SECURITY.md). The current midnight
Worker cron sends the owner digest; `/api/dispense` is an authenticated legacy
batch-preparation endpoint and does not submit an on-chain transaction.

Reviewed external material is in [docs/public](docs/public/README.md).
Historical financial and outreach drafts are preserved privately. The
[mainnet gates](docs/mainnet/README.md) remain open; these merges do not launch JGC mainnet.

---

## Completed History

**Phase 1 -- Concept & Design** (Done)
- Core concept: Proof-of-Useful-Compute (PoUC)
- Concept paper (whitepaper page)
- Visual design system (dark cyberpunk theme)

**Phase 2 -- Frontend & Demo** (Done)
- 8 website sections with interactive components
- Responsive grid layout, mobile support
- Ad integration + reward tracking + batch system
- Airdrop registration + JGT purchase + donation UI
- Staking interface + self-serve ad platform

**Legacy JGT on Base** (Held; not promoted)
- JGT Token (ERC-20) deployed on Base
- Legacy dispenser deployed on Base
- Market and staking sources retained as explicit do-not-deploy references

**Phase 4 -- Backend** (Done)
- Cloudflare Worker API with Turso DB
- Ad view recording, user stats, reward queuing
- Airdrop registration, referral tracking, ad campaign management
- Self-serve ad slots with ETH payments
- Cloudflare security: Bot Fight Mode + rate limiting

**Public JGTC testnet pilot** (archived 2026-11-02; no live value-bearing network)
- Consensus V3 and local/container testnet foundation complete
- Storage hardening and local operations-model evaluation complete; the retired
  two-provider pilot has been replaced by a provider-neutral, three-failure-domain
  deployment **candidate** that has not been deployed
- The repaired zero-premine `jgtc-testnet-v2` chain ran in the archived pilot;
  six settlements and exact supply conservation were observed by the 2026-09-02
  UTC snapshot. Independent-runner evidence and a real multi-host soak remain
  open gates

---

## Quick Commands

```bash
# Join and record participation in the JGTC testnet pilot
# Set JGC_SEEDS to comma-separated wss:// bootstrap URLs from your operator.
cd packages/jgc-node
npm ci
JGC_SEEDS="wss://seed-a.example.net,wss://seed-b.example.org" npm run testnet:participate

# Mainnet readiness (all expect a blocked result today)
npm run gates:status
npm run proof:registry
npm run mainnet:launch -- --assert-blocked
npm run infra:guard

# Local website development (from the repository root)
corepack yarn install --frozen-lockfile
corepack yarn dev

# Verify the JGC node
cd packages/jgc-node
npm run typecheck
npm test
npm run build
npm run sync-demo

# JGT market and staking contracts are reference-only. Do not deploy them.
```

## Tech Stack

- **Frontend:** Next.js 16 + React 19 + TypeScript; no globally mounted EVM
  wallet SDK
- **Styling:** Custom CSS design system (dark cyberpunk)
- **Deployment (website only):** Vercel
- **Backend (website only):** Cloudflare Workers + Turso (SQLite)
- **Node deployment:** provider-neutral, operator-owned hosts; the website
  stack is outside the consensus trust boundary and its long-term provider
  scope is still under review
- **Blockchain:** Base network (Ethereum L2)
- **Contracts:** Solidity ^0.8.20 (no OpenZeppelin deps)
- **Fonts:** Outfit + JetBrains Mono

## Important Notes

- **ONE repo:** `topnodrog/junctiongenerator` (lowercase). The old `Junction_Generator` (capitals) was deleted.
- **Canonical local clone:** `C:\dev\JunctionGenerator`
- **Do not store access tokens or private keys in the repository.** Use the
  authenticated Git credential manager and environment/secret stores.
- Public components use the deployed Worker URL as their fallback. Deployment
  variables should still be audited in Vercel without copying values into git.
