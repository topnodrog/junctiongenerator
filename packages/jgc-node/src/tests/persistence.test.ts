/**
 * @file src/tests/persistence.test.ts
 * @description Tests for block serialization + the durable BlockStore
 * (BigInt amounts and the EpochState Map must round-trip).
 */

import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";
import type { Block } from "../types/index.js";
import { serializeBlock, deserializeBlock, BlockStore } from "../storage/persistence.js";
import { createGenesisHeader } from "../consensus/block.js";
import { initEpochState, applyBlockToEpoch } from "../consensus/epoch.js";
import { assembleBlock, GENESIS_DIFFICULTY_BITS } from "../consensus/block.js";
import { JGCNode } from "../network/node.js";
import { makeGenesisBlock, makeContribution, DEFAULT_MINERS } from "../sim/harness.js";
import { ComputeTaskType } from "../types/index.js";
import { BASE_UNITS_PER_JGC } from "../consensus/emission.js";
import type { MinerComputeContribution, NodeConfig } from "../types/index.js";

function contrib(addr: string, tflops: number): MinerComputeContribution {
  return {
    minerAddress: addr,
    proof: {
      taskCommitment: "aa".repeat(32), proofBytes: "AAAA", circuitId: "C",
      publicInputs: ["1"], tflopsWeight: tflops, taskType: ComputeTaskType.AI_INFERENCE,
      computeStartedAt: "2026-06-14T00:00:00Z",
    },
    signature: "00".repeat(64), publicKey: "02" + "11".repeat(32),
  };
}

function sampleBlock(): Block {
  const epochState = initEpochState(0, 1_749_600_000);
  applyBlockToEpoch(epochState, [contrib("minerA", 600), contrib("minerB", 450)], 0, 7n);
  return {
    header: createGenesisHeader(),
    transactions: [{
      version: 1, inputs: [],
      outputs: [{ value: 123n * BASE_UNITS_PER_JGC, scriptPubKey: "76a914" + "11".repeat(20) + "88ac" }],
      locktime: 0,
    }],
    computeProofs: [contrib("minerA", 600)],
    epochState,
  };
}

describe("block serialization", () => {
  test("round-trips BigInt amounts and the EpochState Map", () => {
    const block = sampleBlock();
    const back = deserializeBlock(serializeBlock(block));

    expect(back.transactions[0]!.outputs[0]!.value).toBe(123n * BASE_UNITS_PER_JGC);
    expect(back.epochState.minerContributions).toBeInstanceOf(Map);
    expect(back.epochState.minerContributions.get("minerA")).toBe(600);
    expect(back.epochState.minerContributions.get("minerB")).toBe(450);
    expect(back.epochState.pendingRewardPool).toBe(block.epochState.pendingRewardPool);
    expect(typeof back.epochState.pendingRewardPool).toBe("bigint");
    expect(back.header.merkleRoot).toBe(block.header.merkleRoot);
  });
});

describe("BlockStore", () => {
  const dir = join(tmpdir(), `jgc-blockstore-test-${process.pid}`);

  afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

  test("append then loadAll preserves order and content", () => {
    const store = new BlockStore(dir);
    store.clear();
    const b1 = sampleBlock();
    const b2 = sampleBlock();
    b2.transactions[0]!.outputs[0]!.value = 7n;
    store.append(b1);
    store.append(b2);

    const loaded = store.loadAll();
    expect(loaded).toHaveLength(2);
    expect(loaded[0]!.transactions[0]!.outputs[0]!.value).toBe(123n * BASE_UNITS_PER_JGC);
    expect(loaded[1]!.transactions[0]!.outputs[0]!.value).toBe(7n);
    expect(store.count()).toBe(2);
  });

  test("clear empties the store", () => {
    const store = new BlockStore(dir);
    store.append(sampleBlock());
    store.clear();
    expect(store.loadAll()).toHaveLength(0);
  });
});

describe("replay integrity (re-validation on restart)", () => {
  const dir = join(tmpdir(), `jgc-replay-tamper-${process.pid}`);
  const cfg = (): NodeConfig => ({
    listenPort: 0, rpcPort: 0, networkMagic: 0xD9B4BEF9,
    maxPeers: 8, enableBroker: false, junctionGeneratorMode: false, dataDir: dir,
  });

  /** A valid height-1 block on top of genesis (value-0 coinbase). */
  function validHeightOne(): Block {
    const genesis = makeGenesisBlock();
    const mirror = initEpochState(0, genesis.header.timestamp);
    applyBlockToEpoch(mirror, [], 0, 0n);
    const contributions = DEFAULT_MINERS.map(m => makeContribution(m, 1));
    const coinbase = { version: 1, inputs: [], outputs: [{ value: 0n, scriptPubKey: "76a914" + "00".repeat(20) + "88ac" }], locktime: 0 };
    return assembleBlock(genesis.header, [coinbase], contributions, mirror, GENESIS_DIFFICULTY_BITS, 1, genesis.header.timestamp + 600);
  }

  afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

  test("honest store replays to the right tip", () => {
    const store = new BlockStore(dir); store.clear();
    store.append(validHeightOne());
    const node = new JGCNode(cfg(), makeGenesisBlock());
    expect(node.getChainInfo().tipHeight).toBe(1);
  });

  test("tampered stored block makes restart throw", () => {
    const store = new BlockStore(dir); store.clear();
    const tampered = deserializeBlock(serializeBlock(validHeightOne()));
    tampered.transactions[0]!.outputs[0]!.value = 5n * BASE_UNITS_PER_JGC; // breaks merkleRoot
    store.append(tampered);
    expect(() => new JGCNode(cfg(), makeGenesisBlock())).toThrow(/integrity/i);
  });
});
