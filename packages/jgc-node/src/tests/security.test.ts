/**
 * @file src/tests/security.test.ts
 * @description Regression tests for the consensus/crypto review findings:
 *   #1 non-boundary coinbase cannot mint value
 *   #2 duplicate compute contributions are rejected
 *   #3 fractional tflopsWeight is rejected (epoch-settlement DoS guard)
 *   #4 verifierMode "simnet" is forbidden in production
 */

import type { Transaction } from "../types/index.js";
import { ComputeTaskType } from "../types/index.js";
import {
  validateBlock, validateComputeProofs, ValidationError,
  type BlockValidationContext,
} from "../consensus/validation.js";
import { loadVerifierWasm, verifyComputeProof } from "../crypto/zkp.js";
import { setQuantumVerifierMode } from "../crypto/pq.js";
import { makeGenesisBlock, makeContribution, DEFAULT_MINERS } from "../sim/harness.js";
import { assembleBlock, createGenesisHeader, hashBlockHeader, GENESIS_DIFFICULTY_BITS } from "../consensus/block.js";
import { initEpochState, applyBlockToEpoch, computeEpochSettlement } from "../consensus/epoch.js";
import { UTXOSet } from "../consensus/utxo.js";
import { BASE_UNITS_PER_JGC, BLOCKS_PER_EPOCH } from "../consensus/emission.js";
import { quantumScriptPubKeyFromAddress } from "../crypto/pq.js";

beforeAll(async () => {
  setQuantumVerifierMode("simnet");
  await loadVerifierWasm({ mode: "simnet" });
});

/** Build a height-1 block (with a coinbase of `coinbaseValue`) + a context that
 *  is valid for everything EXCEPT the coinbase-value rule under test. */
function heightOneBlock(coinbaseValue: bigint): { block: ReturnType<typeof assembleBlock>; context: BlockValidationContext } {
  const genesis = makeGenesisBlock();
  const mirror = initEpochState(0, genesis.header.timestamp);
  applyBlockToEpoch(mirror, [], 0, 0n); // genesis occupies epoch slot 0
  const contributions = DEFAULT_MINERS.map(m => makeContribution(m, 1));
  const coinbase: Transaction = {
    version: 1, inputs: [],
    outputs: [{ value: coinbaseValue, scriptPubKey: "76a914" + "00".repeat(20) + "88ac" }],
    locktime: 0,
  };
  const block = assembleBlock(genesis.header, [coinbase], contributions, mirror, GENESIS_DIFFICULTY_BITS, 1, genesis.header.timestamp + 600);
  const context: BlockValidationContext = {
    prevHash: hashBlockHeader(genesis.header),
    expectedHeight: 1,
    nowUnix: genesis.header.timestamp + 100_000,
    medianPastTime: genesis.header.timestamp - 1,
    expectedDifficultyBits: GENESIS_DIFFICULTY_BITS,
    epochState: mirror,
    blockFees: 0n,
    epochBlockIndex: 1,
    epochFees: 0n,
    utxos: new UTXOSet(),
  };
  return { block, context };
}

function boundaryBlock(locktime = BLOCKS_PER_EPOCH - 1): {
  block: ReturnType<typeof assembleBlock>;
  context: BlockValidationContext;
} {
  const genesis = makeGenesisBlock();
  const epoch = initEpochState(0, genesis.header.timestamp);
  applyBlockToEpoch(epoch, [], 0, 0n);
  const historicalContributions = DEFAULT_MINERS.map(miner => makeContribution(miner, 1));
  for (let height = 1; height < BLOCKS_PER_EPOCH - 1; height++) {
    applyBlockToEpoch(epoch, historicalContributions, height, 0n);
  }
  const height = BLOCKS_PER_EPOCH - 1;
  const contributions = DEFAULT_MINERS.map(miner => makeContribution(miner, height));
  const settled = {
    ...epoch,
    minerContributions: new Map(epoch.minerContributions),
  };
  applyBlockToEpoch(settled, contributions, height, 0n);
  const settlement = computeEpochSettlement(settled, 0);
  const coinbase: Transaction = {
    version: 1,
    inputs: [],
    outputs: settlement.payouts.map(payout => ({
      value: payout.satoshis,
      scriptPubKey: quantumScriptPubKeyFromAddress(payout.minerAddress),
    })),
    locktime,
  };
  const previousHeader = { ...genesis.header, height: height - 1 };
  const block = assembleBlock(
    previousHeader,
    [coinbase],
    contributions,
    epoch,
    GENESIS_DIFFICULTY_BITS,
    0,
    genesis.header.timestamp + 600,
  );
  return {
    block,
    context: {
      prevHash: hashBlockHeader(previousHeader),
      expectedHeight: height,
      nowUnix: genesis.header.timestamp + 100_000,
      medianPastTime: genesis.header.timestamp - 1,
      expectedDifficultyBits: GENESIS_DIFFICULTY_BITS,
      epochState: epoch,
      blockFees: 0n,
      epochBlockIndex: height,
      epochFees: 0n,
      utxos: new UTXOSet(),
    },
  };
}

