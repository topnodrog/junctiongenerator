# Deterministic consensus acceptance record

Status: **complete** for the candidate's `deterministicConsensus` engineering gate.
This record covers the unpublished `jgc-mainnet-v3` candidate's arithmetic,
encoding, state transitions, fork ordering and replay. Proof soundness, privacy,
quantum security, permissionless production and independent review remain
separate mandatory gates. A future consensus/proof change requires renewed
acceptance; this record is not authorization to activate a valuable network.

## Rules and repairs

- Candidate fork ordering is greatest cumulative exact work, then the lowest
  canonical header hash. Equal-work branches converge independently of arrival
  order. The published `jgtc-testnet-v2` pilot and legacy development networks
  retain first-seen ties and their existing retarget/work-unit policy.
- An inactive known parent now releases waiting children, so child-before-parent
  delivery can still select a heavier branch. The winning branch is validated
  before active state changes; an invalid preferred hash cannot displace it.
- Verification and block-state application execute synchronously as one
  transition. Existing Promise-based validation callers remain compatible.
  Concurrent local submissions cannot both apply the same epoch slot.
- Consensus proof minima remain BigInt micro-units through comparison. Verified
  work must equal committed work. The simulation adapter rejects different
  inner/outer amounts, circuits, task commitments and public inputs. This fixes
  inconsistent accounting; it does not make simulation receipts sound proofs.
  Pending-work admission now uses the same scheme dispatcher as block validation;
  the prior simulation-only admission path silently discarded real Conv1D proofs.
- Compact difficulty encoding correctly aligns small mantissas and preserves
  unsigned values for every supported exponent. Retargeting has integer clamps
  and floor division. Header encoding rejects fractional/unsafe integers,
  non-canonical hash strings, trailing bytes and nonzero reserved fields.
- Candidate restart revalidates the complete active log with the same validator
  used live, including spends, signatures, proofs and settlement. A snapshot's
  matching tip hash does not authenticate its balances; candidate state is
  rebuilt instead of trusting the snapshot's UTXOs or epoch accumulator.

## Acceptance evidence

- `candidate-consensus.test.ts`: opposite-order equal-work forks, inactive-parent
  orphan delivery, invalid preferred branches, concurrent submissions, 143 live
  blocks through the first settlement, replay with/without a forged snapshot,
  and rejection of corrupted signatures on restart.
- The deterministic fixture uses fixed keys, task/nonce inputs and timestamps.
  Its post-settlement state digest is
  `8e960538c5a6d392b7cf2922cc5193baa58d45b8772aefb9b67dd09c68a026e8`.
  It checks exactly 7,200 synthetic coins of issuance. The digest covers tip,
  epoch commitment, difficulty and sorted UTXOs. Simulation receipts and
  test-only readiness overrides are explicit fixture inputs.
- `exact-proof-work.test.ts`: equality, one-micro-unit boundaries, extreme
  targets, invalid numbers and inner/outer receipt substitution.
- `canonical.test.ts` and `emission.test.ts`: canonical header rejection,
  small-target fixtures, all 253 exponents from 3 through 255, exact clamps and
  existing genesis/difficulty vectors.
- Existing spend, settlement, emission, reorg, persistence, audit and network
  suites remain part of the full release check. Published pilot vectors pass.

Local release rehearsal passed 53 suites / 451 tests, four manifest tests,
typecheck, build and staged-bundle verification. The real Rust/WASM demonstration
passed three blocks with six Conv1D proofs after the admission repair; CI now
also runs that demonstration.

Implementation commit: `b66f3ac0409cd884ad7ef3d6657e9caec8272c37`.
[Acceptance CI run](https://github.com/topnodrog/junctiongenerator/actions/runs/34747110938)
passed every job: Node 20 on Windows/macOS/Linux, Node 22/24 on Linux, release
bundle, containers, native-wallet rehearsals, Rust/WASM and strict proof/block
admission. The full suite on each supported platform checks the same pinned
settlement-state digest. The readiness baseline now satisfies deterministic
consensus and peer authentication; ten other gates still block launch.

## Operating boundaries

Peers must use the same network identity, protocol version, registered verifier
and execution profile. The existing two-hour future-block admission rule needs
a sufficiently synchronized clock; it is a local admission condition. Timing
diagnostics are not consensus inputs. Matching synthetic vectors establish
deterministic behavior, not privacy, proof soundness or useful market demand.

Full candidate replay costs more startup time than trusting snapshots. Review
and benchmark any future authenticated snapshot optimization before replacing
this behavior. None of these changes deploys or rewrites the running pilot.
