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

**L5 — verification model:** DIRECTION CHOSEN 2026-06-18 = **deterministic-replay** (from the design space of redundant execution / spot-check / replay / attestation). First primitive is BUILT and live: `packages/jgc-node/src/broker/verification.ts` — a node publishes a claim (VerifiableTask spec + output + sha256 commitment); a challenger replays the spec and compares commitments. Enabled by the junctioning seam being deterministic (temp 0 + seed; see [[junctioning-milestone]]). Verified live against `gemma4:e2b` (replay reproduced output → verified; tampered claim → distinct commitment). 153/153 tests green; commit `e78cac4`.

**Economic layer BUILT 2026-06-18** (commit `95e2ed8`, `broker/challenge.ts`): sampling + slashing so we DON'T replay every task (the cost problem from [[trusted-compute-research]]). Challenge a random sample; slash a caught liar so cheating is -EV even at low sample rate (`p·slash > gain`). Verifiable sampling: `shouldChallenge` draws from `sha256(commitment‖beacon)` — prover can't predict the beacon, network recomputes the verdict. Plus StakeLedger + ChallengeCoordinator (sample→replay→slash, pays challenger). Deterrence math is pure/exported. 167/167 green.

**Collusion layer BUILT 2026-06-18** (commit `eaa0e40`, `broker/quorum.ts`): multi-challenger quorum. Sortition draws a verifiable, prover-unpredictable subset (`sha256(commitment‖beacon‖id)`); each replays independently; slash only when a supermajority CONVERGES on one commitment (converged≠claim → slash; scatter → inconclusive, so honest cross-machine scatter is never a wrongful slash). Pays only the correct voters. 2/3 threshold ⇒ tolerates <1/3 colluding/faulty challengers (BFT bound), tested both directions. 183/183 green.

**Honest open scope (still UNSOLVED — keep private):** (a) collusion — ADDRESSED by the quorum within the <1/3 BFT bound (beyond that a liar still escapes; classic limit); (b) **cross-machine determinism** — bit-exact replay breaks across runtimes/hardware (FP reduction order); the quorum MITIGATES it (scatter→inconclusive) but the real fix is a canonical reference runtime or output tolerance — THE hard part, still open; (c) **empirical fraud-rate tuning** of `p` (needs live data); (d) **beacon source** — sampling/sortition need an external randomness beacon (future block hash / drand); consuming it is wired, sourcing it is a protocol TODO. The replay verdict is a fraud-proof BASIS, not a succinct proof. **Stance unchanged: network stays private/permissioned until the verification model is complete; permissionless is the end state.** The Rust ZK-SNARK verifier remains the load-bearing on-chain piece for the coin's PoUC proofs.

**L6 — agent org architecture:** Research top organizations (historical + current) → extract roles that brought them to the top AND held them there (two distinct skill sets). Each role = a **triad**: left-hemisphere agent (analytical/logical) + right-hemisphere agent (holistic/intuitive) + context agent (synthesizes into words/action). Left + right deliberate/debate to reach a decision; context agent verbalizes it. Agent count ≈ 3 × roles. Open: how left/right differ in practice (prompt/temp/model), whether context agent breaks deadlocks, whether a coordinating layer sits above roles.

**Hard problems ranked:** (1) verifiable useful compute [L5, make-or-break], (2) phone inference at useful quality, (3) compression-vs-quality tradeoff, (4) net-positive economics.

Related: [[project-jgc]], [[project-architecture]], [[junctioning-milestone]], [[jgc-reward-divisibility]].
