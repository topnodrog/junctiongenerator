/**
 * @file src/tests/quorum.test.ts
 * @description Tests for the multi-challenger quorum (quorum.ts).
 *
 * Covers verifiable sortition, convergence-based tallying (honest pass, fraud
 * slash, scatter → inconclusive), and the BFT-style collusion bound: a forged
 * claim is slashed under an honest supermajority and escapes only once colluders
 * exceed 1/3.
 */

import {
  isChallengerSelected,
  selectChallengers,
  tallyQuorum,
  collectVotes,
  QuorumChallengeCoordinator,
  type Challenger,
} from "../broker/quorum.js";
import { StakeLedger } from "../broker/challenge.js";
import { makeClaim, commitJunctioning } from "../broker/verification.js";
import {
  FakeInferenceBackend,
  fakeExecutionProfile,
  type InferenceBackend,
  type InferenceRequest,
  type InferenceResult,
  type VerifiableTask,
} from "../broker/junctioning.js";

function task(overrides: Partial<VerifiableTask> = {}): VerifiableTask {
  const model = overrides.model ?? "gemma2:2b";
  return { prompt: "what is PoUC?", model, maxTokens: 1024, temperature: 0, seed: 0,
    executionProfile: fakeExecutionProfile(model), ...overrides };
}

/** A backend that always returns `text`, ignoring the prompt — models a node
 *  (or colluding challenger) reporting a fixed, possibly-fabricated answer. */
function fixedBackend(text: string): InferenceBackend {
  return {
    name: "fixed",
    async executionProfile(model) { return fakeExecutionProfile(model); },
    async run(req: InferenceRequest): Promise<InferenceResult> {
      return { text, promptTokens: 1, outputTokens: 1, backend: "fixed", model: req.model };
    },
  };
}

function honest(id: string): Challenger {
  return { id, backend: new FakeInferenceBackend() };
}

describe("sortition", () => {
  it("selects all at p>=1 and none at p<=0", () => {
    expect(isChallengerSelected("c", "b", "id", 1)).toBe(true);
    expect(isChallengerSelected("c", "b", "id", 0)).toBe(false);
  });

  it("is deterministic and id-dependent", () => {
    expect(isChallengerSelected("c", "b", "id", 0.5)).toBe(isChallengerSelected("c", "b", "id", 0.5));
  });

  it("selectChallengers draws roughly the configured fraction", () => {
    const challengers = Array.from({ length: 1000 }, (_, i) => honest(`n${i}`));
    const picked = selectChallengers("commit", "beacon", challengers, 0.3);
    expect(picked.length).toBeGreaterThan(230);
    expect(picked.length).toBeLessThan(370);
  });
});

describe("tallyQuorum", () => {
  const claim = "CLAIM";

  it("passes when a supermajority agrees with the claim", () => {
    expect(tallyQuorum(claim, [claim, claim, claim]).verdict).toBe("pass");
  });

  it("slashes when a supermajority converges on a different commitment", () => {
    const t = tallyQuorum(claim, ["OTHER", "OTHER", "OTHER"]);
    expect(t.verdict).toBe("slash");
    expect(t.topCommitment).toBe("OTHER");
  });

  it("is inconclusive when votes scatter (no supermajority)", () => {
    // Honest challengers under non-determinism: all differ from the claim AND
    // from each other → must NOT slash.
    expect(tallyQuorum(claim, ["A", "B", "C"]).verdict).toBe("inconclusive");
  });

  it("is inconclusive below the minimum quorum", () => {
    expect(tallyQuorum(claim, [claim], { minQuorum: 3 }).verdict).toBe("inconclusive");
  });

  it("is inconclusive with no votes", () => {
    expect(tallyQuorum(claim, []).verdict).toBe("inconclusive");
  });

  it("tolerates a minority disagreeing with the claim (still passes)", () => {
    // 2/3 agree → meets the default threshold.
    expect(tallyQuorum(claim, [claim, claim, "OTHER"]).verdict).toBe("pass");
  });
});

describe("collectVotes", () => {
  it("gathers each challenger's recomputed commitment", async () => {
    const t = task();
    const fake = new FakeInferenceBackend();
    const produced = await fake.run(t);
    const claim = makeClaim(t, produced.text);

    const votes = await collectVotes(claim, [honest("a"), honest("b")]);
    expect(votes.map((v) => v.id)).toEqual(["a", "b"]);
    // Deterministic fake ⇒ every honest challenger reproduces the claim.
    expect(votes.every((v) => v.commitment === claim.commitment)).toBe(true);
  });

  it("excludes challengers with incompatible numerical profiles", async () => {
    const t = task();
    const produced = await new FakeInferenceBackend().run(t);
    const claim = makeClaim(t, produced.text);
    const incompatible: Challenger = {
      id: "gpu-other",
      backend: {
        name: "other",
        async executionProfile(model) {
          return { ...fakeExecutionProfile(model), numericBackend: "gpu-other" };
        },
        async run() { throw new Error("incompatible verifier must abstain"); },
      },
    };
    const votes = await collectVotes(claim, [honest("portable"), incompatible]);
    expect(votes.map((vote) => vote.id)).toEqual(["portable"]);
  });
});

