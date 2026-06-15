/**
 * @file src/scripts/utxo-live-demo.ts
 * @description UTXO enforcement LIVE inside the node's block pipeline.
 *
 * Unlike utxo-demo.ts (which exercises the ledger functions directly), this
 * drives real blocks through JGCNode.processMessage → validateBlock → acceptBlock:
 *
 *   1. Seed the node's UTXO set with a funded output owned by Alice (a premine).
 *   2. Mine a block whose tx[1] is a REAL secp256k1-signed spend (Alice → Bob +
 *      change). The node validates it against its UTXO set and ACCEPTS the block;
 *      afterwards the funded output is spent and the new outputs exist.
 *   3. The node REJECTS a block that double-spends the (now consumed) output, and
 *      one that overspends (outputs > inputs) — the chain tip does not advance.
 *
 * Run:  npm run utxo-live-demo     (after npm run build)
 */

import type { Block, Transaction } from "../types/index.js";
import { MessageType as MT } from "../types/index.js";
import { JGCNode } from "../network/node.js";
import { loadVerifierWasm } from "../crypto/zkp.js";
import { txid, txSigHash } from "../consensus/utxo.js";
import { generateKeyPair, p2pkhScript, signHash, p2pkhScriptSig } from "../crypto/signatures.js";
import { BASE_UNITS_PER_JGC } from "../consensus/emission.js";
import {
  makeGenesisBlock, makePeer, BlockProducer, makeContribution, makeMessage, DEFAULT_MINERS,
} from "../sim/harness.js";
import type { NodeConfig } from "../types/index.js";

const J = (n: bigint): bigint => n * BASE_UNITS_PER_JGC;
const CENTI = BASE_UNITS_PER_JGC / 10_000n;
const FUNDING_TXID = "00".repeat(31) + "ab";

const alice = generateKeyPair();
const bob = generateKeyPair();

function cfg(): NodeConfig {
  return { listenPort: 0, rpcPort: 0, networkMagic: 0xD9B4BEF9, maxPeers: 8, enableBroker: false, junctionGeneratorMode: false };
}

/** A P2PKH spend signed by `key`, spending one outpoint into `outputs`. */
function signedSpend(prevTxid: string, vout: number, outputs: Transaction["outputs"], key: { privateKey: string; publicKey: string }): Transaction {
  const tx: Transaction = {
    version: 1,
    inputs: [{ prevOut: { txid: prevTxid, vout }, scriptSig: "", sequence: 0xFFFFFFFF }],
    outputs,
    locktime: 0,
  };
  tx.inputs[0]!.scriptSig = p2pkhScriptSig(signHash(key.privateKey, txSigHash(tx)), key.publicKey);
  return tx;
}

async function main(): Promise<void> {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(" JGC Node — UTXO enforcement LIVE in the block pipeline");
  console.log("══════════════════════════════════════════════════════════════");

  await loadVerifierWasm({ mode: "simnet" }); // fast proofs; UTXO rules are always-on

  const node = new JGCNode(cfg(), makeGenesisBlock());
  node.connectPeer(makePeer("local-miner", "inproc").conn);
  const producer = new BlockProducer(makeGenesisBlock());

  // Premine: fund Alice with 10 JGC (non-coinbase, immediately spendable).
  node.getUTXOSet().add(FUNDING_TXID, 0, {
    value: J(10n), scriptPubKey: p2pkhScript(alice.publicKey), height: 0, isCoinbase: false,
  });
  console.log(`[UTXOLive] Seeded funded UTXO: 10 JGC → Alice  (utxos=${node.getUTXOSet().size})`);
  console.log("──────────────────────────────────────────────────────────────");

  // Mine a block carrying the given spend txs; returns the produced block.
  async function mineBlock(extraTxs: Transaction[]): Promise<Block> {
    const height = node.getChainInfo().tipHeight + 1;
    for (const m of DEFAULT_MINERS) {
      await node.processMessage("local-miner", makeMessage(MT.COMPUTE_PROOF, makeContribution(m, height)));
    }
    const block = producer.produceBlock(node.getPendingProofs(), extraTxs);
    await node.processMessage("local-miner", makeMessage(MT.BLOCK, block));
    return block;
  }

  let allOk = true;
  const row = (label: string, ok: boolean): void => { allOk = allOk && ok; console.log(`  ${(label + " ").padEnd(46, ".")} ${ok ? "✓" : "✗"}`); };

  // ── 1. Valid signed spend in a block → ACCEPTED ───────────────────────────
  const spend1 = signedSpend(FUNDING_TXID, 0, [
    { value: J(6n),         scriptPubKey: p2pkhScript(bob.publicKey) },
    { value: J(4n) - CENTI, scriptPubKey: p2pkhScript(alice.publicKey) },
  ], alice);
  const block1 = await mineBlock([spend1]);
  const accepted = node.getChainInfo().tipHeight === 1;
  row("block with valid signed spend accepted", accepted);
  if (accepted) producer.confirmBlock(block1);
  row("funded output now spent in UTXO set", !node.getUTXOSet().has(FUNDING_TXID, 0));
  row("spend outputs added to UTXO set", node.getUTXOSet().has(txid(spend1), 0) && node.getUTXOSet().has(txid(spend1), 1));

  // ── 2. Double-spend of the consumed output → REJECTED ─────────────────────
  const tipBefore2 = node.getChainInfo().tipHeight;
  await mineBlock([signedSpend(FUNDING_TXID, 0, [{ value: J(5n), scriptPubKey: p2pkhScript(bob.publicKey) }], alice)]);
  row("double-spend block rejected (tip unchanged)", node.getChainInfo().tipHeight === tipBefore2);

  // ── 3. Overspend (outputs > inputs) → REJECTED ────────────────────────────
  // Spend Bob's 6-JGC output but try to create 7 JGC.
  const tipBefore3 = node.getChainInfo().tipHeight;
  await mineBlock([signedSpend(txid(spend1), 0, [{ value: J(7n), scriptPubKey: p2pkhScript(alice.publicKey) }], bob)]);
  row("overspend block rejected (tip unchanged)", node.getChainInfo().tipHeight === tipBefore3);

  console.log("──────────────────────────────────────────────────────────────");
  console.log("[UTXOLive] UTXO rules enforced live in validateBlock/acceptBlock");
  console.log(`[UTXOLive] RESULT: ${allOk ? "PASS ✓" : "FAIL ✗"}`);
  if (!allOk) process.exit(1);
}

main().catch(err => {
  console.error("[UTXOLive] Unhandled error:", err);
  process.exit(1);
});
