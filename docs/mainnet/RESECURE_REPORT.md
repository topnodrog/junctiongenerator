# Resecure report — verification after the 2026-11-02 hardening pass

**Run:** 2026-11-02/03 (sandbox UTC 2026-11-03), branch `arena/08b59d79-junctiongenerator`
**Scope:** re-verification after the security fixes, provider-neutral deployment kit, gate closure mechanism, launch-control code and outreach/funnel documentation.
**Result:** all repository-local automated checks pass; one external Vercel
preview deployment check remains failing (§1b). **Mainnet remains deliberately
blocked.** This is engineering verification, not an external security review.

> Note: `node_modules/` and `dist/` are not persisted between sandbox sessions. Re-run `npm ci` and `npm run build` in `packages/jgc-node` before any command below.

## 1. Commands and results

| Check | Command | Result |
| --- | --- | --- |
| Type safety | `npm run typecheck` | PASS |
| Compile | `npm run build` | PASS |
| Full node suite | `npm test -- --ci` | **57 suites / 496 tests passed** (baseline was 54 / 466; +3 suites, +30 tests) |
| Release rehearsal | `npm run release:check` | **PASS** — typecheck, full suite (57/496), build, mainnet preflight still blocked, bundle staged + verified, 4 manifest tests |
| Website/Worker tests | `node --test worker/public-write.test.mjs worker/legacy-rewards.test.mjs worker/rate-limit.test.mjs worker/cors.test.mjs scripts/deploy/deployment-safety.test.cjs` | **21 tests passed** |
| Worker/deploy syntax | `node --check` over `worker/*.js`, `worker/*.mjs`, `scripts/deploy/*`, `tools/jgt-rescue/*` | PASS |
| Provider-neutral monitor | `node --test deploy/selfhosted/monitor.test.mjs` | **4 tests passed** |
| Infrastructure guard | `node scripts/infra-guard.mjs` | `ok: true`, 12 active files checked, 0 findings, no Fly.io / Google Cloud references |
| Proof registry | `node scripts/proof-registry-check.mjs --assert-blocked` | PASS (blocked as expected; built-in registry has 5 placeholder circuits) |
| Gate status | `node scripts/gate-status.mjs` | Generated [`gate-status.json`](gate-status.json); 0 of 12 gates evidence-satisfied; policy invalid (0 trusted keys) |
| Launch gate | `node scripts/mainnet-launch.mjs --assert-blocked` | PASS (blocked, `launchAttempted: false`) |
| Local soak rehearsal | `npm run solo-soak -- --blocks 24 --nodes 3 --output .tmp/soak-rehearsal.json` | PASS — 3 nodes, 24 blocks, partition reconnect synced, all tips agree; local simnet evidence only |
| Split-listener runtime smoke | Start `testnet-node.js` with `JGC_PUBLIC_API_PORT`, then curl both listeners | PASS — public `/healthz` and `/explorer` 200; public `/status` 404; private `/status` 200; disallowed `Origin` 403 |
| Whitespace / patch hygiene | `git diff --check` | PASS |

## 1b. CI regression found and fixed (2026-11-03)

PR #66's first CI run exposed a real consequence of the H-02 fix: the Docker
HEALTHCHECK and the two-node compose smoke used the **private** `/status` route,
which is intentionally disabled on a `0.0.0.0` bind. Containers now use only
the narrow public routes:

| File | Change |
| --- | --- |
| `packages/jgc-node/Dockerfile` | HEALTHCHECK → `/healthz` |
| `packages/jgc-node/compose.smoke.yml` | `JGC_SMOKE_STATUS` → `/explorer` |
| `packages/jgc-node/scripts/compose-smoke.mjs` | default endpoints → `/explorer` (the snapshot carries `network`, `height`, `peerCount` and `producer`, so assertions are unchanged) |
| `packages/jgc-node/src/scripts/testnet-smoke-contributor.ts` | reads tip height from `/explorer` instead of `/status` |

Verified on a real `0.0.0.0` bind: `/healthz` 200, `/explorer` 200 with the
expected fields, `/status` 404. **Docker Compose testnet smoke now passes in
CI** (run 41582619326). Runner docs and `docs/PUBLIC_SEED_DEPLOYMENT.md` were
corrected in the same commit.

**The external Vercel check was root-caused and fixed.** The owner identified
the Hobby plan's 12-Serverless-Function limit. Vercel auto-deploys every source
file in the root `api/` directory as a separate function — including helpers,
`node:test` suites and migration scripts. `main` had 9 such files and just fit;
PR #66 added `cors.mjs` and `cors.test.mjs` → 11 → over the cap, so every
commit in the PR (even docs-only) failed while the equivalent GitHub Actions
website build passed. All Cloudflare Worker source was moved to `worker/` so
Vercel creates **0** root-`api` functions, and
`scripts/vercel-function-budget.mjs --max 0` now guards CI. No HTTP route,
auth rule, CORS behaviour or mainnet gate changed. Full analysis and the
12-route shortlist: [`../VERCEL_FUNCTION_BUDGET.md`](../VERCEL_FUNCTION_BUDGET.md).
Preview confirmation after the fix is recorded in §1c.

## 1c. Vercel preview confirmation

Pending: the fix commit is pushed and the Vercel preview status is checked in
the GitHub PR. This section is updated with the result before handoff.

## 2. New regression coverage

