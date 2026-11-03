# Documentation audit — 2026-11-03

**Scope:** every Markdown file tracked in the repository (69 pre-existing files,
70 including this report), including
root docs, `docs/**`, `docs/public/**`, `docs/mainnet/**`, package READMEs,
deployment runbooks, `.serena/memories/architecture/**` and the new
launch/review material.

**Method:**
1. Resolve every relative Markdown link and report missing targets.
2. Scan for dated "Status"/"Updated" lines and stale numeric claims.
3. Cross-check provider references (Fly.io, Google Cloud/GCP, `gcloud`, GCS,
   Cloud Scheduler, Vertex/Gemini) against the owner's "without Fly.IO or
   googles cloud" constraint and the active provider-neutral kit.
4. Cross-check code reality against docs: `JGC_SEEDS`, `/status` on public binds,
   exact CORS allowlist, signed launch control, zero-premine issuance, gate
   state and current test counts.
5. Check cross-links in the public review funnel and issue templates.

**Outcome:** all relative links now resolve; stale state claims are either
corrected or carry a dated "historical" banner pointing at current sources.
No gate was flipped, no network was started and no value-bearing mainnet was
launched.

## 1. Link check

| Pass | Broken links | Resolution |
| --- | --- | --- |
| Initial full scan | 2 | `docs/concept-paper.md` → `../CONTRIBUTING.md` (file does not exist); `packages/jgc-node/deploy/selfhosted/README.md` → `../../../docs/mainnet/LAUNCH_PLAN.md` (needed four `..`). Both fixed. |
| After banner insertion | 5 | Four banner links inside `docs/mainnet/ASSIGNED_WORK.md` used a duplicated `mainnet/` prefix (fixed); one pointed at this audit file before it existed (now created). |
| Final | **0** | Re-run after this file was written. |

The concept paper's "Get Involved" section also pointed at a wrong GitHub
repository (`junctiongenerator/junction-generator`) and a nonexistent
contributor guide; both now point to `topnodrog/junctiongenerator`, the
independent-review one-pager and the review pack.

## 2. Stale claims corrected

