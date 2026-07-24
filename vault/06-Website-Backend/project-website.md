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

**2026-07-24 community refresh:** homepage rebuilt around the useful-compute loop, honest project status, and clear ways to participate. Coinbase and Kraken were removed after declining affiliation; the remaining Ledger/Koinly links are described as independent affiliate links. The hire-me popup remains because paid work is an immediate project need. Reviewed refresh is commit `07cbe0a` on `junctioning`.

**NodeStatusPanel (real local-node status):** `src/components/NodeStatusPanel.tsx` polls `http://127.0.0.1:7777/status` (override via `NEXT_PUBLIC_NODE_STATUS_URL`) every 5s; shows current/pending JGC, wallet address, height, uptime; honest offline/connecting states. Backed by jgc-node's `src/network/status-server.ts` (loopback, read-only, CORS+Private-Network-Access headers so the HTTPS site can reach loopback in Chrome/Edge/Firefox). Run it: `cd packages/jgc-node && npm run build && npm run node-status -- --address <addr> [--datadir <store>]` (watch-only needs no passphrase; --datadir gives real mature/immature balances). Verified preflight returns 204 + `Allow-Private-Network: true`.

**Removed:** JGT revenue-hub, staking widgets, ad-revenue features (pointed at compromised wallet).

**Funding stance:** pursue grants (Gitcoin/ZK/verifiable-compute) + donations. Do NOT sell/promote JGT (securities risk + compromised). Donation addresses on site: ETH/Base `0x3f3e604eA29bfA66d0e6CA07f4B6BCA5e36ce7C8`, BTC `bc1q4crtxa5lng0nq9s7y2u9h0ml2egus95p833xf0`, SOL `43mBkQPgTz3XbM6wBz5RXkzMLuCM1KB3xRTqeE8mTj1E`.

**2026-07-24 notification status:** Worker version `27376d87-c982-46c1-b089-04ace3e01651` is live. `POST /api/subscribe` and `POST /api/hire-lead` store the record in Turso first, then immediately email `james_gordon@junctiongenerator.net`; a send failure is logged without losing the submission, and the midnight digest remains the fallback. The digest schedule was proven by `digest_state.last_sent_at = 2026-07-24 00:00:01`. A live synthetic hire-lead test succeeded and Cloudflare tail logged `owner notification sent`; both labeled test rows were removed afterward, leaving all real records untouched.

The destination address is Cloudflare-verified and the fixed-destination Worker send binding works. Zone-level inbound Email Routing currently reports unconfigured/disabled; that is separate from the verified outbound Worker notification path and does not block it. Wrangler deploys through the valid OAuth login; the dead `.cf_token` used by older automation is not a deployment blocker. See `api/DEPLOY.md` for the current operational record.
