# Back-Checker and Useful-Compute Proof Boundary

## Decision
Use heterogeneous machines as independent back-checkers, but separate their authority by what they can objectively establish.

## Roles
- `proof-verifier`: checks a portable cryptographic proof without sharing the miner's CPU/GPU/runtime. Its result is consensus pass/fail.
- `replay-auditor`: repeats inference only when its complete `ExecutionProfile` matches the claim. Its vote is usable only through the compatible replay quorum; incompatibility means abstention.
- `quality-auditor`: evaluates usefulness, policy, and customer acceptance. Its result is advisory and cannot independently slash stake.

Implementation: `packages/jgc-node/src/broker/backcheck.ts`.

## Portable proof routing
`packages/jgc-node/src/crypto/compute-proof.ts` identifies and verifies the proof scheme. Consensus calls this boundary from `consensus/validation.ts`.

- Registered Groth16 proofs use the real Rust/WASM pairing verifier.
- `PQ-HASH-IOP-v1` is a research transport receipt. It checks Merkle consistency but contains no computation constraints, so strict mode rejects it.
- Missing or crashing proof-verifier code fails closed.
- The accept-all JavaScript Groth16 stub is permitted only in explicit simnet and cannot be selected by strict loading.

## Operational modes
- Default/unconfigured processes are strict.
- The local `testnet` launcher explicitly enables simulation receipts and prints a warning.
- `NODE_ENV=production` forbids simulation receipt mode.
- ML-DSA contribution signatures are always verified, including simnet.

## Proven working slice
The `strict-mine-demo` uses real Conv1D Groth16 computation proofs, the Rust/WASM verifier, and ML-DSA miner signatures. On 2026-07-28 it accepted three blocks containing six proofs end to end.

This proves the architecture works for bounded circuits. It does not provide a general or post-quantum proof for arbitrary AI inference.

## Production gate
Do not activate rewards or market the system as general proof of useful compute until an independently audited transparent general-compute proof system is integrated and its proof statement binds:

- network and proof protocol version;
- miner and assigned task identity;
- approved program/circuit/model/tokenizer digests as applicable;
- canonical input and output commitments;
- an integer work metric derived inside the proven program;
- epoch or challenge entropy for replay resistance.

Reference documents: `packages/jgc-node/docs/BACK-CHECKER-ARCHITECTURE.md`, `packages/jgc-node/docs/CONSENSUS-V3.md`, and `packages/jgc-node/docs/QUANTUM-READY.md`.
