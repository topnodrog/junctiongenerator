/**
 * @file src/consensus/epoch.ts
 * @description Epoch accumulator and proportional payout settlement.
 *
 * EPOCH SYSTEM OVERVIEW
 * ──────────────────────
 * Bitcoin distributes a coinbase reward to ONE miner per block.
 * JGC accumulates all TFLOPS contributions over 144 blocks (1 epoch = 1 day),
 * then settles pro-rata at the epoch boundary block (height % 144 === 143).
 *
 * This design:
 *   1. Rewards all contributing miners fairly (not just block proposers).
 *   2. Smooths variance — a small miner accumulates contributions steadily.
 *   3. Aligns incentives: miners submit proofs to the network even when they
 *      didn't "win" the block slot.
 *   4. Reduces coinbase transaction bloat by batching all payouts into one
 *      settlement transaction per epoch.
 *
 * EPOCH FLOW:
 *   Block 0:   epochState initialized, miners submit proofs → TFLOPS accumulated
 *   Block 1–142: proofs accumulated, epochState updated in each block header
 *   Block 143:  EPOCH BOUNDARY — settlement tx generated, payouts distributed
 *   Block 144:  new epoch begins (same as block 0 pattern)
 *
 * PAYOUT FORMULA:
 *   For miner m with tflopsM TFLOPS-seconds contributed:
 *   payout(m) = epochRewardPool × (tflopsM / totalEpochTFLOPS)
 *
 *   epochRewardPool = sum of blockReward(h) for h in [epochStart, epochStart+143]
 *                   + all transaction fees collected in the epoch
 *
 * JUNCTION GENERATOR AI CLUSTER PRIORITY:
 *   Per the system spec, compute is used primarily for the JG internal AI
 *   cluster.  Excess compute (beyond consensus requirements) is brokered.
 *   This is tracked in EpochState.jgClusterTFLOPS vs. brokerTFLOPS.
 */

import { createHash } from "crypto";
import type {
  Address, BlockHeight, EpochState, JGCSatoshis, MinerComputeContribution,
} from "../types/index.js";
import { getBlockReward, BLOCKS_PER_EPOCH } from "./emission.js";
import { buildMerkleTree, hashComputeProof } from "../crypto/merkle.js";
import type { Hash256 } from "../types/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Payout entry in the epoch settlement transaction. */
export interface EpochPayoutEntry {
  minerAddress: Address;
  satoshis: JGCSatoshis;
  tflopsContributed: number;
  sharePercent: number;
}

/** Full result of epoch settlement computation. */
export interface EpochSettlement {
  epochIndex: number;
  epochStartHeight: BlockHeight;
  epochEndHeight: BlockHeight;
  totalRewardPool: JGCSatoshis;
  totalTFLOPS: number;
  payouts: EpochPayoutEntry[];
  settlementTxHash: Hash256;
}

// ─────────────────────────────────────────────────────────────────────────────
// Epoch State Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize a fresh EpochState at an epoch boundary.
 *
 * @param epochStartHeight  Must be a multiple of BLOCKS_PER_EPOCH.
 * @param epochStartTime    UNIX timestamp of the epoch's first block.
 */
export function initEpochState(
  epochStartHeight: BlockHeight,
  epochStartTime:   number,
): EpochState {
  if (epochStartHeight % BLOCKS_PER_EPOCH !== 0) {
    throw new RangeError(
      `epochStartHeight ${epochStartHeight} is not a multiple of ${BLOCKS_PER_EPOCH}`
    );
  }

  return {
    epochStartHeight,
    epochBlockIndex:    0,
    totalEpochTFLOPS:   0,
    minerContributions: new Map<Address, number>(),
    pendingRewardPool:  0n,
    epochStartTime,
  };
}

/**
 * Apply a new block's compute contributions to the epoch accumulator.
 *
 * Called by the consensus layer for every block processed.
 * Modifies epochState in-place (the caller holds the canonical state object).
 *
 * @param epochState   Current mutable epoch accumulator.
 * @param contributions  All verified MinerComputeContributions in this block.
 * @param blockHeight  Absolute block height.
 * @param blockFees    Total transaction fees collected in this block (satoshis).
 */
