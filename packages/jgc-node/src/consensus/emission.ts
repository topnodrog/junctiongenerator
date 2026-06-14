/**
 * @file src/consensus/emission.ts
 * @description JGC supply schedule, halving (quartering) logic, and coinbase math.
 *
 * SUPPLY MODEL — JGC vs BITCOIN
 * ──────────────────────────────
 *
 * BITCOIN:
 *   Initial reward: 50 BTC/block
 *   Halving interval: 210,000 blocks (~4 years at 10min/block)
 *   Reduction factor: ÷2 (exactly 50% cut)
 *   Era n reward: floor(50×10^8 / 2^n) satoshis
 *   Hard cap: 50×210000 / (1-0.5) = 21,000,000 BTC  (geometric series)
 *   Source: src/validation.cpp GetBlockSubsidy()
 *
 * JGC:
 *   Initial reward: 50 JGC/block
 *   Quartering interval: 105,000 blocks (~2 years at 10min/block)
 *   Reduction factor: ×0.75 (25% cut, retaining 75%)
 *   Era n reward: floor(50×10^8 × 0.75^n) satoshis
 *   Hard cap: 5,250,000 / (1-0.75) = 21,000,000 JGC  (same geometric formula)
 *   Daily emission (era 0): 50 × 144 = 7,200 JGC/day
 *
 * GEOMETRIC SERIES VERIFICATION:
 *   a  = 50 JGC × 105,000 blocks = 5,250,000 JGC  (Era 0 total)
 *   r  = 0.75 (retention factor)
 *   S  = a / (1 - r) = 5,250,000 / 0.25 = 21,000,000 JGC  ✓
 *
 * ERA TABLE (first 10 eras):
 *   Era | Reward/block | Start height | End height | Era total supply
 *   ────┼──────────────┼──────────────┼────────────┼──────────────────
 *    0  | 50.000 JGC   |     0        |   104,999  | 5,250,000.0 JGC
 *    1  | 37.500 JGC   | 105,000      |   209,999  | 3,937,500.0 JGC
 *    2  | 28.125 JGC   | 210,000      |   314,999  | 2,953,125.0 JGC
 *    3  | 21.094 JGC   | 315,000      |   419,999  | 2,214,843.75 JGC
 *    4  | 15.820 JGC   | 420,000      |   524,999  | 1,661,132.8 JGC
 *    5  | 11.865 JGC   | 525,000      |   629,999  | 1,245,849.6 JGC
 *    6  |  8.899 JGC   | 630,000      |   734,999  |   934,387.2 JGC
 *    7  |  6.674 JGC   | 735,000      |   839,999  |   700,790.4 JGC
 *    8  |  5.006 JGC   | 840,000      |   944,999  |   525,592.8 JGC
 *    9  |  3.754 JGC   | 945,000      | 1,049,999  |   394,194.6 JGC
 *
 * NOTE ON BASE-UNIT PRECISION:
 *   JGC internal arithmetic uses integer base units (the JGC "satoshi").
 *   1 JGC = 10^16 base units (16 decimals) — far finer than Bitcoin's 1e8 so a
 *   day-long pro-rata payout can be split among very large numbers of compute
 *   contributors without small participants rounding to zero.
 *   Because 21,000,000 × 10^16 = 2.1e23 exceeds a signed 64-bit integer, all
 *   amounts are BigInt and the canonical wire format must use a >64-bit
 *   (u128 / varint) money field — unlike Bitcoin, which fits supply in int64.
 *   blockReward(era) = floor(50 × 10^16 × 0.75^era) — integer floor prevents
 *   excess emission, identical in spirit to Bitcoin's floor(50e8 / 2^era).
 */

import type { BlockHeight, EmissionEra, JGCSatoshis } from "../types/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Decimal places for JGC: 1 JGC = 10^DECIMALS base units. */
export const DECIMALS: number = 16;

/**
 * Base units per whole JGC — the smallest indivisible unit (the JGC "satoshi").
 * 16 decimals so epoch pro-rata payouts never round small contributors to zero.
 */
export const BASE_UNITS_PER_JGC: JGCSatoshis = 10n ** 16n;

/** Initial block reward in base units (50 JGC). */
export const INITIAL_BLOCK_REWARD_SATOSHIS: JGCSatoshis = 50n * BASE_UNITS_PER_JGC;

/** Blocks per quartering interval (~2 years). Compare: Bitcoin = 210,000. */
export const BLOCKS_PER_QUARTERING: number = 105_000;

