# Isolated PQ proof backend evaluation

Research harness only. This crate is not a node dependency and its proofs have
no network admission, payment authority or reward value. It evaluates
`triton-vm = 8.0.0` with its default parameters, pinned by `Cargo.lock`.

From this directory, with Rust 1.96.0 and a native linker installed:

```sh
cargo +1.96.0 test --release --locked
cargo +1.96.0 build --release --locked
RAYON_NUM_THREADS=2 ./target/release/jgc-pq-proof-evaluation
```

The binary emits one JSON measurement. Build time is excluded. `proveMs`
includes VM trace generation; `verifyMs` measures one in-process verification.
`proofRawU64Bytes` is eight times the number of proof field elements, **not** a
deployed transaction format or JSON size. The default benchmark exports neither
proof nor witness. `prove NEW_FILE` explicitly exports a synthetic proof fixture
using create-new semantics; it refuses to overwrite an existing file.
The binary reports memory as unavailable; use an external process monitor
such as the included `python3 measure.py /path/to/binary` wrapper on Linux/macOS.
It records whole-process maximum RSS in bytes and enforces a 180-second timeout.
Repeat runs in fresh processes and record CPU, OS, compiler, thread count,
lockfile digest and source revision. Never infer a weakest-node budget from a
single development machine. Use an external timeout for unattended runs.

## Exact statement and limits

The fixed assembly consumes four private values and one public fee. It checks
each is in `[0, 2^32 - 1]`, then asserts `a + b = c + d + fee`. Each side is
smaller than the base-field modulus, so modular wraparound cannot satisfy a false
integer balance. The public output is empty; the claim includes program digest,
VM version and fee. Tests exercise boundary values, invalid balances, oversized
values, field-minus-one fees, and proof rejection for changed fee/program/version/
output, corruption and truncation. This is a bounded smoke test, not fuzzing.

Values are synthetic fixtures. Prover blinding uses the backend's fresh default
randomness; no seeded deterministic prover mode is enabled. A passing test or
absence of plaintext in a claim is not a zero-knowledge security argument.

**There are no note commitments, membership checks, nullifiers, spending keys,
encrypted notes or transaction context in this experiment.** Anyone can choose
values satisfying the equation. Consequently this proves no ownership and cannot
prevent payment inflation on a ledger. It measures a small component needed by
the [V3 requirements](../../docs/mainnet/SHIELDED_PAYMENTS_V3_DESIGN.md), not the
full payment relation or useful computation. No backend is approved for JGC.

See the [evaluation record](../../docs/mainnet/PQ_BACKEND_EVALUATION.md) for
parameters, results and remaining acceptance blockers.

## Offline verification and fixed fixture

```sh
python3 worker.py target/release/jgc-pq-proof-evaluation evidence/balance-v1.pqe 1
python3 process_tests.py target/release/jgc-pq-proof-evaluation
python3 measure.py target/release/jgc-pq-proof-evaluation verify evidence/balance-v1.pqe 1
python3 inventory.py
```

On Windows use the `.exe` suffix. The fixture contains no seed, witness or
prover blinding randomness. Its public fee is 1; its program and backend are
pinned. The verifier constructs its own expected claim and parameters rather
than trusting a proof-supplied program or fee. Pass the independently expected
fee on the command line; this is not a payment-authorization decision.

The research envelope is little-endian:

| Offset | Size | Meaning |
|---:|---:|---|
| 0 | 8 | ASCII `JGCPQE01` |
| 8 | 4 | Envelope version 1 |
| 12 | 4 | Triton ISA/proof version 8 |
| 16 | 4 | Public fee, u32 |
| 20 | 40 | Fixed program digest, five canonical u64 field elements |
| 60 | 4 | Number of proof field elements |
| 64 | count * 8 | Canonical u64 field elements; each strictly less than p |

Local evaluation caps: 131,072 proof elements, 1,048,640 total bytes, 128 decoded
proof items, one initial height with log2 at most 12. Reads stop at cap + 1;
length/context/canonical-field checks precede backend decoding. Re-encoding the
decoded proof must match, and the backend must consume the full transcript.
These are experimental policy limits, not approved consensus limits.

The Python parent runs one child at a time with a five-second wall deadline.
On Linux it also sets 512 MiB address space and three CPU seconds before exec.
Windows/macOS enforce the wall deadline only; their memory/CPU isolation remains
open. A panic, invalid JSON, nonzero exit, missing executable or deadline expiry
fails closed. Calling the Rust binary directly bypasses the parent deadline.
The Rust unwind handler cannot recover from allocation aborts. Use only offline
files; the wrapper is not a multi-user queue, sandbox or public RPC service.

The deterministic malformed corpus is bounded regression coverage, not exhaustive
fuzzing or cryptographic review. CI verifies the same saved bytes on Ubuntu,
Windows and macOS; that is not an independent verifier implementation.

`inventory.py` records declared licenses, not legal conclusions. The locked graph
includes GPL-2.0 declarations for `twenty-first` and `bfieldcodec_derive`, plus
MPL-2.0 for `colored`; resolve distribution requirements before backend adoption.
