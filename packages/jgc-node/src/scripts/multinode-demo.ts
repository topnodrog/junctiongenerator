/**
 * @file src/scripts/multinode-demo.ts
 * @description Real multi-peer P2P over sockets: block propagation across a
 * 3-node network, plus auto-reconnect + re-sync.
 *
 * Topology (line):   A  ←──  B  ←──  C      (A mines; B dials A, C dials B)
 *
 *   1. Mine a block on A. It relays to B (socket); B relays to C — a real
 *      multi-hop gossip across three separate WebSocket nodes. All three reach
 *      the same tip.
 *   2. Disconnect C, mine another block on A (reaches B, not C), then reconnect
 *      C: the VERSION handshake makes C request headers and CATCH UP to the tip
 *      it missed while offline.
 *
 * Run:  npm run multinode-demo     (after npm run build)
 */

import type { NodeConfig } from "../types/index.js";
import { JGCNode } from "../network/node.js";
import { loadVerifierWasm } from "../crypto/zkp.js";
import { startP2PServer, connectToPeers, type P2PServer, type PeerLinks } from "../network/transport.js";
import { makeGenesisBlock, makePeer, BlockProducer, mineBlocks } from "../sim/harness.js";

const PORT_A = 29401, PORT_B = 29402, PORT_C = 29403;
const url = (p: number): string => `ws://127.0.0.1:${p}`;

function cfg(port: number): NodeConfig {
  return { listenPort: port, rpcPort: port - 1000, networkMagic: 0xD9B4BEF9, maxPeers: 16, enableBroker: false, junctionGeneratorMode: false };
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/** Poll until `cond()` is true or timeout; returns whether it succeeded. */
async function waitFor(cond: () => boolean, timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return true;
    await sleep(50);
  }
  return cond();
}

async function main(): Promise<void> {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(" JGC Node — multi-peer P2P: 3-node propagation + reconnect");
  console.log("══════════════════════════════════════════════════════════════");

  await loadVerifierWasm({ mode: "simnet" });

  // Three independent nodes, each on its own socket.
  const nodeA = new JGCNode(cfg(PORT_A), makeGenesisBlock());
  const nodeB = new JGCNode(cfg(PORT_B), makeGenesisBlock());
  const nodeC = new JGCNode(cfg(PORT_C), makeGenesisBlock());
  const servers: P2PServer[] = [
    await startP2PServer(nodeA, PORT_A),
    await startP2PServer(nodeB, PORT_B),
    await startP2PServer(nodeC, PORT_C),
  ];

  // A mines via an in-process miner; B and C learn everything over sockets.
  nodeA.connectPeer(makePeer("local-miner", "inproc").conn);
  const producer = new BlockProducer(makeGenesisBlock());

  // Line topology: B → A, C → B.
  const linkBA = connectToPeers(nodeB, [url(PORT_A)], { retryMs: 500 });
  let linkCB: PeerLinks = connectToPeers(nodeC, [url(PORT_B)], { retryMs: 500 });
  await sleep(400); // let handshakes settle

  let allOk = true;
  const row = (label: string, ok: boolean): void => { allOk = allOk && ok; console.log(`  ${(label + " ").padEnd(48, ".")} ${ok ? "✓" : "✗"}`); };

  // ── 1. Multi-hop propagation A → B → C ────────────────────────────────────
  await mineBlocks(nodeA, "local-miner", producer, 1);
  const tipA1 = nodeA.getChainInfo().tipHash;
  const prop1 = await waitFor(() =>
    nodeB.getChainInfo().tipHeight === 1 && nodeC.getChainInfo().tipHeight === 1);
  row("block mined on A reaches B (1 hop)", nodeB.getChainInfo().tipHash === tipA1);
  row("block reaches C (2 hops, via B)", nodeC.getChainInfo().tipHash === tipA1);
  row("all three nodes at height 1", prop1);

  // ── 2. Disconnect C, mine while it's offline, then reconnect + re-sync ─────
  linkCB.close();
  await sleep(400); // let C drop from B's peer set
  await mineBlocks(nodeA, "local-miner", producer, 1);
  const tipA2 = nodeA.getChainInfo().tipHash;
  await waitFor(() => nodeB.getChainInfo().tipHeight === 2);
  row("B advances to height 2 while C offline", nodeB.getChainInfo().tipHeight === 2);
  row("C still at height 1 (offline)", nodeC.getChainInfo().tipHeight === 1);

  linkCB = connectToPeers(nodeC, [url(PORT_B)], { retryMs: 500 });
  const resynced = await waitFor(() => nodeC.getChainInfo().tipHeight === 2);
  row("C reconnects and catches up to height 2", resynced && nodeC.getChainInfo().tipHash === tipA2);

  // ── Teardown ──────────────────────────────────────────────────────────────
  linkBA.close();
  linkCB.close();
  for (const s of servers) await s.close();

  console.log("──────────────────────────────────────────────────────────────");
  console.log("[MultiNode] blocks propagated multi-hop; reconnecting node re-synced");
  console.log(`[MultiNode] RESULT: ${allOk ? "PASS ✓" : "FAIL ✗"}`);
  process.exit(allOk ? 0 : 1);
}

main().catch(err => {
  console.error("[MultiNode] Unhandled error:", err);
  process.exit(1);
});
