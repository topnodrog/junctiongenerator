/**
 * @file src/scripts/mempool-demo.ts
 * @description Mempool + transaction relay + fee accounting, end to end.
 *
 *   1. Alice broadcasts a signed spend to node A. A validates it into its
 *      mempool and relays it over the socket to node B, which validates and
 *      mempools it too — peer-to-peer tx propagation.
 *   2. A mines a block that includes the mempool tx. Both nodes accept it,
 *      remove the tx from their mempools, update the UTXO set, and credit the
 *      fee to the epoch reward pool (deferred, distributed pro-rata at boundary).
 *   3. Invalid/conflicting submissions (double-spend, unknown input) are rejected
 *      and never relayed.
 *
 * Run:  npm run mempool-demo     (after npm run build)
 */

import type { NodeConfig, Transaction } from "../types/index.js";
import { JGCNode } from "../network/node.js";
import { MessageType as MT } from "../types/index.js";
import { loadVerifierWasm } from "../crypto/zkp.js";
import { txSigHash } from "../consensus/utxo.js";
import { generateKeyPair, p2pkhScript, signHash, p2pkhScriptSig } from "../crypto/signatures.js";
import { BASE_UNITS_PER_JGC, getBlockReward } from "../consensus/emission.js";
import {
  makeGenesisBlock, makePeer, BlockProducer, makeContribution, makeMessage, DEFAULT_MINERS,
} from "../sim/harness.js";
import { startP2PServer, connectToPeers, type P2PServer, type PeerLinks } from "../network/transport.js";

const PORT_A = 29501, PORT_B = 29502;
const J = (n: bigint): bigint => n * BASE_UNITS_PER_JGC;
const CENTI = BASE_UNITS_PER_JGC / 10_000n; // 0.0001 JGC fee
const FUNDING_TXID = "00".repeat(31) + "cd";

const alice = generateKeyPair();
const bob = generateKeyPair();

function cfg(port: number): NodeConfig {
  return { listenPort: port, rpcPort: port - 1000, networkMagic: 0xD9B4BEF9, maxPeers: 16, enableBroker: false, junctionGeneratorMode: false };
}
const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
async function waitFor(cond: () => boolean, ms = 6000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (cond()) return true; await sleep(50); }
  return cond();
}

function fund(node: JGCNode): void {
  node.getUTXOSet().add(FUNDING_TXID, 0, { value: J(10n), scriptPubKey: p2pkhScript(alice.publicKey), height: 0, isCoinbase: false });
}

function spend(outs: Transaction["outputs"]): Transaction {
  const tx: Transaction = {
    version: 1,
    inputs: [{ prevOut: { txid: FUNDING_TXID, vout: 0 }, scriptSig: "", sequence: 0xFFFFFFFF }],
    outputs: outs, locktime: 0,
  };
  tx.inputs[0]!.scriptSig = p2pkhScriptSig(signHash(alice.privateKey, txSigHash(tx)), alice.publicKey);
  return tx;
}

async function main(): Promise<void> {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(" JGC Node — mempool + transaction relay + fee accounting");
  console.log("══════════════════════════════════════════════════════════════");

  await loadVerifierWasm({ mode: "simnet" });

  const nodeA = new JGCNode(cfg(PORT_A), makeGenesisBlock());
  const nodeB = new JGCNode(cfg(PORT_B), makeGenesisBlock());
  const servers: P2PServer[] = [await startP2PServer(nodeA, PORT_A), await startP2PServer(nodeB, PORT_B)];
  fund(nodeA); fund(nodeB);                       // both nodes know the funded UTXO
  nodeA.connectPeer(makePeer("local-miner", "inproc").conn);
  const producer = new BlockProducer(makeGenesisBlock());
  const linkBA: PeerLinks = connectToPeers(nodeB, [`ws://127.0.0.1:${PORT_A}`], { retryMs: 500 });
  await sleep(400);

  let allOk = true;
  const row = (label: string, ok: boolean): void => { allOk = allOk && ok; console.log(`  ${(label + " ").padEnd(46, ".")} ${ok ? "✓" : "✗"}`); };

  // ── 1. Broadcast a signed spend; it propagates A → B ──────────────────────
  const tx = spend([
    { value: J(6n),         scriptPubKey: p2pkhScript(bob.publicKey) },
    { value: J(4n) - CENTI, scriptPubKey: p2pkhScript(alice.publicKey) },
  ]);
  const sub = await nodeA.broadcastTransaction(tx);
  row("valid spend accepted into A's mempool", sub.ok && nodeA.getMempool().length === 1);
  row("tx relayed to B's mempool", await waitFor(() => nodeB.getMempool().length === 1));

  // ── 2. Invalid submissions are rejected (and not relayed) ─────────────────
  row("double-spend rejected", !(await nodeA.broadcastTransaction(spend([{ value: J(5n), scriptPubKey: p2pkhScript(bob.publicKey) }]))).ok);
  const unknown: Transaction = { version: 1, inputs: [{ prevOut: { txid: "ff".repeat(32), vout: 0 }, scriptSig: "", sequence: 0xFFFFFFFF }], outputs: [{ value: J(1n), scriptPubKey: p2pkhScript(bob.publicKey) }], locktime: 0 };
  unknown.inputs[0]!.scriptSig = p2pkhScriptSig(signHash(alice.privateKey, txSigHash(unknown)), alice.publicKey);
  row("unknown-input tx rejected", !(await nodeA.broadcastTransaction(unknown)).ok);

  // ── 3. Mine a block that includes the mempool tx ──────────────────────────
  const height = nodeA.getChainInfo().tipHeight + 1;
  for (const m of DEFAULT_MINERS) await nodeA.processMessage("local-miner", makeMessage(MT.COMPUTE_PROOF, makeContribution(m, height)));
  const block = producer.produceBlock(nodeA.getPendingProofs(), nodeA.getMempool());
  await nodeA.processMessage("local-miner", makeMessage(MT.BLOCK, block));
  producer.confirmBlock(block);

  row("block included the tx (2 txs: coinbase + spend)", block.transactions.length === 2);
  row("A mempool emptied after mining", nodeA.getMempool().length === 0);
  row("B accepts block and prunes its mempool", await waitFor(() => nodeB.getChainInfo().tipHeight === 1 && nodeB.getMempool().length === 0));
  row("funded output spent in A's UTXO set", !nodeA.getUTXOSet().has(FUNDING_TXID, 0));

  // ── 4. Fee credited to the epoch reward pool ──────────────────────────────
  const pool = nodeA.getEpochState().pendingRewardPool;
  const expected = 2n * getBlockReward(0) + CENTI; // genesis + block1 subsidies + the 0.0001 JGC fee
  row(`fee added to epoch pool (=${CENTI} base units)`, pool === expected);

  linkBA.close();
  for (const s of servers) await s.close();
  console.log("──────────────────────────────────────────────────────────────");
  console.log(`[Mempool] RESULT: ${allOk ? "PASS ✓" : "FAIL ✗"}`);
  process.exit(allOk ? 0 : 1);
}

main().catch(err => { console.error("[Mempool] Unhandled error:", err); process.exit(1); });
