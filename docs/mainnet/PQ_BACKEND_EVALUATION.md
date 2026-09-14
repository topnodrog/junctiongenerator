# PQ proof backend evaluation: Triton VM

2026-09-13. **Offline verifier hardening complete locally; no mainnet gate acceptance.**
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
Compiler: Rust 1.96.0. The dependency inventory and advisory scan below narrow
the dependency-review gap; cryptographic and distribution review remain open.

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
manifest tests. The initial Ubuntu CI passed for `784ea314ed10705656a3fd53279a3d24efc7ba6d`:
[run 34789381377](https://github.com/topnodrog/junctiongenerator/actions/runs/34789381377).
The expanded three-platform job must pass on the hardening commit separately.

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
transport and deserialization. The original whole-process maximum RSS combines
prover and verifier; the new verifier-only measurements below separate that cost.

## Offline verifier hardening

The new offline envelope pins the program, proof version, parameters and expected
fee. It rejects trailing/truncated data, noncanonical field values and excessive
counts before backend work; the decoded transcript is re-encoded canonically and
its single initial height is bounded before shifting. It caps reads at 1,048,640
bytes, proof elements at 131,072, decoded items at 128 and log2 height at 12.
These limits are an experiment policy, not a proposed consensus budget.

Six Rust tests and three separate-process tests passed locally. They include the
saved proof, changed fee/program/version/output, extra transcript items, hostile
height values, field wraparound, malformed length/discriminant corpus, file
corruption, process failures and a live deadline/termination check. The saved
fixture SHA-256 is
`3ccac57aebe1965271d7b47cf2a5eafd335d3e5b41cc3952899ba928edebb011`.
The five-second parent deadline rejects failure; Linux additionally bounds
address space to 512 MiB and CPU time to three seconds. Other platforms still
need memory/CPU isolation. This is offline tooling, not a public service.

Three fresh verifier-only processes on the same WSL2 machine measured 88.139,
67.840 and 61.326 ms, with maximum RSS 12,259,328, 12,312,576 and 12,214,272
bytes. These include file reading, decoding, policy checks and verification,
unlike the earlier in-process timings. See
[raw verifier evidence](../../tools/pq-proof-evaluation/evidence/verifier-only-wsl2.json).
No network latency, weakest-node limit or full-payment performance is claimed.

## Dependency review evidence

[Inventory](../../tools/pq-proof-evaluation/evidence/dependencies.json) records
123 registry packages across all resolved targets, including build dependencies,
with versions, declared licenses and checksums. `twenty-first 1.1.0` and
`bfieldcodec_derive 0.7.1` declare GPL-2.0; `colored 3.1.1` declares MPL-2.0.
The top-level Triton license alone does not settle distribution obligations.
Resolve this before adopting or distributing a production backend. This is a
metadata inventory, not a legal opinion or an audited release SBOM.

[RustSec scan](../../tools/pq-proof-evaluation/evidence/rustsec-audit.json) using
official cargo-audit 0.22.2 found zero known vulnerabilities and no informational
warnings against database commit `455fd4bac659b5f1fca3810661c2d8b3c25dad05`.
The scanner archive digest and lockfile digest are retained in the evidence.
No ignore flags were used. Absence of a published advisory is not security
acceptance; refresh the database on every release.

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

The expanded CI job runs the same fixture and rejection tests on Ubuntu,
Windows and macOS. It is engineering regression coverage, not an independent
implementation, external review or production readiness.