| Claim | Where | Correction |
| --- | --- | --- |
| "44 suites / 351 tests" / "40 suites / 329 tests" | root `README.md`, `docs/ROADMAP.md`, `docs/public/JGC_OnePager.md`, `docs/concept-paper.md`, `docs/mainnet/ASSIGNED_WORK.md` (historical line) | Current verification is **57 suites / 496 tests** (`RESECURE_REPORT.md`). Historical numbers retained only inside dated banners/snapshots. |
| "live two-seed pilot", Google Seed A / Fly.io Seed B as reachable | root `README.md`, `packages/jgc-node/README.md`, `RUN-A-NODE.md`, `RELEASE_NOTES.md`, `docs/public/JGC_OnePager.md`, `docs/NEXT_STEPS_PLAN.md`, `docs/PILOT_OPERATIONS_TESTING.md` | Pilot **retired/archived 2026-11-02**; no vendor hostnames are baked into the release. `JGC_SEEDS` (or `--seed`) is required; current kit is `packages/jgc-node/deploy/selfhosted/README.md`. |
| `npm run testnet:public` "dials both seeds" | package README, `RUN-A-NODE.md` | It dials exactly the operator-supplied `JGC_SEEDS` (max 32, `wss://` for public hosts). |
| `/status` available in containers | `Dockerfile`, `compose.smoke.yml`, `compose-smoke.mjs`, `testnet-smoke-contributor.ts`, runner docs | Private `/status` is disabled on a `0.0.0.0` bind; containers use `/healthz` and `/explorer`. CI Docker Compose smoke now passes. |
| `--allow-private-status-on-public-bind --status-token` described as CLI flags | `packages/jgc-node/README.md` (introduced by the hardening pass) | These are environment variables only: `JGC_ALLOW_PRIVATE_STATUS_ON_PUBLIC_BIND` and `JGC_STATUS_TOKEN`. Full environment-only list added. |
| "For the continuously running Google Cloud + Fly.io pilot, see deploy/README.md" | package README | `deploy/README.md` is archived; active path is `deploy/selfhosted/README.md`. |
| "operational plan in docs/NEXT_STEPS_PLAN.md" | root `README.md` | Replaced with `GATE_CLOSURE_PROTOCOL.md` + `gate-status.json`; `NEXT_STEPS_PLAN.md` bannered as archived. |
| "Open pull requests: none" | `docs/SECURITY_BASELINE.md` | Now records open PRs (including #66) and the 18 Dependabot alerts reported on 2026-11-03 (7 critical, 6 high, 5 moderate). |
| "Public JGTC testnet pilot (Live)" in Completed History | root `README.md` | Marked archived; no live value-bearing network. |
| "two-provider WSS seed defaults" in v0.1.0 release notes | `packages/jgc-node/RELEASE_NOTES.md` | Marked historical; the prerelease embeds retired hostnames and must not be used as a current runner path. |
| Funding / token / waitlist language | `docs/concept-paper.md`, `COMMUNITY_FLYWHEEL_PLAYBOOK.md`, `docs/FUNDRAISING_PUBLICATION_PLAN.md` | Bannered as historical; current stance is grants/donations/paid work, no token sale, no implemented premine (`PREMINE_FUNDING_DECISION.md`). |
| "findings and prioritized todo" described as the current audit | `docs/mainnet/README.md` | Points to `NODE_SECURITY_REVIEW.md`; `FINDINGS_AND_TODO.md` is a dated snapshot. |

## 3. Dated documents bannered as historical

A dated banner (with links to the current authoritative sources) was added to
29 files. No file was deleted: the old evidence is still reproducible.

- Root / strategy: `docs/NEXT_STEPS_PLAN.md`, `docs/PILOT_OPERATIONS_TESTING.md`,
  `docs/ROADMAP.md`, `docs/SECURITY_BASELINE.md`, `docs/WEBSITE_SECURITY.md`,
  `docs/concept-paper.md`, `docs/JGC_COMPLETION_PLAN.md`,
  `docs/DAILY_DISTRIBUTION_PROTOTYPE.md`,
  `docs/FUNDRAISING_PUBLICATION_PLAN.md`, `docs/LOCAL_MODEL_BENCHMARK.md`,
  `docs/JGT_FAUCET.md`, `COMMUNITY_FLYWHEEL_PLAYBOOK.md`,
  `docs/PUBLIC_SEED_DEPLOYMENT.md`, `BACKEND_SETUP.md` (pre-existing banner).
- Public 2026-09 drafts: `docs/public/JGC_OnePager.md`, `JGC_TeamBios.md`,
  `JGC_UseCases.md`, `JG_Logo_Guidelines.md`; `docs/public/README.md` now
  separates the current one-pager from historical background.
- Mainnet snapshots: `FINDINGS_AND_TODO.md`, `REMAINING_GATES_HANDOFF.md`,
  `NEXT_CONVERSATION.md`, `ASSIGNED_WORK.md`, `WALLET_AND_PARTICIPATION.md`,
  `DETERMINISTIC_CONSENSUS.md`, `PEER_AUTHENTICATION.md`,
  `PQ_BACKEND_EVALUATION.md`, `SHIELDED_PAYMENTS_V3_DESIGN.md`.
- Archived deployment: `packages/jgc-node/deploy/README.md` (pre-existing),
  `deploy/monitor/README.md`, `deploy/google/**`, `deploy/fly/**`,
  `deploy/monitor/**`, `deploy/ops/**` (directories retained for audit only).
- Internal agent memories: all four `.serena/memories/architecture/*.md` files.

## 4. Authoritative sources now

| Question | Read |
| --- | --- |
| What is the launch state? | [`README.md`](README.md), [`gate-status.json`](gate-status.json) |
| What is the plan and go/no-go? | [`LAUNCH_PLAN.md`](LAUNCH_PLAN.md) |
| How do gates actually close? | [`GATE_CLOSURE_PROTOCOL.md`](GATE_CLOSURE_PROTOCOL.md) |
| What was hardened and re-verified? | [`NODE_SECURITY_REVIEW.md`](NODE_SECURITY_REVIEW.md), [`RESECURE_REPORT.md`](RESECURE_REPORT.md) |
| How do outsiders join? | [`REVIEW_PACK.md`](REVIEW_PACK.md), [`EXTERNAL_REVIEW_ONBOARDING.md`](EXTERNAL_REVIEW_ONBOARDING.md), [`OUTREACH_PLAN.md`](OUTREACH_PLAN.md), [`../public/JGC_INDEPENDENT_REVIEW_PROGRAM.md`](../public/JGC_INDEPENDENT_REVIEW_PROGRAM.md), root `SECURITY.md` |
| Is there a premine? | [`PREMINE_FUNDING_DECISION.md`](PREMINE_FUNDING_DECISION.md) — **not implemented, not approved** |
| How do I run a node/seed? | [`../../packages/jgc-node/README.md`](../../packages/jgc-node/README.md), [`../../packages/jgc-node/docs/RUN-A-NODE.md`](../../packages/jgc-node/docs/RUN-A-NODE.md), [`../../packages/jgc-node/deploy/selfhosted/README.md`](../../packages/jgc-node/deploy/selfhosted/README.md) |

`AGENTS.md` and `CLAUDE.md` remain the operative agent instructions and were
reviewed without change. Technical design docs under `packages/jgc-node/docs/`
remain valid design records; none is launch clearance.

## 5. Still open (owner / external, not documentation)

1. **Vercel preview deployments fail** on PR #66 while the equivalent GitHub
   Actions website build passes. Requires Vercel build logs
   (`npx vercel inspect dpl_<id> --logs`) or dashboard access; unavailable in
   this sandbox. See `RESECURE_REPORT.md` §1b.
2. **Dependency triage:** 18 Dependabot alerts reported; `npm audit` not run.
3. Not performed: Docker image build, Wrangler dry-run, live endpoint check,
   Solidity compilation, website end-to-end deployment verification.
4. No external security review, independent operators, signed launch record,
   reviewed proof registry, genesis manifest or multi-host soak exists.
5. Cloudflare / Vercel / Turso remain the website stack; whether they stay in
   scope is an unresolved owner decision. They are outside the consensus trust
   boundary and are not Fly.io or Google Cloud.

**Correct label:** hardened, fail-closed, zero-value testnet candidate with a
current, auditable documentation set and a public review funnel. Not a
value-bearing mainnet.
