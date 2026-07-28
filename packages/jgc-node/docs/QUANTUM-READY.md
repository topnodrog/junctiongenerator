# JGC Quantum-Readiness Status

**Status:** signatures and several hashing paths are quantum-oriented; a sound
post-quantum proof of useful computation is not yet implemented. No public JGC
chain or mainnet is deployed.

## Current security boundary

| Layer | Current implementation | Production status |
|---|---|---|
| Miner and spend signatures | ML-DSA-65 | Implemented; requires independent review |
| Hashing | SHA3-256 on PQ paths | Implemented |
| Useful-compute proof | Groth16 circuits for limited Conv1D/MatVec kernels | Soundness path exists; BN254 is not post-quantum and production keys are not installed |
| `PQ-HASH-IOP-v1` | Merkle receipt over prover-chosen witness values | Simulation only; not a proof of computation |
| General post-quantum compute | Transparent STARK/zkVM or equivalent | Required before production |

## Why the hash/Merkle receipt is simulation-only

`src/crypto/pq-zkp.ts` commits to values supplied by the prover and checks
Fiat–Shamir-selected Merkle openings. It does not contain polynomial or virtual
machine constraints establishing that an inference, training run, or claimed
number of operations occurred. A dishonest prover can construct a structurally
valid receipt without performing useful work.

Consequently:

- strict verification rejects `PQ-HASH-IOP-v1`;
- `simnet` must be selected explicitly and is forbidden when
  `NODE_ENV=production`;
- simulation receipts receive no production consensus or marketing claim of
  computational soundness;
- a missing strict Groth16 verifier fails closed rather than falling back to an
  accept-all JavaScript stub.

## Heterogeneous verification

Different computers do not need to reproduce the miner's native execution to
check a portable cryptographic proof. JGC separates three back-checker roles:

1. `proof-verifier` checks a machine-independent proof and participates in
   consensus validity;
2. `replay-auditor` performs exact replay only when its execution profile
   matches, with decisions made through a quorum;
3. `quality-auditor` checks usefulness and customer policy, but its judgment is
   advisory and cannot independently slash a miner.

See `BACK-CHECKER-ARCHITECTURE.md` and `CONSENSUS-V3.md`.

## Production path

1. Keep the research receipt for transport and simulation tests only.
2. Use the existing real Groth16 Conv1D/MatVec circuits for bounded development
   demonstrations, with registered keys from a controlled setup.
3. Integrate and independently audit a transparent general-compute proof system
   such as a STARK/zkVM.
4. Bind every proof to the assigned task, approved program or circuit digest,
   input commitment, output commitment, work metric, miner identity, network,
   and epoch anti-replay value.
5. Add cross-platform golden vectors and at least two independent verifier
   implementations before activating rewards or slashing.

## Relevant files

| File | Role |
|---|---|
| `src/crypto/compute-proof.ts` | portable proof dispatch and fail-closed routing |
| `src/crypto/zkp.ts` | real Groth16 verifier and limited useful-compute circuits |
| `src/crypto/pq-zkp.ts` | simulation-only hash/Merkle receipt |
| `src/broker/backcheck.ts` | proof, replay, and quality back-checker roles |
| `src/crypto/pq-signatures.ts` | ML-DSA-65 contribution and spend signatures |
