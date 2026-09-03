/**
 * @file src/scripts/reorg-demo.ts
 * @description Fork choice + chain reorganization.
 *
 *   1. Node A mines a 1-block branch; a competing 2-block branch is produced from
 *      the same genesis (distinct timestamps ⇒ distinct blocks).
 *   2. A receives the competing branch. Its first block ties A's tip (kept as a
 *      side branch — first-seen wins); the second makes that branch heavier, so A
 *      reorganizes onto it.
 *   3. A second node B, which only ever saw the 2-block branch, ends on the same
 *      tip — both nodes converge on the heaviest chain. Competing blocks at the
 *      same height no longer split the network.
 *
 * Run:  npm run reorg-demo     (after npm run build)
 */

import type { NodeConfig, Block, MinerComputeContribution } from "../types/index.js";
import { JGCNode } from "../network/node.js";
import { MessageType as MT } from "../types/index.js";
import { loadVerifierWasm } from "../crypto/zkp.js";
import { setQuantumVerifierMode } from "../crypto/pq.js";
import { hashBlockHeader } from "../consensus/block.js";
import {
  makeGenesisBlock, makePeer, makeMessage, makeContribution, BlockProducer, DEFAULT_MINERS,
} from "../sim/harness.js";

const cfg = (): NodeConfig => ({ listenPort: 0, rpcPort: 0, networkMagic: 0xD9B4BEF9, maxPeers: 8, enableBroker: false, junctionGeneratorMode: false });
const contribs = (height: number): MinerComputeContribution[] => DEFAULT_MINERS.map(m => makeContribution(m, height));
const hash = (b: Block): string => hashBlockHeader(b.header);

function node(): JGCNode {
  const n = new JGCNode(cfg(), makeGenesisBlock());
  n.connectPeer(makePeer("net", "inproc").conn);
  return n;
}
const recv = (n: JGCNode, b: Block): Promise<void> => n.processMessage("net", makeMessage(MT.BLOCK, b));

async function main(): Promise<void> {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(" JGC Node — fork choice + chain reorganization");
  console.log("══════════════════════════════════════════════════════════════");
  setQuantumVerifierMode("simnet");
  await loadVerifierWasm({ mode: "simnet" });

  let allOk = true;
  const row = (label: string, ok: boolean): void => { allOk = allOk && ok; console.log(`  ${(label + " ").padEnd(52, ".")} ${ok ? "✓" : "✗"}`); };

  // Two competing branches from the same genesis.
  const pA = new BlockProducer(makeGenesisBlock());
  const pB = new BlockProducer(makeGenesisBlock(), { timeOffsetSec: 11 });
  const a1 = pA.produceBlock(contribs(1)); pA.confirmBlock(a1);
  const b1 = pB.produceBlock(contribs(1)); pB.confirmBlock(b1);
  const b2 = pB.produceBlock(contribs(2)); pB.confirmBlock(b2);

  // Node A: mines its 1-block branch, then receives the competing branch.
  const nodeA = node();
  await recv(nodeA, a1);
  row("A on its own 1-block branch", nodeA.getChainInfo().tipHeight === 1 && nodeA.getChainInfo().tipHash === hash(a1));

  await recv(nodeA, b1); // ties A's tip → retained as a side branch
  row("competing block of equal work does NOT reorg (first-seen tip holds)",
    nodeA.getChainInfo().tipHash === hash(a1));

  await recv(nodeA, b2); // makes B's branch heavier → reorg
  row("heavier branch triggers reorg (A switches to it)",
    nodeA.getChainInfo().tipHeight === 2 && nodeA.getChainInfo().tipHash === hash(b2));

  // Node B only ever saw the 2-block branch.
  const nodeB = node();
  await recv(nodeB, b1); await recv(nodeB, b2);

  row("independent node B is on the same branch", nodeB.getChainInfo().tipHash === hash(b2));
  row("A and B converged on the same tip", nodeA.getChainInfo().tipHash === nodeB.getChainInfo().tipHash);
  row("converged state agrees (epoch reward pool)",
    nodeA.getEpochState().pendingRewardPool === nodeB.getEpochState().pendingRewardPool);

  console.log("──────────────────────────────────────────────────────────────");
  console.log(`[Reorg] RESULT: ${allOk ? "PASS ✓" : "FAIL ✗"}`);
  process.exit(allOk ? 0 : 1);
}

main().catch(err => { console.error("[Reorg] Unhandled error:", err); process.exit(1); });
