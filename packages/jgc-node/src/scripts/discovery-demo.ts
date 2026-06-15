/**
 * @file src/scripts/discovery-demo.ts
 * @description Peer discovery via ADDR gossip — no central seed needed.
 *
 *   Topology seeded as a line:  A   B→A   C→B
 *     • A advertises itself and waits.
 *     • B is seeded with A only.
 *     • C is seeded with B only — it has never heard of A.
 *
 *   Through the VERSION handshake + GETADDR/ADDR gossip, C learns A's address
 *   from B and dials it. The line collapses into a mesh: every node ends up
 *   connected to every other, discovered purely from one bootstrap link each.
 *
 * Run:  npm run discovery-demo     (after npm run build)
 */

import type { NodeConfig } from "../types/index.js";
import { JGCNode } from "../network/node.js";
import { makeGenesisBlock } from "../sim/harness.js";
import { startP2PServer, maintainPeers, type P2PServer, type PeerLinks } from "../network/transport.js";

const PORT_A = 29801, PORT_B = 29802, PORT_C = 29803;
const url = (p: number): string => `ws://127.0.0.1:${p}`;
const cfg = (port: number): NodeConfig => ({
  listenPort: port, rpcPort: port - 1000, networkMagic: 0xD9B4BEF9, maxPeers: 16,
  enableBroker: false, junctionGeneratorMode: false, advertiseUrl: url(port),
});
const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
async function waitFor(cond: () => boolean, ms = 8000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (cond()) return true; await sleep(50); }
  return cond();
}

async function main(): Promise<void> {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(" JGC Node — peer discovery via ADDR gossip");
  console.log("══════════════════════════════════════════════════════════════");

  const nodeA = new JGCNode(cfg(PORT_A), makeGenesisBlock());
  const nodeB = new JGCNode(cfg(PORT_B), makeGenesisBlock());
  const nodeC = new JGCNode(cfg(PORT_C), makeGenesisBlock());
  const servers: P2PServer[] = [
    await startP2PServer(nodeA, PORT_A),
    await startP2PServer(nodeB, PORT_B),
    await startP2PServer(nodeC, PORT_C),
  ];

  let allOk = true;
  const row = (label: string, ok: boolean): void => { allOk = allOk && ok; console.log(`  ${(label + " ").padEnd(52, ".")} ${ok ? "✓" : "✗"}`); };

  // Seed a line: A alone, B→A, C→B. No node is told the full set.
  const links: PeerLinks[] = [];
  links.push(maintainPeers(nodeB, [url(PORT_A)], { fillIntervalMs: 500 }));
  await sleep(700);
  row("B connected to its seed A", nodeB.peerCount() >= 1 && nodeA.peerCount() >= 1);

  links.push(maintainPeers(nodeC, [url(PORT_B)], { fillIntervalMs: 500 }));

  // C should learn A's address from B (gossip) and then dial it.
  row("C learned A's address from B (gossip)", await waitFor(() => nodeC.getKnownAddresses().includes(url(PORT_A))));
  row("C dialed the discovered peer A", await waitFor(() => nodeC.peerCount() >= 2));
  row("A now sees both B and C", await waitFor(() => nodeA.peerCount() >= 2));

  console.log(`  A peers=${nodeA.peerCount()}  B peers=${nodeB.peerCount()}  C peers=${nodeC.peerCount()}`);
  console.log(`  C address book: ${nodeC.getKnownAddresses().join(", ")}`);

  for (const l of links) l.close();
  for (const s of servers) await s.close();
  console.log("──────────────────────────────────────────────────────────────");
  console.log(`[Discovery] RESULT: ${allOk ? "PASS ✓" : "FAIL ✗"}`);
  process.exit(allOk ? 0 : 1);
}

main().catch(err => { console.error("[Discovery] Unhandled error:", err); process.exit(1); });
