/**
 * @file src/tests/epoch.test.ts
 * @description Unit tests for JGC epoch payout accumulator and settlement.
 */

import {
  initEpochState,
  applyBlockToEpoch,
  computeEpochSettlement,
  computeEpochRoot,
} from "../consensus/epoch.js";
import { BLOCKS_PER_EPOCH, getBlockReward, BASE_UNITS_PER_JGC } from "../consensus/emission.js";
import type { MinerComputeContribution } from "../types/index.js";
import { ComputeTaskType } from "../types/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeContrib(address: string, tflops: number): MinerComputeContribution {
  return {
    minerAddress: address,
    signature:    "0".repeat(128),
    publicKey:    "0".repeat(66),
    proof: {
      taskCommitment:  "a".repeat(64),
      proofBytes:      Buffer.alloc(256).toString("base64"),
      circuitId:       "CIRCUIT_AI_INFERENCE_V1",
      publicInputs:    ["0", "0", "0"],
      tflopsWeight:    tflops,
      taskType:        ComputeTaskType.AI_INFERENCE,
      computeStartedAt: "2026-06-11T00:00:00Z",
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Init Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("initEpochState", () => {
  test("initializes correctly at height 0", () => {
    const state = initEpochState(0, 1_749_600_000);
    expect(state.epochStartHeight).toBe(0);
    expect(state.epochBlockIndex).toBe(0);
    expect(state.totalEpochTFLOPS).toBe(0);
    expect(state.pendingRewardPool).toBe(0n);
    expect(state.minerContributions.size).toBe(0);
  });

  test("throws if height is not multiple of 144", () => {
    expect(() => initEpochState(143, 0)).toThrow(RangeError);
    expect(() => initEpochState(1, 0)).toThrow(RangeError);
  });

  test("accepts epoch start at height 144", () => {
    const state = initEpochState(144, 0);
    expect(state.epochStartHeight).toBe(144);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Block Application Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("applyBlockToEpoch", () => {
  test("accumulates TFLOPS and reward pool", () => {
    const state = initEpochState(0, 0);
    const contrib = makeContrib("miner1", 500);

    applyBlockToEpoch(state, [contrib], 0, 0n);

    expect(state.totalEpochTFLOPS).toBe(500);
    expect(state.pendingRewardPool).toBe(getBlockReward(0));
    expect(state.epochBlockIndex).toBe(1);
    expect(state.minerContributions.get("miner1")).toBe(500);
  });

  test("accumulates multiple miners across blocks", () => {
    const state = initEpochState(0, 0);

    applyBlockToEpoch(state, [makeContrib("minerA", 300)], 0, 0n);
    applyBlockToEpoch(state, [makeContrib("minerB", 200)], 1, 0n);
    applyBlockToEpoch(state, [makeContrib("minerA", 100)], 2, 0n);

    expect(state.totalEpochTFLOPS).toBe(600);
    expect(state.minerContributions.get("minerA")).toBe(400);  // 300 + 100
    expect(state.minerContributions.get("minerB")).toBe(200);
    expect(state.epochBlockIndex).toBe(3);
  });

  test("adds fees to reward pool", () => {
    const state = initEpochState(0, 0);
    applyBlockToEpoch(state, [makeContrib("m1", 100)], 0, 1_000n);
    expect(state.pendingRewardPool).toBe(getBlockReward(0) + 1_000n);
  });

  test("throws on epoch block index mismatch", () => {
    const state = initEpochState(0, 0);
    // state.epochBlockIndex = 0, but passing height=1 (which has index 1)
    expect(() => applyBlockToEpoch(state, [], 1, 0n)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Settlement Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("computeEpochSettlement", () => {
  function buildFullEpoch(epoch: number = 0) {
    const startHeight = epoch * BLOCKS_PER_EPOCH;
    const state = initEpochState(startHeight, 0);

    for (let i = 0; i < BLOCKS_PER_EPOCH; i++) {
      const contribs = [
        makeContrib("miner1", 600),
        makeContrib("miner2", 400),
      ];
      applyBlockToEpoch(state, contribs, startHeight + i, 0n);
    }

    return state;
  }

  test("payouts sum to total reward pool", () => {
    const state = buildFullEpoch(0);
    const settlement = computeEpochSettlement(state, 0);

    const total = settlement.payouts.reduce((s, p) => s + p.satoshis, 0n);
    expect(total).toBe(settlement.totalRewardPool);
  });

  test("miner1 gets 60%, miner2 gets 40%", () => {
    const state = buildFullEpoch(0);
    const settlement = computeEpochSettlement(state, 0);

    const m1 = settlement.payouts.find(p => p.minerAddress === "miner1")!;
    const m2 = settlement.payouts.find(p => p.minerAddress === "miner2")!;

    // miner1 contributed 600/1000 = 60%, miner2 = 400/1000 = 40%
    expect(m1.sharePercent).toBeCloseTo(60, 0);
    expect(m2.sharePercent).toBeCloseTo(40, 0);

    // Satoshi amounts should reflect the ratio.
    const ratio = Number(m1.satoshis) / Number(m2.satoshis);
    expect(ratio).toBeCloseTo(1.5, 1);  // 60/40 = 1.5
  });

  test("total pool = 144 × blockReward(era0) = 7,200 JGC", () => {
    const state = buildFullEpoch(0);
    const settlement = computeEpochSettlement(state, 0);

    const expectedPool = getBlockReward(0) * BigInt(BLOCKS_PER_EPOCH);
    expect(settlement.totalRewardPool).toBe(expectedPool);

    const poolJGC = Number(settlement.totalRewardPool / BASE_UNITS_PER_JGC);
    expect(poolJGC).toBe(7200);
  });

  test("throws if epoch not complete", () => {
    const state = initEpochState(0, 0);
    applyBlockToEpoch(state, [makeContrib("m1", 100)], 0, 0n);
    // Only 1 block applied, not 144.
    expect(() => computeEpochSettlement(state, 0)).toThrow();
  });

  test("empty epoch returns empty payouts", () => {
    const state = initEpochState(0, 0);
    // Apply 144 blocks with no contributions.
    for (let i = 0; i < BLOCKS_PER_EPOCH; i++) {
      applyBlockToEpoch(state, [], i, 0n);
    }
    const settlement = computeEpochSettlement(state, 0);
    expect(settlement.payouts).toHaveLength(0);
  });

  test("settlementTxHash is deterministic", () => {
    const state1 = buildFullEpoch(0);
    const state2 = buildFullEpoch(0);
    const s1 = computeEpochSettlement(state1, 0);
    const s2 = computeEpochSettlement(state2, 0);
    expect(s1.settlementTxHash).toBe(s2.settlementTxHash);
  });

  test("16-decimal granularity: a full epoch splits among 100k miners, no zero payouts, exact sum", () => {
    const N = 100_000;
    const state = initEpochState(0, 0);

    // Block 0: N distinct miners each contribute 1 TFLOPS (tiny equal shares).
    const many = Array.from({ length: N }, (_, i) => makeContrib(`miner${i}`, 1));
    applyBlockToEpoch(state, many, 0, 0n);
    // Blocks 1..143: a single carrier advances the epoch to completion.
    for (let i = 1; i < BLOCKS_PER_EPOCH; i++) {
      applyBlockToEpoch(state, [makeContrib("carrier", 1)], i, 0n);
    }

    const settlement = computeEpochSettlement(state, 0);

    // Every contributor receives a strictly positive payout. This is the point
    // of 16 decimals: ~7.2e19 base units / ~1e5 miners ≈ 7e14 units each — far
    // above zero. (It also guards the BigInt pro-rata: a Number() round-trip at
    // this scale would corrupt the amounts and break the exact-sum invariant.)
    for (const p of settlement.payouts) {
      expect(p.satoshis).toBeGreaterThan(0n);
    }
    // Payouts remain exhaustive (sum exactly equals the pool).
    const sum = settlement.payouts.reduce((s, p) => s + p.satoshis, 0n);
    expect(sum).toBe(settlement.totalRewardPool);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Epoch Root Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("computeEpochRoot", () => {
  test("deterministic for same state", () => {
    const state = initEpochState(0, 1_749_600_000);
    applyBlockToEpoch(state, [makeContrib("m1", 100)], 0, 0n);
    const root1 = computeEpochRoot(state);
    const root2 = computeEpochRoot(state);
    expect(root1).toBe(root2);
  });

  test("changes when contributions change", () => {
    const state1 = initEpochState(0, 1_749_600_000);
    applyBlockToEpoch(state1, [makeContrib("m1", 100)], 0, 0n);

    const state2 = initEpochState(0, 1_749_600_000);
    applyBlockToEpoch(state2, [makeContrib("m1", 200)], 0, 0n);  // different TFLOPS

    expect(computeEpochRoot(state1)).not.toBe(computeEpochRoot(state2));
  });

  test("root is 64 hex chars (32 bytes)", () => {
    const state = initEpochState(0, 0);
    const root = computeEpochRoot(state);
    expect(root).toMatch(/^[0-9a-f]{64}$/);
  });
});
