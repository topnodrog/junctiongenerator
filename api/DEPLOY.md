# Deploying the hardened worker

**Written 2026-07-07.** The security fixes are committed on `junctioning` (`api/worker.js`,
`api/wrangler.toml`) but **not yet deployed** — the live worker is still the old, open version.
This is the exact runbook to ship it.

> Supersedes the digest-only checklist in `vault/06-Website-Backend/tonight-setup-steps.md`.
> That file's two "blockers" (rotate `.cf_token`, enable Email Routing) **no longer apply** —
> see Pre-flight below.

---

## What this deploy changes on the live API

- Legacy mining/admin endpoints now require `Authorization: Bearer <API_SECRET>`:
  `POST /api/ad-view`, `POST /api/referral/claim`, `POST /api/ads/campaigns`, `GET /api/pending-rewards`.
- Ad rewards become server-authoritative (`AD_REWARD_JGT`, default 1); client `rewardAmount` ignored.
- `GET /api/user` no longer returns email; `GET /api/airdrop/status` masks it.
- CORS locked to junctiongenerator.net + localhost + `*.vercel.app` (was `*`).
- Per-IP rate limiting on `subscribe` / `hire-lead` / `airdrop register` (20 req / 60 s).
- Adds the daily-digest cron + `EMAIL_SENDER` binding (first time these ship).

**The public site is unaffected.** It only calls `POST /api/subscribe` and `POST /api/hire-lead`,
both of which stay public. Verified: `src/` calls none of the now-gated endpoints.

---

## Pre-flight — all already satisfied (2026-07-07)

Nothing to set up. Each was checked tonight; re-run any command to confirm.

| Requirement | State | Check command (run from `api/`) |
|---|---|---|
| wrangler logged in (correct account) | ✅ OAuth as james_gordon@…, acct …990c | `wrangler whoami` |
| Worker secrets set | ✅ API_SECRET, CRON_SECRET, TURSO_AUTH_TOKEN | `wrangler secret list` |
| Email Routing destination verified | ✅ james_gordon@… verified 2026-06-26 | `wrangler email routing addresses list` |
| `mimetext` dependency installed | ✅ in `api/node_modules` | `npm ls mimetext` |
| wrangler supports rate-limit binding | ✅ v4.98.0 | `wrangler --version` |

> **The dead `.cf_token` does NOT block this.** That file is only used by the separate
> Python/API automation (`scripts/db/deploy_worker.py`). `wrangler deploy` authenticates with
> its own OAuth login, which is valid.

---

## Step 1 — Baseline (prove the old worker is open)

In PowerShell (use `curl.exe`, not `curl` — in Windows PowerShell `curl` is an alias for
Invoke-WebRequest and won't take `-X`/`-H`):

```powershell
curl.exe https://jgt-mining-api.james-gordon.workers.dev/api/pending-rewards
```

**Now:** returns HTTP 200 with the full ledger (wallet addresses + pending JGT). That's the hole.

## Step 2 — Deploy

```powershell
cd C:\dev\JunctionGenerator\api
wrangler deploy
```

Expect a success summary listing bindings `EMAIL_SENDER`, `RATE_LIMITER`, `TURSO_URL`,
`DIGEST_RECIPIENT`, `AD_REWARD_JGT`, and the cron trigger `0 0 * * *`. (`wrangler deploy --dry-run`
first if you want a no-op rehearsal — it already passes.)

## Step 3 — Verify the fix is live

```powershell
# THE key proof: same request as Step 1 → now 401
curl.exe https://jgt-mining-api.james-gordon.workers.dev/api/pending-rewards
#   → {"error":"Unauthorized"}

# Same endpoint WITH the owner token → 200 ledger again
curl.exe -H "Authorization: Bearer <API_SECRET>" https://jgt-mining-api.james-gordon.workers.dev/api/pending-rewards

# Health still green
curl.exe https://jgt-mining-api.james-gordon.workers.dev/api/health
#   → {"status":"ok",...,"database":"connected"}

# CORS is locked (note the echoed Origin is NOT reflected)
curl.exe -i -H "Origin: https://evil.example" https://jgt-mining-api.james-gordon.workers.dev/api/health
#   → Access-Control-Allow-Origin: https://junctiongenerator.net

# Digest end-to-end (optional): triggers the email path
curl.exe -X POST -H "Authorization: Bearer <CRON_SECRET>" https://jgt-mining-api.james-gordon.workers.dev/api/digest/run
#   → {"success":true,"message":"Digest run triggered"}  — then check the inbox
```

You need the actual `API_SECRET` / `CRON_SECRET` values (from your password manager — Cloudflare
secrets can't be read back). If lost, re-set with `wrangler secret put API_SECRET`. Low risk:
the site never uses `API_SECRET`, and `CRON_SECRET` only gates the manual digest/dispense triggers.

## Step 4 — Rollback (only if something looks wrong)

```powershell
wrangler deployments list           # find the previous deployment id
wrangler rollback <deployment-id>   # revert instantly
```

---

## Not part of this deploy

- **The website** (Vercel) is separate. Deploying the worker does not touch it. The site's new
  security headers ship when `junctioning` merges to `main` (Vercel auto-deploys `main`).
- **Order if doing both tonight:** worker first (closes the live hole), then merge `main` for the
  site. There's no dependency between them.
