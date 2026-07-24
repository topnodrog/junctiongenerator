# Junction Generator

**Make Mining Useful**

Junction Generator is building a community-owned Proof-of-Useful-Compute
network where everyday devices contribute verifiable local AI inference.

**Live site:** [junctiongenerator.net](https://junctiongenerator.net)
**Repo:** [topnodrog/junctiongenerator](https://github.com/topnodrog/junctiongenerator) (GitHub Pages)

---

## Public Site

The 2026-07-24 community-first refresh leads with the useful-compute mission,
shows working evidence separately from open research, recruits early
contributors, and keeps the interactive demos in a clearly labeled prototype
lab. The hire-James flow remains prominent because client work funds
development. The refresh is committed to `junctioning`; production remains on
`main` until the branch is merged/deployed.

---

## JGC Sovereign Node

The primary protocol product lives in `packages/jgc-node`; it is separate from
the legacy JGT token on Base.

Current node milestone (2026-07-23):

- consensus v2 uses a 192-byte header with `auditRoot`;
- historical compute is selected in 10-block windows using a delayed block-hash
  beacon and verified by ML-DSA-signed validator committees;
- complete audit evidence is committed to blocks and independently checked
  during mining, peer sync, restart, and reorg;
- post-quantum identity/signature paths and SHA3-256 wire checksums are active;
- the suite passes 24 test suites / 244 tests and a 31-block two-node sync demo.

The node is local/private testnet software. No JGC public blockchain or mainnet
has been deployed. Rewards and slashing from audit verdicts remain disabled
until bonded validator state is consensus-owned.

See [`packages/jgc-node/README.md`](packages/jgc-node/README.md) and
[`packages/jgc-node/docs/AUDIT-PROTOCOL.md`](packages/jgc-node/docs/AUDIT-PROTOCOL.md).

---

## What's Deployed On-Chain (Base Network)

| Contract | Address | Status |
|----------|---------|--------|
| JGT Token (ERC-20) | `0x7Fe...c587` | Deployed |
| Dispenser | `0x6afF...f9C7` | Deployed |
| JGTMarket (buy JGT with ETH) | _pending_ | Deployed, needs ETH funding |
| JGTBatchDispenser | _pending_ | Contract ready, needs JGT token auth |
| JGTStaking | _pending_ | Contract ready, needs deployment |

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

## Revenue Model

1. **Bitmedia ads** -- Users watch ads, earn JGT (diminishing returns: 2 -> 1 -> 0.5 -> 0.25)
2. **Self-serve ad slots** -- Crypto projects pay ETH to feature campaigns
3. **JGT Market** -- Buy JGT with ETH (1 ETH = 10,000 JGT)
4. **Referral system** -- Users earn for bringing new miners
5. **Staking** -- Stake JGT for platform rewards/benefits

---

## TODO: What Needs Doing Now

### ACTIVE (Next Up)
- [ ] Fund deployer wallet with ETH to deploy JGTMarket on Base
- [ ] Set `NEXT_PUBLIC_API_URL` in Vercel env vars (point to CF Worker)
- [ ] Get Bitmedia Publisher ID + replace placeholder in `AttentionMining.tsx`
- [ ] Add `tsconfig.json` and `next.config.js` to `.gitignore`
- [ ] Wire real Bitmedia JS ad rendering (replace placeholder)

### ALSO NEEDED
- [ ] Cloudflare Turnstile on ad-complete endpoint (bot protection)
- [ ] Cron job for batch dispensing (call `/api/dispense` daily)
- [ ] Deploy JGTStaking contract on Base
- [ ] Remove "Coming Soon" alerts on Buy JGT / Stake buttons (wallet integration real later)
- [ ] Mobile nav overflow (8 links wraps badly on small screens)
- [ ] Error boundary on sections (1 broken component shouldn't kill the page)

### TECH DEBT
- [ ] Remove `/home/Kali/junctiongenerator` old clone (stale, causes confusion)
- [ ] Clean up test scripts (`test_turso*.py`, `verify_db*.py`) from repo
- [ ] Archive deploy scripts (`deploy_*.js`) to `scripts/` folder
- [ ] Update `schema.sql` last migrated version in sync with Turso

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

**Phase 3 -- On-Chain** (Partially Done)
- JGT Token (ERC-20) deployed on Base
- Batch Dispenser deployed on Base
- Market contract deployed, needs funding
- Staking contract written, not yet deployed

**Phase 4 -- Backend** (Done)
- Cloudflare Worker API with Turso DB
- Ad view recording, user stats, reward queuing
- Airdrop registration, referral tracking, ad campaign management
- Self-serve ad slots with ETH payments
- Cloudflare security: Bot Fight Mode + rate limiting

**Phase 5 -- Revenue** (In Progress)
- Bitmedia pipeline ready (needs publisher ID)
- Self-serve ads ready (needs first advertiser)
- JGT Market ready (needs ETH funding)
- Referral system built (needs promotion)

---

## Quick Commands

```bash
# Local dev
cd C:/dev/JunctionGenerator
npm run dev

# Verify the JGC node
cd packages/jgc-node
npm run typecheck
npm test
npm run build
npm run sync-demo

# Deploy contract (when ETH available)
# Update .env with private key, then:
# npx hardhat run scripts/deploy.js --network base
```

## Tech Stack

- **Frontend:** Next.js 16 + React 19 + TypeScript
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
- **Vercel env:** needs `NEXT_PUBLIC_API_URL` set to Worker URL
