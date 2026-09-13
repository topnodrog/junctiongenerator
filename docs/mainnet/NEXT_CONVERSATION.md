# Mainnet continuation handoff

Prepared 2026-09-13 for continuation after PR #52. Start by checking the current
branch, working tree and merged PR state; this document is a snapshot, not a
replacement for current source evidence.

## Objective and boundaries

Continue JGC mainnet preparation. Zcash-like payment privacy and end-to-end
quantum readiness are mandatory. Finish bounded implementation work with tests,
findings and a focused PR; do not waive gates or activate valuable networks.
Read `AGENTS.md`, `docs/mainnet/FINDINGS_AND_TODO.md`, and
`packages/jgc-node/src/config/mainnet-readiness.ts` first.

Two engineering gates are satisfied: `peerAuthentication` and
`deterministicConsensus`. Ten remain: `proofSystem`, `postQuantumSecurity`,
`paymentPrivacy`, `usefulServices`, `governance`, `permissionlessProduction`,
`validatorEconomics`, `reproducibleArtifacts`, `soloSoak`,
`independentSecurityReview`. Implementation is not external security acceptance.

## Design continuation update (2026-09-13)

Read [SHIELDED_PAYMENTS_V3_DESIGN.md](SHIELDED_PAYMENTS_V3_DESIGN.md) first.
Revision 0 now records the bounded gap audit and versioned design requirements.
Crypto facade/signature/receipt/Groth16 claims were corrected without runtime
changes. Next: evaluate a candidate explicitly zero-knowledge PQ proof backend
in an isolated harness, with exact parameters, resource measurements and review
gaps. Resolve descriptor/nullifier binding and recipient-private encryption
before implementing a payment protocol. No construction is approved; all ten
remaining gates stay blocked. Preserve the published pilot.

## Continuing design requirements

Extend the bounded audit and revision 0 design as construction evidence becomes
available. Recheck `src/crypto/pq-stealth.ts`, `pq-signatures.ts`, `pq-zkp.ts` and
`compute-proof.ts` under `packages/jgc-node`. Audit stale claims in comments and
public material; correct claims without pretending that documentation closes
the privacy or quantum gates. Consult current primary cryptographic sources
before choosing a construction, and record review dependencies explicitly.

Known blockers: experimental ML-KEM V2 destinations expose the spending seed
to the sender; amounts and spends remain public; the historically named viewing
secret has spending authority. Mainnet still declares `strict-groth16-v1`.
Hash/Merkle receipts in `pq-zkp.ts` are simulation-only, not computation proofs.
Wallet address commitments are truncated to 20 bytes. ML-DSA signatures alone
do not establish end-to-end quantum security.

Design acceptance must cover recipient-exclusive spending, separate viewing
authority, encrypted notes, commitments/nullifiers, hidden values and linkage,
confidential value conservation, scanning/recovery, reorgs and metadata limits.
Document proof assumptions/parameters, verifier limits, transport and backup
confidentiality, upgrade authority, full-length commitments and versioned
migration. Obtain external cryptographic review before gate completion.

If a separate engineering increment is useful, inspect release staging and
manifest scripts for reproducibleArtifacts: current content-addressed inventory
and tamper tests are a foundation, not evidence of independent reproducibility,
signed artifacts, SBOM or pinned genesis acceptance. Useful-services work still
needs authorized remote dispatch, buyer funding/reservation and exactly-once
settlement with cancellation/crash/reorg tests. Do not fabricate soak duration
or independent security review.

## Evidence and regression traps

PR: https://github.com/topnodrog/junctiongenerator/pull/52

Consensus implementation `b66f3ac0409cd884ad7ef3d6657e9caec8272c37` passed all CI:
https://github.com/topnodrog/junctiongenerator/actions/runs/34747110938
Local release checks passed 53 suites / 451 tests plus four manifest tests,
typecheck, build and bundle verification. Real Rust/WASM Conv1D demo passed
six proofs in three blocks. Acceptance details are in
`DETERMINISTIC_CONSENSUS.md` and `PEER_AUTHENTICATION.md` alongside this file.

Candidate `jgc-mainnet-v3` uses greatest work then lowest canonical header hash,
synchronous validation/state application, exact BigInt proof thresholds and
full chain revalidation on restart. Published `jgtc-testnet-v2` retains its
existing first-seen tie and retarget rules. Preserve that separation.
Admission and block verification must use the same proof dispatcher. Outer
receipt context/work must agree with the embedded receipt. Reject noncanonical
headers, unsafe integers and forged snapshots. Peer authentication binds fresh
handshakes to signed per-direction sequences; preserve queue and timeout bounds.

From `packages/jgc-node`, run `npm run release:check` for relevant consensus or
readiness changes. Rust/WASM strict admission also runs in CI. Simulation
fixtures use test-only readiness overrides and do not prove production proof
soundness, privacy or quantum security.

## Workspace hygiene and delivery

Preserve unrelated untracked `sprite-windows-amd64.zip`,
`sprite-windows-amd64/`, `validate_pptx.py`, `verify_pptx_zip.py` if present.
Start subsequent implementation on a fresh `codex/` branch from merged main.
Review the diff, commit only scoped work, push and open/update a PR as AGENTS.md
requires. The current user's merge authorization concerns PR #52; do not infer
authorization to merge future work or deploy mainnet from this handoff.
