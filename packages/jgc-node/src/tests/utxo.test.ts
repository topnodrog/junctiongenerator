/**
 * @file src/tests/utxo.test.ts
 * @description Tests for the UTXO ledger: value conservation, double-spend
 * prevention, coinbase maturity, and P2PKH spend authorization.
 */

import type { Transaction } from "../types/index.js";
import { UTXOSet, validateSpend, txid, txSigHash, COINBASE_MATURITY } from "../consensus/utxo.js";
import { generateKeyPair, p2pkhScript, signHash, p2pkhScriptSig } from "../crypto/signatures.js";
import { BASE_UNITS_PER_JGC } from "../consensus/emission.js";

const alice = generateKeyPair();
const bob = generateKeyPair();
const J = (n: bigint): bigint => n * BASE_UNITS_PER_JGC;
const MATURE = COINBASE_MATURITY;

function fund(): { utxo: UTXOSet; cb: string } {
  const coinbase: Transaction = {
    version: 1, inputs: [],
    outputs: [{ value: J(10n), scriptPubKey: p2pkhScript(alice.publicKey) }],
    locktime: 0,
  };
  const utxo = new UTXOSet();
  utxo.applyTransaction(coinbase, 0, true);
  return { utxo, cb: txid(coinbase) };
}

function spend(cb: string, outs: Transaction["outputs"]): Transaction {
  return { version: 1, inputs: [{ prevOut: { txid: cb, vout: 0 }, scriptSig: "", sequence: 0xFFFFFFFF }], outputs: outs, locktime: 0 };
}

function sign(tx: Transaction, key: { privateKey: string; publicKey: string }): Transaction {
  tx.inputs[0]!.scriptSig = p2pkhScriptSig(signHash(key.privateKey, txSigHash(tx)), key.publicKey);
  return tx;
}

describe("UTXO ledger", () => {
  test("valid signed spend conserves value and reports the fee", () => {
    const { utxo, cb } = fund();
    const tx = sign(spend(cb, [
      { value: J(6n), scriptPubKey: p2pkhScript(bob.publicKey) },
      { value: J(4n) - 1000n, scriptPubKey: p2pkhScript(alice.publicKey) },
    ]), alice);
    const r = validateSpend(tx, utxo, MATURE);
    expect(r.ok).toBe(true);
    expect(r.fee).toBe(1000n);
  });

  test("applyTransaction spends the input and creates outputs", () => {
    const { utxo, cb } = fund();
    const tx = sign(spend(cb, [{ value: J(6n), scriptPubKey: p2pkhScript(bob.publicKey) }]), alice);
    utxo.applyTransaction(tx, MATURE, false);
    expect(utxo.has(cb, 0)).toBe(false);          // input consumed
    expect(utxo.has(txid(tx), 0)).toBe(true);      // output created
  });

  test("double-spend of a consumed input is rejected", () => {
    const { utxo, cb } = fund();
    const tx = sign(spend(cb, [{ value: J(6n), scriptPubKey: p2pkhScript(bob.publicKey) }]), alice);
    utxo.applyTransaction(tx, MATURE, false);
    expect(validateSpend(tx, utxo, MATURE).ok).toBe(false);
  });

  test("overspend (inflation) is rejected", () => {
    const { utxo, cb } = fund();
    const tx = sign(spend(cb, [{ value: J(11n), scriptPubKey: p2pkhScript(bob.publicKey) }]), alice);
    const r = validateSpend(tx, utxo, MATURE);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/overspend/);
  });

  test("spending an unknown output is rejected", () => {
    const { utxo } = fund();
    const tx = sign(spend("ff".repeat(32), [{ value: J(1n), scriptPubKey: p2pkhScript(bob.publicKey) }]), alice);
    expect(validateSpend(tx, utxo, MATURE).ok).toBe(false);
  });

  test("bad signature is rejected", () => {
    const { utxo, cb } = fund();
    const tx = sign(spend(cb, [{ value: J(6n), scriptPubKey: p2pkhScript(bob.publicKey) }]), alice);
    tx.inputs[0]!.scriptSig = (tx.inputs[0]!.scriptSig[0] === "a" ? "b" : "a") + tx.inputs[0]!.scriptSig.slice(1);
    expect(validateSpend(tx, utxo, MATURE).ok).toBe(false);
  });

  test("spend signed by the wrong key is rejected (no theft)", () => {
    const { utxo, cb } = fund();
    const tx = sign(spend(cb, [{ value: J(6n), scriptPubKey: p2pkhScript(bob.publicKey) }]), bob); // Bob signs Alice's coin
    expect(validateSpend(tx, utxo, MATURE).ok).toBe(false);
  });

  test("immature coinbase cannot be spent", () => {
    const { utxo, cb } = fund();
    const tx = sign(spend(cb, [{ value: J(6n), scriptPubKey: p2pkhScript(bob.publicKey) }]), alice);
    const r = validateSpend(tx, utxo, 5);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/immature/);
  });

  test("duplicate input within a tx is rejected", () => {
    const { utxo, cb } = fund();
    const tx: Transaction = {
      version: 1,
      inputs: [
        { prevOut: { txid: cb, vout: 0 }, scriptSig: "", sequence: 0xFFFFFFFF },
        { prevOut: { txid: cb, vout: 0 }, scriptSig: "", sequence: 0xFFFFFFFF },
      ],
      outputs: [{ value: J(6n), scriptPubKey: p2pkhScript(bob.publicKey) }],
      locktime: 0,
    };
    expect(validateSpend(tx, utxo, MATURE).ok).toBe(false);
  });

  test("sighash ignores scriptSig contents (signature can't sign itself)", () => {
    const { cb } = fund();
    const base = spend(cb, [{ value: J(6n), scriptPubKey: p2pkhScript(bob.publicKey) }]);
    const h1 = Buffer.from(txSigHash(base)).toString("hex");
    base.inputs[0]!.scriptSig = "deadbeef";
    const h2 = Buffer.from(txSigHash(base)).toString("hex");
    expect(h1).toBe(h2);
  });
});
