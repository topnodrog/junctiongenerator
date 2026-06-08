# Junction Generator

**Turn Your Vibe Into Verifiable Web3 Code**

AI-operated, mined-compute Web3 factory. Speak English to compile smart contracts, earn $JGT through useful compute.

**Live site:** [junctiongenerator.net](https://junctiongenerator.net)
**Repo:** [topnodrog/junctiongenerator](https://github.com/topnodrog/junctiongenerator) (GitHub Pages)

---

## Sections on the Site

| # | Section | Component | Status |
|---|---------|-----------|--------|
| 1 | Compiler Sandbox | `VibePlayground.tsx` | Live |
| 2 | Compute Grid | `MiningTelemetry.tsx` | Live |
| 3 | OSCRP Stake | `OSCRPCalculator.tsx` | Live |
| 4 | C-Suite Console | `AgentConsole.tsx` | Live |
| 5 | Mine JGT | `AttentionMining.tsx` | Live (needs Bitmedia Publisher ID) |
| 6 | Revenue Hub | `JGTRevenueHub.tsx` | Live (needs ETH + API URL) |
| 7 | JGT Staking | `JGTStaking.tsx` | Live (needs staking contract deployed) |
| 8 | Ad Slots | `AdSlotManager.tsx` | Live (needs ETH for on-chain campaigns) |
| -- | Whitepaper | `whitepaper/page.tsx` | Live |

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

**DB tables:** users, sessions, ad_views, pending_claims, dispense_batches, airdrop_registrations, referrals, ad_campaigns

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
cd /home/Kali/Junction_Generator
npm run dev

# Push to GitHub (auto-triggers Vercel deploy)
python3 push_page.py

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
- **Local clone:** `/home/Kali/Junction_Generator` (directory has underscore, remote does not)
- **Stale dir:** `/home/Kali/junctiongenerator` -- old copy from June 2, ignore it
- **Push token:** stored in `.gh_token`, read at runtime by `push_page.py`
- **Vercel env:** needs `NEXT_PUBLIC_API_URL` set to Worker URL
