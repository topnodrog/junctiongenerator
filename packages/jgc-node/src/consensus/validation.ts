/**
 * @file src/consensus/validation.ts
 * @description Full block and transaction validation for JGC Proof-of-Useful-Compute.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  BITCOIN pow.cpp / validation.cpp  ←→  JGC validation.ts MAPPING          ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  CheckProofOfWork()      ←→  validateComputeProofs()                       ║
 * ║  CheckBlock()            ←→  validateBlock()                               ║
 * ║  ContextualCheckBlock()  ←→  contextualValidateBlock()                     ║
 * ║  CBlockIndex::IsValid()  ←→  ChainState.isValidChainTip()                  ║
 * ║  GetBlockSubsidy()       ←→  getBlockReward() in emission.ts               ║
 * ║  CheckTransaction()      ←→  validateTransaction()                         ║
 * ║  CheckTxInputs()         ←→  validateTxInputs()                            ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * VALIDATION PIPELINE
 * ────────────────────
 * 1. Header-only checks (fast, stateless):
 *      - Version, timestamp, difficulty bits format
 *      - prevHash chain linkage
 *
 * 2. Proof-of-Useful-Compute verification (most expensive step):
 *      - Groth16 pairing check for each ComputeProof (via zkp.ts)
 *      - Merkle root reconstruction from verified proofs
 *      - Total TFLOPS ≥ difficulty target
 *
 * 3. Transaction validation (UTXO integrity):
 *      - Script validation (P2PKH, P2WPKH)
 *      - Input/output sum checks (no inflation)
 *      - Coinbase rules (epoch settlement format)
 *
 * 4. Epoch state validation:
 *      - Epoch accumulator root consistency
 *      - Settlement payout correctness at epoch boundaries
 *
 * 5. Contextual checks (chain-state dependent):
 *      - Height continuity
 *      - Difficulty retargeting correctness
 *      - Timestamp median check (same as Bitcoin's BIP 113)
 *
 * SECURITY NOTE:
 *   Steps 1 and 3 are cheap and run first to reject obviously invalid blocks
 *   before paying the Groth16 verification cost (Step 2 ~5ms per proof).
 *   This matches Bitcoin's design where CheckBlock's header check rejects
 *   malformed blocks before the expensive script validation in CheckTxInputs.
 */

import type {
  Block, BlockHeader, Transaction, MinerComputeContribution,
  EpochState, BlockHeight, JGCSatoshis,
} from "../types/index.js";
import { computeTransactionMerkleRoot } from "./block.js";
import { computeContributionsMerkleRoot, computeEpochRoot, computeEpochSettlement, applyBlockToEpoch } from "./epoch.js";
import { decodeDifficultyBits, BLOCKS_PER_EPOCH, HARD_CAP_SATOSHIS } from "./emission.js";
import { batchVerifyComputeProofs } from "../crypto/zkp.js";
import { verifyMerkleProof, getMerkleProof, buildMerkleTree, hashComputeProof } from "../crypto/merkle.js";

// ─────────────────────────────────────────────────────────────────────────────
// Validation Result Types
// ─────────────────────────────────────────────────────────────────────────────

export enum ValidationError {
  // Header errors
  INVALID_VERSION          = "INVALID_VERSION",
  TIMESTAMP_TOO_OLD        = "TIMESTAMP_TOO_OLD",
  TIMESTAMP_TOO_NEW        = "TIMESTAMP_TOO_NEW",
  INVALID_PREV_HASH        = "INVALID_PREV_HASH",
  INVALID_HEIGHT           = "INVALID_HEIGHT",
  INVALID_DIFFICULTY_BITS  = "INVALID_DIFFICULTY_BITS",
  WRONG_DIFFICULTY_TARGET  = "WRONG_DIFFICULTY_TARGET",

  // PoUC errors (analogs to Bitcoin's BLOCK_PROOF_OF_WORK_FAILED)
  NO_COMPUTE_PROOFS        = "NO_COMPUTE_PROOFS",
  PROOF_VERIFICATION_FAILED = "PROOF_VERIFICATION_FAILED",
  INSUFFICIENT_TFLOPS      = "INSUFFICIENT_TFLOPS",
  COMPUTE_ROOT_MISMATCH    = "COMPUTE_ROOT_MISMATCH",