describe("security regressions", () => {
  test("#1 non-boundary coinbase that mints value is REJECTED", async () => {
    const { block, context } = heightOneBlock(1_000_000n * BASE_UNITS_PER_JGC);
    const r = await validateBlock(block, context);
    expect(r.valid).toBe(false);
    expect(r.errors).toContain(ValidationError.INVALID_COINBASE);
  });

  test("#1 zero-value coinbase block is accepted (control)", async () => {
    const { block, context } = heightOneBlock(0n);
    const r = await validateBlock(block, context);
    expect(r.valid).toBe(true);
  });

  test("#2 duplicate contribution from the same miner is REJECTED", async () => {
    const c = makeContribution(DEFAULT_MINERS[0]!, 1);
    const r = await validateComputeProofs([c, { ...c }], createGenesisHeader(), 1, 1);
    expect(r.valid).toBe(false);
    expect(r.errors).toContain(ValidationError.DUPLICATE_CONTRIBUTION);
  });

  test("#3 fractional tflopsWeight is REJECTED", () => {
    const r = verifyComputeProof({
      taskCommitment: "aa".repeat(32), proofBytes: "AAAA", circuitId: "CIRCUIT_AI_INFERENCE_V1",
      publicInputs: ["1", "2", "3"], tflopsWeight: 600.5, taskType: ComputeTaskType.AI_INFERENCE,
      computeStartedAt: "2026-06-14T00:00:00Z",
    }, 1, 100, 1);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/integer/i);
  });

  test("#4 simnet verifier mode is forbidden in production", async () => {
    const prev = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";
    try {
      await expect(loadVerifierWasm({ mode: "simnet" })).rejects.toThrow(/simnet/i);
    } finally {
      process.env["NODE_ENV"] = prev;
      await loadVerifierWasm({ mode: "simnet" }); // restore for any later tests
    }
  });

  test("#5 strict consensus rejects the research compute receipt", async () => {
    const contribution = makeContribution(DEFAULT_MINERS[0]!, 1);
    setQuantumVerifierMode("strict");
    try {
      const result = await validateComputeProofs([contribution], createGenesisHeader(), 1, 1);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(ValidationError.PROOF_VERIFICATION_FAILED);
      expect(result.warnings.join(" ")).toMatch(/research receipt|not a sound proof/i);
    } finally {
      setQuantumVerifierMode("simnet");
    }
  });

  test("#6 simnet still enforces ML-DSA contribution signatures", async () => {
    const contribution = makeContribution(DEFAULT_MINERS[0]!, 1);
    contribution.signature = "00";
    const result = await validateComputeProofs([contribution], createGenesisHeader(), 1, 1);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(ValidationError.INVALID_SIGNATURE);
  });

  test("#7 settlement coinbase commits its boundary height", async () => {
    const valid = boundaryBlock();
    await expect(validateBlock(valid.block, valid.context)).resolves.toMatchObject({ valid: true });

    const missingCommitment = boundaryBlock(0);
    const result = await validateBlock(missingCommitment.block, missingCommitment.context);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(ValidationError.INVALID_EPOCH_SETTLEMENT);
    expect(result.warnings.join(" ")).toMatch(/height commitment/i);
  });

  test("#8 settlement coinbase cannot overwrite an unspent outpoint", async () => {
    const candidate = boundaryBlock();
    candidate.context.utxos!.applyTransaction(candidate.block.transactions[0]!, 1, true);

    const result = await validateBlock(candidate.block, candidate.context);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(ValidationError.INVALID_COINBASE);
    expect(result.warnings.join(" ")).toMatch(/overwrite unspent outpoint/i);
  });
});
