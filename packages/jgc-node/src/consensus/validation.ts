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
 *      - Post-quantum hash-based proof check for each ComputeProof (via pq.ts)
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
 *   before paying the post-quantum proof verification cost (Step 2).
 *   This matches Bitcoin's design where CheckBlock's header check rejects
 *   malformed blocks before the expensive script validation in CheckTxInputs.
 */

import type {
  Block, BlockHeader, Transaction, MinerComputeContribution,
  EpochState, BlockHeight, JGCSatoshis,
} from "../types/index.js";
import {
  computeAuditVerdictsMerkleRoot,
  computeTransactionMerkleRoot,
  GENESIS_BLOCK_VERSION,
  hashBlockHeader,
} from "./block.js";
import { computeContributionsMerkleRoot, computeEpochRoot, computeEpochSettlement, applyBlockToEpoch } from "./epoch.js";
import { decodeDifficultyBits, BLOCKS_PER_EPOCH, HARD_CAP_SATOSHIS } from "./emission.js";
import {
  getQuantumVerifierMode,
  quantumVerifyContributionSignature,
  quantumVerifyProofForConsensus,
  quantumScriptPubKeyFromAddress,
} from "../crypto/pq.js";
import { UTXOSet, validateSpend } from "./utxo.js";
import { verifyMerkleProof, getMerkleProof, buildMerkleTree, hashComputeProof } from "../crypto/merkle.js";
import { validateAuditVerdictRecord } from "../broker/audit-protocol.js";
import { auditWindow, computeAuditClaimId } from "../broker/audit-schedule.js";

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
  INVALID_SIGNATURE        = "INVALID_SIGNATURE",
  DUPLICATE_CONTRIBUTION   = "DUPLICATE_CONTRIBUTION",
  INSUFFICIENT_TFLOPS      = "INSUFFICIENT_TFLOPS",
  COMPUTE_ROOT_MISMATCH    = "COMPUTE_ROOT_MISMATCH",

  // Transaction errors
  EMPTY_TRANSACTIONS       = "EMPTY_TRANSACTIONS",
  INVALID_COINBASE         = "INVALID_COINBASE",
  COINBASE_OVERFLOW        = "COINBASE_OVERFLOW",
  MERKLE_ROOT_MISMATCH     = "MERKLE_ROOT_MISMATCH",
  AUDIT_ROOT_MISMATCH      = "AUDIT_ROOT_MISMATCH",
  INVALID_AUDIT_VERDICT    = "INVALID_AUDIT_VERDICT",
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
  /** Milliseconds spent on post-quantum proof verification (profiling). */
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
  // Version check — v2 commits signed historical-audit evidence.
  // BITCOIN: nVersion must not be negative; BIP 34/65/66/CSV version bits enforced.
  if (header.version !== GENESIS_BLOCK_VERSION) {
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
  _epochBlockIndex: number,  // unused: PQ verification is height-gated, not epoch-indexed
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

  // ── Reject duplicate contributions ────────────────────────────────────────
  // A miner gets ONE contribution per block, and each task is proven once;
  // otherwise a miner could resubmit the same proof K times and multiply its
  // pro-rata TFLOPS share (applyBlockToEpoch sums per address).
  const seenMiners = new Set<string>();
  const seenTasks  = new Set<string>();
  for (const c of contributions) {
    if (seenMiners.has(c.minerAddress)) {
      return fail(ValidationError.DUPLICATE_CONTRIBUTION,
        `Duplicate contribution from miner ${c.minerAddress} in one block`);
    }
    if (seenTasks.has(c.proof.taskCommitment)) {
      return fail(ValidationError.DUPLICATE_CONTRIBUTION,
        `Duplicate taskCommitment ${c.proof.taskCommitment.slice(0, 16)}… in one block`);
    }
    seenMiners.add(c.minerAddress);
    seenTasks.add(c.proof.taskCommitment);
  }

  // ── Signature verification (strict mode) ─────────────────────────────────
  // Each contribution must be signed by the key controlling its payout address,
  // over a sighash binding the proven work and this height. Cheap — runs before
  // the expensive pairing checks. Skipped in "simnet" mode (placeholder sigs).
  if (getQuantumVerifierMode() === "strict") {
    for (let i = 0; i < contributions.length; i++) {
      const sigOk = quantumVerifyContributionSignature(contributions[i]!, currentHeight);
      if (!sigOk) {
        return {
          valid: false,
          errors: [ValidationError.INVALID_SIGNATURE],
          warnings: [`Contribution ${i} (miner ${contributions[i]!.minerAddress}): ML-DSA signature invalid`],
        };
      }
    }
  }

  // ── Post-quantum proof verification (replaces Groth16 pairing checks) ────
  const zkStart = Date.now();

  // Per-proof minimum: 10% of block target (prevents thousands of tiny proofs).
  const perProofMin = difficultyTarget * 0.1;

  const verificationResults = contributions.map(c =>
    quantumVerifyProofForConsensus(c.proof, currentHeight, perProofMin)
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
  const settlement = computeEpochSettlement(epochState, epochIndex);

  if (coinbaseTx.outputs.length !== settlement.payouts.length) {
    return fail(
      ValidationError.INVALID_EPOCH_SETTLEMENT,
      `Coinbase has ${coinbaseTx.outputs.length} outputs, expected ${settlement.payouts.length}`
    );
  }

  // Verify each output's exact script and amount against the settlement.
  // computeEpochSettlement guarantees sum(payouts[i].satoshis) === pool exactly
  // (the lowest-TFLOPS miner absorbs the floor residual), so per-output exact
  // checks are sufficient — no separate total-pool guard needed.
  for (let i = 0; i < settlement.payouts.length; i++) {
    const payout = settlement.payouts[i]!;
    const output = coinbaseTx.outputs[i]!;
    const expectedScript = quantumScriptPubKeyFromAddress(payout.minerAddress);

    if (output.scriptPubKey !== expectedScript) {
      return fail(
        ValidationError.INVALID_EPOCH_SETTLEMENT,
        `Coinbase output ${i}: scriptPubKey ${output.scriptPubKey} does not match miner ${payout.minerAddress}`
      );
    }

    if (output.value !== payout.satoshis) {
      return fail(
        ValidationError.INVALID_EPOCH_SETTLEMENT,
        `Coinbase output ${i}: value ${output.value} != expected ${payout.satoshis} for miner ${payout.minerAddress}`
      );
    }
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
  /** Current UTXO set (chainstate). When present, every non-coinbase tx (tx[1..])
   *  is validated against it: inputs exist & unspent, authorized, value conserved. */
  utxos?: UTXOSet;
  /** Active-chain historical block lookup, required when a block carries audits. */
  getActiveBlock?: (height: BlockHeight) => Block | undefined;
  /** True when this audit id is already committed on the active chain. */
  hasCommittedAudit?: (auditId: string) => boolean;
}

const MAX_AUDIT_VERDICTS_PER_BLOCK = 64;

export function validateAuditVerdicts(
  block: Block,
  context: Pick<BlockValidationContext, "getActiveBlock" | "hasCommittedAudit">,
): ValidationResult {
  if (!Array.isArray(block.auditVerdicts)) {
    return fail(ValidationError.INVALID_AUDIT_VERDICT, "Block audit verdict body is missing");
  }
  if (block.auditVerdicts.length > MAX_AUDIT_VERDICTS_PER_BLOCK) {
    return fail(
      ValidationError.INVALID_AUDIT_VERDICT,
      `Block carries ${block.auditVerdicts.length} audits; maximum is ${MAX_AUDIT_VERDICTS_PER_BLOCK}`,
    );
  }
  if (block.auditVerdicts.some((record) =>
    !record || typeof record.auditId !== "string" || !/^[0-9a-f]{64}$/i.test(record.auditId)
  )) {
    return fail(ValidationError.INVALID_AUDIT_VERDICT, "Block contains a malformed audit id");
  }

  const expectedRoot = computeAuditVerdictsMerkleRoot(block.auditVerdicts);
  if (block.header.auditRoot !== expectedRoot) {
    return fail(
      ValidationError.AUDIT_ROOT_MISMATCH,
      `Header auditRoot: ${block.header.auditRoot} ≠ computed: ${expectedRoot}`,
    );
  }
  if (block.auditVerdicts.length === 0) return ok();
  if (!context.getActiveBlock || !context.hasCommittedAudit) {
    return fail(
      ValidationError.INVALID_AUDIT_VERDICT,
      "Historical chain lookup is required to validate audit evidence",
    );
  }

  const seen = new Set<string>();
  let previousAuditId = "";
  for (const record of block.auditVerdicts) {
    if (seen.has(record.auditId) ||
        (previousAuditId && previousAuditId.localeCompare(record.auditId) >= 0)) {
      return fail(
        ValidationError.INVALID_AUDIT_VERDICT,
        "Audit verdicts must be unique and in canonical audit-id order",
      );
    }
    if (context.hasCommittedAudit(record.auditId)) {
      return fail(ValidationError.INVALID_AUDIT_VERDICT, `Audit ${record.auditId} is already committed`);
    }

    const evidenceError = validateAuditVerdictRecord(record);
    if (evidenceError) {
      return fail(
        ValidationError.INVALID_AUDIT_VERDICT,
        `Audit ${record.auditId}: ${evidenceError}`,
      );
    }

    const assignment = record.request.assignment;
    if (record.finalizedAtHeight >= block.header.height ||
        assignment.claimHeight >= block.header.height ||
        assignment.beaconHeight >= block.header.height) {
      return fail(
        ValidationError.INVALID_AUDIT_VERDICT,
        `Audit ${record.auditId} does not predate its containing block`,
      );
    }

    let window: ReturnType<typeof auditWindow>;
    try {
      window = auditWindow(assignment.windowIndex);
    } catch {
      return fail(ValidationError.INVALID_AUDIT_VERDICT, `Audit ${record.auditId} has an invalid window`);
    }
    if (assignment.claimHeight < window.startHeight ||
        assignment.claimHeight > window.endHeight ||
        assignment.beaconHeight !== window.beaconHeight) {
      return fail(
        ValidationError.INVALID_AUDIT_VERDICT,
        `Audit ${record.auditId} does not match its deterministic window`,
      );
    }

    const beaconBlock = context.getActiveBlock(assignment.beaconHeight);
    if (!beaconBlock || hashBlockHeader(beaconBlock.header) !== assignment.beaconHash.toLowerCase()) {
      return fail(
        ValidationError.INVALID_AUDIT_VERDICT,
        `Audit ${record.auditId} beacon is not on the active chain`,
      );
    }

    const claimBlock = context.getActiveBlock(assignment.claimHeight);
    if (!claimBlock) {
      return fail(
        ValidationError.INVALID_AUDIT_VERDICT,
        `Audit ${record.auditId} claim block is not on the active chain`,
      );
    }
    const claimHash = hashBlockHeader(claimBlock.header);
    const claim = claimBlock.computeProofs.find((contribution, index) =>
      computeAuditClaimId(claimHash, index) === assignment.claimId &&
      contribution.minerAddress === assignment.claimantId &&
      contribution.proof.taskCommitment.toLowerCase() === assignment.commitment.toLowerCase()
    );
    if (!claim) {
      return fail(
        ValidationError.INVALID_AUDIT_VERDICT,
        `Audit ${record.auditId} claim is not on the active chain`,
      );
    }

    seen.add(record.auditId);
    previousAuditId = record.auditId;
  }
  return ok();
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
    // tx[0] is the block coinbase (epoch-settlement payout at the boundary, or a
    // no-spend marker otherwise); all others are ordinary spends.
    const txResult = validateTransaction(block.transactions[i]!, i === 0);
    if (!txResult.valid) {
      return {
        valid: false,
        errors: [ValidationError.INVALID_TRANSACTION],
        warnings: [`tx[${i}]: ${txResult.warnings.join(", ")}`],
      };
    }
  }

  // ── Step 2b: Spend validation against the UTXO set ────────────────────────
  // Every non-coinbase tx must spend existing, unspent, authorized (P2PKH-signed)
  // outputs and conserve value (Σin ≥ Σout). Validated against a scratch copy so
  // a tx can spend an earlier tx's output in the same block; the canonical set is
  // updated by the node on accept. (No-op for coinbase-only blocks, e.g. simnet.)
  if (context.utxos) {
    const view = context.utxos.clone();
    for (let i = 1; i < block.transactions.length; i++) {
      const tx = block.transactions[i]!;
      const spend = validateSpend(tx, view, context.expectedHeight);
      if (!spend.ok) {
        return {
          valid: false,
          errors: [ValidationError.INVALID_TRANSACTION],
          warnings: [`tx[${i}] spend invalid: ${spend.error}`],
        };
      }
      view.applyTransaction(tx, context.expectedHeight, false);
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

  // ── Step 4: Historical audit evidence ─────────────────────────────────────
  const auditResult = validateAuditVerdicts(block, context);
  if (!auditResult.valid) return auditResult;

  // ── Step 5: Epoch root ────────────────────────────────────────────────────
  const epochRootResult = validateEpochRoot(header, context.epochState);
  if (!epochRootResult.valid) return epochRootResult;

  // ── Step 6: ZK Proof verification (core PoUC check) ──────────────────────
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

  // ── Step 7: Coinbase validation at epoch boundary ─────────────────────────
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
  } else {
    // ── Non-boundary coinbase must NOT create value ─────────────────────────
    // JGC defers ALL reward — subsidy AND fees — to the epoch-boundary settlement
    // (fees are added to the epoch pool and distributed pro-rata). So tx[0] in
    // every other block must mint nothing. Without this, a miner could pay itself
    // arbitrary outputs in any normal block (acceptBlock adds tx[0] outputs to the
    // UTXO set) — the inflation guard for the only otherwise-unconstrained value.
    const minted = block.transactions[0]!.outputs.reduce((s, o) => s + o.value, 0n);
    if (minted > 0n) {
      return fail(ValidationError.INVALID_COINBASE,
        `Non-boundary coinbase mints ${minted} (reward + fees are paid only at the epoch boundary)`);
    }
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