| Suite | What it pins |
| --- | --- |
| `src/tests/status-server-security.test.ts` | No origin reflection, no PNA for unknown origins, PNA only on allowed loopback origins, `/status` hidden on public binds, token gating, method/URL bounds, strict default allowlist. |
| `src/tests/testnet-options.test.ts` (extended) | `wss://` required for public seeds; credentials/query/fragments/duplicates/32-entry cap rejected; local container `ws://` still allowed; separate public API listener and status token parsed. |
| `src/tests/proof-registry.test.ts` | Built-in placeholder registry fails; full-length G1/G2 manifest passes; wrong network, missing review, single-participant ceremony, duplicate circuit IDs and bad IC lengths rejected. |
| `src/tests/mainnet-launch-control.test.ts` | All 12 gate contracts; empty policy/ledger fails closed; a complete independently signed, release-bound evidence set can reach `ready: true` in a synthetic test; tampering, duplicate signers, wrong genesis, expiry, missing artifacts and digest mismatch rejected; canonical signing order-independent. |
| `worker/cors.test.mjs` | No `*.vercel.app` wildcard reflection; exact preview allowlist; malformed entries ignored. |
| `deploy/selfhosted/monitor.test.mjs` | Clean `wss://`→https origin derivation; healthy/supply-conserving seeds accepted; wrong network, broken supply, unhealthy status and fetch errors fail closed; list bounds. |
| `src/tests/transport-bounds.test.ts` (extended) | Global inbound socket cap (64 default, injectable override) rejects excess connections before peer state is allocated; invalid bounds rejected. |

The synthetic `ready: true` case in `mainnet-launch-control.test.ts` uses throwaway Ed25519 keys generated inside the test. No real review key or launch record was created.

## 3. Fail-closed state after the pass

- `MAINNET_READINESS` unchanged: `status: "blocked"`, 2 of 12 gates true, 10 false.
- `launch-policy.json`: `trustedKeys: []`, `threshold: 2`, `minIndependentReviewers: 1`.
- `gate-evidence.json`: `records: []`.
- `proof-registry.json`: placeholder with `keys: []`, `ceremony: null`, `review: null`.
- `mainnet-launch-record.json`: intentionally absent.
- CI: `.github/workflows/infra-guard.yml` asserts the proof registry and launch gate stay blocked; `jgc-node-ci.yml` still asserts the exact ten missing preflight gates; `website-ci.yml` now runs the CORS tests. The scheduled Fly.io token workflow was deleted.

## 4. Hardening delivered (see [full review](NODE_SECURITY_REVIEW.md))

H-01 arbitrary-origin CORS/PNA reflection; H-02 private `/status` on a public bind; H-03 placeholder proving keys enforceable at the gate; H-04 unsigned in-memory readiness override; M-05 `*.vercel.app` CORS wildcard; M-06 unvalidated seed URLs; M-07 active Fly/Google deployment dependencies; M-08 hosted monitor with cloud IAM and model decisions; M-12 unbounded simultaneous inbound WebSockets.

## 5. Residual and open items

1. **Critical protocol work remains:** real reviewed proving keys, end-to-end PQ security, shielded payments, permissionless production, validator economics, funded settlement, governance, reproducible signed artifacts, multi-host soak and independent review. See [`NODE_SECURITY_REVIEW.md`](NODE_SECURITY_REVIEW.md) §3.
2. **`JGCNode` still accepts an in-memory readiness override** for unit-testability; the signed launch control protects the launcher/CI path. A future release should remove or bind that override to a verified envelope.
3. **The release binary must actually load the reviewed proof registry.** Enforced as `reproducibleArtifacts`/`proofSystem` artifacts, not by the preflight alone.
4. **No external review exists.** This report is self-verification. [`EXTERNAL_REVIEW_ONBOARDING.md`](EXTERNAL_REVIEW_ONBOARDING.md), [`OUTREACH_PLAN.md`](OUTREACH_PLAN.md), [`REVIEW_PACK.md`](REVIEW_PACK.md) and the public one-pager exist to make one possible.
5. **Owner decisions recorded:** prepare only (no network started), mixed provider-neutral infrastructure, low-friction public funnel, and a proposed 3–5 week premine that is **not implemented** and must not fund the review that authorizes it ([`PREMINE_FUNDING_DECISION.md`](PREMINE_FUNDING_DECISION.md)).
6. Website/API still use Vercel, Cloudflare Workers and Turso — third parties, but neither Fly.io nor Google Cloud, and outside consensus trust. Provider/secret rotation remains in the recurring checklist. The Vercel Hobby function budget is now guarded in CI (§1b/§1c).
7. **Dependency alerts are open:** a 2026-11-03 push reported 18 alerts on the default branch (7 critical, 6 high, 5 moderate). `npm audit`, alert triage, Docker image build, Wrangler dry-run, live endpoint check and Solidity compilation have not been run in this pass.
8. **Documentation was audited on 2026-11-03** (`DOCUMENTATION_AUDIT.md`): 69 Markdown files, all relative links verified, stale provider/test-count/launch claims corrected or bannered as historical.

## 6. Correct label after this pass

**Hardened, fail-closed, zero-value testnet candidate with a concrete gate-closure mechanism and a public onboarding funnel.** Not a value-bearing mainnet. Do not publish any stronger claim until the twelve gates, the M-of-N signed launch record and an independent security review exist.
