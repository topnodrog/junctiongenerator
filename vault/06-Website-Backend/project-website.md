---
name: project-website
description: "junctiongenerator.net — Next.js site, deploy flow, Cloudflare/Turso backend, funding stance"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c068aa4-5366-42b6-b8f5-01e71bf2c4a0
---

**junctiongenerator.net** is a Next.js (app-router) site at `C:\dev\JunctionGenerator\src\app\` (NOT `packages/web`, which is an empty scaffold). Repo: `github.com/topnodrog/junctiongenerator`, branch `main` = production (Vercel auto-deploys on push to main).

**Deploy flow:** commit to `junctioning` branch, then user pushes `main` from a real PowerShell window (NOT `!` prefix — that uses WSL bash which is broken). Claude prepares commits + PR branch; user merges. Root `tsconfig.json` must keep `"exclude": [..., "packages"]` or jgc-node ES2020 BigInts break the web ES2017 typecheck. Build check: `npm run build` from repo root.

**Backend:** Cloudflare Worker `jgt-mining-api` at `jgt-mining-api.james-gordon.workers.dev` (`api/worker.js`) + Turso DB `jgt-mining-topnodrog.aws-us-east-2.turso.io`. Live/healthy. `POST /api/subscribe {email}` → `newsletter_subscribers` table. Check signups: `turso db shell jgt-mining "SELECT email, created_at FROM newsletter_subscribers"`. Tokens in gitignored `.cf_token`/`.turso-token`.

**What's live on site:** compiler sandbox (VibePlayground), mining telemetry (MiningTelemetry — note: fully SIMULATED random numbers), OSCRP stake calculator, Agent Console, newsletter signup, honest donation section, whitepaper, live **NodeStatusPanel** (real data, not simulated).

**2026-06-19 grant polish:** hero rewritten to lead with PoUC/Layer-1 (not vibe-coding); added "What We've Built" milestones + 3-pillar verification explainer; added "Be One of the First" run-a-node recruitment section; replaced 3 stale attention-mining blog posts with 3 PoUC technical posts; whitepaper Phase 3 marked complete + verification section updated to replay+sampling+quorum.

**NodeStatusPanel (real local-node status):** `src/components/NodeStatusPanel.tsx` polls `http://127.0.0.1:7777/status` (override via `NEXT_PUBLIC_NODE_STATUS_URL`) every 5s; shows current/pending JGC, wallet address, height, uptime; honest offline/connecting states. Backed by jgc-node's `src/network/status-server.ts` (loopback, read-only, CORS+Private-Network-Access headers so the HTTPS site can reach loopback in Chrome/Edge/Firefox). Run it: `cd packages/jgc-node && npm run build && npm run node-status -- --address <addr> [--datadir <store>]` (watch-only needs no passphrase; --datadir gives real mature/immature balances). Verified preflight returns 204 + `Allow-Private-Network: true`.

**Removed:** JGT revenue-hub, staking widgets, ad-revenue features (pointed at compromised wallet).

**Funding stance:** pursue grants (Gitcoin/ZK/verifiable-compute) + donations. Do NOT sell/promote JGT (securities risk + compromised). Donation addresses on site: ETH/Base `0x3f3e604eA29bfA66d0e6CA07f4B6BCA5e36ce7C8`, BTC `bc1q4crtxa5lng0nq9s7y2u9h0ml2egus95p833xf0`, SOL `43mBkQPgTz3XbM6wBz5RXkzMLuCM1KB3xRTqeE8mTj1E`.

**2026-06-25 cleanup + daily digest:** wiped test rows (`test@example.com`) from `newsletter_subscribers` and `airdrop_registrations` — both empty now, ready for real signups. Added a daily digest: worker's existing midnight-UTC cron (`scheduled()` in `api/worker.js`) now calls `sendDailyDigest()`, which diffs `newsletter_subscribers`/`airdrop_registrations` against a new `digest_state` table (tracks `last_sent_at`) and emails any new rows to `james_gordon@junctiongenerator.net` via a Cloudflare `send_email` binding (`EMAIL_SENDER` in `wrangler.toml`) + `mimetext` (added `api/package.json`). Manual test trigger: `POST /api/digest/run` with `Authorization: Bearer <CRON_SECRET>`.

**Blocked on:** (1) Email Routing must be enabled for junctiongenerator.net + `james_gordon@junctiongenerator.net` verified as a destination address in Cloudflare dashboard (Email > Email Routing) — couldn't automate via API because `.cf_token` is dead (fails `/user/tokens/verify`, needs rotation — see [leaked-secrets-risk](../07-Security/leaked-secrets-risk.md)). (2) Once routing is verified and a fresh token is in place, deploy with `cd api && wrangler deploy`.
