/**
 * Recipient-gated post-quantum payment discovery.
 *
 * Version 1 derived a spendable ML-DSA seed entirely from public data. Anyone
 * watching the chain could therefore recover the payment key. Version 2 uses
 * ML-KEM-768: only the holder of the recipient's view secret can decapsulate
 * the shared secret and recognise the destination. Spending remains bound to
 * a separate ML-DSA key, which the sender never learns.
 *
 * This is a private-scanning prototype, not a complete shielded pool. Spending
 * reveals the long-term spend public key and can therefore link already-spent
 * notes. The API deliberately avoids claiming Zcash-equivalent privacy.
 */

import { createHash, randomBytes } from "crypto";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import {
  pqGenerateKeyPair,
  pqIsValidPrivateKey,
  pqIsValidPublicKey,
  pqKeyPairMatches,
} from "./pq-signatures.js";
import {
  PQ_CRYPTO_SUITE,
  decodeCanonicalHex,
  encodeTaggedFields,
  isCanonicalHex,
} from "./pq-suite.js";

const STEALTH_DOMAIN = "JGC-PQ-PRIVATE-SCAN-v2";
const STEALTH_PREFIX = "st1qg2";
const STEALTH_DESTINATION_PREFIX = "1QST";

// FIPS 203 ML-KEM-768 encoded sizes.
export const PQ_STEALTH_SIZES = Object.freeze({
  seed: 64,
  publicKey: 1184,
  secretKey: 2400,
  cipherText: 1088,
  sharedSecret: 32,
} as const);

const toHex = (value: Uint8Array): string => Buffer.from(value).toString("hex");

function H(domain: string, fields: ReadonlyArray<readonly [string, string | Uint8Array]>): Buffer {
  return createHash("sha3-256").update(encodeTaggedFields(domain, fields)).digest();
}

function deriveSeed(masterSeed: Uint8Array, label: string, bytes: number): Uint8Array {
  const output = createHash(bytes <= 32 ? "sha3-256" : "sha3-512")
    .update(encodeTaggedFields(STEALTH_DOMAIN, [["suite", PQ_CRYPTO_SUITE.id], ["label", label], ["master", masterSeed]]))
    .digest();
  return Uint8Array.from(output.subarray(0, bytes));
}

export interface StealthMetaAddress {
  scheme: "JGC-PQ-PRIVATE-SCAN-v2";
  /** ML-KEM-768 public key used only for private payment discovery. */
  viewPublicKey: string;
  /** ML-DSA-65 public key that authorises a later spend. */
  spendPublicKey: string;
  /** Versioned, publishable encoding of both public keys. */
  metaAddress: string;
}

export interface StealthPayment {
  scheme: "JGC-PQ-PRIVATE-SCAN-v2";
  /** FIPS 203 ML-KEM-768 ciphertext. */
  kemCiphertext: string;
  /** Unique 256-bit destination commitment. */
  oneTimeAddress: string;
}

export interface StealthIdentity extends StealthMetaAddress {
  viewSecretKey: string;
  spendSecretKey: string;
}

export interface RecoveredStealthPayment {
  spendSecretKey: string;
  spendPublicKey: string;
  oneTimeAddress: string;
  /** Needed by the future stealth spend script; never publish before spending. */
  sharedSecret: string;
}

function validateViewPublicKey(value: string): boolean {
  return isCanonicalHex(value, PQ_STEALTH_SIZES.publicKey);
}

function validateViewSecretKey(value: string): boolean {
  return isCanonicalHex(value, PQ_STEALTH_SIZES.secretKey);
}

function destinationAddress(viewPublicKey: string, spendPublicKey: string, ciphertext: string, sharedSecret: Uint8Array): string {
  return STEALTH_DESTINATION_PREFIX + H(STEALTH_DOMAIN, [
    ["suite", PQ_CRYPTO_SUITE.id],
    ["viewPublicKey", viewPublicKey],
    ["spendPublicKey", spendPublicKey],
    ["ciphertext", ciphertext],
    ["sharedSecret", sharedSecret],
  ]).toString("hex");
}

/** Generate independent ML-KEM view keys and ML-DSA spend keys. */
export function pqStealthGenerateIdentity(seedHex?: string): StealthIdentity {
  const master = seedHex === undefined
    ? randomBytes(32)
    : Buffer.from(decodeCanonicalHex(seedHex, 32, "stealth master seed"));
  const view = ml_kem768.keygen(deriveSeed(master, "view", PQ_STEALTH_SIZES.seed));
  const spend = pqGenerateKeyPair(toHex(deriveSeed(master, "spend", 32)));
  const viewPublicKey = toHex(view.publicKey);
  const spendPublicKey = spend.publicKey;
  return {
    scheme: "JGC-PQ-PRIVATE-SCAN-v2",
    viewSecretKey: toHex(view.secretKey),
    viewPublicKey,
    spendSecretKey: spend.privateKey,
    spendPublicKey,
    metaAddress: pqStealthMetaAddress(viewPublicKey, spendPublicKey),
  };
}

