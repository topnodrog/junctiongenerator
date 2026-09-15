/** Versioned JGC recovery derivation. BIP39 words do not imply BIP32/EVM support. */
import { hkdfSync, randomBytes } from "node:crypto";
import { entropyToMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { pqGenerateKeyPair } from "../crypto/pq-signatures.js";

export const MAX_RECOVERY_ACCOUNTS = 100;
export const RECOVERY_SCHEME = "jgc-ml-dsa65-bip39-hkdf-v1";

export function normalizeRecoveryPhrase(phrase: string): string {
  if (typeof phrase !== "string" || phrase.length > 512) throw new Error("Invalid recovery phrase");
  const normalized = phrase.normalize("NFKD").trim().toLowerCase().split(/\s+/).join(" ");
  if (normalized.split(" ").length !== 24 || !validateMnemonic(normalized, wordlist)) {
    throw new Error("Expected 24 English recovery words with a valid checksum");
  }
  return normalized;
}

export function generateRecoveryPhrase(): string {
  // OS-backed CSPRNG; no clocks, Math.random, remote entropy or fallback PRNG.
  const entropy = randomBytes(32);
  try { return entropyToMnemonic(entropy, wordlist); }
  finally { entropy.fill(0); }
}

export function recoveryKeyPair(phrase: string, chainId: string, index: number): { privateKey: string; publicKey: string } {
  if (!/^[a-z0-9-]{1,64}$/.test(chainId)) throw new Error("Invalid recovery network");
  if (!Number.isSafeInteger(index) || index < 0 || index >= MAX_RECOVERY_ACCOUNTS) throw new Error("Invalid recovery account index");
  // Empty BIP39 passphrase is deliberate: the local encryption password does
  // not change recovered addresses. No hidden '25th word' recovery dependency.
  const seed = mnemonicToSeedSync(normalizeRecoveryPhrase(phrase), "");
  const derived = Buffer.from(hkdfSync("sha512", seed, Buffer.from(RECOVERY_SCHEME),
    Buffer.from(JSON.stringify([chainId, index])), 32));
  try { return pqGenerateKeyPair(derived.toString("hex")); }
  finally { seed.fill(0); derived.fill(0); }
}
