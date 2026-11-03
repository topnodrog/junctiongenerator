# Mainnet launch plan — secure, plan, resecure, launch

**Prepared:** 2026-11-02 (America/Toronto)
**Branch:** `arena/08b59d79-junctiongenerator`
**Authority:** `packages/jgc-node/src/config/mainnet-readiness.ts` is the only source of gate truth. This document does not change it.

## 0. Decision summary

The request was: *secure the project, create a plan to prepare mainnet launch, resecure, launch mainnet, without Fly.io or Google Cloud.*

What is true after this pass:

| Requested step | Delivered | Honest limit |
| --- | --- | --- |
| Secure | Real hardening fixes + regression tests across the node status/API surface, bootstrap URLs, proof registry, Worker CORS and CI. See [`NODE_SECURITY_REVIEW.md`](NODE_SECURITY_REVIEW.md). | Cryptographic protocol gates (privacy, PQ proofs, economics) are **design work**, not patchable in one pass. |
| Plan | This document + [`GATE_CLOSURE_PROTOCOL.md`](GATE_CLOSURE_PROTOCOL.md) + [`EXTERNAL_REVIEW_ONBOARDING.md`](EXTERNAL_REVIEW_ONBOARDING.md). | Dates depend on external reviewers and a trusted-setup ceremony. |
| Unblock remaining gates | A machine-checkable gate ledger, per-gate deliverable/owner/verification contract, signed evidence format, M-of-N launch policy, offline signer and a fail-closed launcher. | No gate was flipped to `true`. Ten remain false and must be earned with evidence. |
| Resecure | New tests, CI guard, release checks, fail-closed preflight and a re-verification report in [`RESECURE_REPORT.md`](RESECURE_REPORT.md). | Independent review is still required before anyone may trust it. |
| Launch mainnet | `npm run mainnet:launch` is the real, fail-closed launch gate. | **No value-bearing mainnet was launched.** Launching one today would be unsafe: 2 of 12 gates pass, no external review exists, and the compiled proof registry contains placeholder keys. |
| No Fly.io / Google Cloud | New provider-neutral deployment kit at [`packages/jgc-node/deploy/selfhosted`](../../packages/jgc-node/deploy/selfhosted/README.md), neutral monitor, neutral release seeds, retired scheduled Fly token workflow, and an infra guard that fails CI on any active cloud-specific dependency. | The old `deploy/google`, `deploy/fly` and `deploy/monitor` directories remain as archived historical material only; no new deployment or workflow uses them. |

## 0.1 Owner decisions recorded 2026-11-02

| Question | Decision | Effect on this plan |
| --- | --- | --- |
| What does "launch" mean for this pass? | **Prepare only.** | No network was started. `npm run mainnet:launch` remains a fail-closed gate, not an activator. Phase 4 is a runbook template, not an execution. |
| Infrastructure? | **Mixed**: owner hardware + independent VPS + community-operated seeds, three distinct failure domains. | `deploy/selfhosted/inventory.example.json` and §5 use exactly that topology; zero Google Cloud / Fly.io anywhere in the active kit. |
| How to get it out there? | **Low-friction public funnel** first. | [`OUTREACH_PLAN.md`](OUTREACH_PLAN.md), [`REVIEW_PACK.md`](REVIEW_PACK.md), a shareable [public one-pager](../public/JGC_INDEPENDENT_REVIEW_PROGRAM.md), GitHub issue templates and a public [gate snapshot](gate-status.json). |
| Funding? | Owner proposed **3–5 weeks of premined issuance** for reviews and future bounties. | **Not implemented.** It conflicts with the zero-premine invariant and the `validatorEconomics` gate, and cannot fund the review that authorizes it. See [`PREMINE_FUNDING_DECISION.md`](PREMINE_FUNDING_DECISION.md) for the amounts, eight required conditions and no-budget fallback. |

**Non-negotiable invariants**

1. No gate is waived, and no readiness boolean is changed without signed, reproducible evidence.
2. A value-bearing launch requires an independent external security review with no unresolved high/critical findings.
3. Owner-run rehearsal is evidence, not decentralization. A permanently owner-only network is a zero-value canary, not a value-bearing decentralized mainnet.
4. If a consensus defect is found before economic activation, abandon the chain ID and create a new genesis. After activation, use a versioned consensus upgrade; never rewrite history.
5. No secret, private key or cloud credential is stored in Git, container images, instance metadata or this plan.