/** Encode the public ML-KEM view key and ML-DSA spend key without ambiguity. */
export function pqStealthMetaAddress(viewPublicKey: string, spendPublicKey: string): string {
  if (!validateViewPublicKey(viewPublicKey)) throw new Error("invalid ML-KEM-768 view public key");
  if (!pqIsValidPublicKey(spendPublicKey)) throw new Error("invalid ML-DSA-65 spend public key");
  return `${STEALTH_PREFIX}:${viewPublicKey}:${spendPublicKey}`;
}

export function pqStealthParseMetaAddress(metaAddress: string): StealthMetaAddress | null {
  const parts = metaAddress.split(":");
  if (parts.length !== 3 || parts[0] !== STEALTH_PREFIX) return null;
  const [, viewPublicKey, spendPublicKey] = parts;
  if (!viewPublicKey || !spendPublicKey) return null;
  if (!validateViewPublicKey(viewPublicKey) || !pqIsValidPublicKey(spendPublicKey)) return null;
  return { scheme: "JGC-PQ-PRIVATE-SCAN-v2", viewPublicKey, spendPublicKey, metaAddress };
}

/**
 * Create a payment commitment. The sender learns the KEM shared secret (as all
 * KEM senders do) but never receives or derives the recipient's spend key.
 */
export function pqStealthCreatePayment(recipient: StealthMetaAddress): { payment: StealthPayment } {
  if (recipient.scheme !== "JGC-PQ-PRIVATE-SCAN-v2") throw new Error("unsupported stealth scheme");
  if (!validateViewPublicKey(recipient.viewPublicKey)) throw new Error("invalid ML-KEM-768 view public key");
  if (!pqIsValidPublicKey(recipient.spendPublicKey)) throw new Error("invalid ML-DSA-65 spend public key");
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(decodeCanonicalHex(
    recipient.viewPublicKey,
    PQ_STEALTH_SIZES.publicKey,
    "ML-KEM-768 view public key"
  ));
  const kemCiphertext = toHex(cipherText);
  return {
    payment: {
      scheme: "JGC-PQ-PRIVATE-SCAN-v2",
      kemCiphertext,
      oneTimeAddress: destinationAddress(recipient.viewPublicKey, recipient.spendPublicKey, kemCiphertext, sharedSecret),
    },
  };
}

/**
 * Recognise a payment. A wrong view secret decapsulates to a different secret,
 * so the destination commitment does not match and recovery fails.
 */
export function pqStealthScanAndRecover(
  identity: StealthIdentity,
  payment: StealthPayment
): RecoveredStealthPayment | null {
  try {
    if (identity.scheme !== "JGC-PQ-PRIVATE-SCAN-v2" || payment.scheme !== identity.scheme) return null;
    if (!validateViewPublicKey(identity.viewPublicKey) || !validateViewSecretKey(identity.viewSecretKey)) return null;
    if (!pqIsValidPrivateKey(identity.spendSecretKey) || !pqIsValidPublicKey(identity.spendPublicKey)) return null;
    if (!pqKeyPairMatches(identity.spendSecretKey, identity.spendPublicKey)) return null;
    if (!isCanonicalHex(payment.kemCiphertext, PQ_STEALTH_SIZES.cipherText)) return null;
    if (!new RegExp(`^${STEALTH_DESTINATION_PREFIX}[0-9a-f]{64}$`).test(payment.oneTimeAddress)) return null;

    const sharedSecret = ml_kem768.decapsulate(
      decodeCanonicalHex(payment.kemCiphertext, PQ_STEALTH_SIZES.cipherText, "ML-KEM ciphertext"),
      decodeCanonicalHex(identity.viewSecretKey, PQ_STEALTH_SIZES.secretKey, "ML-KEM secret key")
    );
    const expected = destinationAddress(
      identity.viewPublicKey,
      identity.spendPublicKey,
      payment.kemCiphertext,
      sharedSecret
    );
    if (expected !== payment.oneTimeAddress) return null;
    return {
      spendSecretKey: identity.spendSecretKey,
      spendPublicKey: identity.spendPublicKey,
      oneTimeAddress: expected,
      sharedSecret: toHex(sharedSecret),
    };
  } catch {
    return null;
  }
}

/** Convenience: fresh random 32-byte master seed (hex). */
export function pqStealthNewSeed(): string {
  return randomBytes(32).toString("hex");
}
