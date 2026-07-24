/**
 * @file src/wallet/wallet.ts
 * @description JGC wallet — key management, balance/UTXO scanning, and spend
 * construction (UTXO selection + P2PKH signing) over the canonical ledger.
 *
 * The wallet never touches consensus state directly: it reads a UTXOSet to find
 * its coins and emits a fully-signed Transaction that the node validates exactly
 * like any other (submitTransaction → validateSpend). Keys are persisted in an
 * AES-256-GCM keystore sealed with a scrypt-derived key, so a stolen keystore
 * file is useless without the passphrase.
 *
 * BITCOIN ANALOG: the wallet half of Bitcoin Core — CWallet (keystore) + coin
 * selection (CreateTransaction) + signing (SignTransaction). Address/script
 * QUANTUM-READY: keys are ML-DSA-65 (FIPS 204) and spends are PQ-signed
 * (src/crypto/pq-signatures.ts). Legacy secp256k1 keystore records are NOT
 * loadable — this is the clean-sheet quantum chain.
 */

import {
  createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual,
} from "crypto";
import type { Transaction, JGCSatoshis } from "../types/index.js";
import { UTXOSet, txid, txSigHash, COINBASE_MATURITY } from "../consensus/utxo.js";
import { BASE_UNITS_PER_JGC, DECIMALS } from "../consensus/emission.js";
import {
  pqGenerateKeyPair, pqAddressFromPublicKey, pqScriptPubKey, pqScriptSig,
  pqSignHash, pqScriptPubKeyFromAddress, pqIsValidPublicKey,
} from "../crypto/pq-signatures.js";

// ─────────────────────────────────────────────────────────────────────────────
// Money formatting (16-decimal JGC ⇄ base units), string-exact (no float)
// ─────────────────────────────────────────────────────────────────────────────

/** Format base units as a JGC decimal string, e.g. 65000000000000000n → "6.5". */
export function formatJGC(sats: JGCSatoshis): string {
  const neg = sats < 0n;
  const v = neg ? -sats : sats;
  const whole = v / BASE_UNITS_PER_JGC;
  const frac = (v % BASE_UNITS_PER_JGC).toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + whole.toString() + (frac ? "." + frac : "");
}

/** Parse a JGC decimal string into base units. Rejects >16 fractional digits
 *  (sub-base-unit precision can't be represented and must not be silently lost). */
export function parseJGC(text: string): JGCSatoshis {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) throw new Error(`invalid JGC amount: "${text}"`);
  const frac = m[2] ?? "";
  if (frac.length > DECIMALS) {
    throw new Error(`amount "${text}" has more than ${DECIMALS} decimal places`);
  }
  return BigInt(m[1]!) * BASE_UNITS_PER_JGC + BigInt(frac.padEnd(DECIMALS, "0") || "0");
}

// ─────────────────────────────────────────────────────────────────────────────
// Keystore
// ─────────────────────────────────────────────────────────────────────────────

interface KeyRecord { privateKey: string; publicKey: string; }

/** On-disk encrypted keystore envelope (JSON). The plaintext is the JSON map of
 *  label → {privateKey, publicKey}; only it is secret, the params are public. */
export interface KeystoreFile {
  version: 1;
  kdf: "scrypt";
  scrypt: { N: number; r: number; p: number; keyLen: number };
  salt: string;     // hex
  iv: string;       // hex (12 bytes, GCM nonce)
  authTag: string;  // hex (16 bytes, GCM tag)
  ciphertext: string; // hex
}

const SCRYPT = { N: 1 << 15, r: 8, p: 1, keyLen: 32 } as const;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  // maxmem must be raised above the default 32 MB for N=2^15.
  return scryptSync(passphrase, salt, SCRYPT.keyLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 128 * 1024 * 1024 });
}

export interface SpendUTXO { txid: string; vout: number; value: JGCSatoshis; height: number; isCoinbase: boolean; }

/**
 * A labelled set of secp256k1 keys plus the spend logic over them. Construct via
 * {@link Wallet.create} (empty), {@link Wallet.fromKeystore} (decrypt), and
 * serialize with {@link Wallet.toKeystore} (encrypt).
 */
export class Wallet {
  private readonly keys = new Map<string, KeyRecord>();

  static create(): Wallet { return new Wallet(); }

