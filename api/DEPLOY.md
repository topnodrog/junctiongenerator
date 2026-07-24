# Cloudflare Worker deployment and verification

**Last verified:** 2026-07-24

Worker: `jgt-mining-api`

URL: `https://jgt-mining-api.james-gordon.workers.dev`

Current version: `27376d87-c982-46c1-b089-04ace3e01651`

## Live behavior

- `POST /api/subscribe` and `POST /api/hire-lead` remain public.
- Each valid submission is written to Turso before notification is attempted.
- Newsletter signups and hire leads immediately email
  `james_gordon@junctiongenerator.net`.
- A notification failure is logged but does not fail or discard the stored
  submission.
- The `0 0 * * *` cron runs the midnight-UTC digest as a fallback.
- Legacy mining/admin endpoints require
  `Authorization: Bearer <API_SECRET>`.
- CORS, rate limiting, server-authoritative rewards, and PII masking remain
  enabled.

## Verified Cloudflare state

| Requirement | Verified state |
|---|---|
| Wrangler identity | OAuth as `james_gordon@junctiongenerator.net` |
| Worker secrets | `API_SECRET`, `CRON_SECRET`, `TURSO_AUTH_TOKEN` present |
| Send binding | `EMAIL_SENDER` → verified fixed destination |
| Destination | `james_gordon@junctiongenerator.net`, verified 2026-06-26 |
| Other bindings | `RATE_LIMITER`, `TURSO_URL`, `DIGEST_RECIPIENT`, `AD_REWARD_JGT` |
| Scheduled trigger | `0 0 * * *` |
| Database health | `/api/health` returned 200 and `database: connected` |
| Protected endpoint | `/api/pending-rewards` returned 401 without a token |
| Digest execution | `digest_state.last_sent_at` advanced to `2026-07-24 00:00:01` |
| Immediate email | Live synthetic request logged `owner notification sent` |

The live synthetic verification rows were deleted after the test. Real contact
records were not changed.

Cloudflare currently reports zone-level **inbound Email Routing** as
unconfigured/disabled. That is distinct from the Worker send binding: the
destination address is verified and the outbound notification call completed
successfully in the live Worker.

The gitignored `.cf_token` belongs to older API automation and is not used by
`wrangler deploy`; Wrangler's OAuth session is the working deployment
credential.

## Deploy

From `C:\dev\JunctionGenerator\api`:

```powershell
wrangler deploy --dry-run
wrangler deploy
```

The deployment summary should include `EMAIL_SENDER`, `RATE_LIMITER`,
`TURSO_URL`, `DIGEST_RECIPIENT`, `AD_REWARD_JGT`, and schedule `0 0 * * *`.

## Read-only checks

```powershell
wrangler whoami
wrangler secret list
wrangler deployments status
wrangler email routing addresses list

curl.exe https://jgt-mining-api.james-gordon.workers.dev/api/health
curl.exe https://jgt-mining-api.james-gordon.workers.dev/api/pending-rewards
```

Expected: health is 200 with a connected database; pending rewards is 401
without the owner token.

## Manual digest

```powershell
curl.exe -X POST `
  -H "Authorization: Bearer <CRON_SECRET>" `
  https://jgt-mining-api.james-gordon.workers.dev/api/digest/run
```

Cloudflare secrets cannot be read back. If one is lost, replace it with
`wrangler secret put <NAME>`.

## Rollback

```powershell
wrangler deployments list
wrangler rollback <deployment-id>
```

The website is deployed separately through Vercel when `junctioning` is merged
to `main`.