---

## 1. Phase 1 — Secure (completed in this pass)

### 1.1 Fixed findings

| ID | Finding | Fix |
| --- | --- | --- |
| H-01 | Node status server reflected any `Origin` and emitted Private-Network-Access headers for it, letting an unrelated web page read a local node's private status. | Exact origin allowlist; PNA only for allowlisted origins on a loopback bind; `403` for unrecognized origins. `src/network/status-server.ts`, `src/tests/status-server-security.test.ts`. |
| H-02 | Binding the status server to `0.0.0.0` (as the old seed deployments did) exposed `/status`, balances and producer diagnostics on the same port as the public explorer. | Private routes now return `404` on a non-loopback bind. Separate `JGC_PUBLIC_API_PORT` listener serves only `/healthz`, `/explorer`, `/balance`. Optional bearer token for explicitly exposed private status. |
| H-03 | Strict Groth16 verification had a mutable `CIRCUIT_REGISTRY` full of short placeholder points, with no release gate. | `src/crypto/proof-registry.ts` defines a full-length, ceremony-bound, externally reviewed registry manifest; `npm run proof:registry -- --check` fails while placeholders remain; the launcher refuses to start without a reviewed manifest. |
| H-04 | A caller could pass an unsigned in-memory `mainnetReadiness` object to `JGCNode` and satisfy the guard. | `src/config/mainnet-launch-control.ts` requires an M-of-N Ed25519-signed, expiring, release-specific launch record bound to the evidence ledger, proof registry, artifact digest, compiled chain identity and genesis. |
| M-05 | Worker API trusted any `https://*.vercel.app` origin. | Exact allowlist in `api/cors.mjs`; preview origins are opt-in via `ALLOWED_PREVIEW_ORIGINS`. |
| M-06 | Public bootstrap seeds could be cleartext `ws://`, contain credentials, queries or duplicates. | `validatePeerUrl` in `src/config/testnet-options.ts`; `wss://` required for public hosts; 32-seed bound. |
| M-07 | A scheduled workflow used a Fly.io organization token; release bundles and runner scripts hard-coded `*.fly.dev`. | Scheduled workflow removed; neutral `infra-guard.yml`, `sign:envelope`, `gates:status`, `mainnet:launch`; provider-neutral `JGC_RELEASE_SEEDS`, `-Seeds`, `JGC_SEEDS`. |
| M-08 | Hosted soak monitor depended on Cloud Scheduler, GCS and Gemini and could pause itself with a cloud IAM token. | `deploy/selfhosted/monitor.mjs` polls only narrow public endpoints, uses no cloud API and no model decisions, writes local JSON evidence. |
| M-12 | No global bound on simultaneous inbound WebSockets; per-peer limits alone did not stop an idle-socket flood. | `MAX_INBOUND_SOCKETS = 64` checked before peer allocation in `src/network/transport.ts`, with a regression test. |

### 1.2 Deliberately not fixed here (protocol work)

- Zcash-like shielded payments with recipient-exclusive spending and separate viewing keys.
- End-to-end post-quantum proofs, full-length address commitments, PQ transport confidentiality and upgrade keys.
- Permissionless proposer enforcement, consensus-owned validator bonds/slashing, funded exactly-once settlement, governance authority limits.
- Reproducible signed release binaries/containers, SBOM and genesis manifest.
- Multi-host real-cadence soak and independent operation.

These are the remaining gates, not configuration toggles. Flipping a boolean would be a false launch.

---

## 2. Phase 2 — Prepare: how every gate gets unblocked

The authoritative, machine-readable contract is `GATE_EVIDENCE_REQUIREMENTS` in `src/config/mainnet-launch-control.ts`. `npm run gates:status` prints it with the current evidence state, owner, deliverable, required artifacts and verification commands.

