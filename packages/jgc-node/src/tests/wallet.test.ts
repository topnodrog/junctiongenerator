/**
 * @file src/tests/wallet.test.ts
 * @description Wallet unit tests: money formatting, encrypted keystore, balance
 * scanning, coin selection + change, and signed-spend validity against the ledger.
 */

import { Wallet, formatJGC, parseJGC } from "../wallet/wallet.js";
import { UTXOSet, validateSpend, COINBASE_MATURITY } from "../consensus/utxo.js";
import { pqScriptPubKey, pqScriptPubKeyFromAddress } from "../crypto/pq-signatures.js";
import { pqGenerateKeyPair } from "../crypto/pq-signatures.js";
import { BASE_UNITS_PER_JGC } from "../consensus/emission.js";

const MATURITY = COINBASE_MATURITY;

const J = (n: bigint): bigint => n * BASE_UNITS_PER_JGC;

describe("money formatting", () => {
  test("parse/format round-trips", () => {
    expect(parseJGC("6")).toBe(J(6n));
    expect(parseJGC("6.5")).toBe(65n * (BASE_UNITS_PER_JGC / 10n));
    expect(parseJGC("0.0001")).toBe(BASE_UNITS_PER_JGC / 10_000n);
    expect(formatJGC(J(6n))).toBe("6");
    expect(formatJGC(65n * (BASE_UNITS_PER_JGC / 10n))).toBe("6.5");
    expect(formatJGC(BASE_UNITS_PER_JGC / 10_000n)).toBe("0.0001");
  });
  test("rejects sub-base-unit precision", () => {
    expect(() => parseJGC("1.00000000000000001")).toThrow(); // 17 decimals
  });
  test("rejects garbage", () => {
    expect(() => parseJGC("abc")).toThrow();
    expect(() => parseJGC("-5")).toThrow();
  });
});

describe("keystore", () => {
  test("encrypts and decrypts with the right passphrase", () => {
    const w = Wallet.create();
    const addr = w.generate("a");
    const file = w.toKeystore("pw");
    expect(JSON.stringify(file)).not.toContain(w.privateKey("a")); // secret not in plaintext
    const w2 = Wallet.fromKeystore(file, "pw");
    expect(w2.address("a")).toBe(addr);
    expect(w2.privateKey("a")).toBe(w.privateKey("a"));
  });
  test("wrong passphrase throws", () => {
    const w = Wallet.create(); w.generate("a");
    const file = w.toKeystore("pw");
    expect(() => Wallet.fromKeystore(file, "nope")).toThrow();
  });
  test("tampered ciphertext is rejected (GCM auth)", () => {
    const w = Wallet.create(); w.generate("a");
    const file = w.toKeystore("pw");
    const flipped = file.ciphertext.slice(0, -2) + (file.ciphertext.endsWith("00") ? "01" : "00");
    expect(() => Wallet.fromKeystore({ ...file, ciphertext: flipped }, "pw")).toThrow();
  });
  test("duplicate label is rejected", () => {
    const w = Wallet.create(); w.generate("a");
    expect(() => w.generate("a")).toThrow();
  });
  test("rejects weakened KDF settings before decryption", () => {
    const w = Wallet.create(); w.generate("a");
    const file = w.toKeystore("pw");
    expect(() => Wallet.fromKeystore({ ...file, scrypt: { ...file.scrypt, N: 2 } }, "pw")).toThrow(/KDF/i);
  });
  test("import rejects malformed or mismatched keypairs", () => {
    const a = pqGenerateKeyPair("aa".repeat(32));
    const b = pqGenerateKeyPair("bb".repeat(32));
    const w = Wallet.create();
    expect(() => w.importKey("bad-size", "aa", a.publicKey)).toThrow(/private key/i);
    expect(() => w.importKey("mismatch", a.privateKey, b.publicKey)).toThrow(/does not match/i);
    expect(w.labels()).toEqual([]);
  });
});

describe("balance + coin selection", () => {
  function funded(): { wallet: Wallet; utxo: UTXOSet } {
    const wallet = Wallet.create();
    wallet.generate("alice");
    wallet.generate("bob");
    const utxo = new UTXOSet();
    const spk = pqScriptPubKey(wallet.publicKey("alice"));
    utxo.add("aa".repeat(32), 0, { value: J(5n), scriptPubKey: spk, height: 0, isCoinbase: false });
    utxo.add("bb".repeat(32), 0, { value: J(3n), scriptPubKey: spk, height: 0, isCoinbase: false });
    return { wallet, utxo };
  }

  test("balance sums only the owner's mature outputs", () => {
    const { wallet, utxo } = funded();
    expect(wallet.balance("alice", utxo, 100)).toBe(J(8n));
    expect(wallet.balance("bob", utxo, 100)).toBe(0n);
  });

  test("immature coinbase is excluded from balance", () => {
    const { wallet, utxo } = funded();
    utxo.add("cc".repeat(32), 0, { value: J(50n), scriptPubKey: pqScriptPubKey(wallet.publicKey("alice")), height: 10, isCoinbase: true });
    expect(wallet.balance("alice", utxo, 10 + MATURITY - 1)).toBe(J(8n));      // still locked
    expect(wallet.balance("alice", utxo, 10 + MATURITY)).toBe(J(58n));         // matured
  });

  test("buildSpend selects coins, makes change, and signs a valid spend", () => {
    const { wallet, utxo } = funded();
    const { tx, fee, change } = wallet.buildSpend({
      fromLabel: "alice", toAddress: wallet.address("bob"),
      amount: J(6n), fee: BASE_UNITS_PER_JGC / 10_000n, utxo, currentHeight: 100,
    });
    // 5 + 3 selected (largest-first); change = 8 - 6 - fee back to alice.
    expect(tx.inputs.length).toBe(2);
    expect(change).toBe(J(2n) - fee);
    // first output pays bob exactly; the spend validates against the ledger.
    expect(tx.outputs[0]!.scriptPubKey).toBe(pqScriptPubKeyFromAddress(wallet.address("bob")));
    expect(tx.outputs[0]!.value).toBe(J(6n));
    const res = validateSpend(tx, utxo, 100);
    expect(res.ok).toBe(true);
    expect(res.fee).toBe(fee);
  });

  test("insufficient funds throws", () => {
    const { wallet, utxo } = funded();
    expect(() => wallet.buildSpend({
      fromLabel: "alice", toAddress: wallet.address("bob"),
      amount: J(100n), fee: 0n, utxo, currentHeight: 100,
    })).toThrow(/insufficient/);
  });

  test("exact-amount spend produces no change output (difference is fee)", () => {
    const { wallet, utxo } = funded();
    const { tx, change } = wallet.buildSpend({
      fromLabel: "alice", toAddress: wallet.address("bob"),
      amount: J(8n), fee: 0n, utxo, currentHeight: 100,
    });
    expect(change).toBe(0n);
    expect(tx.outputs.length).toBe(1);
  });
});
