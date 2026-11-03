# Independent review pack — start here

One entry point for anyone reviewing, operating or reproducing JGC. **Status: zero-value testnet candidate. No value-bearing mainnet. No token sale.** This pack is deliberately short: the first task takes about ten minutes.

## The 10-minute first win

Pick one:

```text
# A. Reproduce the release (no node needed)
cd packages/jgc-node
npm ci
npm run typecheck
npm run build
npm run release:check
npm run gates:status
```

Post your OS, Node version, commit, `RELEASE-MANIFEST.json` tree digest and archive digest in the **rebuild challenge** issue template. A mismatch is a finding, not a failure.

```text
# B. Run a local node (zero value, no external network)
cd packages/jgc-node
npm ci
npm run testnet          # loopback only by default
npm run solo-soak -- --blocks 20 --nodes 3
```

```text
# C. Verify the launch guard is honestly blocked
cd packages/jgc-node
npm run mainnet:preflight
npm run proof:registry
npm run mainnet:launch                # must exit non-zero
npm run infra:guard
```

## What exists, in one table

| Topic | Where | What to check |
| --- | --- | --- |
| Gate contract | `src/config/mainnet-launch-control.ts` → `GATE_EVIDENCE_REQUIREMENTS` | Exact artifacts and verification commands for all 12 gates. |
| Current status | [`gate-status.json`](gate-status.json), `npm run gates:status` | Machine-readable "blocked" report; a snapshot, not evidence. |
| Readiness authority | `src/config/mainnet-readiness.ts` | 2 of 12 gates true; 10 false. |
| Security review | [`NODE_SECURITY_REVIEW.md`](NODE_SECURITY_REVIEW.md) | Fixed and open findings by severity and component. |
| Consensus | `src/consensus/*`, `src/protocol/canonical.ts`, [`DETERMINISTIC_CONSENSUS.md`](DETERMINISTIC_CONSENSUS.md) | Exact arithmetic, fork ordering, replay, restart validation. |
| Proofs | `src/crypto/zkp.ts`, `src/crypto/pq-zkp.ts`, `src/crypto/proof-registry.ts`, `rust/src/zkp_verify.rs` | Placeholder keys, simulation receipts, strict verifier boundary. |
| Privacy / PQ | [`SHIELDED_PAYMENTS_V3_DESIGN.md`](SHIELDED_PAYMENTS_V3_DESIGN.md), [`PQ_BACKEND_EVALUATION.md`](PQ_BACKEND_EVALUATION.md) | Open design drafts — not accepted constructions. |
| P2P | `src/network/*`, [`PEER_AUTHENTICATION.md`](PEER_AUTHENTICATION.md) | Handshake, sequences, replay, queue bounds, status/API isolation. |
| Storage | `src/storage/*`, `src/broker/assigned-work.ts` | Fsynced journals, torn-tail recovery, remaining rollback/truncation limits. |
| Release | `scripts/release-manifest.mjs`, `scripts/verify-release-bundle.mjs`, `.github/workflows/jgc-node-release.yml` | Content-addressed inventory, tag-on-main rule, checksums. |
| Deployment | [`packages/jgc-node/deploy/selfhosted/README.md`](../../packages/jgc-node/deploy/selfhosted/README.md) | Three independent seeds, no Fly.io / Google Cloud. |
| Launch control | [`GATE_CLOSURE_PROTOCOL.md`](GATE_CLOSURE_PROTOCOL.md), `src/config/mainnet-launch-control.ts` | Signed evidence, M-of-N policy, fail-closed launcher. |
| Funding decision | [`PREMINE_FUNDING_DECISION.md`](PREMINE_FUNDING_DECISION.md) | Open genesis-allocation question, not implemented. |
| Disclosure | [`SECURITY.md`](../../SECURITY.md) | Safe harbor and reporting channels. |

## Choose a track

| Track | First artifact | Issue template |
| --- | --- | --- |
| Independent seed operator | `inventory.json` entry + 30 days of `monitor.mjs` evidence | Join the independent review program |
| Protocol / crypto reviewer | One reproduced finding, then a version-specific signed report | Join the independent review program |
| Consensus / network / economics reviewer | Adversarial test proposal or finding | Join the independent review program |
| Independent release rebuilder | Two matching digests on a different OS/architecture | Reproducible build challenge |

## What we will NOT ask you to do

- Sign anything before you have reproduced something.
- Declare a network "secure" or "launched".
- Accept payment conditioned on a clean report.
- Trust a hosted model, cloud IAM role, or an owner-only attestation.
- Handle real funds, private keys, or another person's data. Everything here is zero-value.

## What a finding looks like

ID, severity, affected commit, component, reproduction steps, impact, suggested fix. File privately through a GitHub security advisory for exploitable issues ([`SECURITY.md`](../../SECURITY.md)); everything else goes in a public issue and then into `docs/mainnet/FINDINGS_REGISTER.md`. Every high/critical finding pauses the affected gate until it is fixed, re-reviewed and publicly disclosed.

## After you have an artifact

1. Generate an offline Ed25519 key and publish only the public PEM + fingerprint (instructions in [`GATE_CLOSURE_PROTOCOL.md`](GATE_CLOSURE_PROTOCOL.md)).
2. Add it to `deploy/selfhosted/launch-policy.json` via a reviewed PR.
3. Sign your gate evidence record with `npm run sign:envelope`.
4. Re-run `npm run gates:status` and `npm run mainnet:launch`.

The launcher stays blocked until all 12 gates, an M-of-N signed launch record, a reviewed proof registry and an independent security review exist. That is intentional.
