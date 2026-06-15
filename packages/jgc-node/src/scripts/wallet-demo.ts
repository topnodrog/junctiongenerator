/**
 * @file src/scripts/wallet-demo.ts
 * @description Wallet lifecycle, end to end:
 *
 *   1. Create a wallet (alice, bob), seal it in an encrypted keystore, and
 *      reload it — proving the AES-256-GCM/scrypt round-trip and that a wrong
 *      passphrase fails closed.
 *   2. Fund alice; the wallet scans the UTXO set and reports her balance.
 *   3. alice sends 6 JGC to bob: the wallet selects coins, builds change back to
 *      alice, signs every input, and broadcasts over a socket to peer B.
 *   4. A block confirms the tx; both nodes update, and the wallet re-scans to
 *      show bob credited, alice's change, and the fee landing in the epoch pool.
 *
 * Run:  npm run wallet-demo     (after npm run build)
 */

import { JGCNode } from "../network/node.js";
import { MessageType as MT } from "../types/index.js";
import { loadVerifierWasm } from "../crypto/zkp.js";
import { p2pkhScript } from "../crypto/signatures.js";
import { BASE_UNITS_PER_JGC, getBlockReward } from "../consensus/emission.js";
import {
  makeGenesisBlock, makePeer, makeContribution, makeMessage, BlockProducer, DEFAULT_MINERS,
} from "../sim/harness.js";
import { startP2PServer, connectToPeers, type P2PServer, type PeerLinks } from "../network/transport.js";
import { Wallet, formatJGC, parseJGC } from "../wallet/wallet.js";
import type { NodeConfig } from "../types/index.js";

const PORT_A = 29601, PORT_B = 29602;
const J = (n: bigint): bigint => n * BASE_UNITS_PER_JGC;
const FEE = parseJGC("0.0001");
const FUNDING_TXID = "00".repeat(31) + "ab";
const PASS = "correct horse battery staple";

const cfg = (port: number): NodeConfig => ({
  listenPort: port, rpcPort: port - 1000, networkMagic: 0xD9B4BEF9, maxPeers: 16,
  enableBroker: false, junctionGeneratorMode: false,
});
const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
async function waitFor(cond: () => boolean, ms = 6000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (cond()) return true; await sleep(50); }
  return cond();
}

async function main(): Promise<void> {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(" JGC Wallet — keystore, balance, coin selection, send, confirm");
  console.log("══════════════════════════════════════════════════════════════");
  await loadVerifierWasm({ mode: "simnet" });

  let allOk = true;
  const row = (label: string, ok: boolean): void => { allOk = allOk && ok; console.log(`  ${(label + " ").padEnd(50, ".")} ${ok ? "✓" : "✗"}`); };

  // ── 1. Keystore: create, seal, reload ─────────────────────────────────────
  const w0 = Wallet.create();
  const aliceAddr = w0.generate("alice");
  const bobAddr = w0.generate("bob");
  const sealed = w0.toKeystore(PASS);
  const wallet = Wallet.fromKeystore(sealed, PASS);
  row("keystore round-trips (addresses preserved)", wallet.address("alice") === aliceAddr && wallet.address("bob") === bobAddr);
  let wrongRejected = false;
  try { Wallet.fromKeystore(sealed, "wrong pass"); } catch { wrongRejected = true; }
  row("wrong passphrase fails closed", wrongRejected);
  console.log(`  alice: ${aliceAddr}`);
  console.log(`  bob:   ${bobAddr}`);

  // ── 2. Boot two nodes; fund alice on both ─────────────────────────────────
  const nodeA = new JGCNode(cfg(PORT_A), makeGenesisBlock());
  const nodeB = new JGCNode(cfg(PORT_B), makeGenesisBlock());
  const servers: P2PServer[] = [await startP2PServer(nodeA, PORT_A), await startP2PServer(nodeB, PORT_B)];
  for (const n of [nodeA, nodeB]) {
    n.getUTXOSet().add(FUNDING_TXID, 0, { value: J(10n), scriptPubKey: p2pkhScript(wallet.publicKey("alice")), height: 0, isCoinbase: false });
  }
  nodeA.connectPeer(makePeer("local-miner", "inproc").conn);
  const producer = new BlockProducer(makeGenesisBlock());
  const linkBA: PeerLinks = connectToPeers(nodeB, [`ws://127.0.0.1:${PORT_A}`], { retryMs: 500 });
  await sleep(400);

  const h0 = nodeA.getChainInfo().tipHeight + 1;
  row("alice balance = 10 JGC", wallet.balance("alice", nodeA.getUTXOSet(), h0) === J(10n));
  row("bob balance = 0 JGC", wallet.balance("bob", nodeA.getUTXOSet(), h0) === 0n);

  // ── 3. alice sends 6 JGC to bob (wallet selects coins + change, signs) ─────
  const { tx, txid, change } = wallet.buildSpend({
    fromLabel: "alice", toAddress: bobAddr, amount: J(6n), fee: FEE,
    utxo: nodeA.getUTXOSet(), currentHeight: h0,
  });
  console.log(`  built ${txid.slice(0, 16)}… — out 6 JGC to bob, change ${formatJGC(change)} JGC, fee ${formatJGC(FEE)} JGC`);
  const sub = await nodeA.broadcastTransaction(tx);
  row("spend accepted into A's mempool", sub.ok && nodeA.getMempool().length === 1);
  row("spend relayed to B's mempool", await waitFor(() => nodeB.getMempool().length === 1));

  // ── 4. Mine a block including the spend; re-scan balances ─────────────────
  const height = nodeA.getChainInfo().tipHeight + 1;
  for (const m of DEFAULT_MINERS) await nodeA.processMessage("local-miner", makeMessage(MT.COMPUTE_PROOF, makeContribution(m, height)));
  const block = producer.produceBlock(nodeA.getPendingProofs(), nodeA.getMempool());
  await nodeA.processMessage("local-miner", makeMessage(MT.BLOCK, block));
  producer.confirmBlock(block);
  await waitFor(() => nodeB.getChainInfo().tipHeight === 1);

  const h1 = nodeA.getChainInfo().tipHeight + 1;
  row("block confirmed the spend (coinbase + tx)", block.transactions.length === 2);
  row("bob balance = 6 JGC", wallet.balance("bob", nodeA.getUTXOSet(), h1) === J(6n));
  row("alice balance = 10 − 6 − fee (change)", wallet.balance("alice", nodeA.getUTXOSet(), h1) === J(10n) - J(6n) - FEE);
  row("fee credited to epoch pool", nodeA.getEpochState().pendingRewardPool === 2n * getBlockReward(0) + FEE);
  row("balances agree on peer B", wallet.balance("bob", nodeB.getUTXOSet(), h1) === J(6n));

  linkBA.close();
  for (const s of servers) await s.close();
  console.log("──────────────────────────────────────────────────────────────");
  console.log(`[Wallet] RESULT: ${allOk ? "PASS ✓" : "FAIL ✗"}`);
  process.exit(allOk ? 0 : 1);
}

main().catch(err => { console.error("[Wallet] Unhandled error:", err); process.exit(1); });
