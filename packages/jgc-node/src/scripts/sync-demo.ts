/**
 * @file src/scripts/sync-demo.ts
 * @description Two-node WebSocket sync demo.
 *
 * Exercises the real network stack end to end:
 *
 *   1. Node A boots from genesis and mines 30 blocks (in-process miner).
 *   2. Node A starts a WebSocket P2P server (src/network/transport.ts).
 *   3. Node B boots fresh from genesis and dials A over ws://127.0.0.1.
 *   4. Headers-first sync (the same flow as Bitcoin's BIP 130 sequence):
 *        B: VERSION  →  A: VERACK              (handshake)
 *        A: VERSION  →  B: VERACK + GETHEADERS (A's startHeight > B's tip)
 *        A: HEADERS  →  B: GETDATA             (30 unknown headers)
 *        A: BLOCK ×30 → B validates each through validateBlock()
 *   5. Live gossip: A mines one more block; relayBlock pushes it to B
 *      over the socket without B asking.
 *
 * PASS requires B's tip (height AND hash) to equal A's after both phases.
 */

import type { NodeConfig } from "../types/index.js";
import { loadVerifierWasm } from "../crypto/zkp.js";
import { JGCNode } from "../network/node.js";
import { startP2PServer, dialPeer } from "../network/transport.js";
import { BlockProducer, mineBlocks, makePeer, makeGenesisBlock } from "../sim/harness.js";

const P2P_PORT      = 28333;
const INITIAL_CHAIN = 30;     // blocks mined before B connects
const SYNC_TIMEOUT  = 15_000; // ms

function makeConfig(listenPort: number): NodeConfig {
  return {
    listenPort,
    rpcPort:               listenPort - 1,
    networkMagic:          0xD9B4BEF9,
    maxPeers:              8,
    enableBroker:          false,
    junctionGeneratorMode: false,
  };
}

async function waitForHeight(node: JGCNode, height: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (node.getChainInfo().tipHeight >= height) return true;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return false;
}

async function main(): Promise<void> {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(" JGC Node — two-node WebSocket sync demo");
  console.log("══════════════════════════════════════════════════════════════");

  // Simnet harness mines with placeholder proofs (no valid pairing) — use the
  // structural verifier path. Mainnet nodes load in the default "strict" mode.
  await loadVerifierWasm({ mode: "simnet" });

  // ── Node A: mining node ───────────────────────────────────────────────────
  const nodeA = new JGCNode(makeConfig(P2P_PORT), makeGenesisBlock());
  const miner = makePeer("local-miner", "inproc");
  nodeA.connectPeer(miner.conn);

  const producer = new BlockProducer(makeGenesisBlock());
  await mineBlocks(nodeA, "local-miner", producer, INITIAL_CHAIN);
  console.log(`[SyncDemo] Node A mined to height ${nodeA.getChainInfo().tipHeight}`);

  const server = await startP2PServer(nodeA, P2P_PORT);
  console.log(`[SyncDemo] Node A listening on ws://127.0.0.1:${server.port}`);

  // ── Node B: fresh node, syncs over a real socket ─────────────────────────
  const nodeB = new JGCNode(makeConfig(P2P_PORT + 10), makeGenesisBlock());
  await dialPeer(nodeB, `ws://127.0.0.1:${server.port}`);
  console.log("[SyncDemo] Node B connected — starting headers-first sync");

  const synced = await waitForHeight(nodeB, INITIAL_CHAIN, SYNC_TIMEOUT);
  const afterSync = nodeB.getChainInfo();
  console.log(
    `[SyncDemo] Initial sync: B at height ${afterSync.tipHeight}/${INITIAL_CHAIN} ` +
    `${synced ? "OK" : "TIMEOUT"}`
  );

  // ── Live gossip: A mines one more block, relay should push it to B ───────
  await mineBlocks(nodeA, "local-miner", producer, 1);
  const gossiped = await waitForHeight(nodeB, INITIAL_CHAIN + 1, SYNC_TIMEOUT);
  console.log(
    `[SyncDemo] Live gossip:  B at height ${nodeB.getChainInfo().tipHeight}/${INITIAL_CHAIN + 1} ` +
    `${gossiped ? "OK" : "TIMEOUT"}`
  );

  // ── Verdict ───────────────────────────────────────────────────────────────
  const a = nodeA.getChainInfo();
  const b = nodeB.getChainInfo();
  console.log("──────────────────────────────────────────────────────────────");
  console.log(`[SyncDemo] A: height=${a.tipHeight} tip=${a.tipHash.slice(0, 24)}…`);
  console.log(`[SyncDemo] B: height=${b.tipHeight} tip=${b.tipHash.slice(0, 24)}…`);

  const ok = synced && gossiped && b.tipHeight === a.tipHeight && b.tipHash === a.tipHash;
  console.log(`[SyncDemo] RESULT: ${ok ? "PASS ✓" : "FAIL ✗"}`);
  if (!ok) process.exitCode = 1;

  await server.close();
}

main().catch(err => {
  console.error("[SyncDemo] Unhandled error:", err);
  process.exitCode = 1;
});
