# Cloudflare Worker deployment and verification

**Last verified:** 2026-09-05 UTC

Worker: `jgt-mining-api`

URL: `https://jgt-mining-api.james-gordon.workers.dev`

Current version: `9de91da9-3e77-447e-9bf4-98362650f3d6`

Website protection merged in PR #47 and deployed through Vercel before the
Worker update. The production page has its real Turnstile site key and enforced
CSP; no dummy key is present. See `docs/WEBSITE_SECURITY.md`.

## Live behavior

- `POST /api/subscribe`, `POST /api/hire-lead`,
  `POST /api/community/join`, and `POST /api/community/activate` are public
  and rate-limited, and require server-verified Turnstile tokens bound to the
  form action and production hostname before storage or notification.
- `GET /api/community/scoreboard` returns aggregate community and funding
  progress without personal data.
- `POST /api/community/funding` and `POST /api/community/weekly-metrics`
  require the owner bearer token.
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
- Legacy `POST /api/airdrop/register` is retired and returns 410.

## Verified Cloudflare state

| Requirement | Verified state |
|---|---|
| Deployment identity | Existing project Cloudflare API token; previous OAuth session unavailable |
| Worker secrets | `API_SECRET`, `CRON_SECRET`, `TURSO_AUTH_TOKEN`, `TURNSTILE_SECRET_KEY` present |
| Send binding | `EMAIL_SENDER` → verified fixed destination |
| Destination | `james_gordon@junctiongenerator.net`, verified 2026-06-26 |
| Other bindings | `RATE_LIMITER`, `TURSO_URL`, `DIGEST_RECIPIENT`, `AD_REWARD_JGT` |
| Scheduled trigger | `0 0 * * *` |
| Database health | `/api/health` returned 200 and `database: connected` |
| Protected endpoint | `/api/pending-rewards` returned 401 without a token |
| Community scoreboard | `/api/community/scoreboard` returned aggregate launch-week data |
| Community owner route | `/api/community/funding` returned 401 without a token |
| Digest execution | `digest_state.last_sent_at` advanced to `2026-07-24 00:00:01` |
| Immediate email | Live synthetic request logged `owner notification sent` |

The digest and immediate-email rows above are historical 2026-07-24 evidence;
no new notification was sent during the September security verification.
On 2026-09-05 all four public write routes rejected missing tokens with 400,
a forged newsletter token returned 400, airdrop registration returned 410,
owner-only pending rewards returned 401, and health/scoreboard reads returned
200 with database health connected. No signup records were created by those checks.

The live synthetic verification rows were deleted after the test. Real contact
records were not changed.

Cloudflare currently reports zone-level **inbound Email Routing** as
unconfigured/disabled. That is distinct from the Worker send binding: the
destination address is verified and the outbound notification call completed
successfully in the live Worker.

The gitignored `.cf_token` was used through the temporary
`CLOUDFLARE_API_TOKEN` process environment for the September deployment.
Do not print or commit it. The earlier Wrangler OAuth session was unavailable.
The Turnstile secret is stored in the Worker; it is not in the repository.

## Deploy

Apply `db/schema_community_flywheel.sql` to Turso before deploying this Worker.
The migration is additive and does not alter existing mining or newsletter
records.

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
