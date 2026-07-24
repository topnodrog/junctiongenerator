---
name: project-jg-vision
description: "Grand vision — PoUC=LLM inference closed loop, L5 verification stance, L6 hemisphere-triad agent org"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c068aa4-5366-42b6-b8f5-01e71bf2c4a0
---

The end-state vision unifying JGC, the node network, and JunctionGenerator into one self-sustaining system (clarified 2026-06-16).

**Closed loop:** consumer devices (PCs + phones, incl. Gemma 3n on phones) run local LLM inference → PoUC verifies the work → nodes earn JGC → aggregate verified compute powers a fleet of AI agents → those agents autonomously run JunctionGenerator → JunctionGenerator produces value that funds the loop. "Useful work" in JGC's PoUC = LLM inference. Context compression ("junctioning") is the efficiency layer that makes inference viable on weak hardware — and is therefore an economic throughput parameter, not a side utility. See [[junctioning-milestone]].

**L5 — verification model:** DIRECTION CHOSEN 2026-06-18 =
**deterministic replay + unpredictable historical sampling + signed quorum**
(from the design space of redundant execution / spot-check / replay /
attestation). First primitive: `packages/jgc-node/src/broker/verification.ts`
— a node publishes a claim (VerifiableTask spec + output + commitment); a
challenger replays the spec and compares commitments. Enabled by the
junctioning seam being deterministic (temp 0 + seed; see
[[junctioning-milestone]]). It was verified locally against `gemma4:e2b`.
The historical 153-test figure describes that milestone, not the current suite.

**Economic prototype BUILT 2026-06-18** (commit `95e2ed8`,
`broker/challenge.ts`): sampling + a local `StakeLedger`/slashing coordinator
demonstrated the deterrence condition `p·slash > gain`. This is design and
test code only; it was never connected to consensus-owned balances and must
not be described as active network slashing.

**Collusion layer prototype BUILT 2026-06-18** (commit `eaa0e40`,
`broker/quorum.ts`): multi-challenger quorum showed that a 2/3 threshold can
tolerate fewer than 1/3 colluding/faulty challengers and that scattered replay
results must be inconclusive. The historical suite reached 183 tests.

**Consensus audit layer BUILT 2026-07-23** (commit `ad9b0a7`): claims are
grouped into fixed 10-block windows. The hash two blocks after the window is
the prover-unpredictable randomness beacon. Every claimant receives one
coverage audit; selected claims receive three validators. Votes are ML-DSA
signed, and the complete request/deadline/verdict/evidence set is committed to
the block header's `auditRoot`. Full nodes independently reconstruct and
validate the claim and beacon from active-chain data, verify signatures and
quorum math, reject premature/forged/replayed verdicts, and rebuild the audit
index on sync or restart. Current baseline: 24 suites / 244 tests plus a
passing 31-block two-node sync demo.

**Honest open scope:** (a) collusion is bounded by the quorum assumption but
not eliminated beyond the <1/3 fault bound; (b) **cross-machine determinism**
still breaks bit-exact replay across runtimes/hardware (FP reduction order);
scatter→inconclusive prevents wrongful penalties but does not prove the claim;
(c) empirical audit/fraud-rate tuning needs real soak data; (d) the delayed
block-hash beacon is now implemented, but the committee still depends on a
validator roster that is not yet consensus-owned; (e) before any economic
penalty, add an on-chain bond/stake snapshot and deterministic committee
reconstruction from that snapshot. The replay verdict is durable fraud
evidence, not a succinct proof and not authority to move funds. **Stance:
network stays local/private until these gates and public-P2P protections are
complete; permissionless remains the end state.** The post-quantum
`pq-zkp.ts` verifier is the live PoUC proof path. The Rust Groth16/BN254 crate
is retained only as legacy reference code.

**L6 — agent org architecture:** Research top organizations (historical + current) → extract roles that brought them to the top AND held them there (two distinct skill sets). Each role = a **triad**: left-hemisphere agent (analytical/logical) + right-hemisphere agent (holistic/intuitive) + context agent (synthesizes into words/action). Left + right deliberate/debate to reach a decision; context agent verbalizes it. Agent count ≈ 3 × roles. Open: how left/right differ in practice (prompt/temp/model), whether context agent breaks deadlocks, whether a coordinating layer sits above roles.

**Hard problems ranked:** (1) verifiable useful compute [L5, make-or-break], (2) phone inference at useful quality, (3) compression-vs-quality tradeoff, (4) net-positive economics.

Related: [[project-jgc]], [[project-architecture]], [[junctioning-milestone]], [[jgc-reward-divisibility]].
