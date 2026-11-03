# JGC mainnet readiness

Status: **blocked**. `jgc-node` contains a declared mainnet identity, but it
does not yet contain a launchable value-bearing mainnet.

Two engineering gates are satisfied: peer authentication and deterministic
consensus. The other ten, including payment privacy and end-to-end quantum
security, remain incomplete and block launch.

**2026-11-02 security and launch-control pass:** the node, Worker API and
deployment surface were hardened (see [full node security review](NODE_SECURITY_REVIEW.md)
and [re-verification report](RESECURE_REPORT.md)); a provider-neutral deployment
kit replaced the Google Cloud/Fly.io seed plan; and a signed, machine-checkable
gate closure mechanism was added. No gate was flipped and **no value-bearing
mainnet was launched** — the owner chose *prepare only* for this pass.

Start with [the launch plan](LAUNCH_PLAN.md),
[the gate closure protocol](GATE_CLOSURE_PROTOCOL.md) and
[the external-review onboarding plan](EXTERNAL_REVIEW_ONBOARDING.md).

Also see: [outreach funnel](OUTREACH_PLAN.md), [review pack](REVIEW_PACK.md),
[public one-pager](../public/JGC_INDEPENDENT_REVIEW_PROGRAM.md),
[machine-readable gate snapshot](gate-status.json),
[premine funding decision](PREMINE_FUNDING_DECISION.md) and the
[provider-neutral deployment kit](../../packages/jgc-node/deploy/selfhosted/README.md).

See the [full node security review](NODE_SECURITY_REVIEW.md) for the current
audit, including the owner's mandatory Zcash-like privacy and quantum
requirements. [Findings and prioritized todo](FINDINGS_AND_TODO.md) is a dated
2026-09-13 snapshot retained for background. See
[peer authentication evidence](PEER_AUTHENTICATION.md) for the candidate
connection protocol and its acceptance checks.
Candidate arithmetic, fork ordering and replay are tracked in the
[deterministic-consensus acceptance record](DETERMINISTIC_CONSENSUS.md).

The release guard is intentionally fail-closed. Run this from
`packages/jgc-node`:

```text
npm run mainnet:preflight
```

The command builds the node, prints a machine-readable JSON result, and exits
non-zero until every required gate is complete. A non-zero result is expected
for the current repository.

Additional fail-closed checks (all from `packages/jgc-node`):

```text
npm run gates:status                  # per-gate owners, deliverables, evidence state
npm run proof:registry                # placeholder proving-key report
npm run mainnet:launch                # signed M-of-N launch record + evidence verification
npm run infra:guard                   # active kit has no Fly.io / Google Cloud dependency
```

`npm run mainnet:launch` is a launch **gate**, not an activator. It never starts
a node. With zero trusted keys, an empty evidence ledger, a placeholder proof
registry and no signed launch record, it always fails closed. CI asserts this
in `.github/workflows/infra-guard.yml`.

## Required gates

The readiness record is defined in
`packages/jgc-node/src/config/mainnet-readiness.ts` and must match the compiled
chain identity exactly.

| Gate | Meaning |
| --- | --- |
| `proofSystem` | Mainnet accepts only sound, registered proofs; simulation receipts and placeholder keys are impossible. |
| `postQuantumSecurity` | Reviewed end-to-end post-quantum security, including proofs, address commitments, transport, and upgrade keys. ML-DSA alone is insufficient. |
| `paymentPrivacy` | Reviewed recipient-exclusive spending, viewing-key separation, encrypted notes and shielded value conservation; wallet and consensus integration pass adversarial tests. |
| `usefulServices` | Compute, inference and storage have assigned work, verifiable completion/availability, replay prevention and funded, exactly-once settlement. |
| `governance` | The central intelligence has explicit authority limits, accountable proposals, versioned upgrades, budget controls and tested recovery. |
| `deterministicConsensus` | Consensus arithmetic, encoding, replay, and fork choice are deterministic across supported builds. |
| `permissionlessProduction` | Block production does not depend on one designated operator. |
| `peerAuthentication` | P2P identities, sessions, messages, and replay protection are authenticated and bounded. |
| `validatorEconomics` | Issuance, fees, bonds, audits, rewards, slashing, and activation heights are specified and tested. |
| `reproducibleArtifacts` | Clean rebuilds produce matching, signed binaries, containers, SBOMs, and genesis manifests. |
| `soloSoak` | The owner-controlled multi-host accelerated and real-cadence rehearsals pass with immutable evidence. |
| `independentSecurityReview` | A value-bearing launch has an external security review with no unresolved high or critical findings. |

## Current known blockers

- The Groth16 registry still contains placeholder verification keys.
- The testnet proof path uses simulation receipts that are not proofs of useful
  computation.