  /** Decrypt a keystore envelope with the passphrase. Throws on a wrong
   *  passphrase (GCM auth failure) or a tampered file. */
  static fromKeystore(file: KeystoreFile, passphrase: string): Wallet {
    if (file.version !== 1 || file.kdf !== "scrypt") throw new Error("unsupported keystore format");
    const key = deriveKey(passphrase, Buffer.from(file.salt, "hex"));
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(file.iv, "hex"));
    decipher.setAuthTag(Buffer.from(file.authTag, "hex"));
    let plain: string;
    try {
      plain = decipher.update(Buffer.from(file.ciphertext, "hex"), undefined, "utf8") + decipher.final("utf8");
    } catch {
      throw new Error("keystore decryption failed (wrong passphrase or corrupt file)");
    }
    const obj = JSON.parse(plain) as Record<string, KeyRecord>;
    const w = new Wallet();
    for (const [label, rec] of Object.entries(obj)) w.keys.set(label, rec);
    return w;
  }

  /** Encrypt the wallet into a keystore envelope under the passphrase. */
  toKeystore(passphrase: string): KeystoreFile {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = deriveKey(passphrase, salt);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const plain = JSON.stringify(Object.fromEntries(this.keys));
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return {
      version: 1, kdf: "scrypt", scrypt: { ...SCRYPT },
      salt: salt.toString("hex"), iv: iv.toString("hex"),
      authTag: cipher.getAuthTag().toString("hex"), ciphertext: ct.toString("hex"),
    };
  }

  // ── Key management ──────────────────────────────────────────────────────────

  /** Create a fresh key under `label`. Throws if the label already exists (so a
   *  rerun can never silently overwrite — and orphan — funded keys). */
  generate(label: string): string {
    if (this.keys.has(label)) throw new Error(`key "${label}" already exists`);
    const kp = pqGenerateKeyPair();
    this.keys.set(label, kp);
    return pqAddressFromPublicKey(kp.publicKey);
  }

  /** Import an existing ML-DSA keypair under `label`. Unlike secp256k1, an
   *  ML-DSA secret key does NOT cheaply yield its public key, so both halves are
   *  required (as produced by generate()/pqGenerateKeyPair). */
  importKey(label: string, privateKeyHex: string, publicKeyHex: string): string {
    if (this.keys.has(label)) throw new Error(`key "${label}" already exists`);
    if (!pqIsValidPublicKey(publicKeyHex)) throw new Error("public key must be a valid ML-DSA-65 public key (hex)");
    this.keys.set(label, { privateKey: privateKeyHex.toLowerCase(), publicKey: publicKeyHex.toLowerCase() });
    return pqAddressFromPublicKey(publicKeyHex);
  }

  has(label: string): boolean { return this.keys.has(label); }
  labels(): string[] { return [...this.keys.keys()]; }

  private rec(label: string): KeyRecord {
    const r = this.keys.get(label);
    if (!r) throw new Error(`unknown key "${label}"`);
    return r;
  }

  publicKey(label: string): string { return this.rec(label).publicKey; }
  privateKey(label: string): string { return this.rec(label).privateKey; }
  address(label: string): string { return pqAddressFromPublicKey(this.rec(label).publicKey); }

  // ── Chain views ─────────────────────────────────────────────────────────────

  /** Spendable UTXOs for `label` at `currentHeight` (mature coinbase only). */
  listUnspent(label: string, utxo: UTXOSet, currentHeight: number): SpendUTXO[] {
    const mine = pqScriptPubKey(this.rec(label).publicKey);
    const out: SpendUTXO[] = [];
    for (const { txid: id, vout, entry } of utxo.entries()) {
      if (entry.scriptPubKey !== mine) continue;
      if (entry.isCoinbase && currentHeight - entry.height < COINBASE_MATURITY) continue;
      out.push({ txid: id, vout, value: entry.value, height: entry.height, isCoinbase: entry.isCoinbase });
    }
    return out;
  }

  /** Total spendable balance for `label` (sum of mature UTXOs). */
  balance(label: string, utxo: UTXOSet, currentHeight: number): JGCSatoshis {
    return this.listUnspent(label, utxo, currentHeight).reduce((s, u) => s + u.value, 0n);
  }

  // ── Spend construction ──────────────────────────────────────────────────────

  /**
   * Build a fully-signed spend of `amount` (base units) from `fromLabel` to a
   * JGC address, paying `fee`. Greedy coin selection (largest-first) over the
   * sender's mature UTXOs; change (if any) returns to the sender's own address.
   * Every input is signed (SIGHASH_ALL-style) over the same canonical sighash.
   *
   * Throws on insufficient funds. The returned tx passes validateSpend as-is.
   */
  buildSpend(args: {
    fromLabel: string;
    toAddress: string;
    amount: JGCSatoshis;
    fee: JGCSatoshis;
    utxo: UTXOSet;
    currentHeight: number;
  }): { tx: Transaction; txid: string; fee: JGCSatoshis; change: JGCSatoshis } {
    const { fromLabel, toAddress, amount, fee, utxo, currentHeight } = args;
    if (amount <= 0n) throw new Error("amount must be positive");
    if (fee < 0n) throw new Error("fee must be non-negative");
    const need = amount + fee;

    const candidates = this.listUnspent(fromLabel, utxo, currentHeight)
      .sort((a, b) => (a.value < b.value ? 1 : a.value > b.value ? -1 : 0)); // largest first

    const selected: SpendUTXO[] = [];
    let inSum = 0n;
    for (const u of candidates) {
      selected.push(u);
      inSum += u.value;
      if (inSum >= need) break;
    }
    if (inSum < need) {
      throw new Error(`insufficient funds: need ${formatJGC(need)} JGC (amount+fee), have ${formatJGC(inSum)} JGC`);
    }

    const change = inSum - need;
    const outputs: Transaction["outputs"] = [
      { value: amount, scriptPubKey: pqScriptPubKeyFromAddress(toAddress) },
    ];
    // Return change to the sender. Zero change adds no output (addTransactionOutputs
    // would drop a 0-value output anyway); the difference stays as the fee.
    if (change > 0n) {
      outputs.push({ value: change, scriptPubKey: pqScriptPubKey(this.rec(fromLabel).publicKey) });
    }

    const tx: Transaction = {
      version: 1,
      inputs: selected.map(u => ({ prevOut: { txid: u.txid, vout: u.vout }, scriptSig: "", sequence: 0xFFFFFFFF })),
      outputs,
      locktime: 0,
    };

    // SIGHASH_ALL: every input commits to the same digest over all outputs/outpoints.
    const sigHash = txSigHash(tx);
    const { privateKey, publicKey } = this.rec(fromLabel);
    for (const input of tx.inputs) {
      input.scriptSig = pqScriptSig(pqSignHash(privateKey, sigHash), publicKey);
    }

    return { tx, txid: txid(tx), fee, change };
  }
}

/** Constant-time equality (re-exported for callers comparing secrets/addresses). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