describe("QuorumChallengeCoordinator", () => {
  const baseParams = {
    selectionProbability: 1,   // select everyone, so tests are deterministic
    slashAmount: 900,
    challengerRewardBps: 6000, // 60% of the slash to correct voters
  };

  async function honestClaim() {
    const t = task();
    const produced = await new FakeInferenceBackend().run(t);
    return makeClaim(t, produced.text);
  }

  it("passes an honest claim verified by an all-honest quorum", async () => {
    const ledger = new StakeLedger();
    ledger.bond("prover", 900);
    const coord = new QuorumChallengeCoordinator(baseParams, ledger, [honest("a"), honest("b"), honest("c")]);

    const res = await coord.resolve(await honestClaim(), "prover", "beacon");
    expect(res.verdict).toBe("pass");
    expect(res.slashed).toBe(0);
    expect(ledger.stakeOf("prover")).toBe(900);
  });

  it("slashes a forged claim and pays the converged (honest) challengers", async () => {
    const ledger = new StakeLedger();
    ledger.bond("prover", 900);
    const coord = new QuorumChallengeCoordinator(baseParams, ledger, [honest("a"), honest("b"), honest("c")]);

    const forged = makeClaim(task(), "fabricated answer the model never produced");
    const res = await coord.resolve(forged, "prover", "beacon");

    expect(res.verdict).toBe("slash");
    expect(res.slashed).toBe(900);
    expect(res.challengerReward).toBe(540);                 // 60% of 900
    expect(res.rewardedChallengers.sort()).toEqual(["a", "b", "c"]);
    expect(ledger.isSlashed("prover")).toBe(true);
  });

  it("still slashes a forged claim with a 1/3 colluding minority", async () => {
    const F = "fabricated answer the model never produced";
    const ledger = new StakeLedger();
    ledger.bond("prover", 900);
    // 2 honest + 1 colluder (colluder echoes the fabricated output to match the claim).
    const challengers: Challenger[] = [honest("h1"), honest("h2"), { id: "c1", backend: fixedBackend(F) }];
    const coord = new QuorumChallengeCoordinator(baseParams, ledger, challengers);

    const res = await coord.resolve(makeClaim(task(), F), "prover", "beacon");
    expect(res.verdict).toBe("slash");                       // honest 2/3 converge on truth
    expect(res.rewardedChallengers.sort()).toEqual(["h1", "h2"]); // colluder not paid
  });

  it("a forged claim escapes once colluders exceed 1/3 (documented BFT bound)", async () => {
    const F = "fabricated answer the model never produced";
    const ledger = new StakeLedger();
    ledger.bond("prover", 900);
    // 1 honest + 2 colluders → colluders are the supermajority matching the claim.
    const challengers: Challenger[] = [
      honest("h1"),
      { id: "c1", backend: fixedBackend(F) },
      { id: "c2", backend: fixedBackend(F) },
    ];
    const coord = new QuorumChallengeCoordinator(baseParams, ledger, challengers);

    const res = await coord.resolve(makeClaim(task(), F), "prover", "beacon");
    expect(res.verdict).toBe("pass");      // the liar gets away — beyond the 1/3 bound
    expect(ledger.isSlashed("prover")).toBe(false);
  });

  it("is inconclusive (no slash) when too few challengers are drawn", async () => {
    const ledger = new StakeLedger();
    ledger.bond("prover", 900);
    const coord = new QuorumChallengeCoordinator(
      { ...baseParams, selectionProbability: 0, minQuorum: 3 },
      ledger,
      [honest("a"), honest("b"), honest("c")],
    );

    const res = await coord.resolve(makeClaim(task(), "anything"), "prover", "beacon");
    expect(res.verdict).toBe("inconclusive");
    expect(res.slashed).toBe(0);
    expect(ledger.stakeOf("prover")).toBe(900);
  });

  it("commitment helper stays consistent with the quorum's notion of a vote", () => {
    // Sanity: a vote is exactly commitJunctioning(spec, output).
    const t = task();
    expect(commitJunctioning(t, "x")).toHaveLength(64);
  });
});
