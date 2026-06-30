# JGT Attention Mining — Backend Setup Guide

## Architecture

```
Frontend (Vercel) → Cloudflare Worker API → Turso DB (SQLite)
                                      ↓
                              Daily Cron (midnight UTC)
                                      ↓
                    JGTBatchDispenser Contract (Base L2)
                                      ↓
                         Users receive JGT tokens
```

## Cost Breakdown (All Free Tier)

| Service | Cost | What it does |
|---|---|---|
| **Turso** (Database) | $0/mo | Stores user data, ad views, pending claims |
| **Cloudflare Workers** (API) | $0/mo (500K req/day) | REST API for tracking rewards |
| **Cloudflare Cron** | $0/mo | Triggers daily batch dispense |
| **Vercel** (Frontend) | $0/mo | Hosts the website |
| **Base L2** (Smart Contract) | ~$0.01/batch | Daily token distribution |

**Total monthly cost: ~$0.30** (just the Base gas for daily batches)

## Setup Steps

### 1. Create Turso Database

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login
turso auth login

# Create database
turso db create jgt-mining

# Get connection info
turso db show jgt-mining
turso db tokens create jgt-mining

# Run schema
turso db shell jgt-mining < db/schema.sql
```

Save the database URL and auth token — you'll need them for the Worker.

### 2. Deploy Cloudflare Worker

```bash
# Install Wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create jgt-mining

# Update wrangler.toml with your database_id
# Update secrets:
wrangler secret put API_SECRET
wrangler secret put CRON_SECRET
wrangler secret put TURSO_URL
wrangler secret put TURSO_AUTH_TOKEN

# Deploy
cd api
wrangler deploy
```

### 3. Deploy Smart Contract

1. Deploy JGT token contract first (ERC-20 on Base)
2. Deploy JGTBatchDispenser with the token address
3. Fund the dispenser with JGT tokens for the reward pool

### 4. Connect Frontend

Update the AttentionMining component:
- Set API endpoint to your Worker URL
- Set ACTIVE_PROVIDER to "bitmedia" when ready
- Add email collection form for newsletter

## Daily Flow

1. User watches ad → frontend calls `/api/ad-view`
2. Worker records ad view in Turso DB + adds to pending_claims
3. At midnight UTC, Cloudflare Cron triggers `/api/dispense`
4. Worker aggregates all pending claims by wallet
5. Backend submits batch to JGTBatchDispenser contract
6. Contract distributes all JGT tokens in ONE transaction
7. Gas cost: ~$0.01 for up to 200 recipients

## Newsletter

Emails collected in `newsletter_subscribers` table.
Export anytime: `SELECT email FROM newsletter_subscribers WHERE active = 1`
Use with Mailchimp, Resend, or any email service.