| Gate | Concrete finish line | Who can close it |
| --- | --- | --- |
| `proofSystem` | Trusted-setup ceremony → full-length BN254 (or reviewed PQ-proof) registry manifest → transcript digest → 2+ external crypto reviewers → `npm run proof:registry -- --check` passes → release bundle loads the manifest, not `CIRCUIT_REGISTRY`. | Crypto lead + independent ZK reviewers |
| `postQuantumSecurity` | PQ proof backend admitted by consensus (not `strict-groth16-v1`), full-length commitments, PQ transport/backup/upgrade keys, versioned migration, adversarial tests, version-specific external review. | Crypto lead + PQ reviewers |
| `paymentPrivacy` | Implement [`SHIELDED_PAYMENTS_V3_DESIGN.md`](SHIELDED_PAYMENTS_V3_DESIGN.md): encrypted notes, commitments, nullifiers, confidential value conservation, incoming/full viewing separation, wallet scan/recovery/reorg, adversarial theft/inflation tests, external review. | Protocol/wallet leads + privacy reviewers |
| `usefulServices` | Authenticated remote enrollment/dispatch, per-user admission limits, confidential transport, real buyer funding, consensus ledger settlement, storage availability challenges, crash/reorg accounting. | Broker + consensus leads |
| `governance` | Explicit authority limits, accountable versioned proposals, budget controls, tested emergency recovery; model output cannot authorize consensus. | Protocol lead + governance reviewer |
| `deterministicConsensus` | Already `true`; keep pinned cross-platform vectors, restart validation and canonical fork ordering. Re-attest after any consensus change. | Consensus lead |
| `permissionlessProduction` | Bind proposer identity into the block header, enforce the deterministic schedule in validation and fork choice, retire the designated producer, define activation height, adversarial proposer tests. | Consensus lead + reviewer |
| `peerAuthentication` | Already `true`; keep mutual handshake, sequence/replay, queue-bound and WebSocket exchange tests. | Networking lead |
| `validatorEconomics` | Consensus-owned bond ledger, issuance/fees/rewards/slashing specification, activation heights, adversarial bond/reward tests. | Economics + consensus leads + reviewer |
| `reproducibleArtifacts` | Two independent clean rebuilds with identical digests, signed binaries/containers, SBOM, pinned genesis manifest. | Release engineer + independent rebuilders |
| `soloSoak` | Owner-controlled multi-host accelerated plus real-cadence rehearsals (restart, seed loss, reorg, 72h+ and three settlement cycles) with immutable evidence; then independent operators. | Operations lead + independent operators |
| `independentSecurityReview` | Signed external reports across consensus, crypto, network and economics; findings register; remediation; re-review; public disclosure record. | Independent reviewers only |

### 2.1 The unblocking mechanism (new)

1. **Contract:** every gate has a fixed artifact set and verification command list. No prose-only evidence.
2. **Signing:** reviewers generate an offline Ed25519 key, publish only the public key + fingerprint in `deploy/selfhosted/launch-policy.json`, and sign evidence payloads with `npm run sign:envelope -- --payload ... --key ... --key-id ... --out ...`.
3. **Ledger:** `deploy/selfhosted/gate-evidence.json` holds one signed envelope per gate, bound to a 40-character release commit, with artifact SHA-256 digests and CI run IDs.
4. **Launch record:** `deploy/selfhosted/mainnet-launch-record.json` (intentionally absent today) is signed by at least `threshold` distinct keys including an independent reviewer, expires, and commits to the ledger digest, reviewed proof registry digest, artifact digest, chain identity, genesis and readiness record.
5. **Verification:** `npm run mainnet:launch` calls `evaluateLaunchRequest()` → `assertMainnetLaunchAllowed()`. It never starts a node. CI asserts it stays blocked until all evidence exists.
6. **No waivers:** an empty `trustedKeys` policy, empty ledger, missing registry and missing launch record all fail closed. A single compromised key cannot launch; a single reviewer cannot close a crypto gate.

See [`GATE_CLOSURE_PROTOCOL.md`](GATE_CLOSURE_PROTOCOL.md) for exact JSON schemas and commands.

### 2.2 People: how external review becomes possible

[`EXTERNAL_REVIEW_ONBOARDING.md`](EXTERNAL_REVIEW_ONBOARDING.md) defines four onboarding tracks, identity verification, conflict-of-interest rules and a findings register. [`OUTREACH_PLAN.md`](OUTREACH_PLAN.md) is the low-friction funnel that actually recruits them: 10-minute reproducible-build challenge → verified environment → one finding or one seed → signed evidence. [`REVIEW_PACK.md`](REVIEW_PACK.md) is the single entry point, the [public one-pager](../public/JGC_INDEPENDENT_REVIEW_PROGRAM.md) is the shareable copy, and the two GitHub issue forms are the self-serve application path. Without that program, `independentSecurityReview`, `soloSoak` (independent half) and `permissionlessProduction` cannot be closed at all.