/** Retention fraction numerator — reward × 75% = reward × 3/4. */
export const RETENTION_NUMERATOR: bigint = 3n;

/** Retention fraction denominator. */
export const RETENTION_DENOMINATOR: bigint = 4n;

/** Hard supply cap in base units: 21,000,000 JGC × 10^16. */
export const HARD_CAP_SATOSHIS: JGCSatoshis = 21_000_000n * BASE_UNITS_PER_JGC;

/** Blocks per epoch (24-hour payout cycle). */
export const BLOCKS_PER_EPOCH: number = 144;

/** Target block interval in seconds (600s = 10 minutes, same as Bitcoin). */
export const TARGET_BLOCK_INTERVAL_SECONDS: number = 600;

/** Daily JGC emission at Era 0 (informational): 50 × 144 = 7,200 JGC. */
export const ERA0_DAILY_JGC: number = 7_200;

// ─────────────────────────────────────────────────────────────────────────────
// Core Emission Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate the era index for a given block height.
 *
 * BITCOIN ANALOG: src/validation.cpp
 *   int halvings = nHeight / consensusParams.nSubsidyHalvingInterval;
 *
 * JGC:
 *   eraIndex = floor(height / BLOCKS_PER_QUARTERING)
 *
 * @param height Block height (0-indexed from genesis).
 * @returns Era index (0 = genesis era, 1 = first quartering, ...).
 */
export function getEraIndex(height: BlockHeight): number {
  return Math.floor(height / BLOCKS_PER_QUARTERING);
}

/**
 * Calculate the block reward in satoshis for a given block height.
 *
 * BITCOIN ANALOG (validation.cpp GetBlockSubsidy):
 *   CAmount GetBlockSubsidy(int nHeight, const Consensus::Params& consensusParams) {
 *       int halvings = nHeight / consensusParams.nSubsidyHalvingInterval;
 *       if (halvings >= 64) return 0;           // ← Bitcoin returns 0 after 64 halvings
 *       CAmount nSubsidy = 50 * COIN;
 *       nSubsidy >>= halvings;                  // ← right-shift = divide by 2^halvings
 *       return nSubsidy;
 *   }
 *
 * JGC EQUIVALENT:
 *   reward(era) = floor(50×10^8 × (3/4)^era)
 *
 *   We use BigInt integer arithmetic to avoid floating-point precision loss:
 *   reward = INITIAL × 3^era / 4^era
 *   (computed iteratively to avoid BigInt exponentiation on large era values)
 *
 * At some large era, floor(reward) reaches 0 — no new emission. The exact
 * era depends on the initial value: floor(50e8 × 0.75^n) → 0 when n ≈ 267.
 * This mirrors Bitcoin's 64-halvings cutoff.
 *
 * @param height Block height.
 * @returns Block subsidy in satoshis (0 after all JGC has been emitted).
 */
export function getBlockReward(height: BlockHeight): JGCSatoshis {
  const era = getEraIndex(height);

  // Iterative BigInt multiplication to preserve precision.
  // reward = floor(50×10^8 × (3/4)^era)
  // = floor(50×10^8 × 3^era / 4^era)
  // Computed as: start with INITIAL_BLOCK_REWARD_SATOSHIS, multiply by 3,
  // divide by 4 (integer floor), repeat era times.
  let reward = INITIAL_BLOCK_REWARD_SATOSHIS;
  for (let i = 0; i < era; i++) {
    reward = (reward * RETENTION_NUMERATOR) / RETENTION_DENOMINATOR;
    if (reward === 0n) return 0n;
  }

  return reward;
}

/**
 * Calculate total JGC emitted up to (but not including) a given block height.
 * Useful for circulating supply queries and supply cap validation.
 *
 * Computed by summing complete era totals then adding the partial current era.
 *
 * @param height Block height (exclusive upper bound).
 * @returns Cumulative satoshis emitted.
 */
export function getCumulativeSupply(height: BlockHeight): JGCSatoshis {
  let totalSatoshis = 0n;
  let h = 0;

  while (h < height) {
    const reward       = getBlockReward(h);
    if (reward === 0n) break;  // no further emission

    const eraStart     = getEraIndex(h) * BLOCKS_PER_QUARTERING;
    const eraEnd       = eraStart + BLOCKS_PER_QUARTERING;
    const blocksInEra  = Math.min(eraEnd, height) - h;

    totalSatoshis += reward * BigInt(blocksInEra);
    h = eraEnd;

    if (h >= height) break;
  }

  // Hard cap: never exceed 21M JGC.
  return totalSatoshis > HARD_CAP_SATOSHIS ? HARD_CAP_SATOSHIS : totalSatoshis;
}

