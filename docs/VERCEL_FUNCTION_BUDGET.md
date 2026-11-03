# Vercel Hobby function budget — review and resolution

**Date:** 2026-11-03 · **Decision:** Option A (owner approved "implement, then review"), keep all 19 HTTP routes, add a CI guard.

## 1. Diagnosis

Vercel Hobby allows **12 Serverless Functions per deployment** [5](https://github.com/vercel/vercel/discussions/6197). Vercel auto-deploys **every supported source file in the root `api/` directory as its own function** — including helpers, tests and migration scripts that have no request handler [3](https://vercel.com/docs/functions/configuring-functions/advanced-configuration). There is no `excludeFiles` option; the only built-in exemptions are files/directories starting with `_`, files starting with `.`, and `*.d.ts` [2](https://github.com/vercel/next.js/discussions/77046). Next.js pages are bundled into far fewer Lambdas, so the root `api/` directory is what consumed the budget [3](https://github.com/vercel/community/discussions/832).

This repository's root `api/` was **Cloudflare Worker source**, not a set of Vercel endpoints. The live API is `https://jgt-mining-api.james-gordon.workers.dev`, and the website calls it directly (`src/proxy.ts` allows that origin in its CSP). Vercel was being asked to deploy 11 copies of code it never invokes.

| # | `api/` file (before) | What it really is | Vercel function? |
| --- | --- | --- | --- |
| 1 | `worker.js` | Cloudflare Worker entry; one `export default { fetch }` serving 19 routes | counted, but wrong runtime (`cloudflare:email`, `mimetext`, `EMAIL_SENDER`, `RATE_LIMITER`) |
| 2 | `public-write.mjs` | Turnstile / JSON helper | counted, no handler |
| 3 | `rate-limit.mjs` | fail-closed limiter helper | counted, no handler |
| 4 | `legacy-rewards.mjs` | read-only dispense preview helper | counted, no handler |
| 5 | `cors.mjs` | exact-origin allowlist helper (added in PR #66) | counted, no handler |
| 6 | `public-write.test.mjs` | `node:test` suite | counted, no handler |
| 7 | `rate-limit.test.mjs` | `node:test` suite | counted, no handler |
| 8 | `legacy-rewards.test.mjs` | `node:test` suite | counted, no handler |
| 9 | `cors.test.mjs` | `node:test` suite (added in PR #66) | counted, no handler |
| 10 | `migrate_digest_state.js` | one-off Turso migration | counted, no handler |
| 11 | `migrate_hire_leads.js` | one-off Turso migration | counted, no handler |

**Why PR #66 started failing:** `main` had 9 files in `api/` and sat right at the cap once Next.js functions were added. PR #66 added `cors.mjs` and `cors.test.mjs` → 11 → over 12. Every commit in the PR (including docs-only ones) therefore failed, while `main` still deployed. This matches the owner's Hobby-plan diagnosis.

## 2. What Vercel actually needs

None of those files should be a Vercel function. The practical 12-slot budget is:

| Slot | Deployed by Vercel | Notes |
| --- | --- | --- |
| 1 | Next.js app bundle | 8 dynamic pages (`/`, `/blog`, `/blog/[slug]`, `/community`, `/testnet`, `/whitepaper`, `/jgt-faucet`, `/_not-found`), bundled into ~1 Lambda |
| 2 | `src/proxy.ts` | Edge Function: per-request nonce CSP |
| 3 | `/blog/[slug]/opengraph-image` | SSG/ISR image route |
| 4 | `src/app/feed.xml/route.ts` | prerendered (`○` static, may cost 0) |
| 5–12 | **free headroom** | deliberately left empty |

So the "12 most practical functions" are **~3–4 that serve the website, and 8–9 empty slots**. The fix is not to choose 12 endpoints to keep — it is to stop Vercel inventing 11 fake ones.

## 3. The 12 routes worth keeping (if the API ever moves to Vercel)

`worker/worker.js` serves 19 paths. All 19 stay on Cloudflare under the chosen option. For reference, these are the 12 practical ones in priority order:

| # | Route | Why keep |
| --- | --- | --- |
| 1 | `GET /api/health` | liveness / monitoring |
| 2 | `POST /api/subscribe` | newsletter, used by the site |
| 3 | `POST /api/hire-lead` | client-work enquiries, funds development |
| 4 | `POST /api/community/join` | used by the site |
| 5 | `POST /api/community/activate` | used by the site |
| 6 | `GET /api/community/scoreboard` | used by the site |
| 7 | `GET /api/user` | public account read |
| 8 | `GET /api/referral` | public referral read |
| 9 | `GET /api/ads/campaigns` | public campaign read |
| 10 | `POST /api/digest/run` | midnight-UTC digest cron, fallback notification |
| 11 | `GET /api/pending-rewards` | owner read-only state |
| 12 | `POST /api/community/funding` | owner funding record |

**7 safe to retire (not retired in this change):** `POST /api/ad-view`, `POST /api/community/weekly-metrics`, `POST /api/referral/claim`, `POST /api/ads/campaigns`, `POST /api/airdrop/register` + `GET /api/airdrop/status` (already 410), `POST /api/dispense`. These are legacy JGT-era flows behind owner/cron bearer tokens.

## 4. Why Option A was recommended

| Option | Verdict |
| --- | --- |
| **A — move the Worker out of `api/`** | **Chosen.** Zero endpoints lost, zero Vercel functions from the Worker, permanent headroom, no reliance on Vercel-specific underscore behaviour. Cost: mechanical path updates. |
| B — underscore-prefix helpers/tests | Rejected: still deploys one broken Cloudflare Worker as a Vercel function (it needs Cloudflare-only modules/bindings), and relies on a convention rather than a guarantee [4](https://github.com/johmacdu/thwaphockey/pull/62). |
| C — rebuild as 12 Vercel API functions | Rejected: changes live hosting architecture, retires 7 endpoints, duplicates auth/rate-limit/Turnstile/Turso logic for no benefit. |

## 5. Implemented

- `git mv api worker/` — Vercel now sees **0** root-`api` functions. `worker/wrangler.toml` keeps `main = "worker.js"`; all relative imports still resolve.
- `scripts/vercel-function-budget.mjs` counts deployable root-`api` files (skipping `_`/`.`/`*.d.ts`) and fails above `--max`; wired into `.github/workflows/website-ci.yml` with `--max 0` and exposed as `npm run vercel:budget`.
- CI path filters, syntax globs and the four Worker test paths updated from `api/` to `worker/`.
- `.gitignore`, `worker/DEPLOY.md`, `worker/wrangler.toml`, `worker/migrate_*.js` comments, `BACKEND_SETUP.md`, root `README.md`, `docs/ROADMAP.md`, `docs/WEBSITE_SECURITY.md`, `docs/NEXT_STEPS_PLAN.md` and `docs/mainnet/*` references updated. HTTP paths (`/api/...`) are unchanged everywhere.
- **No HTTP route, no auth rule, no CORS behaviour and no mainnet gate changed.**

## 6. Verification

1. `node scripts/vercel-function-budget.mjs --max 0` → 0 functions, 12 slots free.
2. `node --check` over `worker/*.js`, `worker/*.mjs`; `node --test worker/*.test.mjs scripts/deploy/deployment-safety.test.cjs` → 21 tests.
3. `yarn lint` + `yarn build` (Next.js still builds with no root `api/`).
4. `node --test scripts/deploy/deployment-safety.test.cjs`, `npm run release:check`, `infra:guard`, `mainnet:launch --assert-blocked` — no gate changes.
5. **Confirmed:** commit `f34546e` produced a successful Vercel preview
   (`Deployment has completed`, `dpl_H4ztnkmnZxvW7kix9h7gAoSzW54w`). The
   Vercel check on PR #66 is green; all GitHub Actions checks pass.

**Not run from this sandbox:** `wrangler deploy --dry-run` (Cloudflare API is not reachable here) and a live endpoint check against the deployed Worker. Both are in `worker/DEPLOY.md` for the owner.

**No mainnet gate is touched.** JGTC remains valueless and `npm run mainnet:launch` stays fail-closed.
