# Mainnet remaining-gates handoff

Prepared 2026-09-13 after the offline PQ verifier hardening. This is a continuation
record, not permission to merge, activate mainnet or waive acceptance criteria.

## Delivered and pushed

- PR: [#53](https://github.com/topnodrog/junctiongenerator/pull/53), still open
  when this handoff was written. Branch: `codex/privacy-quantum-design`.
- Implementation commit:
  [`56c2d717f3b92a3c022411642d10c04b3a9370ea`](https://github.com/topnodrog/junctiongenerator/commit/56c2d717f3b92a3c022411642d10c04b3a9370ea).
- Earlier design and initial evaluation: `0679045` and `784ea31` in the same PR.
- Local validation: six Rust tests, three process-level tests (including the
  malformed-file corpus and a real timeout), 53 node suites / 451 tests,
  typecheck/build, release bundle verification and four manifest tests passed.
  Mainnet preflight still reports all ten gates below as missing.
- Initial Ubuntu evaluation CI passed at `784ea31`:
  [run 34789381377](https://github.com/topnodrog/junctiongenerator/actions/runs/34789381377).
  Three-platform hardening CI for `56c2d71`:
  [run 34795163381](https://github.com/topnodrog/junctiongenerator/actions/runs/34795163381).
  Recheck its final result; do not treat an in-progress run as acceptance.

The implementation now provides a canonical bounded offline proof envelope,
fixed program/parameter/expected-fee binding, a saved synthetic proof, hostile
height/count/encoding rejection, fail-closed child-process execution, a
cross-platform CI matrix, verifier-only measurements and a pinned dependency
inventory/advisory snapshot. See [evaluation](PQ_BACKEND_EVALUATION.md) and
[tool instructions](../../tools/pq-proof-evaluation/README.md).

## What this did not clear

No launch gate changed. `peerAuthentication` and `deterministicConsensus` remain
the only two satisfied engineering gates. The authoritative record is
`packages/jgc-node/src/config/mainnet-readiness.ts`, not this document.

The Triton experiment proves **only** a bounded arithmetic relation. It has no
notes, ownership, membership, nullifiers, encryption, payment state or real
useful-work program. It cannot authorize payments or rewards. The production
dispatcher still uses `strict-groth16-v1`; the research receipt still fails
strict verification. The valueless published pilot remains unchanged.

Stop points now requiring evidence/decisions before backend adoption:

1. Concrete quantum soundness/knowledge/ZK analysis for Triton 8.0.0 and Tip5.
   Upstream's 160-bit parameter is not a certified 128-bit quantum floor.
2. Audit coverage for the exact version and composition. The located audit
   targets 0.42.1 (`d2c6fc7`); it does not cover this JGC design.
3. Distribution review: locked `twenty-first 1.1.0` and
   `bfieldcodec_derive 0.7.1` declare GPL-2.0; `colored 3.1.1` declares MPL-2.0.
   An MIT/Apache label on Triton alone does not answer the dependency question.
4. Reviewed recipient-exclusive authorization, commitment/nullifier binding,
   separate viewing authority and recipient-private encryption construction.
   Do not graft the existing sender-known V2 spending seed onto new notes.

RustSec 0.22.2 reported zero known advisories/no warnings for the locked graph at
database commit `455fd4bac659b5f1fca3810661c2d8b3c25dad05`. This is a dated
dependency check, not cryptographic review or evidence of no unknown defects.

## All remaining gates

Paths in the table are relative to `packages/jgc-node` unless stated otherwise.
Every row remains **false**. The next actions describe implementation work,
not pre-approved gate completion.

| Gate | Remaining work and next bounded increment | Acceptance evidence |
|---|---|---|
| `proofSystem` | Resolve backend assessment above; specify complete useful-work and payment statements. Start with registered program/claim domains and independently checked verifier vectors after construction review. Inspect `src/crypto/compute-proof.ts`, `zkp.ts`, `pq-zkp.ts` and root `tools/pq-proof-evaluation`. | Sound registered proofs only; no placeholder keys, research fallback or unverifiable work accounting; adversarial constraints, malformed inputs and supported-platform agreement |
| `postQuantumSecurity` | Inventory every key/hash/proof/transport/backup/upgrade assumption. Resolve exact backend security and distribution decisions, then define full-length commitments and a versioned migration. Inspect `pq-signatures.ts`, `pq-stealth.ts`, wallet and transport code. | External composition review, concrete security parameters, downgrade/replay resistance, recoverable PQ keys and no remaining classical weak link hidden behind ML-DSA |
| `paymentPrivacy` | Review the [V3 requirements](SHIELDED_PAYMENTS_V3_DESIGN.md), then freeze concrete note/descriptor/nullifier/encryption formats before implementation. Keep amounts/linkage and sender-known spend defects explicit. | Sender/viewer cannot spend; hidden values/linkage; range/conservation, ownership, membership, nullifier uniqueness, tamper, scanning/recovery/change and adversarial reorg tests; external review |
| `usefulServices` | Extend authenticated assigned work into authorized remote dispatch with buyer funding/reservation and one durable settlement transition. Inspect `src/broker/assigned-work.ts`, `compute-broker.ts`, `verification.ts`, `src/consensus/settlement-transaction.ts`. Storage also needs encrypted contracts, availability challenges, replication/repair and funding. | Exactly-once debit/completion/payment under duplicate delivery, cancellation, timeout, crashes and reorgs; independently verifiable computation/availability |
| `governance` | Define enforceable authority boundaries and state transitions for proposals, budgets, upgrades and emergencies before connecting model decisions. Start with a versioned authority policy and unauthorized-action tests; the readiness field is not an implementation. | Model output cannot authorize consensus changes; accountable/quorum-approved actions, budget limits, delayed versioned upgrades, recovery/key-rotation tests |
| `permissionlessProduction` | Bind proposer identity/authorization into candidate block validation and enforce the schedule; remove dependence on a designated operator. Inspect `src/consensus/proposer.ts`, `src/network/node.ts`, `src/scripts/testnet-node.ts`. | Wrong/ineligible proposer rejection, offline proposer/liveness/fork tests, restart/reorg determinism and multi-operator evidence; preserve pilot rules |
| `validatorEconomics` | Specify activation heights, bonds, issuance, fees, rewards, audits and slashing as consensus-owned transitions. Start by tracing bond/settlement primitives into actual validation. Inspect `src/consensus/validator-bonds.ts`, `settlement-transaction.ts`, `emission.ts`, `src/broker/audit-protocol.ts`. | Conservation and deterministic reward/slash outcomes; no double rewards or replayed penalties; crash/reorg and adversarial collusion tests |
| `reproducibleArtifacts` | Turn content inventories into independent clean-build comparisons, signed release artifacts, SBOM and pinned genesis acceptance. Start by recording two clean build environments and identifying nondeterministic outputs. Inspect `scripts/stage-runner-release.mjs`, `release-manifest.mjs`, `verify-release-bundle.mjs`. | Matching independently reproduced artifacts and provenance, verified signing authority, dependency inventory and genesis identity; a local bundle hash alone is insufficient |
| `soloSoak` | Complete release-specific multi-host accelerated and real-cadence rehearsals with restart, seed-loss and reorg evidence. Inspect `src/scripts/solo-soak.ts`, `src/ops/soak-evidence.ts`, `hosted-soak-monitor.ts` and operational docs. | Measured duration and immutable logs tied to exact release/genesis; no invented elapsed time, no simulation proof-soundness claim, no claim of independent operators from owner hosts |
| `independentSecurityReview` | Prepare release-specific review packages for crypto, consensus, network, governance and economics; obtain external reviewers and resolve findings. Start with scoped threat models and pinned code/evidence bundles. | Actual external review with no unresolved high/critical findings, remediation verification and release-specific acceptance; internal tests/AI review do not satisfy it |

## Recommended continuation order

Keep the privacy/quantum design as the priority. The backend decision is now a
review question supported by measurements, rather than an unmeasured library
choice. Obtain the missing version-specific evidence before expanding the
payment construction. If that evidence rules out Triton, keep the isolated
envelope/worker methodology, evaluate another backend and regenerate its
fixtures; never relabel Triton evidence as another backend's results.

Useful work that can proceed while review is pending:

1. `usefulServices`: a bounded buyer reservation/settlement state machine with
   cancellation, crash and reorg tests, using simulation only for valueless
   plumbing until a reviewed work proof is available.
2. `reproducibleArtifacts`: independent clean-build evidence and release signing/
   genesis manifests, coordinated with the actual production dependency decision.
3. `permissionlessProduction` plus `validatorEconomics`: explicit candidate-only
   proposer authorization and consensus-owned balances, preserving deterministic
   replay and published pilot separation.

Remaining verifier engineering: sustained mutation fuzzing, a genuinely
independent verifier implementation, full-relation sizing on the weakest target,
Windows/macOS memory/CPU isolation and bounded service queues. The offline
worker's cap is not a network resource policy. Linux's address-space/CPU limits
apply only through `worker.py`; direct binary invocation bypasses them.

## Reproduce and verify

From `tools/pq-proof-evaluation`, use Rust 1.96.0 with a native linker:

```sh
cargo +1.96.0 test --release --locked
cargo +1.96.0 build --release --locked
python process_tests.py target/release/jgc-pq-proof-evaluation
python worker.py target/release/jgc-pq-proof-evaluation evidence/balance-v1.pqe 1
```

Use `.exe` on Windows. Local Windows lacked MSVC's linker, so recorded local
proof results used the installed Linux/WSL2 toolchain and its temporary Cargo
target directory. Do not replace it with mock verification. Measurements and
dependency snapshots are in `tools/pq-proof-evaluation/evidence`; do not overwrite
old evidence with new numbers under the same description.

From `packages/jgc-node`, run `npm run release:check` for consensus/readiness
work. It intentionally confirms blocked mainnet preflight. The real Rust/WASM
admission CI remains required for changes to that proof path.

## Preserve and deliver

- Recheck PR/branch/CI state first. If #53 is still open, related fixes can update
  it. For a separate increment, start a fresh `codex/` branch from merged main
  once the prerequisite work is merged; do not silently merge this PR.
- Preserve candidate exact arithmetic, canonical fork ordering, full restart
  revalidation, admission/block proof dispatch consistency, signed peer-session
  sequence bounds and the `jgtc-testnet-v2`/`jgc-mainnet-v3` separation.
- Preserve unrelated `sprite-windows-amd64.zip`, `sprite-windows-amd64/`,
  `validate_pptx.py` and `verify_pptx_zip.py`.
- Review the scoped diff, run relevant checks, commit/push and open/update a PR.
  Never treat a saved research proof, zero advisory count or this handoff as
  authorization to activate valuable networks or mark the remaining gates true.
