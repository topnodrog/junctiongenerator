# Consensus Invariants

- Never use measured processor speed, elapsed time, benchmark output, or local scheduling as proof of consensus work.
- Only canonical, versioned byte encodings may be hashed or signed.
- Consensus arithmetic uses integers with explicit units and bounds; no floating point.
- Consensus ordering uses explicit bytewise comparators; never locale-aware ordering.
- Randomness must be cryptographically derived from committed chain data or explicitly included in the signed/hashed object.
- Wall-clock time may enforce bounded future drift, while median-past-time controls chain-relative ordering.
- Model inference replay is not portable unless the complete execution specification is pinned and proven deterministic.
- Every consensus change requires golden vectors, replay tests, reorganization tests, and cross-runtime compatibility checks.
- Telemetry fields such as elapsed milliseconds and estimated TFLOPS must remain outside consensus hashes and payouts unless converted into independently verifiable integer claims.

## Enforced by V3
- A replay-profile mismatch is an abstention, never evidence of fraud.
- Slashable inference claims require a complete execution profile.
- Consensus ordering is raw UTF-8 byte ordering.
- Epoch hashes use domain-separated binary serialization.
- Compute weights must be non-negative safe integers and hash as uint64.
- V3 hashes are intentionally incompatible with V2 development-chain data.
- A Merkle commitment to prover-chosen values is not proof that useful computation occurred.
- `PQ-HASH-IOP-v1` is simnet-only and strict consensus rejects it.
- Portable proof failures are consensus failures; replay decisions require a compatible quorum; quality decisions are advisory.
- Missing strict verifier code must fail closed and must never select an accept-all fallback.
- Simnet proof relaxation must never disable ML-DSA contribution-signature validation.
- A proof verifier may run on any architecture; exact replay requires a matching `ExecutionProfile`.
- Proof failure is objective consensus evidence, replay disagreement requires quorum convergence, and quality rejection is never independently slashable.
- Local testnet receipts must be labeled simulation-only and must not be described as proof that useful compute occurred.
- Public-network peers must agree on chain ID, genesis hash, consensus version,
  and proof mode before any chain data is processed.
- Genesis header roots must always be recomputed from the canonical genesis body;
  any genesis body or timestamp change creates a new, explicitly golden identity.
- A small testnet has one explicitly enabled designated producer; validators and
  heterogeneous back-checkers must not silently become producers.
- The deterministic faucet key and allocation are testnet-only and valueless;
  neither may be carried into a valuable network definition.
