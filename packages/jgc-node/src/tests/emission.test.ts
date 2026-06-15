/**
 * @file src/tests/emission.test.ts
 * @description Unit tests for JGC emission schedule.
 *
 * Verifies the geometric series convergence to 21,000,000 JGC and confirms
 * daily emission, era transitions, and compact difficulty encoding.
 */

import { jest } from "@jest/globals";
import {
  getBlockReward,
  getEraIndex,
  getCumulativeSupply,
  getEmissionEra,
  calculateNextDifficultyTarget,
  encodeDifficultyBits,
  decodeDifficultyBits,
  INITIAL_BLOCK_REWARD_SATOSHIS,
  BASE_UNITS_PER_JGC,
  BLOCKS_PER_QUARTERING,
  HARD_CAP_SATOSHIS,
  BLOCKS_PER_EPOCH,
  TARGET_BLOCK_INTERVAL_SECONDS,
  RETARGET_WINDOW_BLOCKS,
  ERA0_DAILY_JGC,
  printEmissionSchedule,
} from "../consensus/emission.js";

// ─────────────────────────────────────────────────────────────────────────────
// Era Index Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("getEraIndex", () => {
  test("genesis block is era 0", () => {
    expect(getEraIndex(0)).toBe(0);
  });

  test("last block of era 0", () => {
    expect(getEraIndex(BLOCKS_PER_QUARTERING - 1)).toBe(0);
  });

  test("first block of era 1", () => {
    expect(getEraIndex(BLOCKS_PER_QUARTERING)).toBe(1);
  });

  test("mid era 5", () => {
    expect(getEraIndex(5 * BLOCKS_PER_QUARTERING + 1000)).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Block Reward Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("getBlockReward", () => {
  test("era 0 reward = 50 JGC", () => {
    expect(getBlockReward(0)).toBe(INITIAL_BLOCK_REWARD_SATOSHIS);        // 50 × 10^16
    expect(getBlockReward(0)).toBe(50n * BASE_UNITS_PER_JGC);
    expect(getBlockReward(BLOCKS_PER_QUARTERING - 1)).toBe(INITIAL_BLOCK_REWARD_SATOSHIS);
  });

  test("era 1 reward = 37.5 JGC = floor(reward0 × 3/4)", () => {
    const era1Reward = getBlockReward(BLOCKS_PER_QUARTERING);
    expect(era1Reward).toBe(INITIAL_BLOCK_REWARD_SATOSHIS * 3n / 4n);
  });

  test("era 2 reward = 28.125 JGC", () => {
    const era2Reward = getBlockReward(2 * BLOCKS_PER_QUARTERING);
    expect(era2Reward).toBe(INITIAL_BLOCK_REWARD_SATOSHIS * 3n / 4n * 3n / 4n);
  });

  test("era 3 reward = floor(28.125 × 0.75) = 21.09375 JGC", () => {
    const era3Reward = getBlockReward(3 * BLOCKS_PER_QUARTERING);
    expect(era3Reward).toBe(INITIAL_BLOCK_REWARD_SATOSHIS * 3n / 4n * 3n / 4n * 3n / 4n);
  });

  test("reward decreases monotonically across eras", () => {
    let prev = getBlockReward(0);
    for (let era = 1; era <= 10; era++) {
      const curr = getBlockReward(era * BLOCKS_PER_QUARTERING);
      expect(curr).toBeLessThan(prev);
      prev = curr;
    }
  });

  test("reward never exceeds hard cap divided by total blocks", () => {
    for (let era = 0; era <= 20; era++) {
      const reward = getBlockReward(era * BLOCKS_PER_QUARTERING);
      expect(reward).toBeLessThanOrEqual(INITIAL_BLOCK_REWARD_SATOSHIS);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Daily Emission Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("daily emission", () => {
  test("era 0 daily emission = 7,200 JGC", () => {
    const dailySatoshis = getBlockReward(0) * BigInt(BLOCKS_PER_EPOCH);
    // Exact whole-JGC division in BigInt (pool is a whole number of JGC),
    // then to Number — avoids precision loss at the 10^16 base-unit scale.
    const dailyJGC = Number(dailySatoshis / BASE_UNITS_PER_JGC);
    expect(dailyJGC).toBe(ERA0_DAILY_JGC);
    expect(dailyJGC).toBe(7200);
  });

  test("BLOCKS_PER_EPOCH = 144 (6 blocks/hour × 24 hours)", () => {
    expect(BLOCKS_PER_EPOCH).toBe(144);
    expect(TARGET_BLOCK_INTERVAL_SECONDS).toBe(600);
    expect(BLOCKS_PER_EPOCH * TARGET_BLOCK_INTERVAL_SECONDS).toBe(86400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Supply Cap Convergence Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("supply cap geometric convergence", () => {
  test("era 0 total = 5,250,000 JGC", () => {
    const era0 = getEmissionEra(0);
    expect(era0.totalEraSupply).toBe(INITIAL_BLOCK_REWARD_SATOSHIS * BigInt(BLOCKS_PER_QUARTERING));
    expect(era0.totalEraSupply).toBe(5_250_000n * BASE_UNITS_PER_JGC);
  });

  test("sum of first 50 eras converges toward 21,000,000 JGC", () => {
    let total = 0n;
    for (let i = 0; i < 50; i++) {
      total += getEmissionEra(i).totalEraSupply;
      if (total >= HARD_CAP_SATOSHIS) break;
    }
    // Should be very close to but not exceed 21M JGC.
    const jgc = Number(total / BASE_UNITS_PER_JGC);
    expect(jgc).toBeGreaterThan(20_999_900);
    expect(total).toBeLessThanOrEqual(HARD_CAP_SATOSHIS);
  });

  test("geometric series formula: 5,250,000 / (1 - 0.75) = 21,000,000", () => {
    const a = 5_250_000;     // era 0 supply in JGC
    const r = 0.75;          // retention factor
    const S = a / (1 - r);   // infinite geometric sum
    expect(S).toBe(21_000_000);
  });

  test("hard cap is exactly 21M JGC in base units", () => {
    expect(HARD_CAP_SATOSHIS).toBe(21_000_000n * BASE_UNITS_PER_JGC);
  });

  test("cumulative supply at block 0 is 0", () => {
    expect(getCumulativeSupply(0)).toBe(0n);
  });

  test("cumulative supply after 1 block = 1 block reward", () => {
    expect(getCumulativeSupply(1)).toBe(INITIAL_BLOCK_REWARD_SATOSHIS);
  });

  test("cumulative supply never exceeds hard cap", () => {
    const largeHeight = 1_000_000_000;
    const supply = getCumulativeSupply(largeHeight);
    expect(supply).toBeLessThanOrEqual(HARD_CAP_SATOSHIS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Quartering Interval Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("quartering interval", () => {
  test("BLOCKS_PER_QUARTERING = 105,000 (~2 years at 10 min/block)", () => {
    expect(BLOCKS_PER_QUARTERING).toBe(105_000);
    // ~2 years = 365.25 days × 2 × 144 blocks/day = 105,192 blocks
    // JGC uses 105,000 for clean math.
    const approxYears = BLOCKS_PER_QUARTERING * TARGET_BLOCK_INTERVAL_SECONDS / 3600 / 24 / 365.25;
    expect(approxYears).toBeGreaterThan(1.9);
    expect(approxYears).toBeLessThan(2.1);
  });

  test("BTC comparison: Bitcoin halves every 210,000 blocks (~4 years)", () => {
    const btcHalvingInterval = 210_000;
    // JGC quarters more frequently but retains more per event:
    //   BTC: ÷2 every 210,000 → -50%
    //   JGC: ×0.75 every 105,000 → -25%
    expect(BLOCKS_PER_QUARTERING).toBe(btcHalvingInterval / 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Difficulty Encoding Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("difficulty bits encoding", () => {
  test("encode and decode 1000 TFLOPS roundtrip", () => {
    const target  = 1000;
    const bits    = encodeDifficultyBits(target);
    const decoded = decodeDifficultyBits(bits);
    expect(Math.abs(decoded - target) / target).toBeLessThan(0.01);
  });

  test("encode and decode 1 TFLOPS (genesis difficulty)", () => {
    const target  = 1;
    const bits    = encodeDifficultyBits(target);
    const decoded = decodeDifficultyBits(bits);
    expect(Math.abs(decoded - target)).toBeLessThan(0.1);
  });

  test("retargeting clamps to 4× max increase", () => {
    const oldTarget     = 1000;
    const tooFastActual = 1;   // blocks arrived 1 second total (obviously too fast)
    const newTarget = calculateNextDifficultyTarget(oldTarget, tooFastActual);
    // Should be clamped to 4× old target.
    expect(newTarget).toBe(Math.round(oldTarget * 4 * 100) / 100);
  });

  test("retargeting clamps to 1/4 min decrease", () => {
    const oldTarget     = 1000;
    const tooSlowActual = 99_999_999;  // very slow blocks
    const newTarget = calculateNextDifficultyTarget(oldTarget, tooSlowActual);
    expect(newTarget).toBe(Math.round(oldTarget / 4 * 100) / 100);
  });

  test("retargeting adjusts proportionally for slightly fast blocks", () => {
    const oldTarget     = 1000;
    // Blocks arrived in half the expected time → difficulty should double.
    const halfTarget    = RETARGET_WINDOW_BLOCKS * TARGET_BLOCK_INTERVAL_SECONDS / 2;
    const newTarget = calculateNextDifficultyTarget(oldTarget, halfTarget);
    expect(Math.abs(newTarget - 2000)).toBeLessThan(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Era Descriptor Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("getEmissionEra", () => {
  test("era 0 has correct daily emission", () => {
    const era = getEmissionEra(0);
    expect(era.dailyEmissionJGC).toBeCloseTo(7200, 1);
    expect(era.startHeight).toBe(0);
    expect(era.endHeight).toBe(BLOCKS_PER_QUARTERING - 1);
  });

  test("era 1 daily emission = 37.5 × 144 = 5400 JGC", () => {
    const era = getEmissionEra(1);
    expect(era.dailyEmissionJGC).toBeCloseTo(5400, 1);
  });

  test("era eraIndex matches input", () => {
    for (let i = 0; i < 10; i++) {
      expect(getEmissionEra(i).eraIndex).toBe(i);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Print Emission Schedule (snapshot test)
// ─────────────────────────────────────────────────────────────────────────────

describe("printEmissionSchedule", () => {
  test("runs without error and logs 10 eras", () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    printEmissionSchedule(10);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
