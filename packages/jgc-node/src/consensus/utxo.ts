/**
 * @file src/consensus/utxo.ts
 * @description UTXO set + transaction value-conservation and spend authorization.
 *
 * BITCOIN ANALOG: Bitcoin Core's CCoinsViewCache (chainstate). A transaction is
 * valid against the ledger iff every input spends an existing, unspent output
 * (no double-spend / no spending thin air), the spend is authorized by the
 * output's owner (P2PKH signature), coinbase outputs are mature, and
 *   Σ inputs ≥ Σ outputs   (no inflation; the difference is the fee).
 *
 * The coinbase / epoch-settlement transaction creates value (no inputs) and its
 * outputs become new UTXOs; everything else must conserve value.
 *
 * NOTE: this is the ledger subsystem. Wiring it into the live node (maintaining
 * chain.utxos across acceptBlock and replacing the simnet's placeholder spend
 * txs with funded ones) is the remaining integration step.
 */

import { createHash } from "crypto";
import type { Transaction, JGCSatoshis, Hash256 } from "../types/index.js";
import { serializeTransaction } from "./block.js";
import { hashTransaction } from "../crypto/merkle.js";
import { verifyP2PKHSpend } from "../crypto/signatures.js";

/** Coinbase outputs (epoch settlement payouts) can't be spent for this many blocks. */
export const COINBASE_MATURITY = 100;

/** A single unspent output. */
export interface UTXOEntry {
  value: JGCSatoshis;
  scriptPubKey: string;
  height: number;       // block height that created it
  isCoinbase: boolean;  // subject to maturity
}

/** Transaction id = double-SHA256 of its canonical serialization. */
export function txid(tx: Transaction): Hash256 {
  return hashTransaction(serializeTransaction(tx).toString("hex"));
}

/**
 * The 32-byte digest a spend signature commits to (SIGHASH_ALL-style): the
 * transaction serialized with all scriptSigs blanked, double-SHA256'd. Every
 * input signs this same digest, committing to all outputs and outpoints.
 */
export function txSigHash(tx: Transaction): Uint8Array {
  const blanked: Transaction = { ...tx, inputs: tx.inputs.map(i => ({ ...i, scriptSig: "" })) };
  const first = createHash("sha256").update(serializeTransaction(blanked)).digest();
  return new Uint8Array(createHash("sha256").update(first).digest());
}

/** The unspent-transaction-output set (chainstate). */
export class UTXOSet {
  private readonly m = new Map<string, UTXOEntry>();

  private static key(id: Hash256, vout: number): string { return `${id}:${vout}`; }

  get size(): number { return this.m.size; }
  get(id: Hash256, vout: number): UTXOEntry | undefined { return this.m.get(UTXOSet.key(id, vout)); }
  has(id: Hash256, vout: number): boolean { return this.m.has(UTXOSet.key(id, vout)); }

  add(id: Hash256, vout: number, entry: UTXOEntry): void {
    this.m.set(UTXOSet.key(id, vout), entry);
  }

  /** Remove and return an output (marks it spent). */
  spend(id: Hash256, vout: number): UTXOEntry | undefined {
    const k = UTXOSet.key(id, vout);
    const e = this.m.get(k);
    if (e) this.m.delete(k);
    return e;
  }

  /** Add a transaction's value-bearing outputs as new UTXOs. Zero-value outputs
   *  (e.g. the non-boundary coinbase marker, OP_RETURN-style) are unspendable and
   *  are not tracked, to keep the set free of permanent dust. */
  addTransactionOutputs(tx: Transaction, height: number, isCoinbase: boolean): void {
    const id = txid(tx);
    tx.outputs.forEach((o, vout) => {
      if (o.value > 0n) {
        this.add(id, vout, { value: o.value, scriptPubKey: o.scriptPubKey, height, isCoinbase });
      }
    });
  }

  /**
   * Apply a validated transaction: spend its inputs, add its outputs.
   * @param isCoinbase  true for the epoch-settlement coinbase (no inputs spent).
   */
  applyTransaction(tx: Transaction, height: number, isCoinbase: boolean): void {
    if (!isCoinbase) {
      for (const input of tx.inputs) this.spend(input.prevOut.txid, input.prevOut.vout);
    }
    this.addTransactionOutputs(tx, height, isCoinbase);
  }

  /** Deep copy (for validating a candidate block against a scratch view). */
  clone(): UTXOSet {
    const c = new UTXOSet();
    for (const [k, v] of this.m) c.m.set(k, { ...v });
    return c;
  }
}

export interface SpendResult {
  ok: boolean;
  error?: string;
  /** inputs − outputs (only when ok). */
  fee?: JGCSatoshis;
}

/**
 * Validate a non-coinbase transaction against the UTXO set:
 *   - every input exists and is unspent (no double-spend / no phantom inputs),
 *   - no duplicate inputs within the tx,
 *   - coinbase inputs are mature,
 *   - each input is authorized (P2PKH signature over the tx sighash),
 *   - Σ inputs ≥ Σ outputs (no inflation).
 * Returns the fee on success.
 */
export function validateSpend(
  tx: Transaction,
  utxo: UTXOSet,
  currentHeight: number,
  opts: { requireSignatures?: boolean } = {},
): SpendResult {
  const requireSignatures = opts.requireSignatures ?? true;
  const sigHash = txSigHash(tx);

  let inSum = 0n;
  const seen = new Set<string>();
  for (const input of tx.inputs) {
    const key = `${input.prevOut.txid}:${input.prevOut.vout}`;
    if (seen.has(key)) return { ok: false, error: `duplicate input within tx: ${key}` };
    seen.add(key);

    const entry = utxo.get(input.prevOut.txid, input.prevOut.vout);
    if (!entry) return { ok: false, error: `input not in UTXO set (unknown or already spent): ${key}` };

    if (entry.isCoinbase && currentHeight - entry.height < COINBASE_MATURITY) {
      return { ok: false, error: `immature coinbase: needs ${COINBASE_MATURITY} confirmations (got ${currentHeight - entry.height})` };
    }

    if (requireSignatures) {
      const sig = verifyP2PKHSpend(input.scriptSig, entry.scriptPubKey, sigHash);
      if (!sig.ok) return { ok: false, error: `input ${key}: ${sig.error}` };
    }

    inSum += entry.value;
  }

  let outSum = 0n;
  for (const o of tx.outputs) {
    if (o.value < 0n) return { ok: false, error: "negative output value" };
    outSum += o.value;
  }

  if (outSum > inSum) {
    return { ok: false, error: `overspend: outputs ${outSum} > inputs ${inSum}` };
  }
  return { ok: true, fee: inSum - outSum };
}
