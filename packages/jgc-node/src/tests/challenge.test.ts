/**
 * @file src/tests/challenge.test.ts
 * @description Tests for the sampling + slashing economic layer (challenge.ts).
 *
 * Covers the deterrence math, verifiable sampling (deterministic + roughly
 * uniform), the stake ledger, and end-to-end challenge resolution: honest claims
 * pass, forged claims get slashed and pay the challenger.
 */

import {
  isCheatingDeterred,
  minSlashToDeter,
  minProbabilityToDeter,
  shouldChallenge,
  StakeLedger,
  ChallengeCoordinator,
} from "../broker/challenge.js";
import { makeClaim } from "../broker/verification.js";
import { FakeInferenceBackend, type VerifiableTask } from "../broker/junctioning.js";

function task(overrides: Partial<VerifiableTask> = {}): VerifiableTask {
  return { prompt: "what is PoUC?", model: "gemma2:2b", maxTokens: 1024, temperature: 0, seed: 0, ...overrides };
}

describe("deterrence math", () => {
  it("isCheatingDeterred when expected penalty exceeds the gain", () => {
    expect(isCheatingDeterred(0.1, 1000, 50)).toBe(true);   // 100 > 50
    expect(isCheatingDeterred(0.01, 1000, 50)).toBe(false); // 10 < 50
  });

  it("minSlashToDeter is gain/p, Infinity when never challenged", () => {
    expect(minSlashToDeter(0.1, 50)).toBeCloseTo(500, 6);
    expect(minSlashToDeter(0.1, 50, 2)).toBeCloseTo(1000, 6); // safety margin
    expect(minSlashToDeter(0, 50)).toBe(Infinity);
  });

  it("minProbabilityToDeter is gain/slash, Infinity when slash is zero", () => {
    expect(minProbabilityToDeter(1000, 50)).toBeCloseTo(0.05, 6);
    expect(minProbabilityToDeter(0, 50)).toBe(Infinity);
  });

  it("the deterrence functions are mutually consistent at break-even", () => {
    const p = minProbabilityToDeter(1000, 50);   // 0.05
    // at exactly break-even it's not strictly deterred (needs >, not ≥)
    expect(isCheatingDeterred(p, 1000, 50)).toBe(false);
    expect(isCheatingDeterred(p * 1.0001, 1000, 50)).toBe(true);
  });
});

describe("shouldChallenge (verifiable sampling)", () => {
  it("always challenges at p>=1 and never at p<=0", () => {
    expect(shouldChallenge("c", "b", 1)).toBe(true);
    expect(shouldChallenge("c", "b", 0)).toBe(false);
  });

  it("is deterministic for identical inputs", () => {
    expect(shouldChallenge("c", "b", 0.5)).toBe(shouldChallenge("c", "b", 0.5));
  });

  it("draws roughly uniformly across commitments", () => {
    const N = 2000;
    let hits = 0;
    for (let i = 0; i < N; i++) if (shouldChallenge(`commit-${i}`, "beacon", 0.5)) hits++;
    const rate = hits / N;
    expect(rate).toBeGreaterThan(0.43);
    expect(rate).toBeLessThan(0.57);
  });
});

describe("StakeLedger", () => {
  it("accumulates bonded stake and starts un-slashed", () => {
    const l = new StakeLedger();
    l.bond("n", 100);
    l.bond("n", 50);
    expect(l.stakeOf("n")).toBe(150);
    expect(l.isSlashed("n")).toBe(false);
  });

  it("slashes up to the available stake and marks the node", () => {
    const l = new StakeLedger();
    l.bond("n", 100);
    expect(l.slash("n", 30)).toBe(30);
    expect(l.stakeOf("n")).toBe(70);
    expect(l.isSlashed("n")).toBe(true);
  });

  it("caps a slash at the remaining stake", () => {
    const l = new StakeLedger();
    l.bond("n", 40);
    expect(l.slash("n", 1000)).toBe(40); // can't take more than they have
    expect(l.stakeOf("n")).toBe(0);
  });
});

describe("ChallengeCoordinator", () => {
  const params = { challengeProbability: 1, slashAmount: 1000, challengerRewardBps: 5000 };

  async function honestClaim() {
    const backend = new FakeInferenceBackend();
    const t = task();
    const produced = await backend.run(t);
    return { backend, claim: makeClaim(t, produced.text) };
  }

  it("does not challenge when sampling says no (p=0)", async () => {
    const { backend, claim } = await honestClaim();
    const ledger = new StakeLedger();
    ledger.bond("n", 1000);
    const coord = new ChallengeCoordinator({ ...params, challengeProbability: 0 }, ledger, backend);

    const res = await coord.resolve(claim, "n", "beacon");
    expect(res.challenged).toBe(false);
    expect(res.outcome).toBe("not-challenged");
    expect(ledger.stakeOf("n")).toBe(1000); // untouched
  });

  it("passes an honest claim without slashing", async () => {
    const { backend, claim } = await honestClaim();
    const ledger = new StakeLedger();
    ledger.bond("n", 1000);
    const coord = new ChallengeCoordinator(params, ledger, backend);

    const res = await coord.resolve(claim, "n", "beacon");
    expect(res.challenged).toBe(true);
    expect(res.verified).toBe(true);
    expect(res.outcome).toBe("passed");
    expect(res.slashed).toBe(0);
    expect(ledger.isSlashed("n")).toBe(false);
    expect(ledger.stakeOf("n")).toBe(1000);
  });

  it("slashes a forged claim and pays the challenger", async () => {
    const backend = new FakeInferenceBackend();
    const ledger = new StakeLedger();
    ledger.bond("n", 1000);
    const coord = new ChallengeCoordinator(params, ledger, backend);

    // Output the model would never produce for this spec.
    const claim = makeClaim(task(), "a fabricated answer the node never computed");
    const res = await coord.resolve(claim, "n", "beacon");

    expect(res.challenged).toBe(true);
    expect(res.verified).toBe(false);
    expect(res.outcome).toBe("slashed");
    expect(res.slashed).toBe(1000);
    expect(res.challengerReward).toBe(500); // 50% of slash (5000 bps)
    expect(ledger.isSlashed("n")).toBe(true);
    expect(ledger.stakeOf("n")).toBe(0);
  });

  it("reports whether current params + stake deter a given gain", async () => {
    const { backend } = await honestClaim();
    const ledger = new StakeLedger();
    ledger.bond("n", 1000);
    // p=0.1, slashable=min(1000,1000)=1000 → deters gain up to <100.
    const coord = new ChallengeCoordinator({ ...params, challengeProbability: 0.1 }, ledger, backend);
    expect(coord.deters(50, "n")).toBe(true);   // 0.1*1000=100 > 50
    expect(coord.deters(150, "n")).toBe(false); // 100 < 150
  });
});
