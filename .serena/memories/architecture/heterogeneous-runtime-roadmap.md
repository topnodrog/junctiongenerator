# Heterogeneous Runtime and Consensus Roadmap

## Core rule
Consensus results must depend only on canonical bytes and bounded integer arithmetic. Processor speed, wall-clock execution time, CPU/GPU architecture, operating system, locale, JavaScript engine, inference runtime, thread scheduling, and floating-point implementation must never change a block, proof, payout, ordering, or commitment result.

## Concrete risks found
1. `broker/verification.ts` verifies AI work by replaying inference and requiring an exact output commitment. Temperature 0 plus a fixed seed is insufficient across different models, model-file revisions, quantization, inference engines, CPU/GPU kernels, and floating-point implementations.
2. Consensus-related code uses `localeCompare` for canonical ordering. Locale/ICU behavior can vary by runtime. Replace consensus-path ordering with an explicit bytewise ASCII/hex comparator.
3. Epoch consensus state stores TFLOPS weights as JavaScript `number`, hashes them through JSON, and later converts them to `BigInt`. Require non-negative safe integers and preferably use fixed-scale integer/BigInt values end to end.
4. Consensus roots use `JSON.stringify`. JavaScript property order is predictable for these objects, but cross-language nodes and numeric serialization make this a fragile protocol format. Define versioned canonical binary encodings for all hashed consensus structures.
5. Local wall clock is used for future-block checks. Allow bounded skew, use median-past-time for chain ordering, and test nodes with intentionally offset clocks.

## Recommended phases
### Phase 1: Define invariants
- Specify canonical encodings, byte order, integer widths, maximum values, sorting rules, timestamp rules, and protocol version negotiation.
- Classify every field as consensus-critical, network-policy-only, telemetry-only, or display-only.

### Phase 2: Remove environmental ambiguity
- Replace locale-aware sorts in consensus paths.
- Replace consensus floating-point quantities with fixed-scale integers.
- Replace JSON hashing with explicit versioned byte serialization.
- Validate all decoded integers for range and safe representation.

### Phase 3: Make useful-compute verification portable
- Bind claims to exact model hash, tokenizer hash, runtime/proof-system version, quantization, sampling parameters, and input bytes.
- Do not assume native inference is bit-identical across hardware.
- Prefer cryptographic compute proofs, deterministic integer kernels, or a protocol-defined tolerance/quorum scheme over raw output replay.

### Phase 4: Heterogeneous test matrix
- Run the same golden vectors on Windows/Linux and x64/ARM64.
- Include at least two supported Node versions and inference runtimes.
- Compare serialized blocks, hashes, epoch roots, payouts, audit schedules, signatures, and replay results byte for byte.
- Add slow-node, clock-skew, disconnect/reconnect, delayed-block, and reorganization simulations.

### Phase 5: Network synchronization
- Ensure slow nodes can download headers and snapshots before full validation.
- Bound peer queues, messages, orphan pools, and validation work.
- Separate liveness timeouts from consensus validity.
- Version wire messages and reject unsupported consensus versions explicitly.

## Implemented in Consensus V3 (2026-07-28)
- Added versioned `ExecutionProfile` commitments for exact replay.
- Ollama profiles bind runtime version, model/tokenizer digest, quantization, and an explicit `JGC_NUMERIC_BACKEND` deployment identifier.
- Incompatible challengers abstain and cannot cause slashing; quorum tallies exclude incompatible votes.
- Unprofiled claims cannot be published as slashable claims.
- Replaced consensus `localeCompare` ordering with raw UTF-8 byte ordering.
- Replaced JSON epoch commitments with domain-separated binary encodings.
- Compute weights are restricted to non-negative safe integers and committed as uint64.
- Added cross-runtime golden vectors for claims, compute proofs, canonical primitives, and epoch roots.
- Bumped the development protocol to Consensus V3; V2 stores/snapshots require regeneration or an explicit migration.

## Still open
- Execution profiles prevent false cross-runtime accusations but do not prove useful compute.
- Production still needs an audited general transparent STARK/zkVM (or equivalent); existing Groth16 circuits cover only bounded development kernels and are not post-quantum.

## Heterogeneous back-checkers implemented (2026-07-28)
- `src/broker/backcheck.ts` defines three explicit roles: `proof-verifier`, `replay-auditor`, and `quality-auditor`.
- Proof verification is consensus-level and hardware-independent; replay is profile-compatible quorum evidence; quality review is advisory.
- `src/crypto/compute-proof.ts` is the portable proof-dispatch boundary used by consensus and independent proof back-checkers.
- `PQ-HASH-IOP-v1` is classified as a simulation receipt and rejected by strict verification because it does not constrain computation.
- Strict Groth16 loading fails closed and can never select the accept-all JavaScript stub.
- Simulation mode relaxes only proof soundness; ML-DSA contribution signatures remain enforced.
- The bounded sound path was exercised end to end: three blocks containing six real Conv1D Groth16 proofs were accepted by the Rust/WASM pairing verifier with ML-DSA miner identities.
- Verification status after the JGTC launch work: typecheck and build passed;
  37 suites and 318 tests passed under Node.js 22.

## JGTC public-testnet launch (2026-08-15)
- Canonical genesis construction derives every header commitment from the
  actual block body. The current zero-value genesis timestamp is
  2026-08-15 04:00:00 UTC.
- Public testnet identity is `jgtc-testnet-v1`, magic `0x4a475443`, Consensus V3,
  proof mode `simnet-receipts-v1`, and golden genesis hash
  `738588b974ed62ed52e74a946371bc8b6d84508b6c38203f56ada38fce4bab36`.
- VERSION negotiation binds chain ID, genesis hash, consensus version, and proof
  mode. Required-identity nodes reject missing/mismatched peers and reject chain
  data sent before a successful identity handshake.
- `DesignatedBlockProducer` builds from live/replayed chainstate rather than a
  private mirror, waits for sufficient signed work, fully validates locally,
  persists, relays, and resumes after restart. Enable only with `--produce`.
- JGTC has zero premine and no faucet allocation. New test coins enter the UTXO
  set only when recorded participation is paid by the 144-block settlement path.
- Added a two-node container preset, Node 20/22 engine bounds, pinned Rust 1.96.0
  and wasm-pack 0.15.0, and Windows/Linux/macOS CI with consensus golden vectors.
- Google Seed A and independent Fly.io Seed B run Node.js 22 behind TLS/WSS;
  storage recovery, explorer/participation, and the coordinated reset are live.
  Block 1 synchronized across both seeds and an ordinary workstation participant.
- Native ARM execution, independent verifier vectors, a multi-day hostile soak,
  and a production-sound useful-compute proof remain open gates.

## Next proof-system milestones
- Bind the assigned task, approved program/circuit digest, input/output commitments, integer work metric, miner, network, and epoch entropy into one public proof statement.
- Integrate and audit a transparent general-compute STARK/zkVM or equivalent.
- Run proof and consensus golden vectors on Windows/Linux and x64/ARM64 using at least two independent verifier implementations.
- Keep simulation receipts and sound production proofs distinguishable at the type, wire, registry, documentation, and operator-UI layers.