- The production loop is a testnet-only designated producer.
- Peer authentication passes its engineering gate: candidate authenticated mode
  requires a fresh challenge handshake and connection-bound signed sequences.
  Proposer identity is still not bound into the block header; that remains a
  permissionless-production blocker. The unsigned pilot keeps its existing mode.
- There is no mainnet node launcher or mainnet release bundle.
- The isolated `@jg/codegen` package now emits deterministic bounded artifacts,
  but it intentionally does not run a pinned Solidity compiler or deployer.
- The deterministic proposer schedule is a reusable consensus primitive; it is
  not yet enforced by block validation or fork choice.

These are release blockers, not documentation-only tasks.

The 2026-09-11 product requirements are tracked in
[the completion plan](../JGC_COMPLETION_PLAN.md). The four added product gates
are mandatory; old readiness records omitting them are rejected. None is
satisfied by the repaired experimental stealth primitive or the testnet soak.

## Solo preparation policy

Luna may perform all implementation, testing, packaging, deployment, and
monitoring using owner-controlled machines and services. Running multiple nodes
does not constitute independent decentralization evidence. If no independent
security review or outside participation will ever be allowed, the terminal
safe state is a zero-value canary or mainnet candidate; do not label it a
value-bearing decentralized mainnet.

For owner-only rehearsal, run `npm run solo-soak -- --blocks 100000 --nodes 5`
from `packages/jgc-node`. The command uses simnet receipts and writes local JSON
evidence; see [`packages/jgc-node/docs/SOLO-SOAK.md`](../../packages/jgc-node/docs/SOLO-SOAK.md).

For an owner-only release-candidate rehearsal, run `npm run release:check` from
`packages/jgc-node` after installing the locked dependencies. It runs the full
consensus test suite, rebuilds the node, verifies the release bundle and its
metadata, and confirms the mainnet preflight remains blocked. This is useful
local evidence, but it does not satisfy the independent-review, production
proof, or validator-economics gates by itself.

## Launch rule

Any future mainnet launcher must call
`assertMainnetLaunchAllowed()` after loading the signed, release-specific
readiness record. It must refuse to start on malformed records, mismatched
chain identity, missing gates, simulation proof modes, or non-`ready` status.

If a consensus defect is found before economic activation, abandon the chain ID
and create a new genesis. After activation, fixes must use an explicit,
versioned consensus upgrade; never rewrite history or silently replace genesis.

## Privacy and quantum design continuation

See the [V3 shielded-payment requirements draft](SHIELDED_PAYMENTS_V3_DESIGN.md)
for the bounded gap audit, authority separation, transaction relation,
parameter/review blockers and versioned migration requirements. No backend is
selected and no privacy or quantum gate is completed by this draft.

## Documentation status (2026-11-03 audit)

All 69 Markdown files in the repository were reviewed; see the
[documentation audit](DOCUMENTATION_AUDIT.md) for the full findings and fixes.

**Authoritative now:** this file, `LAUNCH_PLAN.md`, `GATE_CLOSURE_PROTOCOL.md`,
`NODE_SECURITY_REVIEW.md`, `RESECURE_REPORT.md`, `REVIEW_PACK.md`,
`EXTERNAL_REVIEW_ONBOARDING.md`, `OUTREACH_PLAN.md`,
`PREMINE_FUNDING_DECISION.md`, `DOCUMENTATION_AUDIT.md`, `gate-status.json`,
`../public/JGC_INDEPENDENT_REVIEW_PROGRAM.md`, `../VERCEL_FUNCTION_BUDGET.md`,
root `README.md`, `SECURITY.md`, `../../worker/DEPLOY.md`,
`../../packages/jgc-node/README.md`, `../../packages/jgc-node/docs/RUN-A-NODE.md`
and `../../packages/jgc-node/deploy/selfhosted/README.md`.

**Historical / dated (banner added, preserved for evidence):** `FINDINGS_AND_TODO.md`,
`REMAINING_GATES_HANDOFF.md`, `NEXT_CONVERSATION.md`, `ASSIGNED_WORK.md`,
`WALLET_AND_PARTICIPATION.md`, `../NEXT_STEPS_PLAN.md`,
`../PILOT_OPERATIONS_TESTING.md`, `../PUBLIC_SEED_DEPLOYMENT.md`,
`../ROADMAP.md`, `../SECURITY_BASELINE.md`, `../concept-paper.md`,
`../public/JGC_OnePager.md` and the other 2026-09 public drafts, plus the
archived `../../packages/jgc-node/deploy/README.md` and `deploy/monitor/README.md`.

**Unchanged technical references:** protocol/design docs under this directory
and `../../packages/jgc-node/docs/` remain valid design records, but none
constitutes launch clearance. `../../AGENTS.md` and `../../CLAUDE.md` remain
the operative agent instructions.