/**
 * Check whether a coinbase transaction value is valid.
 *
 * BITCOIN ANALOG: src/validation.cpp CheckTransaction() + CBlock.vtx[0] coinbase check.
 *   Bitcoin: coinbaseValue ≤ GetBlockSubsidy(nHeight) + totalFees
 *
 * JGC: coinbase transactions are only generated at epoch boundaries (every 144
 * blocks).  This function validates that the epoch settlement tx does not
 * exceed the accumulated epoch reward pool.
 *
 * @param claimedAmount    Satoshi value in the epoch settlement coinbase.
 * @param epochStartHeight Height of the first block in the epoch.
 * @param totalFeesInEpoch Total transaction fees accumulated in the epoch.
 * @returns true if claimedAmount is valid.
 */
export function isValidEpochCoinbase(
  claimedAmount:     JGCSatoshis,
  epochStartHeight:  BlockHeight,
  totalFeesInEpoch:  JGCSatoshis,
): boolean {
  // Accumulate block rewards for all 144 blocks in the epoch.
  let epochRewardPool = 0n;
  for (let i = 0; i < BLOCKS_PER_EPOCH; i++) {
    epochRewardPool += getBlockReward(epochStartHeight + i);
  }

  const maxAllowed = epochRewardPool + totalFeesInEpoch;
  return claimedAmount <= maxAllowed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Era Descriptor Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate the EmissionEra descriptor for a given era index.
 * Used by block explorers, wallets, and supply-monitoring dashboards.
 */
export function getEmissionEra(eraIndex: number): EmissionEra {
  const startHeight = eraIndex * BLOCKS_PER_QUARTERING;
  const endHeight   = startHeight + BLOCKS_PER_QUARTERING - 1;
  const blockReward = getBlockReward(startHeight);
  const totalEraSupply = blockReward * BigInt(BLOCKS_PER_QUARTERING);

  return {
    eraIndex,
    startHeight,
    endHeight,
    blockRewardSatoshis: blockReward,
    dailyEmissionJGC: Number(blockReward) / 1e16 * BLOCKS_PER_EPOCH,
    totalEraSupply,
  };
}

/**
 * Print a human-readable emission schedule (for documentation/debugging).
 * Matches the ERA TABLE in the file header.
 */
export function printEmissionSchedule(eras: number = 10): void {
  console.log("JGC Emission Schedule:");
  console.log(
    "Era | Reward/block (JGC) | Start height | End height | Era total (JGC)"
  );
  console.log("─".repeat(80));

  let cumulative = 0n;
  for (let i = 0; i < eras; i++) {
    const era = getEmissionEra(i);
    if (era.blockRewardSatoshis === 0n) break;
    cumulative += era.totalEraSupply;
    const rewardJGC = Number(era.blockRewardSatoshis) / 1e16;
    const eraTotal  = Number(era.totalEraSupply) / 1e16;
    const cumulJGC  = Number(cumulative) / 1e16;
    console.log(
      `  ${String(i).padStart(2)} | ${rewardJGC.toFixed(9).padStart(18)} | ` +
      `${String(era.startHeight).padStart(12)} | ${String(era.endHeight).padStart(10)} | ` +
      `${eraTotal.toFixed(4).padStart(15)} (cumul: ${cumulJGC.toFixed(0)})`
    );
  }
  console.log(`\n  Hard cap: 21,000,000 JGC`);
  console.log(`  Geometric series: 5,250,000 / (1 - 0.75) = 21,000,000 ✓`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Difficulty Adjustment (retargeting)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retargeting constants — identical window to Bitcoin but in TFLOPS-space.
 *
 * BITCOIN pow.cpp CalculateNextWorkRequired():
 *   nActualTimespan = pindexLast->nTime - pindexFirst->nTime
 *   nTargetTimespan = nPowTargetTimespan (= 14 * 24 * 60 * 60 = 1,209,600 s)
 *   Clamped: nActualTimespan = max/min(nTargetTimespan/4, nTargetTimespan*4)
 *   newTarget = oldTarget * nActualTimespan / nTargetTimespan
 */
export const RETARGET_WINDOW_BLOCKS = 2016;
export const RETARGET_TARGET_SECONDS = RETARGET_WINDOW_BLOCKS * TARGET_BLOCK_INTERVAL_SECONDS;

/**
 * Calculate the new TFLOPS difficulty target.
 *
 * BITCOIN ANALOG: pow.cpp CalculateNextWorkRequired()
 *
 * JGC maps hash-rate difficulty to TFLOPS-rate difficulty:
 *   - If blocks arrived faster than expected, raise the TFLOPS target (harder).
 *   - If blocks arrived slower, lower the TFLOPS target (easier).
 *   - Clamp to [oldTarget/4, oldTarget×4] — same 4× clamp as Bitcoin.
 *
 * @param oldTargetTFLOPS   Previous TFLOPS difficulty target.
 * @param actualTimespan    Actual elapsed seconds over the last 2016 blocks.
 * @returns New TFLOPS difficulty target.
 */
export function calculateNextDifficultyTarget(
  oldTargetTFLOPS: number,
  actualTimespan:  number,
): number {
  // Clamp actual timespan to [target/4, target×4] — same as Bitcoin.
  const clamped = Math.max(
    RETARGET_TARGET_SECONDS / 4,
    Math.min(RETARGET_TARGET_SECONDS * 4, actualTimespan)
  );

  // newTarget = oldTarget × (clamped / targetTimespan)
  // If clamped < target: blocks arrived fast → raise difficulty (result < old? No wait:
  //   fast blocks means actualTimespan < target → clamped/target < 1 → newTarget < old... wait
  //   that lowers difficulty. Let me check: in Bitcoin, lower target = harder.
  //   Bitcoin: newTarget = oldTarget * actual / target  → actual < target → newTarget < old → HARDER.
  //   JGC TFLOPS: HIGHER tflops target = HARDER.
  //   So: if blocks arrived fast (actual < target), we want HIGHER tflops → newTarget = oldTarget * (target/clamped).
  const newTarget = oldTargetTFLOPS * (RETARGET_TARGET_SECONDS / clamped);

  // Floor to a reasonable precision.
  return Math.max(1.0, Math.round(newTarget * 100) / 100);
}

/**
 * Encode a TFLOPS difficulty target in Bitcoin's compact nBits format.
 *
 * nBits format (same as Bitcoin):
 *   The first byte is the exponent; the remaining 3 bytes are the mantissa.
 *   value = mantissa × 256^(exponent - 3)
 *
 * JGC stores the TFLOPS target as a scaled integer (TFLOPS × 10^6) then
 * encodes it using the same compact format Bitcoin uses for hash targets.
 * This allows reuse of Bitcoin-compatible block header parsers.
 *
 * @param tflopsTarget TFLOPS-seconds difficulty target.
 * @returns 32-bit compact encoding (nBits).
 */
export function encodeDifficultyBits(tflopsTarget: number): number {
  // Scale to integer: TFLOPS × 10^6 (micro-TFLOPS precision).
  let value = BigInt(Math.round(tflopsTarget * 1_000_000));
  if (value === 0n) value = 1n;

  // Find the byte length of value.
  let size = 0;
  let temp = value;
  while (temp > 0n) { temp >>= 8n; size++; }

  // Extract the top 3 significant bytes as mantissa.
  const shift     = size > 3 ? (size - 3) * 8 : 0;
  const mantissa  = Number(value >> BigInt(shift)) & 0x00FFFFFF;
  // exponent = byte length of value (same as Bitcoin's nBits exponent field).
  // Bitcoin: compact = (byteLen << 24) | top3bytes; value = top3bytes * 256^(byteLen-3).
  const exponent  = size;

  return (exponent << 24) | mantissa;
}

/**
 * Decode a compact nBits value back to TFLOPS target.
 *
 * BITCOIN ANALOG: arith_uint256.SetCompact() in arith_uint256.h
 *
 * @param compactBits 32-bit nBits value.
 * @returns TFLOPS-seconds difficulty target.
 */
export function decodeDifficultyBits(compactBits: number): number {
  const exponent = (compactBits >> 24) & 0xFF;
  const mantissa = compactBits & 0x00FFFFFF;
  const shift    = exponent - 3;

  if (shift < 0) return mantissa / Math.pow(256, -shift) / 1_000_000;
  const value = BigInt(mantissa) * (256n ** BigInt(shift));
  return Number(value) / 1_000_000;
}
