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
- P2P message construction still uses zero-filled envelope signatures.
- There is no mainnet node launcher or mainnet release bundle.
- The code generator is currently a browser-side template demonstration; it is
  not a compiler, auditor, or deployment service.

These are release blockers, not documentation-only tasks.

## Solo preparation policy

Luna may perform all implementation, testing, packaging, deployment, and
monitoring using owner-controlled machines and services. Running multiple nodes
does not constitute independent decentralization evidence. If no independent
security review or outside participation will ever be allowed, the terminal
safe state is a zero-value canary or mainnet candidate; do not label it a
value-bearing decentralized mainnet.

## Launch rule

Any future mainnet launcher must call
`assertMainnetLaunchAllowed()` after loading the signed, release-specific
readiness record. It must refuse to start on malformed records, mismatched
chain identity, missing gates, simulation proof modes, or non-`ready` status.

If a consensus defect is found before economic activation, abandon the chain ID
and create a new genesis. After activation, fixes must use an explicit,
versioned consensus upgrade; never rewrite history or silently replace genesis.
