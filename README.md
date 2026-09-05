# Junction Generator

**Make Mining Useful**

Junction Generator is building a community-owned Proof-of-Useful-Compute
network where everyday devices contribute verifiable local AI inference.

**Live site:** [junctiongenerator.net](https://junctiongenerator.net)
**Repo:** [topnodrog/junctiongenerator](https://github.com/topnodrog/junctiongenerator) (GitHub Pages)

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

Current node milestone (2026-09-01):

- Consensus V3 underlies the zero-premine `jgtc-testnet-v2` identity and rejects incompatible
  peers before chain data is exchanged;
- canonical encodings, bounded integer work, execution profiles, and
  fail-closed verification provide the portability foundation;
- historical compute is selected through delayed-beacon audit windows and
  verified by ML-DSA-signed committees derived from consensus-owned bonds when
  a bonded roster exists;
- a persistent designated producer, network-aware wallet/explorer path, and
  two-node container topology are implemented;
- an external runner can join the live two-provider pilot with one npm command
  or a one-command Docker Compose setup;
- versioned, network-bound, checksum-protected storage now recovers torn tails,
  quarantines bad snapshots, and refuses incompatible data;
- 40 suites / 329 tests under Node.js 24, plus Node.js 20/22/24 CI, a
  31-block sync demo, a six-proof strict WASM run,
  cross-platform CI, and the hosted Docker smoke test pass.

The node is early, valueless testnet software. Two independent bootstrap seeds
are reachable: Google Seed A at `wss://seed-a.junctiongenerator.net` and Fly.io
Seed B at `wss://jgc-testnet-seed-b.fly.dev`. After the v1 soak exposed
non-unique settlement transaction IDs, the repaired chain was isolated as
`jgtc-testnet-v2` on 2026-08-26 with the old state preserved in recoverable
archives. A 2026-09-02 UTC public snapshot at height 878 passed all ten soak
checks, including six settlements, exact supply conservation, contiguous
ten-minute blocks, and healthy seed connectivity. Only the Seed A anchor
appeared in the current epoch, so independent-runner evidence and a measured
multi-day real-network soak remain gates. No JGC mainnet has been deployed.
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
| JGT Token (ERC-20) | `0x7Fe...c587` | Deployed |
| Dispenser | `0x6afF...f9C7` | Deployed |
| JGTMarket | reference only | **Do not deploy or fund**; no-sale stance and known funds bugs |
| JGTBatchDispenser | legacy/reference | Not part of the JGC public-testnet path |
| JGTStaking | reference only | **Do not deploy**; known principal-lock and reward-accounting bugs |

**Deployer wallet:** `0x5f89d06E0D4dBe3C125a49FD9213624aD8a991d4`
**Token:** 100M initial mint, 1B max supply, 18 decimals

---

## Backend Infrastructure

| Service | Endpoint | Status |
|---------|----------|--------|
| Cloudflare Worker API | `jgt-mining-api.james-gordon.workers.dev` | Live |
| Turso Database | `jgt-mining-topnodrog.aws-us-east-2.turso.io` | Live |
| Vercel Frontend | `junctiongenerator.net` | Live |

**Worker API endpoints:**
- `POST /api/subscribe` -- Store a newsletter signup and notify the owner
- `POST /api/hire-lead` -- Store an email/phone inquiry and notify the owner
- `POST /api/ad-view` -- Record ad views for rewards
- `GET /api/user` -- Get user stats
- `POST /api/airdrop/register` -- Register for airdrop
- `GET /api/airdrop/status` -- Check airdrop registration
- `GET /api/referral` -- Get referral link info
- `POST /api/referral/claim` -- Claim referral bonus
- `GET /api/ads/campaigns` -- List active ad campaigns
- `POST /api/ads/campaigns` -- Create ad campaign (self-serve)
- `POST /api/dispense` -- Trigger batch reward distribution
- `GET /api/pending-rewards` -- View pending reward queue

New newsletter and hire submissions trigger an immediate email to the verified
owner address. A midnight-UTC digest retries visibility from durable Turso
records. The live path was verified end-to-end on 2026-07-24; synthetic rows
were removed afterward.

**DB tables:** users, sessions, ad_views, pending_claims, dispense_batches,
airdrop_registrations, referrals, ad_campaigns, newsletter_subscribers,
hire_leads, digest_state

---

## Funding stance

JGC development is funded through grants, donations, sponsorships, and paid
client work. JGT is a legacy Base token and is not being sold or promoted.
Marketplace, staking, ad-reward, and referral code is historical/reference
material, not the current launch strategy.

---

## What needs doing now

The active plan is [`docs/NEXT_STEPS_PLAN.md`](docs/NEXT_STEPS_PLAN.md). Work is
sequenced behind explicit gates:

The [v0.1.0 prerelease](https://github.com/topnodrog/junctiongenerator/releases/tag/jgc-node-v0.1.0)
and checksum were published on 2026-09-02. The pending node foundations and
release rehearsal fixes are merged in PR #46. The current v2 difficulty rules
are preserved for compatibility with installed nodes.

1. Complete the measured multi-host soak: at least 72 hours and three complete
   settlement cycles. The owner reports two installed computers and a third
   downloading; this is preparation, not measured acceptance evidence.
2. Exercise approved restart and one-seed-loss drills while preserving evidence.
3. Recruit and record independent operators separately from owner-run machines.
4. Publish only the participation and reliability claims supported by that evidence.

Neither evaluated local model passed the operations safety gate. They may help
with sanitized, non-authoritative drafts and summaries; they do not receive
secrets or decide, execute, or verify live operations.

Website protections are merged in PR #47: server-verified Turnstile, a tested
Content Security Policy, error isolation, clear demo labels, and phone layout
fixes. See [security and deployment notes](docs/WEBSITE_SECURITY.md). The current midnight
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

**Public JGTC testnet pilot** (Live; closed soak in progress)
- Consensus V3 and local/container testnet foundation complete
- Storage hardening and local operations-model evaluation complete; Google
  Seed A and independent Fly.io Seed B are live
- The repaired zero-premine `jgtc-testnet-v2` explorer/participation chain is
  live; six settlements and exact supply conservation were observed by the
  2026-09-02 UTC snapshot; independent-runner soak evidence follows

---

## Quick Commands

```bash
# Join and record participation in the JGTC testnet pilot
cd packages/jgc-node
npm ci
npm run testnet:participate

# Local website development
cd C:/dev/JunctionGenerator
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
- **Deployment:** Vercel
- **Backend:** Cloudflare Workers + Turso (SQLite)
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
