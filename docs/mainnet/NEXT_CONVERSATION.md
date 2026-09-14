# Mainnet continuation handoff

Updated 2026-09-13 after PQ verifier hardening. Start with AGENTS.md and
[REMAINING_GATES_HANDOFF.md](REMAINING_GATES_HANDOFF.md). That document contains
all ten remaining gates, acceptance criteria, implementation entry points,
recommended sequencing, verification commands and workspace hygiene.

## Current delivery

PR #53: https://github.com/topnodrog/junctiongenerator/pull/53
Implementation pushed: 56c2d717f3b92a3c022411642d10c04b3a9370ea.
Recheck current branch, PR merge state and CI; this is a snapshot.

The privacy/quantum work now includes a versioned requirements draft, claim
audit, pinned Triton VM 8.0.0 balance-proof experiment, bounded offline envelope,
saved proof, process deadline/isolation tests, verifier-only measurements and
dependency/advisory evidence. Local tests and release checks passed. See
[PQ_BACKEND_EVALUATION.md](PQ_BACKEND_EVALUATION.md) and
[SHIELDED_PAYMENTS_V3_DESIGN.md](SHIELDED_PAYMENTS_V3_DESIGN.md).

## Hard boundaries and next step

No launch gate was cleared. Only peerAuthentication and deterministicConsensus
remain satisfied. The mainnet candidate still declares strict-groth16-v1; the
research receipts remain simulation-only. The balance proof has no ownership,
notes, nullifiers or encryption and cannot authorize payments or rewards.

Next: obtain version-specific quantum/ZK evidence, resolve dependency distribution
requirements and review the concrete payment construction before implementation.
The available Triton audit targets 0.42.1, not 8.0.0. Locked twenty-first and
bfieldcodec_derive declare GPL-2.0; the top-level Triton license is insufficient
to resolve distribution. A zero-known-advisory scan is not cryptographic review.

While review is pending, the full handoff identifies useful-services settlement,
reproducible artifacts and candidate-only proposer/economics work that can
advance without pretending the privacy or quantum gates are complete.

Preserve unrelated untracked files and the published pilot. Finish scoped work
with verification, a commit/push and a PR. Do not infer authorization to merge
PR #53, waive gates or activate a valuable network.
