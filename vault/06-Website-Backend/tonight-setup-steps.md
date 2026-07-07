---
name: tonight-setup-steps
description: "Step-by-step checklist to finish wiring up the daily signup digest email — do tonight"
metadata:
  node_type: memory
  type: project
---

# Tonight's checklist — daily signup digest

> **⚠️ SUPERSEDED 2026-07-07 — read `api/DEPLOY.md` instead.** Two "blockers" below are now
> FALSE: (1) `.cf_token` being dead does **not** block deploy — `wrangler deploy` uses its own
> valid OAuth login (verified: logged in as james_gordon@…). (2) Email Routing is already
> enabled and `james_gordon@junctiongenerator.net` was **verified 2026-06-26**. All three worker
> secrets are already set. The deploy is fully unblocked; the current live worker is the old,
> pre-hardening version. Use the runbook in `api/DEPLOY.md`.

Goal: junctiongenerator.net is ready for a real signup, and you get a daily email whenever a new newsletter/airdrop entry shows up.

## 1. Enable Cloudflare Email Routing

1. Go to the Cloudflare dashboard → select **junctiongenerator.net**.
2. Left sidebar → **Email** → **Email Routing**.
3. Click **Enable Email Routing** (Cloudflare adds the required MX/TXT records automatically).
4. Under **Destination addresses**, click **Add destination address**, enter `james_gordon@junctiongenerator.net`.
5. Check that inbox and click the verification link Cloudflare sends. The address must show **Verified** before continuing.

## 2. Rotate the Cloudflare API token

The token in `.cf_token` is dead (fails Cloudflare's own auth check), so I can't deploy for you until it's replaced.

1. Cloudflare dashboard → top-right profile icon → **My Profile** → **API Tokens**.
2. **Create Token** → use the "Edit Cloudflare Workers" template (or custom token with `Workers Scripts:Edit` + `Email Routing Addresses:Edit` + `Zone:Read` permissions for junctiongenerator.net).
3. Copy the new token.
4. Replace the contents of `C:\dev\JunctionGenerator\.cf_token` with the new token (just the token string, nothing else).

## 3. Deploy the worker

Open a real PowerShell window (not the WSL-bash-backed `!` prefix — that path is broken per the deploy notes).

```powershell
cd C:\dev\JunctionGenerator\api
wrangler deploy
```

Confirm it deploys without errors. If it complains about the `EMAIL_SENDER` binding, double check step 1 — the destination address must be verified first.

## 4. Test the digest manually (don't wait for midnight)

You'll need the `CRON_SECRET` value (set via `wrangler secret put CRON_SECRET` originally — check your password manager / wherever secrets are tracked if you don't remember it offhand).

```powershell
curl -X POST https://jgt-mining-api.james-gordon.workers.dev/api/digest/run -H "Authorization: Bearer <CRON_SECRET>"
```

Expect `{"success":true,"message":"Digest run triggered"}`. Since both tables are currently empty, this run will just reset the "last checked" timestamp — that's expected, not a bug.

## 5. Drop your real entry

Go to junctiongenerator.net and submit your real email (and wallet, if doing the airdrop form too) through the live newsletter signup / airdrop form.

## 6. Verify the digest catches it

Run step 4's curl command again. This time, since there's a new row created after the "last checked" timestamp, you should get an email at `james_gordon@junctiongenerator.net` listing the new signup. After that, the midnight-UTC cron handles it automatically going forward — no more manual triggers needed.

## If something breaks

- **No email arrives:** re-check the destination address shows "Verified" in Email Routing, and that `wrangler deploy` succeeded after that.
- **`wrangler deploy` auth errors:** the new token from step 2 may be missing a permission — re-create it with the Workers template instead of a custom one.
- **Digest endpoint returns 401:** wrong `CRON_SECRET` — re-check what's stored vs. what you're passing.
