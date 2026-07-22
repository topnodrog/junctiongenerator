# Post-Quantum Readiness Review

**Review date:** 2026-07-22
**Status:** Draft branch blocker list — this code must not be deployed or merged
into a production consensus path yet.

## What is promising

- ML-DSA-65 is a standardized post-quantum signature algorithm (FIPS 204).
- The code separates post-quantum primitives behind a facade.
- Signature, wallet, UTXO, miner, and simulation tests have been started.
- Domain separation and replay protection are explicit design goals.
- Secret-like local files are covered by `.gitignore` and are not part of this
  pull request.

## Merge blockers

### 1. Compute proofs do not prove computation (critical)

`pq-zkp.ts` commits arbitrary hashes to a Merkle tree and verifies selected
Merkle paths. The verifier never checks an execution trace, polynomial
constraints, a circuit relation, or that the claimed output resulted from useful
work. Anyone can create a locally valid proof and claim any TFLOPS value allowed
by the registry. This would permit unearned rewards.

**Required direction:** integrate a reviewed STARK/transparent proof system with
an explicitly specified computation relation and independent cryptographic
review. Do not describe the current Merkle-opening prototype as a ZKP, IOP, FRI,
STARK, or sound proof of computation.

### 2. Stealth spending keys are public (critical)

`pqStealthScanAndRecover()` accepts a view secret key but never uses it. An
observer can call the same function with the recipient's public view key and
derive the one-time private spending key. The current tests use the wrong public
key for the eavesdropper, so they do not exercise this attack.

**Required direction:** remove this construction from the protocol. Select a
published, reviewed post-quantum payment-privacy construction whose recipient
exclusivity and sender non-custody properties match the threat model.

### 3. Inner and outer proof fields are not bound (critical)

The proof JSON inside `proofBytes` has its own circuit, output commitment, and
TFLOPS value. The surrounding consensus `ComputeProof` repeats these fields, but
the adapter does not require them to match. Verification credits the inner
TFLOPS value while epoch accounting and signatures use surrounding fields. A
consensus object must have exactly one canonical meaning.

**Required direction:** define a canonical binary encoding and reject every
mismatch before signature, difficulty, payout, Merkle, or epoch calculations.

## High-priority hardening

- The address currently truncates SHA3-256 to 160 bits. Grover search reduces a
  160-bit preimage target to roughly 80 bits, below the intended post-quantum
  security floor. Keep the full 256-bit commitment or justify a different size
  through a documented security target.
- `@noble/post-quantum` 0.6.1 states that it has not had an independent audit and
  provides no side-channel protection. Treat it as a prototype dependency, not
  a production wallet/validator implementation.
- Add crypto agility: algorithm identifiers, versioned canonical encodings,
  activation heights, downgrade protection, and a migration plan. A global
  `QUANTUM_MODE = true` switch is not sufficient for consensus evolution.
- Validate complete keypairs when importing wallet keys. A valid public key does
  not prove that the supplied private key matches it.
- Replace delimiter-joined signature preimages with typed, length-prefixed,
  canonical binary serialization.
- Add strict proof, transaction, signature, key, JSON-depth, and Merkle-path size
  limits before expensive parsing or cryptographic work.
- Add official known-answer vectors and cross-implementation tests for ML-DSA.
- Add adversarial tests for field mismatches, public stealth-key recovery,
  arbitrary-proof forgery, oversized inputs, malformed hex, and downgrade paths.

## Recommended delivery sequence

1. Land crypto-agility types and canonical encodings without changing consensus.
2. Land independently testable ML-DSA primitives behind an experimental flag.
3. Specify address/key lifecycle, recovery, hardware storage, and migration.
4. Select and integrate a reviewed transparent proof system for useful compute.
5. Select a reviewed post-quantum privacy construction or leave privacy out of
   the first post-quantum release.
6. Run independent protocol and implementation audits before activation.
