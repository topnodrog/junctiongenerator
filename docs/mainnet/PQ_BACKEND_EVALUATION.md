# PQ proof backend evaluation: Triton VM

2026-09-13. **Initial engineering experiment complete; no mainnet gate acceptance.**
This opens the backend-evaluation work item from the
[V3 design](SHIELDED_PAYMENTS_V3_DESIGN.md). It does not select the production
payment proof system. `proofSystem`, `postQuantumSecurity` and `paymentPrivacy`
remain false, as does `independentSecurityReview`.

## Candidate screen

| Candidate | Primary evidence | Decision for this increment |
|---|---|---|
| Existing JGC hash/Merkle receipts | `packages/jgc-node/src/crypto/pq-zkp.ts` lacks a computation relation | Reject as backend; retain strict rejection |
| Existing Groth16/BN254 | JGC's implemented bounded circuits use pairings | Does not satisfy the PQ requirement |
| Winterfell | [Maintainer README](https://github.com/facebook/winterfell) warns that current proofs may leak secret-input information and that the project is not production ready | Do not use for this privacy experiment without additional ZK construction/review |
| Triton VM 8.0.0 | [Crate API](https://docs.rs/triton-vm/8.0.0/triton_vm/) explicitly supports zero-knowledge execution with private nondeterministic input | Evaluate a small real-proof relation; not approved for payments |

This is a bounded screen, not a comprehensive market comparison. The choice
prioritizes an explicit ZK implementation and accessible native Rust interface.
Maintainer security claims are inputs to review, not JGC acceptance evidence.

## Pinned experiment

The isolated [harness](../../tools/pq-proof-evaluation/README.md) depends on
`triton-vm = 8.0.0`; its lockfile pins all transitive versions/checksums, including
`twenty-first 1.1.0`. The downloaded crate's VCS metadata identifies upstream
commit `66d701b0b1774527dc3a8a72d23b4d18a24c8d78`. Triton uses MIT OR Apache-2.0;
transitive license/advisory review remains outstanding. Compiler: Rust 1.96.0.

The assembly checks four private u32 values and a public u32 fee:
`a + b = c + d + fee`. Every value is range-checked inside the VM. Both sides
are below the field modulus, including at the maximum u32 boundary. No public
values are derived by unconstrained host-side arithmetic. The claim pins the
program hash and VM/proof version; the public output is empty.

There are **no ownership checks or committed notes**: a prover may choose any
balanced values. No signature, membership, nullifier, encryption or ledger state
is implemented here. This is a component cost measurement; using it to authorize
payments would permit theft/inflation. Its program digest is not registered in
JGC consensus. The node has no dependency on this crate.

## Parameters and assumptions to review

These values come from the downloaded pinned crate sources, particularly
[`stark.rs`](https://docs.rs/crate/triton-vm/8.0.0/source/src/stark.rs),
`triton-air/src/lib.rs`, and `twenty-first`'s field and Tip5 modules.

| Parameter | Evaluated setting |
|---|---|
| Base field | `p = 2^64 - 2^32 + 1` |
| Extension | Degree 3, modulus `x^3 - x + 1` |
| STARK parameter `security_level` | Default 160; upstream labels this conjectured, not a certified 160-bit quantum floor |
| FRI expansion / collinearity checks | 4 / 80 |
| Trace randomizers | 105 (`80 + 4 * 3 * 2 + 1`) |
| Quotient segments / randomized segments | 4 / 5 |
| Batch randomizers | 1 extension-field element |
| Hash | Tip5; 16-element state, rate 10, capacity 6, 5 rounds; digest 5 base-field elements |
| Blinding | Backend default fresh randomness; no fixed randomness seed |
| Recursion / curve compression | Neither used by this harness |
| Grinding | No separate harness override; complete transcript/resource analysis remains open |

The [Tip5 paper](https://eprint.iacr.org/2023/107) defines an
arithmetization-oriented hash for recursive STARKs. Its use requires dedicated
cryptanalysis and quantum collision/preimage analysis; it is not interchangeable
with a NIST hash-security claim. Increasing a STARK query count does not increase
the hash's security. JGC has not established a 128-bit quantum floor for this
composition. Review quantum Fiat-Shamir, multi-target losses, algebraic hash
assumptions, knowledge soundness and blinding/transcript leakage for the exact
version before selecting it. This experiment proves none of those arguments.

The available [Hridam Basu audit](https://neptune.cash/file-uploads/Triton_VM_Code_Final_Publishable_Audit_Hridam_Basu.pdf)
states that its target was **v0.42.1, commit d2c6fc7** (page 1). It is not an
audit of 8.0.0 or JGC's payment relation. Mapping fixes and subsequent changes,
finding current audit coverage and reviewing transitive dependencies are open
acceptance dependencies. No external review was commissioned by this work.

## Evidence and resource limits

Local results: two harness tests passed (integer constraints and real-proof
claim/corruption rejection). Node `release:check` also passed: 53 suites / 451
tests, typecheck, build, blocked mainnet preflight, bundle verification and four
manifest tests. The new CI job has not yet supplied independent platform evidence.

Three fresh processes on an Intel Core i5-1335U, x86_64 Linux under WSL2
(`6.18.33.2-microsoft-standard-WSL2`), Rust 1.96.0 release profile,
`RAYON_NUM_THREADS=2`, Python 3.13.7:

| Run | Proof bytes | Prove ms | Verify ms | Whole-process maximum RSS bytes |
|---|---:|---:|---:|---:|
| 1 | 574568 | 302.936 | 11.724 | 34484224 |
| 2 | 574968 | 376.080 | 13.887 | 34361344 |
| 3 | 572568 | 306.645 | 12.114 | 34799616 |

Padded trace height was 512 in all runs. Raw measurements are retained in the
[evidence JSON](../../tools/pq-proof-evaluation/evidence/linux-wsl2.json).
Lockfile SHA-256:
`4e1626759fc9e6bbe48b78daa2c32b71509592c5c793f2b4ac99467662a7e32a`.
Program digest (Tip5 encoding):
`ff65f54d9c639ec5c25e12e0b4bf9597134a7c7e7ef4644e22228e5eabe0a91b234ffabbaaa0b420`.
Fresh proof randomness can change sizes. These three samples are neither a
statistical performance guarantee nor full-payment/weakest-node benchmarks.
Native Windows compilation lacked the MSVC linker, so the existing Linux
toolchain was used; no Windows verifier result is claimed.

Proof bytes
mean eight bytes per encoded field element, excluding any future envelope,
transaction, claim or ciphertext overhead. This is not a network wire format.
Prover measurements include trace creation. In-process verifier timing excludes
transport and deserialization. Whole-process maximum RSS combines prover and
verifier; separate verifier peak memory remains unmeasured.

The harness accepts no external proof files or witness input. It is not a safe
public verification service. Before any adapter is exposed to peers, implement
bounded decoding, maximum proof/claim lengths, checked height arithmetic,
execution/queue budgets and malformed-proof fuzzing. Numeric consensus caps
remain unresolved and must be based on the full relation and weakest supported
hardware. Do not derive them from this small experiment.

## Next acceptance work

1. Obtain a version-specific ZK/quantum security assessment, including Tip5 and
   the complete transcript. Resolve whether the required security floor is
   attainable before committing to this backend.
2. Specify recipient-exclusive authorization and binding of commitments and
   nullifier keys, plus recipient-private encryption. Review the composition
   before expanding the harness to a complete payment relation.
3. Benchmark that complete relation, including membership depth, authorization
   and encryption consistency, on supported platforms. Measure isolated verifier
   memory and malformed-input costs; pin independent verification vectors.
4. Only after acceptance, implement a versioned wallet/consensus migration with
   replay, crash, reorg, theft and inflation tests. Preserve the published pilot.

The new CI job runs the isolated proof tests on Ubuntu. It is engineering
regression coverage and cannot satisfy external review or production readiness.