Funding is a separate, open decision. The proposed premine is documented in [`PREMINE_FUNDING_DECISION.md`](PREMINE_FUNDING_DECISION.md); the funnel uses the no-budget fallback until separate funds or a reviewed governance proposal exist.

---

## 3. Phase 3 — Resecure

Run after **every** protocol or deployment change, and again immediately before any activation:

```text
cd packages/jgc-node
npm ci
npm run typecheck
npm test -- --ci
npm run build
npm run release:check
npm run gates:status
npm run proof:registry -- --assert-blocked
npm run mainnet:launch -- --assert-blocked
npm run infra:guard
npm run monitor:test
```

Website/Worker checks from the repository root:

```text
node --test api/public-write.test.mjs api/legacy-rewards.test.mjs \
  api/rate-limit.test.mjs api/cors.test.mjs scripts/deploy/deployment-safety.test.cjs
yarn lint && yarn build
```

Then repeat the security review in [`NODE_SECURITY_REVIEW.md`](NODE_SECURITY_REVIEW.md) against the new diff, re-run the supported-platform CI matrix, re-verify release artifact digests from a second machine, and commission an external re-review of any consensus, cryptography or economics change. Record the results in [`RESECURE_REPORT.md`](RESECURE_REPORT.md). **Resecure is not a one-time checkbox; it is the release gate itself.**

---

## 4. Phase 4 — Launch

### 4.1 Distinguish the two possible "launches"

| | Zero-value canary / mainnet candidate | Value-bearing mainnet |
| --- | --- | --- |
| Chain ID | Distinct, clearly labeled; never `jgc-mainnet-v3` | `jgc-mainnet-v3` after a new reviewed genesis |
| Value | No spendable value, no market, no rewards | Real issuance, fees, bonds, rewards, slashing |
| Gates | Can run with simnet receipts behind a distinct identity | All 12 gates, signed evidence, M-of-N record, external review |
| Claim | "candidate / rehearsal" only | "mainnet" only after sign-off |
| Allowed now | Yes, as a local/provider-neutral rehearsal | **No** |

A permanently owner-only network is a canary. Calling it a decentralized value-bearing mainnet would be a false claim.

### 4.2 Go/no-go checklist (all must be YES)

- [ ] `npm run gates:status` reports all 12 gates evidence-satisfied for one release commit.
- [ ] `npm run proof:registry -- --check` passes against a ceremony-produced, externally reviewed manifest loaded by the release binary.
- [ ] `deploy/selfhosted/launch-policy.json` contains at least three distinct trusted keys from at least two organizations, with an independent reviewer key and `threshold >= 2`.
- [ ] Signed launch record exists, is unexpired, and matches the compiled chain identity, genesis, artifact digest, ledger digest and proof registry digest.
- [ ] `independentSecurityReview` evidence includes signed reports with no unresolved high/critical findings and a public disclosure record.
- [ ] At least three independently operated seeds in distinct failure domains are running the reviewed release, with verified TLS, backups, restore drills and monitor evidence.
- [ ] Reproducible rebuilds from two independent machines match byte-for-byte; SBOM and genesis manifest are published and signed.
- [ ] Emergency pause, rollback, incident contact and disclosure procedure are published and rehearsed.
- [ ] The owner signs the explicit activation runbook; `npm run mainnet:launch` reports `ready: true`.

### 4.3 Launch-day runbook (template — not executed)

1. Freeze the release commit; publish signed artifacts, checksums, SBOM, genesis manifest and the evidence ledger.
2. Verify all artifacts from an independent machine; record digests.
3. Confirm each independent operator has the same genesis hash, chain ID, consensus version and proof mode.
4. Start non-producing back-checkers first; confirm peer authentication, height agreement and supply conservation.
5. Start the permissionless proposer set; observe at least three settlement cycles with conserved supply.
6. Only then enable economic activation at the signed `earliestActivationHeight`.
7. Publish the activation transaction/height, the signed launch record and the reviewer reports.
8. Keep the pre-activation canary chain and archives; never silently replace genesis.

### 4.4 Rollback and incident response

