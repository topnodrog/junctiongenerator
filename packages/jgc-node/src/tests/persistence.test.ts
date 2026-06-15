/**
 * @file src/tests/persistence.test.ts
 * @description Tests for block serialization + the durable BlockStore
 * (BigInt amounts and the EpochState Map must round-trip).
 */

import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync } from "fs";
import type { Block } from "../types/index.js";
import {
  serializeBlock, deserializeBlock, encodeBlock, decodeBlock, BlockStore,
  SnapshotStore, type ChainSnapshot,
} from "../storage/persistence.js";
import { createGenesisHeader } from "../consensus/block.js";
import { initEpochState, applyBlockToEpoch } from "../consensus/epoch.js";
import { assembleBlock, GENESIS_DIFFICULTY_BITS } from "../consensus/block.js";
import { JGCNode } from "../network/node.js";
import { loadVerifierWasm } from "../crypto/zkp.js";
import { MessageType as MT } from "../types/index.js";
import { makeGenesisBlock, makeContribution, makePeer, makeMessage, BlockProducer, DEFAULT_MINERS } from "../sim/harness.js";
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

describe("block serialization (JSON debug/clone)", () => {
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

describe("binary block codec", () => {
  test("encodeBlock/decodeBlock round-trips header, txs, proofs, and epoch state", () => {
    const block = sampleBlock();
    const back = decodeBlock(encodeBlock(block));

    // Header identity (the hash is over the 160-byte header) and money fields.
    expect(back.header).toEqual(block.header);
    expect(back.transactions[0]!.outputs[0]!.value).toBe(123n * BASE_UNITS_PER_JGC);
    expect(typeof back.transactions[0]!.outputs[0]!.value).toBe("bigint");

    // Compute proofs (incl. the fractional-safe tflopsWeight and public inputs).
    expect(back.computeProofs).toHaveLength(1);
    expect(back.computeProofs[0]!.proof.tflopsWeight).toBe(600);
    expect(back.computeProofs[0]!.proof.publicInputs).toEqual(["1"]);
    expect(back.computeProofs[0]!.minerAddress).toBe("minerA");

    // Epoch accumulator (Map + bigint pool).
    expect(back.epochState.minerContributions).toBeInstanceOf(Map);
    expect(back.epochState.minerContributions.get("minerA")).toBe(600);
    expect(back.epochState.minerContributions.get("minerB")).toBe(450);
    expect(back.epochState.pendingRewardPool).toBe(block.epochState.pendingRewardPool);
    expect(typeof back.epochState.pendingRewardPool).toBe("bigint");
  });

  test("a truncated record is rejected", () => {
    const buf = encodeBlock(sampleBlock());
    expect(() => decodeBlock(buf.subarray(0, buf.length - 5))).toThrow(RangeError);
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

describe("chainstate snapshot", () => {
  test("SnapshotStore round-trips a chainstate snapshot", () => {
    const dir = join(tmpdir(), `jgc-snap-unit-${process.pid}`);
    const epochState = initEpochState(0, 1_749_600_000);
    applyBlockToEpoch(epochState, [contrib("minerA", 600)], 0, 42n);
    const snap: ChainSnapshot = {
      tipHash: "ab".repeat(32), tipHeight: 4, currentDifficultyBits: GENESIS_DIFFICULTY_BITS,
      medianPastTime: 1_749_600_300, epochFees: 1234n * BASE_UNITS_PER_JGC,
      recentBlockTimes: [100, 200, 300], epochState,
      utxos: [
        { txid: "cd".repeat(32), vout: 0, value: 9n * BASE_UNITS_PER_JGC, scriptPubKey: "76a914" + "11".repeat(20) + "88ac", height: 3, isCoinbase: false },
        { txid: "ef".repeat(32), vout: 2, value: 50n * BASE_UNITS_PER_JGC, scriptPubKey: "76a914" + "22".repeat(20) + "88ac", height: 1, isCoinbase: true },
      ],
    };
    const store = new SnapshotStore(dir); store.clear();
    store.write(snap);
    const back = store.load()!;
    expect(back.tipHash).toBe(snap.tipHash);
    expect(back.tipHeight).toBe(4);
    expect(back.epochFees).toBe(1234n * BASE_UNITS_PER_JGC);
    expect(back.recentBlockTimes).toEqual([100, 200, 300]);
    expect(back.epochState.minerContributions.get("minerA")).toBe(600);
    expect(back.utxos).toHaveLength(2);
    expect(back.utxos[1]!).toMatchObject({ vout: 2, value: 50n * BASE_UNITS_PER_JGC, isCoinbase: true });
    rmSync(dir, { recursive: true, force: true });
  });

  test("restart seeds from the snapshot and replays only the tail to identical state", async () => {
    await loadVerifierWasm({ mode: "simnet" });
    const dir = join(tmpdir(), `jgc-snap-restart-${process.pid}`);
    rmSync(dir, { recursive: true, force: true });
    const cfg = (): NodeConfig => ({
      listenPort: 0, rpcPort: 0, networkMagic: 0xD9B4BEF9, maxPeers: 8,
      enableBroker: false, junctionGeneratorMode: false, dataDir: dir, snapshotIntervalBlocks: 2,
    });

    // Live-mine 5 blocks; snapshots are written at heights 2 and 4.
    const live = new JGCNode(cfg(), makeGenesisBlock());
    live.connectPeer(makePeer("p", "inproc").conn);
    const producer = new BlockProducer(makeGenesisBlock());
    for (let i = 0; i < 5; i++) {
      const height = live.getChainInfo().tipHeight + 1;
      const block = producer.produceBlock(DEFAULT_MINERS.map(m => makeContribution(m, height)));
      await live.processMessage("p", makeMessage(MT.BLOCK, block));
      producer.confirmBlock(block);
    }
    const liveTip = live.getChainInfo().tipHash;
    const livePool = live.getEpochState().pendingRewardPool;
    expect(live.getChainInfo().tipHeight).toBe(5);
    expect(existsSync(join(dir, "chainstate.snapshot"))).toBe(true);

    // Restart from the same dataDir: the snapshot@4 is loaded and only block 5 is re-applied.
    const restarted = new JGCNode(cfg(), makeGenesisBlock());
    expect(restarted.getChainInfo().tipHeight).toBe(5);
    expect(restarted.getChainInfo().tipHash).toBe(liveTip);
    expect(restarted.getEpochState().pendingRewardPool).toBe(livePool);

    rmSync(dir, { recursive: true, force: true });
  });
});