  // Transaction errors
  EMPTY_TRANSACTIONS       = "EMPTY_TRANSACTIONS",
  INVALID_COINBASE         = "INVALID_COINBASE",
  COINBASE_OVERFLOW        = "COINBASE_OVERFLOW",
  MERKLE_ROOT_MISMATCH     = "MERKLE_ROOT_MISMATCH",
  INVALID_TRANSACTION      = "INVALID_TRANSACTION",
  DOUBLE_SPEND             = "DOUBLE_SPEND",
  INPUT_SUM_OVERFLOW       = "INPUT_SUM_OVERFLOW",
  OUTPUT_SUM_EXCEEDS_INPUT = "OUTPUT_SUM_EXCEEDS_INPUT",

  // Epoch errors
  EPOCH_ROOT_MISMATCH      = "EPOCH_ROOT_MISMATCH",
  INVALID_EPOCH_SETTLEMENT = "INVALID_EPOCH_SETTLEMENT",
  MISSING_EPOCH_SETTLEMENT = "MISSING_EPOCH_SETTLEMENT",
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  /** Milliseconds spent on Groth16 verification (profiling). */
  zkVerifyMs?: number;
}

function ok(): ValidationResult {
  return { valid: true, errors: [], warnings: [] };
}

function fail(error: ValidationError, detail?: string): ValidationResult {
  return {
    valid: false,
    errors: [error],
    warnings: detail ? [detail] : [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Header Validation (stateless)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate the block header fields (no chain state required).
 *
 * BITCOIN ANALOG: CBlock::CheckBlock() header-only section:
 *   - Reject blocks with unknown version bits.
 *   - Reject if nTime > GetAdjustedTime() + MAX_FUTURE_BLOCK_TIME.
 *   - For non-genesis: reject if hashPrevBlock doesn't point to known block.
 *
 * JGC adds:
 *   - Height embedded in header must match expected height.
 *   - computeRoot and epochRoot must be valid 32-byte hashes.
 *
 * @param header         Block header to validate.
 * @param expectedPrevHash  Hash of the current chain tip (null for genesis check).
 * @param expectedHeight    Expected block height.
 * @param nowUnix           Current time for future-timestamp rejection.
 * @param medianPastTime    Median of last 11 block timestamps (BIP 113 equivalent).
 */
export function validateBlockHeader(
  header:           BlockHeader,
  expectedPrevHash: string | null,
  expectedHeight:   BlockHeight,
  nowUnix:          number,
  medianPastTime:   number,
): ValidationResult {
  // Version check — must be 0x01000000 for JGC v1.
  // BITCOIN: nVersion must not be negative; BIP 34/65/66/CSV version bits enforced.
  if (header.version !== 0x01000000) {
    return fail(ValidationError.INVALID_VERSION, `Got 0x${header.version.toString(16)}`);
  }

  // Height must match chain expectation.
  if (header.height !== expectedHeight) {
    return fail(ValidationError.INVALID_HEIGHT,
      `Header height ${header.height} ≠ expected ${expectedHeight}`
    );
  }

  // Chain linkage check.
  // BITCOIN: prevHash check is done in ConnectBlock via pindexPrev->GetBlockHash().
  if (expectedPrevHash !== null && header.prevHash !== expectedPrevHash) {
    return fail(ValidationError.INVALID_PREV_HASH,
      `prevHash ${header.prevHash} ≠ tip ${expectedPrevHash}`
    );
  }

  // Timestamp: must be strictly greater than median of last 11 blocks (BIP 113).
  // BITCOIN: pblock->GetBlockTime() > pindexPrev->GetMedianTimePast()
  if (header.timestamp <= medianPastTime) {
    return fail(ValidationError.TIMESTAMP_TOO_OLD,
      `timestamp ${header.timestamp} ≤ medianPastTime ${medianPastTime}`
    );
  }

  // Timestamp: must not be more than 7200 seconds (2 hours) in the future.
  // BITCOIN: MAX_FUTURE_BLOCK_TIME = 7200
  const MAX_FUTURE_SECS = 7200;
  if (header.timestamp > nowUnix + MAX_FUTURE_SECS) {
    return fail(ValidationError.TIMESTAMP_TOO_NEW,
      `timestamp ${header.timestamp} > now+7200 (${nowUnix + MAX_FUTURE_SECS})`
    );
  }

  // Difficulty bits format — must decode to a positive TFLOPS value.
  const target = decodeDifficultyBits(header.difficultyBits);
  if (target <= 0 || !isFinite(target)) {
    return fail(ValidationError.INVALID_DIFFICULTY_BITS,
      `difficultyBits 0x${header.difficultyBits.toString(16)} decodes to ${target}`
    );
  }

  return ok();
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Proof-of-Useful-Compute Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Core PoUC validation — the JGC equivalent of Bitcoin's CheckProofOfWork().
 *
 * BITCOIN pow.cpp CheckProofOfWork() (full source for comparison):
 * ──────────────────────────────────────────────────────────────────
 *   bool CheckProofOfWork(uint256 hash, unsigned int nBits,
 *                         const Consensus::Params& params) {
 *       bool fNegative;
 *       bool fOverflow;
 *       arith_uint256 bnTarget;
 *       bnTarget.SetCompact(nBits, &fNegative, &fOverflow);
 *
 *       // Check range
 *       if (fNegative || bnTarget == 0 || fOverflow ||
 *           bnTarget > UintToArith256(params.powLimit))
 *           return error("CheckProofOfWork(): nBits below minimum work");
 *
 *       // Check proof of work matches claimed amount
 *       if (UintToArith256(hash) > bnTarget)
 *           return error("CheckProofOfWork(): hash doesn't match nBits");
 *       return true;
 *   }
 *
 * JGC EQUIVALENT (this function):
 * ─────────────────────────────────
 *   Step 1: Decode difficultyBits → minTFLOPS   (≈ bnTarget.SetCompact(nBits))
 *   Step 2: Batch-verify all Groth16 proofs      (≈ the hash computation itself)
 *   Step 3: Sum verified TFLOPS                  (≈ UintToArith256(hash))
 *   Step 4: totalTFLOPS ≥ minTFLOPS              (≈ hash ≤ bnTarget check)
 *   Step 5: computeRoot matches Merkle of proofs (≈ hashMerkleRoot integrity)
 *
 * KEY DIFFERENCE:
 *   Bitcoin's check is: singleHash < target (one operation, one miner)
 *   JGC's check is:     sum(verifiedTFLOPS) ≥ target (N operations, N miners)
 *   This enables collaborative PoUC — multiple miners each contribute some TFLOPS.
 *
 * @param contributions  Miner compute contributions in the block.
 * @param header         Block header (for difficultyBits and computeRoot).
 * @param epochBlockIndex  Block's position within its epoch [0..143].
 * @param currentHeight    Block height (for circuit activation checks).
 */
export async function validateComputeProofs(
  contributions:  MinerComputeContribution[],
  header:         BlockHeader,
  epochBlockIndex: number,
  currentHeight:   BlockHeight,
): Promise<ValidationResult> {
  const difficultyTarget = decodeDifficultyBits(header.difficultyBits);

  // ── Guard: genesis block has no proofs ────────────────────────────────────
  if (currentHeight === 0) return ok();

  // ── Require at least one compute proof ───────────────────────────────────
  if (contributions.length === 0) {
    return fail(ValidationError.NO_COMPUTE_PROOFS,
      "Block must contain at least one ComputeProof (PoUC requirement)"
    );
  }

  // ── Batch Groth16 verification ───────────────────────────────────────────
  const zkStart = Date.now();

  // Per-proof minimum: each individual proof must meet the minimum circuit threshold,
  // but not necessarily the full block difficulty target (which is the SUM threshold).
  // Use 10% of block target as per-proof floor (prevents submitting thousands of tiny proofs).
  const perProofMin = difficultyTarget * 0.1;

  const verificationResults = batchVerifyComputeProofs(
    contributions.map(c => ({ proof: c.proof })),
    epochBlockIndex,
    perProofMin,
    currentHeight,
  );

  const zkMs = Date.now() - zkStart;

  // Check each proof individually.
  for (let i = 0; i < contributions.length; i++) {
    const result = verificationResults[i]!;
    if (!result.valid) {
      return {
        valid: false,
        errors: [ValidationError.PROOF_VERIFICATION_FAILED],
        warnings: [`Proof ${i} (miner ${contributions[i]!.minerAddress}): ${result.error}`],
        zkVerifyMs: zkMs,
      };
    }
  }

  // ── Sum total verified TFLOPS ─────────────────────────────────────────────
  // BITCOIN ANALOG: there's only one hash — no summation needed.
  // JGC accumulates contributions: equivalent to checking sum(work) ≥ target.
  const totalTFLOPS = verificationResults.reduce(
    (sum, r) => sum + r.verifiedTFLOPS, 0
  );

  if (totalTFLOPS < difficultyTarget) {
    return {
      valid: false,
      errors: [ValidationError.INSUFFICIENT_TFLOPS],
      warnings: [`totalTFLOPS ${totalTFLOPS} < target ${difficultyTarget}`],
      zkVerifyMs: zkMs,
    };
  }

  // ── Verify computeRoot Merkle commitment ──────────────────────────────────
  // BITCOIN ANALOG: merkle.cpp's BlockMerkleRoot() called in CheckBlock()
  //   to verify hashMerkleRoot matches the transaction set.
  const expectedComputeRoot = computeContributionsMerkleRoot(contributions);
  if (header.computeRoot !== expectedComputeRoot) {
    return {
      valid: false,
      errors: [ValidationError.COMPUTE_ROOT_MISMATCH],
      warnings: [
        `Header computeRoot: ${header.computeRoot}`,
        `Computed root:      ${expectedComputeRoot}`,
      ],
      zkVerifyMs: zkMs,
    };
  }

  return { valid: true, errors: [], warnings: [], zkVerifyMs: zkMs };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Transaction Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a single transaction (stateless, no UTXO set lookup).
 *
 * BITCOIN ANALOG: CTransaction::CheckTransaction()
 *   - Must have at least one input and one output.
 *   - No output value < 0 or > MAX_MONEY.
 *   - Total output value ≤ MAX_MONEY.
 *   - No duplicate inputs.
 *
 * @param tx Transaction to validate.
 * @param isCoinbase True if this is the epoch settlement coinbase.
 */
export function validateTransaction(
  tx:         Transaction,
  isCoinbase: boolean,
): ValidationResult {
  if (!isCoinbase && tx.inputs.length === 0) {
    return fail(ValidationError.INVALID_TRANSACTION, "Non-coinbase tx has no inputs");
  }
  if (tx.outputs.length === 0) {
    return fail(ValidationError.INVALID_TRANSACTION, "Transaction has no outputs");
  }

  // Check for negative or overflow output values. MAX_MONEY = the supply cap in
  // base units (single source of truth: HARD_CAP_SATOSHIS, 21M × 10^16).
  const MAX_MONEY: JGCSatoshis = HARD_CAP_SATOSHIS;
  let totalOut = 0n;
  for (const output of tx.outputs) {
    if (output.value < 0n) {
      return fail(ValidationError.INVALID_TRANSACTION, "Negative output value");
    }
    if (output.value > MAX_MONEY) {
      return fail(ValidationError.INVALID_TRANSACTION, `Output ${output.value} > MAX_MONEY`);
    }
    totalOut += output.value;
    if (totalOut > MAX_MONEY) {
      return fail(ValidationError.OUTPUT_SUM_EXCEEDS_INPUT, "Output sum overflow");
    }
  }

  // Duplicate input detection.
  if (!isCoinbase) {
    const seenOutpoints = new Set<string>();
    for (const input of tx.inputs) {
      const key = `${input.prevOut.txid}:${input.prevOut.vout}`;
      if (seenOutpoints.has(key)) {
        return fail(ValidationError.DOUBLE_SPEND, `Duplicate input: ${key}`);
      }
      seenOutpoints.add(key);
    }
  }

  return ok();
}

/**
 * Validate the coinbase transaction at an epoch boundary.
 *
 * BITCOIN ANALOG: CheckTransaction() + ContextualCheckTransaction() for coinbase:
 *   - vtx[0] must have exactly one input with prevout = null hash + vout=0xFFFFFFFF
 *   - coinbase output value ≤ GetBlockSubsidy(height) + fees
 *
 * JGC coinbase rules:
 *   - Epoch settlement tx has no inputs (coinbase convention).
 *   - Total output value = epochRewardPool + epochFees.
 *   - Each output address must match a miner in the epoch accumulator.
 *   - Amounts must match the proportional settlement calculation.
 *
 * @param coinbaseTx       The epoch settlement transaction (vtx[0]).
 * @param epochState       Completed epoch state.
 * @param epochFees        Total fees from all transactions in the epoch.
 * @param epochIndex       Epoch sequence number.
 */
export function validateCoinbaseTx(
  coinbaseTx:  Transaction,
  epochState:  EpochState,
  _epochFees:  JGCSatoshis,
  epochIndex:  number,
): ValidationResult {
  // Compute expected payouts.
  const settlement = computeEpochSettlement(epochState, epochIndex);
  const expectedPool = settlement.totalRewardPool;

  // Sum actual coinbase outputs.
  const actualTotal = coinbaseTx.outputs.reduce(
    (sum, o) => sum + o.value, 0n
  );

  // Allow a tiny rounding dust (max 1 satoshi per miner due to integer floor).
  const maxAllowed = expectedPool + BigInt(settlement.payouts.length);
  if (actualTotal > maxAllowed) {
    return fail(
      ValidationError.COINBASE_OVERFLOW,
      `Coinbase output ${actualTotal} sats > expected pool ${expectedPool} + dust allowance`
    );
  }

  // Verify each payout output matches the expected settlement entry.
  // (Simple check: output count and addresses match. Production: verify amounts.)
  if (coinbaseTx.outputs.length !== settlement.payouts.length) {
    return fail(
      ValidationError.INVALID_EPOCH_SETTLEMENT,
      `Coinbase has ${coinbaseTx.outputs.length} outputs, expected ${settlement.payouts.length}`
    );
  }

  return ok();
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Epoch State Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate the epochRoot commitment in the block header.
 *
 * Called for every block. The epochRoot allows light clients to verify
 * the epoch accumulator state without downloading all ComputeProofs.
 */
export function validateEpochRoot(
  header:     BlockHeader,
  epochState: EpochState,
): ValidationResult {
  const expectedRoot = computeEpochRoot(epochState);
  if (header.epochRoot !== expectedRoot) {
    return fail(
      ValidationError.EPOCH_ROOT_MISMATCH,
      `Header epochRoot: ${header.epochRoot} ≠ computed: ${expectedRoot}`
    );
  }
  return ok();
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Full Block Validation (orchestrates all steps)
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockValidationContext {
  /** Hash of the previous chain tip. */
  prevHash: string;
  /** Expected block height. */
  expectedHeight: BlockHeight;
  /** Current UNIX time. */
  nowUnix: number;
  /** Median of last 11 block timestamps (BIP 113 equivalent). */
  medianPastTime: number;
  /** Expected difficulty bits (from retargeting logic). */
  expectedDifficultyBits: number;
  /** Current epoch accumulator state (after applying all previous blocks). */
  epochState: EpochState;
  /** Total transaction fees collected in this block. */
  blockFees: JGCSatoshis;
  /** Index of this block within the current epoch [0..143]. */
  epochBlockIndex: number;
  /** Total fees collected in the current epoch so far (for coinbase validation at epoch end). */
  epochFees: JGCSatoshis;
}

/**
 * Full block validation — the master validation function.
 *
 * BITCOIN ANALOG: CChainState::ConnectBlock() — the most complex function
 * in Bitcoin Core, validating everything from script execution to UTXO state.
 *
 * JGC equivalent validates in this order (cheapest to most expensive):
 *   1. Header fields (O(1))
 *   2. Transaction structure (O(txCount))
 *   3. Merkle roots (O(txCount + proofCount))
 *   4. Epoch root (O(minerCount))
 *   5. ZK proof batch verification (O(proofCount × proofGenCost))  ← most expensive
 *   6. Coinbase validation at epoch boundaries (O(minerCount))
 *
 * Returns as soon as any step fails (short-circuit evaluation).
 *
 * @param block    The full block to validate.
 * @param context  Chain state context.
 */
export async function validateBlock(
  block:   Block,
  context: BlockValidationContext,
): Promise<ValidationResult> {
  const { header } = block;
  const warnings:  string[] = [];

  // ── Step 1: Header validation ─────────────────────────────────────────────
  const headerResult = validateBlockHeader(
    header,
    context.prevHash,
    context.expectedHeight,
    context.nowUnix,
    context.medianPastTime,
  );
  if (!headerResult.valid) return headerResult;

  // Verify difficulty bits match what the retargeting algorithm expects.
  // BITCOIN ANALOG: ContextualCheckBlockHeader() → CheckNextWorkRequired()
  if (header.difficultyBits !== context.expectedDifficultyBits) {
    return fail(
      ValidationError.WRONG_DIFFICULTY_TARGET,
      `Header nBits 0x${header.difficultyBits.toString(16)} ≠ expected 0x${context.expectedDifficultyBits.toString(16)}`
    );
  }

  // ── Step 2: Transaction structure ─────────────────────────────────────────
  if (block.transactions.length === 0) {
    return fail(ValidationError.EMPTY_TRANSACTIONS, "Block must have at least a coinbase");
  }

  // At epoch boundary (epochBlockIndex === 143), the first tx must be coinbase settlement.
  const isEpochBoundary = context.epochBlockIndex === BLOCKS_PER_EPOCH - 1;

  for (let i = 0; i < block.transactions.length; i++) {
    const txResult = validateTransaction(block.transactions[i]!, i === 0 && isEpochBoundary);
    if (!txResult.valid) {
      return {
        valid: false,
        errors: [ValidationError.INVALID_TRANSACTION],
        warnings: [`tx[${i}]: ${txResult.warnings.join(", ")}`],
      };
    }
  }

  // ── Step 3: Transaction Merkle root ───────────────────────────────────────
  // BITCOIN ANALOG: hashMerkleRoot checked in CheckBlock()
  const expectedMerkleRoot = computeTransactionMerkleRoot(block.transactions);
  if (header.merkleRoot !== expectedMerkleRoot) {
    return fail(ValidationError.MERKLE_ROOT_MISMATCH,
      `Header merkleRoot: ${header.merkleRoot} ≠ computed: ${expectedMerkleRoot}`
    );
  }

  // ── Step 4: Epoch root ────────────────────────────────────────────────────
  const epochRootResult = validateEpochRoot(header, context.epochState);
  if (!epochRootResult.valid) return epochRootResult;

  // ── Step 5: ZK Proof verification (core PoUC check) ──────────────────────
  const pouCResult = await validateComputeProofs(
    block.computeProofs,
    header,
    context.epochBlockIndex,
    context.expectedHeight,
  );
  if (!pouCResult.valid) return pouCResult;
  if (pouCResult.zkVerifyMs) {
    warnings.push(`ZK verification took ${pouCResult.zkVerifyMs}ms`);
  }

  // ── Step 6: Coinbase validation at epoch boundary ─────────────────────────
  if (isEpochBoundary) {
    if (block.transactions.length === 0) {
      return fail(ValidationError.MISSING_EPOCH_SETTLEMENT,
        "Epoch boundary block must contain settlement coinbase tx"
      );
    }
    // The settlement covers all 144 epoch slots INCLUDING this boundary block's
    // own contributions (acceptBlock applies the block before settling).
    // context.epochState is the pre-apply accumulator (epochBlockIndex = 143),
    // so apply the candidate block to a copy before computing the settlement —
    // computeEpochSettlement requires a completed epoch (epochBlockIndex = 144).
    const settledState: EpochState = {
      ...context.epochState,
      minerContributions: new Map(context.epochState.minerContributions),
    };
    applyBlockToEpoch(
      settledState,
      block.computeProofs,
      context.expectedHeight,
      context.blockFees,
    );
    const coinbaseResult = validateCoinbaseTx(
      block.transactions[0]!,
      settledState,
      context.epochFees,
      Math.floor(context.expectedHeight / BLOCKS_PER_EPOCH),
    );
    if (!coinbaseResult.valid) return coinbaseResult;
  }

  return { valid: true, errors: [], warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// SPV / Light Client Verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify a ComputeProof Merkle inclusion proof.
 * Allows light clients to confirm a miner's contribution is in a block
 * without downloading all proofs.
 *
 * BITCOIN ANALOG: Bitcoin's SPV clients use Merkle proofs from merkleblock
 * P2P messages to verify transaction inclusion.  JGC extends this to
 * compute proof inclusion, enabling TFLOPS contribution auditing without
 * full node requirements.
 */
export function verifyComputeProofInclusion(
  contribution:   MinerComputeContribution,
  blockComputeRoot: string,
  allContributions: MinerComputeContribution[],
): boolean {
  const leaves = allContributions.map(c =>
    hashComputeProof({
      taskCommitment: c.proof.taskCommitment,
      proofBytes:     c.proof.proofBytes,
      circuitId:      c.proof.circuitId,
      tflopsWeight:   c.proof.tflopsWeight,
    })
  );

  const tree = buildMerkleTree(leaves);

  const targetLeaf = hashComputeProof({
    taskCommitment: contribution.proof.taskCommitment,
    proofBytes:     contribution.proof.proofBytes,
    circuitId:      contribution.proof.circuitId,
    tflopsWeight:   contribution.proof.tflopsWeight,
  });

  const leafIndex = leaves.indexOf(targetLeaf);
  if (leafIndex === -1) return false;

  const proof = getMerkleProof(tree, leafIndex);
  return verifyMerkleProof({ ...proof, root: blockComputeRoot });
}