- Before economic activation: abandon the chain ID, create a new reviewed genesis, and preserve evidence. No history rewrite.
- After activation: versioned consensus upgrade only, with signed governance proposal, explicit height and a tested recovery path.
- Critical vulnerability: activate the published emergency pause, disclose per `SECURITY.md`, publish a findings-register entry, re-review, then re-run Phase 3 before any restart.
- Never restore a snapshot without verifying its chain ID, genesis hash, reset marker and backup checksum.

---

## 5. Infrastructure without Fly.io or Google Cloud

### 5.1 Target topology

| Seed | Operator | Failure domain | Provider | Public surface |
| --- | --- | --- | --- | --- |
| A | Owner home lab (Canada) | Residential power/ISP | Owner-owned hardware | `wss://seed-a.junctiongenerator.net` via Caddy |
| B | Independent operator 1 | EU datacenter | Independent VPS (e.g. Hetzner) | `wss://seed-b.<their domain>` |
| C | Independent operator 2 | NA datacenter | Independent VPS (e.g. OVH / Vultr) | `wss://seed-c.<their domain>` |

- Each operator owns their DNS zone, ACME certificate, host, data volume and backups.
- Only TCP 80 (ACME) and 443 (WSS + narrow read API) are public. P2P `19444`, private status `7777` and public API `7778` stay on host loopback.
- Caddy routes `/healthz`, `/explorer`, `/balance` and the P2P WebSocket; `/status` is explicitly `404`.
- Monitoring is `monitor.mjs` from an independent machine via cron/systemd, writing local JSON. No cloud scheduler, object store, IAM role, metadata endpoint or hosted model.
- Backups are local tar archives with SHA-256 checksums, stored off-host, with a tested restore. Cost control is a fixed host count in `inventory.json` plus provider billing alerts — no organization-wide API token.
- See [`packages/jgc-node/deploy/selfhosted/README.md`](../../packages/jgc-node/deploy/selfhosted/README.md) for installation, verification, backup and teardown.

### 5.2 Migration from the legacy two-provider pilot

1. Publish the provider-neutral `JGC_SEEDS` list and a deprecation notice for the old `*.fly.dev` hostname.
2. Bring up seed B and C independently; verify TLS, genesis, peer authentication and supply conservation.
3. Move the DNS `A` record for `seed-a.junctiongenerator.net` to the owner-controlled host; keep the old host online only until all peers have the new list.
4. Verify from an external runner that joining with only the new seeds works.
5. Archive the old volumes and snapshots, delete the old app/VM/addresses/disks, and confirm no recurring charges.
6. Record the migration in the gate evidence ledger (`soloSoak`, `reproducibleArtifacts`).

The retired scheduled Fly cost-guard workflow is gone. `deploy/google`, `deploy/fly` and `deploy/monitor` are archived research material; `npm run infra:guard` fails if their CLIs, hostnames or credentials reappear in the active kit.

### 5.3 What the website/API still uses

The public website, Worker API and Turso database remain on Vercel, Cloudflare Workers and Turso. None is Fly.io or Google Cloud. They are **not** part of the JGC consensus trust boundary, but provider risk, secret rotation and CSP/Turnstile checks remain in the Phase 3 checklist. A future self-hosted frontend/API migration is optional and must not delay node security work.

---

## 6. Milestones (dependency-ordered, not date-guessed)

| Milestone | Exit criterion | Depends on |
| --- | --- | --- |
| M0 Security baseline (done) | Hardening tests pass; infra guard green; launch still blocked | — |
| M1 Reviewer onboarding | 3+ independent operators, 2+ crypto reviewers, 2+ rebuilders enrolled; keys in policy | M0 |
| M2 Proof + privacy/PQ design review | Version-specific external crypto review, no high/critical findings | M1 |
| M3 Protocol implementation | Shielded payments, PQ proofs, permissionless proposer, economics, governance, funded settlement | M2 |
| M4 Reproducible release | Two independent matching rebuilds, SBOM, signed artifacts, genesis manifest | M3 |
| M5 Multi-host soak | Owner + independent seeds, restart/seed-loss/reorg/real-cadence evidence | M4 |
| M6 Independent security review | Signed reports, findings closed, re-review, disclosure record | M3–M5 |
| M7 Signed launch record | All 12 gates evidence-satisfied, threshold signatures, unexpired record | M6 |
| M8 Activation | Published runbook executed, activation height observed, monitoring live | M7 |

Until M7, `npm run mainnet:launch` must exit non-zero. Until M8, no value-bearing JGC mainnet exists.
