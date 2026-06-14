/**
 * @file src/scripts/persistence-demo.ts
 * @description Durability demo — a node survives "restart".
 *
 *   1. Node A (with a dataDir) mines several blocks; each is persisted.
 *   2. Node B is constructed fresh from the SAME dataDir — it replays the block
 *      log on startup and rebuilds the chain, UTXO set, and epoch accumulator.
 *   3. Assert A and B agree on tip height/hash, UTXO size, and epoch state.
 *
 * Run:  npm run persistence-demo     (after npm run build)
 */

import { tmpdir } from "os";
import { join } from "path";
import type { NodeConfig } from "../types/index.js";
import { JGCNode } from "../network/node.js";
import { loadVerifierWasm } from "../crypto/zkp.js";
import { BlockStore } from "../storage/persistence.js";
import { makeGenesisBlock, makePeer, BlockProducer, mineBlocks } from "../sim/harness.js";

const DATA_DIR = join(tmpdir(), "jgc-persistence-demo");
const BLOCKS = 5;

function cfg(): NodeConfig {
  return {
    listenPort: 0, rpcPort: 0, networkMagic: 0xD9B4BEF9,
    maxPeers: 8, enableBroker: false, junctionGeneratorMode: false,
    dataDir: DATA_DIR,
  };
}

interface Snapshot { height: number; tip: string; utxos: number; pool: bigint; tflops: number; epochIdx: number; }
function snapshot(node: JGCNode): Snapshot {
  const info = node.getChainInfo();
  const e = node.getEpochState();
  return {
    height: info.tipHeight, tip: info.tipHash, utxos: node.getUTXOSet().size,
    pool: e.pendingRewardPool, tflops: e.totalEpochTFLOPS, epochIdx: e.epochBlockIndex,
  };
}

async function main(): Promise<void> {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(" JGC Node — persistence: a node survives restart");
  console.log("══════════════════════════════════════════════════════════════");

  await loadVerifierWasm({ mode: "simnet" });
  new BlockStore(DATA_DIR).clear(); // fresh start
  console.log(`[Persist] dataDir: ${DATA_DIR}`);

  // ── Node A: mine and persist ──────────────────────────────────────────────
  const nodeA = new JGCNode(cfg(), makeGenesisBlock());
  nodeA.connectPeer(makePeer("local-miner", "inproc").conn);
  const producer = new BlockProducer(makeGenesisBlock());
  console.log(`[Persist] Node A mining ${BLOCKS} blocks…`);
  await mineBlocks(nodeA, "local-miner", producer, BLOCKS);
  const a = snapshot(nodeA);
  console.log(`[Persist] Node A: height ${a.height}, ${a.utxos} UTXOs, pool ${a.pool}, ${new BlockStore(DATA_DIR).count()} blocks on disk`);
  console.log("──────────────────────────────────────────────────────────────");

  // ── Node B: fresh process, same dataDir → replays from disk ───────────────
  console.log("[Persist] Node B starting from disk (simulated restart)…");
  const nodeB = new JGCNode(cfg(), makeGenesisBlock());
  const b = snapshot(nodeB);
  console.log("──────────────────────────────────────────────────────────────");

  let allOk = true;
  const row = (label: string, ok: boolean): void => { allOk = allOk && ok; console.log(`  ${(label + " ").padEnd(40, ".")} ${ok ? "✓" : "✗"}`); };
  row(`tip height matches (${a.height})`, a.height === b.height && a.height === BLOCKS);
  row("tip hash matches", a.tip === b.tip);
  row(`UTXO set size matches (${a.utxos})`, a.utxos === b.utxos);
  row("epoch reward pool matches", a.pool === b.pool);
  row("epoch TFLOPS matches", a.tflops === b.tflops);
  row("epoch block index matches", a.epochIdx === b.epochIdx);

  console.log("──────────────────────────────────────────────────────────────");
  console.log("[Persist] reloaded node reconstructed identical chain + UTXO + epoch state");
  console.log(`[Persist] RESULT: ${allOk ? "PASS ✓" : "FAIL ✗"}`);
  if (!allOk) process.exit(1);
}

main().catch(err => {
  console.error("[Persist] Unhandled error:", err);
  process.exit(1);
});
