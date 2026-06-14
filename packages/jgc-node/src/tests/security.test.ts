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
import { makeGenesisBlock, makeContribution, DEFAULT_MINERS } from "../sim/harness.js";
import { assembleBlock, createGenesisHeader, hashBlockHeader, GENESIS_DIFFICULTY_BITS } from "../consensus/block.js";
import { initEpochState, applyBlockToEpoch } from "../consensus/epoch.js";
import { UTXOSet } from "../consensus/utxo.js";
import { BASE_UNITS_PER_JGC } from "../consensus/emission.js";

beforeAll(async () => { await loadVerifierWasm({ mode: "simnet" }); });

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
});
