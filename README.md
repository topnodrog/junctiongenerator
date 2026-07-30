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

Current node milestone (2026-07-30):

- Consensus V3 freezes the `jgc-testnet-v3` identity and rejects incompatible
  peers before chain data is exchanged;
- canonical encodings, bounded integer work, execution profiles, and
  fail-closed verification provide the portability foundation;
- historical compute is selected through delayed-beacon audit windows and
  verified by ML-DSA-signed committees derived from consensus-owned bonds when
  a bonded roster exists;
- a persistent designated producer, network-aware wallet/faucet path, and
  two-node container topology are implemented;
- 30 suites / 280 tests, a 31-block sync demo, a six-proof strict WASM run,
  cross-platform CI, and the hosted Docker smoke test pass.

The node is local/private testnet software. No JGC public blockchain or mainnet
has been deployed. Public seeds, crash-safe storage, runner-facing faucet and
explorer services, and a multi-day real-network soak remain gates. Rewards and
slashing remain disabled until mandatory bonded-validator activation and an
economics/security review.

See [`packages/jgc-node/README.md`](packages/jgc-node/README.md) and
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

1. keep repository status and security controls accurate;
2. harden node storage and crash recovery;
3. deploy monitored TLS/WSS seed infrastructure;
4. add explorer-lite, a rate-limited testnet faucet, and runner onboarding;
5. complete a closed multi-machine soak before any public announcement.

Website security continues in parallel: Turnstile on public write forms, a
tested Content Security Policy, and error isolation. The current midnight
Worker cron sends the owner digest; `/api/dispense` is an authenticated legacy
batch-preparation endpoint and does not submit an on-chain transaction.

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

**Public-testnet readiness** (In Progress)
- Consensus V3 and local/container testnet foundation complete
- Storage hardening and public seed operations next
- Explorer/faucet/onboarding and multi-day soak follow

---

## Quick Commands

```bash
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
