/**
 * @file src/tests/mempool.test.ts
 * @description Tests for validated mempool acceptance (submitTransaction).
 */

import type { NodeConfig, Transaction } from "../types/index.js";
import { JGCNode } from "../network/node.js";
import { txSigHash } from "../consensus/utxo.js";
import { generateKeyPair, p2pkhScript, signHash, p2pkhScriptSig } from "../crypto/signatures.js";
import { BASE_UNITS_PER_JGC } from "../consensus/emission.js";
import { makeGenesisBlock } from "../sim/harness.js";

const alice = generateKeyPair();
const bob = generateKeyPair();
const J = (n: bigint): bigint => n * BASE_UNITS_PER_JGC;
const FUNDING = "00".repeat(31) + "ee";

function cfg(): NodeConfig {
  return { listenPort: 0, rpcPort: 0, networkMagic: 0xD9B4BEF9, maxPeers: 8, enableBroker: false, junctionGeneratorMode: false };
}

function fundedNode(): JGCNode {
  const node = new JGCNode(cfg(), makeGenesisBlock());
  node.getUTXOSet().add(FUNDING, 0, { value: J(10n), scriptPubKey: p2pkhScript(alice.publicKey), height: 0, isCoinbase: false });
  return node;
}

function spend(outs: Transaction["outputs"], signer = alice): Transaction {
  const tx: Transaction = {
    version: 1, inputs: [{ prevOut: { txid: FUNDING, vout: 0 }, scriptSig: "", sequence: 0xFFFFFFFF }],
    outputs: outs, locktime: 0,
  };
  tx.inputs[0]!.scriptSig = p2pkhScriptSig(signHash(signer.privateKey, txSigHash(tx)), signer.publicKey);
  return tx;
}

describe("mempool acceptance", () => {
  test("valid signed spend is accepted", () => {
    const node = fundedNode();
    const r = node.submitTransaction(spend([{ value: J(6n), scriptPubKey: p2pkhScript(bob.publicKey) }]));
    expect(r.ok).toBe(true);
    expect(node.getMempool()).toHaveLength(1);
  });

  test("duplicate submission is rejected", () => {
    const node = fundedNode();
    const tx = spend([{ value: J(6n), scriptPubKey: p2pkhScript(bob.publicKey) }]);
    expect(node.submitTransaction(tx).ok).toBe(true);
    expect(node.submitTransaction(tx).ok).toBe(false);
    expect(node.getMempool()).toHaveLength(1);
  });

  test("mempool double-spend (same input, different tx) is rejected", () => {
    const node = fundedNode();
    expect(node.submitTransaction(spend([{ value: J(6n), scriptPubKey: p2pkhScript(bob.publicKey) }])).ok).toBe(true);
    // A different tx spending the same funded output.
    const r = node.submitTransaction(spend([{ value: J(5n), scriptPubKey: p2pkhScript(bob.publicKey) }]));
    expect(r.ok).toBe(false);
    expect(node.getMempool()).toHaveLength(1);
  });

  test("spending an unknown output is rejected", () => {
    const node = fundedNode();
    const tx: Transaction = {
      version: 1, inputs: [{ prevOut: { txid: "ff".repeat(32), vout: 0 }, scriptSig: "", sequence: 0xFFFFFFFF }],
      outputs: [{ value: J(1n), scriptPubKey: p2pkhScript(bob.publicKey) }], locktime: 0,
    };
    tx.inputs[0]!.scriptSig = p2pkhScriptSig(signHash(alice.privateKey, txSigHash(tx)), alice.publicKey);
    expect(node.submitTransaction(tx).ok).toBe(false);
  });

  test("overspend is rejected", () => {
    const node = fundedNode();
    expect(node.submitTransaction(spend([{ value: J(11n), scriptPubKey: p2pkhScript(bob.publicKey) }])).ok).toBe(false);
  });

  test("spend signed by the wrong key is rejected", () => {
    const node = fundedNode();
    expect(node.submitTransaction(spend([{ value: J(6n), scriptPubKey: p2pkhScript(bob.publicKey) }], bob)).ok).toBe(false);
  });
});
