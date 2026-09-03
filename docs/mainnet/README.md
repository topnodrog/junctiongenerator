# JGC mainnet readiness

Status: **blocked**. `jgc-node` contains a declared mainnet identity, but it
does not yet contain a launchable value-bearing mainnet.

The release guard is intentionally fail-closed. Run this from
`packages/jgc-node`:

```text
npm run mainnet:preflight
```

The command builds the node, prints a machine-readable JSON result, and exits
non-zero until every required gate is complete. A non-zero result is expected
for the current repository.

## Required gates

The readiness record is defined in
`packages/jgc-node/src/config/mainnet-readiness.ts` and must match the compiled
chain identity exactly.

| Gate | Meaning |
| --- | --- |
| `proofSystem` | Mainnet accepts only sound, registered proofs; simulation receipts and placeholder keys are impossible. |
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
- ML-DSA message authentication is implemented, but proposer identity is not
  yet bound into the block header and the authenticated mode is not the default
  testnet mode.
- There is no mainnet node launcher or mainnet release bundle.
- The isolated `@jg/codegen` package now emits deterministic bounded artifacts,
  but it intentionally does not run a pinned Solidity compiler or deployer.
- The deterministic proposer schedule is a reusable consensus primitive; it is
  not yet enforced by block validation or fork choice.

These are release blockers, not documentation-only tasks.

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

## Launch rule

Any future mainnet launcher must call
`assertMainnetLaunchAllowed()` after loading the signed, release-specific
readiness record. It must refuse to start on malformed records, mismatched
chain identity, missing gates, simulation proof modes, or non-`ready` status.

If a consensus defect is found before economic activation, abandon the chain ID
and create a new genesis. After activation, fixes must use an explicit,
versioned consensus upgrade; never rewrite history or silently replace genesis.
