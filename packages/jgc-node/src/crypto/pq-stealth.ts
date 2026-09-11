/**
 * Experimental ML-KEM-768 one-time destinations. V1 was unsafe: public data
 * sufficed to reconstruct spending keys. V2 rejects V1 records and keys.
 * This is NOT a shielded payment protocol: amounts and spends remain public,
 * and the sender knows the spending seed. Do not use for valuable payments.
 * Production needs recipient-exclusive spending authority and external review.
 * The historically named "view" secret here grants spending authority.
 */
import { createHash, randomBytes } from "crypto";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { pqGenerateKeyPair, pqAddressFromPublicKey } from "./pq-signatures.js";

const DOMAIN = "JGC-PQ-STEALTH-v2";
const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");

function decode(value: string, length: number, label: string): Uint8Array {
  if (typeof value !== "string" || value.length !== length * 2 || !/^[0-9a-f]+$/i.test(value)) {
    throw new Error(`invalid stealth ${label}`);
  }
  return Uint8Array.from(Buffer.from(value, "hex"));
}

function hash(label: string, ...parts: Uint8Array[]): Buffer {
  const h = createHash("sha3-256").update(DOMAIN).update(label);
  for (const part of parts) h.update(part);
  return h.digest();
}

export interface StealthMetaAddress {
  /** ML-KEM-768 public key; V1 ML-DSA keys are incompatible. */
  viewPublicKey: string;
  metaAddress: string;
}

export interface StealthPayment {
  version: 2;
  kemCiphertext: string;
  oneTimeAddress: string;
}

/** Deterministic identities accept a 32-byte backup seed; never publish it. */
export function pqStealthGenerateIdentity(seedHex?: string): {
  viewSecretKey: string; viewPublicKey: string; metaAddress: string;
} {
  const seed = seedHex === undefined ? randomBytes(32) : decode(seedHex, 32, "seed");
  const kemSeed = createHash("sha3-512").update(DOMAIN).update("identity").update(seed).digest();
  const kp = ml_kem768.keygen(kemSeed);
  kemSeed.fill(0);
  seed.fill(0);
  const viewPublicKey = hex(kp.publicKey);
  const viewSecretKey = hex(kp.secretKey);
  kp.secretKey.fill(0);
  return { viewSecretKey, viewPublicKey, metaAddress: pqStealthMetaAddress(viewPublicKey) };
}

export function pqStealthMetaAddress(viewPublicKeyHex: string): string {
  return "st2qgc" + hex(hash("meta", decode(viewPublicKeyHex, 1184, "public key")));
}

export function pqStealthCreatePayment(recipientViewPublicKeyHex: string): {
  payment: StealthPayment;
  /** Also known to the sender: experimental destinations only. */
  oneTimeSeed: string;
} {
  const publicKey = decode(recipientViewPublicKeyHex, 1184, "public key");
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(publicKey);
  try {
    const oneTimeSeed = hex(hash("seed", sharedSecret, publicKey, cipherText));
    const oneTime = pqGenerateKeyPair(oneTimeSeed);
    return {
      payment: { version: 2, kemCiphertext: hex(cipherText), oneTimeAddress: pqAddressFromPublicKey(oneTime.publicKey) },
      oneTimeSeed,
    };
  } finally {
    sharedSecret.fill(0);
  }
}

/** Invalid, legacy, tampered, and other-recipient records fail closed. */
export function pqStealthScanAndRecover(
  viewSecretKeyHex: string,
  viewPublicKeyHex: string,
  payment: StealthPayment,
): { oneTimeSecretKey: string; oneTimePublicKey: string; oneTimeAddress: string } | null {
  let secretKey: Uint8Array | undefined;
  let sharedSecret: Uint8Array | undefined;
  try {
    if (!payment || payment.version !== 2 || !/^1QGC[0-9a-f]{40}$/.test(payment.oneTimeAddress)) return null;
    const publicKey = decode(viewPublicKeyHex, 1184, "public key");
    secretKey = decode(viewSecretKeyHex, 2400, "secret key");
    const ciphertext = decode(payment.kemCiphertext, 1088, "ciphertext");
    sharedSecret = ml_kem768.decapsulate(ciphertext, secretKey);
    const oneTime = pqGenerateKeyPair(hex(hash("seed", sharedSecret, publicKey, ciphertext)));
    const address = pqAddressFromPublicKey(oneTime.publicKey);
    if (address !== payment.oneTimeAddress) return null;
    return { oneTimeSecretKey: oneTime.privateKey, oneTimePublicKey: oneTime.publicKey, oneTimeAddress: address };
  } catch {
    return null;
  } finally {
    secretKey?.fill(0);
    sharedSecret?.fill(0);
  }
}

export function pqStealthNewSeed(): string {
  return randomBytes(32).toString("hex");
}
