# Consensus V3: Heterogeneous Runtime Safety

Consensus V3 makes cross-machine disagreement explicit and removes several
environment-dependent encodings. It is a breaking development-network upgrade:
V2 block stores and snapshots must be regenerated unless a migration tool is
provided.

## Portable consensus bytes

- Consensus strings are ordered by raw UTF-8 bytes, never `localeCompare`.
- Compute weights are non-negative safe integers and are committed as uint64.
- Epoch state and settlements use domain-separated, fixed-width binary fields.
- Golden vectors freeze claim, compute-proof, and epoch-root encodings.

## Exact replay compatibility

A slashable inference claim includes an `ExecutionProfile` containing:

- protocol version;
- runtime and runtime version;
- model and tokenizer SHA-256 digests;
- quantization;
- numerical backend identifier.

Challengers vote only when their profile matches the claim exactly. An
incompatible challenger abstains; incompatibility is never treated as fraud and
cannot cause slashing.

For Ollama, set `JGC_NUMERIC_BACKEND` to a deployment-defined identifier that
pins all output-affecting numerical details, such as device/backend, kernel
family, deterministic settings, and thread policy. If it is missing, Ollama can
run work but cannot publish a slashable exact-replay claim.

## Security boundary

Matching profiles prevent false accusations between known-incompatible
machines. They do not prove that two nominally matching GPU stacks are actually
bit-identical, nor do they prove that useful work was performed. Production
verification still requires one of:

1. a canonical deterministic execution runtime;
2. a cryptographic proof binding the execution and work quantity; or
3. a carefully specified quorum/tolerance protocol with an economic analysis.

Until that layer exists, elapsed time and estimated TFLOPS remain telemetry and
must not independently determine consensus rewards.

## Heterogeneous back-checkers

Consensus V3 separates three authorities:

- portable proof verifiers check cryptographic execution proofs on any
  architecture and fail closed;
- exact replay auditors vote only when their execution profiles match;
- quality auditors judge usefulness but remain advisory.

`PQ-HASH-IOP-v1` is explicitly simulation-only because Merkle membership does
not constrain the claimed computation. Strict nodes reject it. The existing
Groth16 path can prove limited registered kernels, while a general transparent
STARK/zkVM remains the production target.