export function applyBlockToEpoch(
  epochState:    EpochState,
  contributions: MinerComputeContribution[],
  blockHeight:   BlockHeight,
  blockFees:     JGCSatoshis,
): void {
  const expectedEpochIndex = epochState.epochBlockIndex;
  const actualEpochIndex   = blockHeight % BLOCKS_PER_EPOCH;

  if (actualEpochIndex !== expectedEpochIndex) {
    throw new Error(
      `Epoch block index mismatch: expected ${expectedEpochIndex}, got ${actualEpochIndex} ` +
      `(height ${blockHeight})`
    );
  }

  // Add this block's subsidy to the pending pool.
  const blockSubsidy = getBlockReward(blockHeight);
  epochState.pendingRewardPool += blockSubsidy + blockFees;

  // Accumulate each miner's TFLOPS contribution.
  for (const contrib of contributions) {
    const addr  = contrib.minerAddress;
    const tflops = contrib.proof.tflopsWeight;

    epochState.totalEpochTFLOPS += tflops;

    const existing = epochState.minerContributions.get(addr) ?? 0;
    epochState.minerContributions.set(addr, existing + tflops);
  }

  epochState.epochBlockIndex++;
}

// ─────────────────────────────────────────────────────────────────────────────
// Epoch Settlement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the proportional payouts for all miners in the completed epoch.
 *
 * BITCOIN COMPARISON:
 *   Bitcoin: coinbase(block n) = GetBlockSubsidy(n) + fees(block n)
 *            → single miner receives 100% of that block's reward.
 *
 *   JGC: settlement(epoch e) = sum of all 144 block subsidies + all fees
 *        → distributed proportionally: payout(m) = pool × tflops(m) / total
 *
 * PRECISION HANDLING:
 *   Pro-rata is computed in EXACT BigInt arithmetic — payout = pool × tflopsM /
 *   totalTFLOPS with integer floor division — never via floating point. At the
 *   16-decimal scale the pool (~7.2e19 base units) far exceeds
 *   Number.MAX_SAFE_INTEGER (9.007e15), so any Number() round-trip would corrupt
 *   the result; BigInt keeps every base unit exact. Miners are settled in
 *   descending-TFLOPS order; the LAST entry (the lowest-TFLOPS contributor) is
 *   paid `pool - distributed`, absorbing the accumulated floor residual so the
 *   payouts sum to the pool exactly (no base unit lost). A single deterministic
 *   absorber keeps settlement reproducible across nodes.
 *
 * @param epochState   Completed epoch state (epochBlockIndex must equal 144).
 * @param epochIndex   Epoch sequence number (epochStartHeight / 144).
 * @returns EpochSettlement with all payout entries.
 */
export function computeEpochSettlement(
  epochState: EpochState,
  epochIndex: number,
): EpochSettlement {
  if (epochState.epochBlockIndex !== BLOCKS_PER_EPOCH) {
    throw new Error(
      `Epoch not complete: epochBlockIndex=${epochState.epochBlockIndex}, expected ${BLOCKS_PER_EPOCH}`
    );
  }

  const pool      = epochState.pendingRewardPool;
  const totalTFLOPS = epochState.totalEpochTFLOPS;
  const epochStart  = epochState.epochStartHeight;
  const epochEnd    = epochStart + BLOCKS_PER_EPOCH - 1;

  // Edge case: no compute proofs submitted (shouldn't happen on mainnet —
  // no compute = no valid blocks — but handle for testnet robustness).
  if (totalTFLOPS === 0 || epochState.minerContributions.size === 0) {
    return {
      epochIndex,
      epochStartHeight: epochStart,
      epochEndHeight:   epochEnd,
      totalRewardPool:  pool,
      totalTFLOPS:      0,
      payouts:          [],
      settlementTxHash: "0".repeat(64),
    };
  }

  // Sort miners descending by TFLOPS; the last (lowest-TFLOPS) entry absorbs the
  // floor residual so payouts sum to the pool exactly.
  const sorted = Array.from(epochState.minerContributions.entries())
    .sort(([, a], [, b]) => b - a);

  // TFLOPS contributions are integer counts; convert once for exact BigInt math.
  const totalT = BigInt(totalTFLOPS);

  const payouts: EpochPayoutEntry[] = [];
  let distributed = 0n;

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i]!;
    const [address, tflops] = entry;

    let satoshis: JGCSatoshis;
    if (i === sorted.length - 1) {
      // Last (lowest-TFLOPS) miner absorbs the accumulated floor residual.
      satoshis = pool - distributed;
    } else {
      // Exact integer floor division — no Number() round-trip (see PRECISION note).
      satoshis = (pool * BigInt(tflops)) / totalT;
    }

    distributed += satoshis;
    payouts.push({
      minerAddress: address,
      satoshis,
      tflopsContributed: tflops,
      sharePercent: (tflops / totalTFLOPS) * 100,  // display only
    });
  }

  // Compute a canonical hash of the settlement for inclusion in the block.
  const settlementTxHash = hashEpochSettlement(epochIndex, epochStart, pool, payouts);

  return {
    epochIndex,
    epochStartHeight: epochStart,
    epochEndHeight:   epochEnd,
    totalRewardPool:  pool,
    totalTFLOPS,
    payouts,
    settlementTxHash,
  };
}

