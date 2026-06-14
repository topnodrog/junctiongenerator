/**
 * @file src/scripts/utxo-demo.ts
 * @description UTXO ledger demo — value conservation, double-spend prevention,
 * coinbase maturity, and P2PKH spend authorization.
 *
 *   1. A coinbase funds Alice with 10 JGC.
 *   2. Once mature, Alice spends it: 6 JGC → Bob, 3.9999 JGC change, 0.0001 fee
 *      — a real secp256k1-signed P2PKH spend that the ledger ACCEPTS, then the
 *      UTXO set is updated (coinbase consumed, two new outputs created).
 *   3. Forgeries are REJECTED: double-spend, overspend (inflation), spending an
 *      unknown output, a bad signature, and an immature coinbase.
 *
 * Run:  npm run utxo-demo     (after npm run build)
 */

import type { Transaction } from "../types/index.js";
import { UTXOSet, validateSpend, txid, txSigHash, COINBASE_MATURITY } from "../consensus/utxo.js";
import { generateKeyPair, p2pkhScript, signHash, p2pkhScriptSig } from "../crypto/signatures.js";
import { BASE_UNITS_PER_JGC } from "../consensus/emission.js";

const JGC = (n: bigint): bigint => n * BASE_UNITS_PER_JGC;
const CENTI = BASE_UNITS_PER_JGC / 10_000n; // 0.0001 JGC

const alice = generateKeyPair();
const bob = generateKeyPair();

/** A fresh UTXO set funding Alice with a 10-JGC coinbase at height 0. */
function fundedSet(): { utxo: UTXOSet; coinbaseId: string } {
  const coinbase: Transaction = {
    version: 1, inputs: [],
    outputs: [{ value: JGC(10n), scriptPubKey: p2pkhScript(alice.publicKey) }],
    locktime: 0,
  };
  const utxo = new UTXOSet();
  utxo.applyTransaction(coinbase, 0, true);
  return { utxo, coinbaseId: txid(coinbase) };
}

/** Sign tx input 0 as a P2PKH spend by `key`. */
function signInput0(tx: Transaction, key: { privateKey: string; publicKey: string }): Transaction {
  const sig = signHash(key.privateKey, txSigHash(tx));
  tx.inputs[0]!.scriptSig = p2pkhScriptSig(sig, key.publicKey);
  return tx;
}

function spendFrom(coinbaseId: string, outputs: Transaction["outputs"]): Transaction {
  return {
    version: 1,
    inputs: [{ prevOut: { txid: coinbaseId, vout: 0 }, scriptSig: "", sequence: 0xFFFFFFFF }],
    outputs,
    locktime: 0,
  };
}

function pad(s: string, n: number): string { return s.length >= n ? s : s + " ".repeat(n - s.length); }

function main(): void {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(" JGC Node — UTXO ledger: value conservation + spend authorization");
  console.log("══════════════════════════════════════════════════════════════");

  let allOk = true;
  const row = (label: string, expectOk: boolean, res: { ok: boolean; error?: string; fee?: bigint }): void => {
    const pass = res.ok === expectOk;
    allOk = allOk && pass;
    const detail = res.ok ? (res.fee !== undefined ? `fee=${res.fee}` : "") : `(${res.error ?? ""})`;
    console.log(`  ${pad(label, 34)} ${res.ok ? "accept " : "reject "}  expect ${expectOk ? "accept" : "reject"}  ${pass ? "✓" : "✗"}  ${detail}`.slice(0, 110));
  };

  const height = COINBASE_MATURITY; // coinbase is mature

  // ── Positive: a valid signed spend, then apply it ─────────────────────────
  console.log("  POSITIVE:");
  {
    const { utxo, coinbaseId } = fundedSet();
    const tx = signInput0(spendFrom(coinbaseId, [
      { value: JGC(6n),               scriptPubKey: p2pkhScript(bob.publicKey) },
      { value: JGC(4n) - CENTI,       scriptPubKey: p2pkhScript(alice.publicKey) }, // 3.9999 change
    ]), alice);
    const res = validateSpend(tx, utxo, height);
    row("valid signed spend (6→Bob, change)", true, res);

    const before = utxo.size;
    utxo.applyTransaction(tx, height, false);
    const applied = !utxo.has(coinbaseId, 0) && utxo.size === before - 1 + tx.outputs.length;
    row("UTXO updated (coinbase spent, +2)", true, { ok: applied });

    // Double-spend: the same input is now gone.
    row("double-spend same input", false, validateSpend(tx, utxo, height));
  }

  // ── Negatives (each on a fresh funded set) ────────────────────────────────
  console.log("  NEGATIVE:");
  {
    const { utxo, coinbaseId } = fundedSet();
    const tx = signInput0(spendFrom(coinbaseId, [
      { value: JGC(11n), scriptPubKey: p2pkhScript(bob.publicKey) }, // > 10 in
    ]), alice);
    row("overspend (outputs > inputs)", false, validateSpend(tx, utxo, height));
  }
  {
    const { utxo } = fundedSet();
    const tx = signInput0(spendFrom("ff".repeat(32), [
      { value: JGC(1n), scriptPubKey: p2pkhScript(bob.publicKey) },
    ]), alice);
    row("spend unknown output", false, validateSpend(tx, utxo, height));
  }
  {
    const { utxo, coinbaseId } = fundedSet();
    const tx = signInput0(spendFrom(coinbaseId, [
      { value: JGC(6n), scriptPubKey: p2pkhScript(bob.publicKey) },
    ]), alice);
    // Corrupt the signature half of the scriptSig.
    tx.inputs[0]!.scriptSig = (tx.inputs[0]!.scriptSig[0] === "a" ? "b" : "a") + tx.inputs[0]!.scriptSig.slice(1);
    row("bad signature", false, validateSpend(tx, utxo, height));
  }
  {
    const { utxo, coinbaseId } = fundedSet();
    const tx = signInput0(spendFrom(coinbaseId, [
      { value: JGC(6n), scriptPubKey: p2pkhScript(bob.publicKey) },
    ]), alice);
    row("immature coinbase (height 5)", false, validateSpend(tx, utxo, 5));
  }
  {
    // Spend authorized by the WRONG key (Bob tries to spend Alice's output).
    const { utxo, coinbaseId } = fundedSet();
    const tx = signInput0(spendFrom(coinbaseId, [
      { value: JGC(6n), scriptPubKey: p2pkhScript(bob.publicKey) },
    ]), bob);
    row("spend signed by wrong key", false, validateSpend(tx, utxo, height));
  }

  console.log("──────────────────────────────────────────────────────────────");
  console.log("[UTXO] value conserved, double-spend/overspend/forgery rejected");
  console.log(`[UTXO] RESULT: ${allOk ? "PASS ✓" : "FAIL ✗"}`);
  if (!allOk) process.exit(1);
}

main();
