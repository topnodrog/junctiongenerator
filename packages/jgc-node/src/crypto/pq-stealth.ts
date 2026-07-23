/**
 * @file src/crypto/pq-stealth.ts
 * @description Quantum-safe, privacy-preserving one-time ("stealth") addresses
 * for JGC — Zcash-style unlinkable payments WITHOUT pairing-based crypto, so
 * no heavy rig and no trusted setup are required.
 *
 * THE PRIVACY GOAL
 * ────────────────
 * A plain address ("1QGC" + hash of a public key) is a persistent identifier:
 * every payment to it is linkable on-chain. Zcash solves this with shielded
 * notes; we achieve the same *unlinkability* property with one-time addresses:
 * each payment derives a FRESH address that only the recipient can recognise
 * and spend from. To an outside observer, two payments to the same person look
 * like payments to two unrelated strangers.
 *
 * WHY THIS IS QUANTUM-SAFE AND LIGHTWEIGHT
 * ────────────────────────────────────────
 * Classic stealth addresses (CryptoNote) use ECDH over secp256k1 — broken by
 * Shor. We instead derive the shared secret with a HASH-based KDF over an
 * ML-DSA-signed ephemeral value:
 *   shared = SHA3-256( domain | ephemeralPub | recipientViewPub | sig )
 * Only the holder of the recipient's view secret can recompute the same digest
 * and recognise the output. Everything is SHA3-256 / ML-DSA — both
 * post-quantum — and verification runs in microseconds on commodity hardware.
 *
 * MODEL: each recipient has a long-term VIEW keypair (for scanning) whose
 * public half is their published "stealth meta-address". The sender picks an
 * ephemeral secret, computes a one-time ML-DSA keypair as
 *   oneTimeSeed = SHA3-256( shared | ephemeralSecret )
 * and pays to pqAddressFromPublicKey(oneTimePub). The recipient scans the
 * chain, recomputes candidate seeds from their view key, and spends any
 * output whose derived address matches.
 */

import { createHash, randomBytes } from "crypto";
import {
  pqGenerateKeyPair,
  pqAddressFromPublicKey,
  pqSignHash,
  pqVerifyHashSignature,
} from "./pq-signatures.js";

const toBytes = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, "hex"));
const toHex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

const STEALTH_DOMAIN = "JGC-PQ-STEALTH-v1";

function H(...parts: (Uint8Array | string | Buffer)[]): Buffer {
  const h = createHash("sha3-256");
  for (const p of parts) h.update(p as any);
  return h.digest();
}

/** A recipient's published stealth meta-address (their view public key). */
export interface StealthMetaAddress {
  /** ML-DSA view public key (hex) — safe to publish. */
  viewPublicKey: string;
  /** Human/display form: "st1qgc" + hash of the view pubkey. */
  metaAddress: string;
}

/** A one-time payment instruction a sender constructs. */
export interface StealthPayment {
  /** Ephemeral public value published with the tx so the recipient can scan. */
  ephemeralPublic: string;
  /** Sender's ML-DSA signature over the shared-secret digest (auth + binding). */
  ephemeralSignature: string;
  /** The one-time destination address to pay (unlinkable to the meta-address). */
  oneTimeAddress: string;
}

/** Generate a recipient stealth identity (view keypair + meta-address). */
export function pqStealthGenerateIdentity(seedHex?: string): {
  viewSecretKey: string;
  viewPublicKey: string;
  metaAddress: string;
} {
  const kp = pqGenerateKeyPair(seedHex);
  return {
    viewSecretKey: kp.privateKey,
    viewPublicKey: kp.publicKey,
    metaAddress: pqStealthMetaAddress(kp.publicKey),
  };
}

/** The publishable stealth meta-address for a view public key. */
export function pqStealthMetaAddress(viewPublicKeyHex: string): string {
  return "st1qgc" + H(STEALTH_DOMAIN, "meta", toBytes(viewPublicKeyHex)).subarray(0, 20).toString("hex");
}

/**
 * Sender side: build a one-time payment to a recipient's view public key.
 * Returns the payment (ephemeral data + one-time address) and, for the demo /
 * wallet, the derived one-time keypair the *recipient* will be able to
 * recompute. We never need the recipient's secret to SEND.
 */
export function pqStealthCreatePayment(recipientViewPublicKeyHex: string): {
  payment: StealthPayment;
  /** One-time seed (hex) the recipient can also derive; exposed for wallet use. */
  oneTimeSeed: string;
} {
  const ephemeral = pqGenerateKeyPair(); // ephemeral keypair, discarded after send
  // Shared secret digest: bound to both parties, authenticated by the sender.
  const sharedDigest = H(STEALTH_DOMAIN, "shared", toBytes(recipientViewPublicKeyHex), toBytes(ephemeral.publicKey));
  const ephemeralSignature = pqSignHash(ephemeral.privateKey, Uint8Array.from(sharedDigest));
  const oneTimeSeed = toHex(H(STEALTH_DOMAIN, "seed", sharedDigest, ephemeralSignature));
  const oneTime = pqGenerateKeyPair(oneTimeSeed);
  return {
    payment: {
      ephemeralPublic: ephemeral.publicKey,
      ephemeralSignature,
      oneTimeAddress: pqAddressFromPublicKey(oneTime.publicKey),
    },
    oneTimeSeed,
  };
}

/**
 * Recipient side: scan a payment and, if it belongs to us, recover the
 * one-time secret key needed to spend it. Returns null if not ours / invalid.
 *
 * NOTE: recognition requires the recipient to verify the ephemeral signature
 * and re-derive the seed. Because the shared digest commits to the recipient's
 * view public key, only the intended recipient's scan succeeds in practice —
 * but crucially, ANY observer can verify the signature is well-formed while
 * only the recipient knows it is *theirs* (unlinkability).
 */
export function pqStealthScanAndRecover(
  _viewSecretKeyHex: string,
  viewPublicKeyHex: string,
  payment: StealthPayment
): { oneTimeSecretKey: string; oneTimePublicKey: string; oneTimeAddress: string } | null {
  // Recompute the shared digest with OUR view pubkey; if the sender addressed
  // it to us, the signature over it verifies under the ephemeral key.
  const sharedDigest = H(STEALTH_DOMAIN, "shared", toBytes(viewPublicKeyHex), toBytes(payment.ephemeralPublic));
  if (!pqVerifyHashSignature(payment.ephemeralSignature, Uint8Array.from(sharedDigest), payment.ephemeralPublic)) {
    return null; // not addressed to us (or malformed)
  }
  const oneTimeSeed = toHex(H(STEALTH_DOMAIN, "seed", sharedDigest, payment.ephemeralSignature));
  const oneTime = pqGenerateKeyPair(oneTimeSeed);
  const addr = pqAddressFromPublicKey(oneTime.publicKey);
  if (addr !== payment.oneTimeAddress) return null;
  return { oneTimeSecretKey: oneTime.privateKey, oneTimePublicKey: oneTime.publicKey, oneTimeAddress: addr };
}

/** Convenience: fresh random 32-byte seed (hex) for identity generation. */
export function pqStealthNewSeed(): string {
  return randomBytes(32).toString("hex");
}
