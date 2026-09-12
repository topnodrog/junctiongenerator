import { createCipheriv, createHash, scryptSync } from "node:crypto";
import { Wallet } from "../wallet/wallet.js";
import { generateRecoveryPhrase, normalizeRecoveryPhrase, recoveryKeyPair } from "../wallet/recovery.js";
import { createVerifiedRecoveryWallet, verifyWalletRecovery, type RecoveryPrompts } from "../wallet/onboarding.js";
import { pqGenerateKeyPair } from "../crypto/pq-signatures.js";
import { pqScriptPubKey } from "../crypto/pq-signatures.js";
import { UTXOSet, validateSpend } from "../consensus/utxo.js";

// Public BIP39 zero-entropy vector. Never use this phrase for actual funds.
const PHRASE = `${"abandon ".repeat(23)}art`;
const CHAIN = "jgtc-testnet-v2";

describe("wallet recovery", () => {
  test("preserves the published v1 derivation fingerprint across future releases", () => {
    const publicKey = recoveryKeyPair(PHRASE, CHAIN, 0).publicKey;
    expect(createHash("sha256").update(Buffer.from(publicKey, "hex")).digest("hex"))
      .toBe("af98a9f6cb3a976edc25d32e934302653af8f28fcdbf8f5d30230853e11f07f6");
  });
  test("accepts the public BIP39 vector and rejects bad checksums and short phrases", () => {
    expect(normalizeRecoveryPhrase(`  ${PHRASE.toUpperCase()}  `)).toBe(PHRASE);
    expect(() => normalizeRecoveryPhrase("abandon ".repeat(24))).toThrow("checksum");
    expect(() => normalizeRecoveryPhrase("abandon ".repeat(11) + "about")).toThrow("24");
    expect(generateRecoveryPhrase().split(" ")).toHaveLength(24);
  });

  test("recovers sequential accounts independently of aliases and local password", () => {
    const original = Wallet.fromRecoveryPhrase(PHRASE, CHAIN);
    original.generate("savings");
    const restored = Wallet.fromRecoveryPhrase(PHRASE, CHAIN, 2);
    expect(restored.publicKey("account-0")).toBe(original.publicKey("account-0"));
    expect(restored.privateKey("account-1")).toBe(original.privateKey("savings"));
    const file = original.toKeystore("first password");
    expect(file.version).toBe(2);
    expect(JSON.stringify(file)).not.toContain(PHRASE);
    const decrypted = Wallet.fromKeystore(file, "first password");
    expect(decrypted.recoveryNetwork()).toBe(CHAIN);
    verifyWalletRecovery(decrypted, PHRASE);
    const changedPassword = Wallet.fromKeystore(decrypted.toKeystore("new password"), "new password");
    verifyWalletRecovery(changedPassword, PHRASE);
    changedPassword.generate("third");
    expect(changedPassword.publicKey("third")).toBe(Wallet.fromRecoveryPhrase(PHRASE, CHAIN, 3).publicKey("account-2"));
  });

  test("separates accounts and networks and disallows unrecoverable imported keys", () => {
    const a = recoveryKeyPair(PHRASE, CHAIN, 0);
    expect(a.publicKey).not.toBe(recoveryKeyPair(PHRASE, CHAIN, 1).publicKey);
    expect(a.publicKey).not.toBe(recoveryKeyPair(PHRASE, "jgc-mainnet-v3", 0).publicKey);
    const wallet = Wallet.fromRecoveryPhrase(PHRASE, CHAIN);
    expect(() => wallet.importKey("extra", a.privateKey, a.publicKey)).toThrow("mix");
    expect(() => Wallet.fromRecoveryPhrase(PHRASE, CHAIN, 101)).toThrow();
    expect(() => recoveryKeyPair(PHRASE, CHAIN, -1)).toThrow();
    expect(() => verifyWalletRecovery(wallet, generateRecoveryPhrase())).toThrow("match");
  });

  test("a wallet rebuilt from words can spend its original ledger output", () => {
    const original = Wallet.fromRecoveryPhrase(PHRASE, CHAIN);
    const recipient = Wallet.create(); recipient.generate("recipient");
    const utxo = new UTXOSet();
    utxo.add("ab".repeat(32), 0, { value: 100n, scriptPubKey: pqScriptPubKey(original.publicKey("account-0")), height: 0, isCoinbase: false });
    const recovered = Wallet.fromRecoveryPhrase(PHRASE, CHAIN);
    const { tx } = recovered.buildSpend({ fromLabel: "account-0", toAddress: recipient.address("recipient"), amount: 90n, fee: 10n, utxo, currentHeight: 1 });
    expect(validateSpend(tx, utxo, 1)).toMatchObject({ ok: true, fee: 10n });
  });

  test("does not claim that new words recover existing random keys", () => {
    const old = Wallet.create(); old.generate("old");
    const restored = Wallet.fromKeystore(old.toKeystore("password"), "password");
    expect(restored.publicKey("old")).toBe(old.publicKey("old"));
    expect(() => verifyWalletRecovery(restored, PHRASE)).toThrow("Legacy");
  });

  test("rejects malformed seed hex and mismatched private/public key imports", () => {
    for (const seed of ["", "ab".repeat(31), "ab".repeat(33), "z".repeat(64), "ab".repeat(32) + "x"]) {
      expect(() => pqGenerateKeyPair(seed)).toThrow("32 bytes");
    }
    const a = pqGenerateKeyPair("00".repeat(32));
    const b = pqGenerateKeyPair("01".repeat(32));
    const wallet = Wallet.create();
    expect(() => wallet.importKey("bad", a.privateKey, b.publicKey)).toThrow("matching");
    expect(() => wallet.importKey("bad", a.privateKey + "0", a.publicKey)).toThrow("matching");
    expect(() => wallet.importKey("bad", a.privateKey, a.publicKey + "0")).toThrow("matching");
  });

  test("rejects unsupported KDF parameters and malformed envelopes before decrypting", () => {
    const wallet = Wallet.create(); wallet.generate("old");
    const file = wallet.toKeystore("password");
    expect(() => Wallet.fromKeystore({ ...file, scrypt: { ...file.scrypt, N: 2 ** 30 } }, "password")).toThrow("KDF");
    for (const field of ["salt", "iv", "authTag", "ciphertext"] as const) {
      expect(() => Wallet.fromKeystore({ ...file, [field]: file[field] + "x" }, "password")).toThrow("envelope");
    }
  });

  test("rejects a correctly encrypted but internally inconsistent recovery record", () => {
    const wallet = Wallet.fromRecoveryPhrase(PHRASE, CHAIN);
    const file = wallet.toKeystore("password");
    const key = scryptSync("password", Buffer.from(file.salt, "hex"), 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
    const cipher = createCipheriv("aes-256-gcm", key, Buffer.from(file.iv, "hex"));
    const wrong = {
      keys: { "account-0": { privateKey: wallet.privateKey("account-0"), publicKey: wallet.publicKey("account-0") } },
      recovery: { scheme: "jgc-ml-dsa65-bip39-hkdf-v1", phrase: PHRASE, chainId: "wrong-chain" },
    };
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(wrong)), cipher.final()]).toString("hex");
    expect(() => Wallet.fromKeystore({ ...file, ciphertext, authTag: cipher.getAuthTag().toString("hex") }, "password")).toThrow("do not match");
  });
});

describe("mandatory backup rehearsal", () => {
  function prompts(confirmCorrectly: boolean): RecoveryPrompts {
    let written = "";
    let hidden = false;
    return {
      show(message) { if (message.startsWith("1. ")) written = message.split("\n").map(line => line.slice(line.indexOf(" ") + 1)).join(" "); },
      acknowledge: async question => question.includes("READY") ? "READY" : "",
      clear() { hidden = true; },
      async secret() { expect(hidden).toBe(true); return confirmCorrectly ? written : PHRASE; },
    };
  }
  test("only completes after all words were entered from the hidden backup", async () => {
    const wallet = await createVerifiedRecoveryWallet(prompts(true), CHAIN);
    expect(wallet.labels()).toEqual(["account-0"]);
  });
  test("rejects incorrect words and cancellation without completing setup", async () => {
    await expect(createVerifiedRecoveryWallet(prompts(false), CHAIN)).rejects.toThrow("do not match");
    const io = prompts(true);
    io.acknowledge = async () => "no";
    await expect(createVerifiedRecoveryWallet(io, CHAIN)).rejects.toThrow("cancelled");
  });
});
