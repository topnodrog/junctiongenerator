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
deployed transaction format or JSON size. No proof or witness is exported.
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