/**
 * Compute the Merkle root of all MinerComputeContributions.
 * This becomes the computeRoot in the BlockHeader.
 *
 * @param contributions All contributions for a block.
 * @returns Merkle root hash.
 */
export function computeContributionsMerkleRoot(
  contributions: MinerComputeContribution[],
): Hash256 {
  if (contributions.length === 0) return "0".repeat(64);

  const leaves = contributions.map(c =>
    hashComputeProof({
      taskCommitment: c.proof.taskCommitment,
      proofBytes:     c.proof.proofBytes,
      circuitId:      c.proof.circuitId,
      tflopsWeight:   c.proof.tflopsWeight,
    })
  );

  return buildMerkleTree(leaves).root;
}

/**
 * Compute the Merkle root of the epoch accumulator state.
 * Committed in each block header as epochRoot for auditability.
 */
export function computeEpochRoot(epochState: EpochState): Hash256 {
  // Serialize the contribution map into a canonical sorted byte string.
  const entries = Array.from(epochState.minerContributions.entries())
    .sort(([a], [b]) => a.localeCompare(b));

  const hasher = createHash("sha256");
  hasher.update(
    Buffer.from(
      JSON.stringify({
        epochStartHeight: epochState.epochStartHeight,
        epochBlockIndex:  epochState.epochBlockIndex,
        totalTFLOPS:      epochState.totalEpochTFLOPS,
        pool:             epochState.pendingRewardPool.toString(),
        contributions:    entries,
      })
    )
  );
  const first = hasher.digest();
  return createHash("sha256").update(first).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Canonical hash of an epoch settlement (for transaction ID generation). */
function hashEpochSettlement(
  epochIndex:   number,
  epochStart:   BlockHeight,
  pool:         JGCSatoshis,
  payouts:      EpochPayoutEntry[],
): Hash256 {
  const data = Buffer.from(
    JSON.stringify({
      epochIndex,
      epochStart,
      pool: pool.toString(),
      payouts: payouts.map(p => ({
        addr: p.minerAddress,
        sats: p.satoshis.toString(),
      })),
    })
  );
  const first = createHash("sha256").update(data).digest();
  return createHash("sha256").update(first).digest("hex");
}

/**
 * Serialize EpochState to a plain object for JSON persistence / P2P broadcast.
 * (Map is not JSON-serializable natively.)
 */
export function serializeEpochState(state: EpochState): Record<string, unknown> {
  return {
    epochStartHeight:   state.epochStartHeight,
    epochBlockIndex:    state.epochBlockIndex,
    totalEpochTFLOPS:   state.totalEpochTFLOPS,
    pendingRewardPool:  state.pendingRewardPool.toString(),
    epochStartTime:     state.epochStartTime,
    minerContributions: Object.fromEntries(state.minerContributions),
  };
}

/** Deserialize EpochState from JSON (reverses serializeEpochState). */
export function deserializeEpochState(raw: Record<string, unknown>): EpochState {
  return {
    epochStartHeight:   raw["epochStartHeight"] as number,
    epochBlockIndex:    raw["epochBlockIndex"]  as number,
    totalEpochTFLOPS:   raw["totalEpochTFLOPS"] as number,
    pendingRewardPool:  BigInt(raw["pendingRewardPool"] as string),
    epochStartTime:     raw["epochStartTime"]   as number,
    minerContributions: new Map(
      Object.entries(raw["minerContributions"] as Record<string, number>)
    ),
  };
}
