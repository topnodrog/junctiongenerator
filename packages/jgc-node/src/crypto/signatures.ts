/**
 * @file src/crypto/signatures.ts
 * @description secp256k1 (ECDSA) signing/verification for JGC — miner compute
 * contributions and (later) transaction spends.
 *
 * BITCOIN ANALOG: libsecp256k1 ECDSA over the same curve. Keys are compressed
 * secp256k1 points (33 bytes, 02/03 prefix); signatures are 64-byte compact
 * (r‖s). Verification uses @noble/secp256k1 (audited, zero-dep).
 *
 * SECURITY MODEL (compute contributions):
 *   A contribution is authentic iff
 *     (1) minerAddress == addressFromPublicKey(publicKey)  — the payee address
 *         is controlled by the signing key (you can only earn to an address you
 *         own), AND
 *     (2) signature is a valid ECDSA sig over contributionSigHash by publicKey.
 *   The sighash binds minerAddress, the proven work (taskCommitment, circuitId,
 *   tflopsWeight) and the block height — so a signature cannot be replayed for a
 *   different payee, a different claim, or a different block.
 */

import { createHash, createHmac } from "crypto";
import * as secp from "@noble/secp256k1";
import type { MinerComputeContribution } from "../types/index.js";

// @noble/secp256k1 v3 defaults to async WebCrypto hashing; wire Node's sync
// primitives so sign()/verify() work synchronously (RFC6979 needs HMAC-SHA256).
secp.hashes.sha256 = (msg) =>
  new Uint8Array(createHash("sha256").update(msg).digest());
secp.hashes.hmacSha256 = (key, msg) =>
  new Uint8Array(createHmac("sha256", Buffer.from(key)).update(msg).digest());

const toBytes = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, "hex"));
const toHex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

/**
 * Bitcoin's hash160 = RIPEMD160(SHA256(x)). Falls back to SHA256d(x)[:20] on the
 * rare Node/OpenSSL build without ripemd160 — deterministic either way.
 */
function hash160(data: Uint8Array): Buffer {
  const sha = createHash("sha256").update(data).digest();
  try {
    return createHash("ripemd160").update(sha).digest();
  } catch {
    return createHash("sha256").update(sha).digest().subarray(0, 20);
  }
}

/**
 * JGC address from a compressed secp256k1 public key: "1JGC" + hex(hash160(pk)).
 * Deterministic and collision-resistant; binds an address to exactly one key.
 * (Production would base58check-encode; hex keeps this dependency-light.)
 */
export function addressFromPublicKey(publicKeyHex: string): string {
  return "1JGC" + hash160(toBytes(publicKeyHex)).toString("hex");
}

/** Generate a fresh keypair: { privateKey, publicKey } as hex (pubkey compressed). */
export function generateKeyPair(): { privateKey: string; publicKey: string } {
  const priv = secp.utils.randomSecretKey();
  return { privateKey: toHex(priv), publicKey: toHex(secp.getPublicKey(priv, true)) };
}

/**
 * Canonical 32-byte digest a contribution signature commits to:
 *   SHA256d( minerAddress | taskCommitment | circuitId | tflopsWeight | height ).
 */
export function contributionSigHash(c: MinerComputeContribution, height: number): Uint8Array {
  const preimage = [
    c.minerAddress,
    c.proof.taskCommitment,
    c.proof.circuitId,
    String(c.proof.tflopsWeight),
    String(height),
  ].join("|");
  const first = createHash("sha256").update(preimage, "utf8").digest();
  return Uint8Array.from(createHash("sha256").update(first).digest());
}

/** Sign a contribution with the miner's private key (hex) → 64-byte compact sig hex. */
export function signContribution(privateKeyHex: string, c: MinerComputeContribution, height: number): string {
  const sig = secp.sign(contributionSigHash(c, height), toBytes(privateKeyHex), { prehash: false });
  return toHex(sig);
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction-spend (P2PKH) primitives
// ─────────────────────────────────────────────────────────────────────────────

/** hash160 (RIPEMD160∘SHA256) of a compressed public key, hex. */
export function hash160Hex(publicKeyHex: string): string {
  return hash160(toBytes(publicKeyHex)).toString("hex");
}

/** P2PKH scriptPubKey for a public key: 76a914 <hash160> 88ac. */
export function p2pkhScript(publicKeyHex: string): string {
  return "76a914" + hash160Hex(publicKeyHex) + "88ac";
}

/** Extract the 20-byte hash160 (hex) from a P2PKH scriptPubKey, or null. */
export function hash160FromP2PKH(scriptPubKey: string): string | null {
  const m = /^76a914([0-9a-fA-F]{40})88ac$/.exec(scriptPubKey);
  return m ? m[1]!.toLowerCase() : null;
}

/** ECDSA-sign a 32-byte digest with a private key (hex) → 64-byte compact sig hex. */
export function signHash(privateKeyHex: string, hash32: Uint8Array): string {
  return toHex(secp.sign(hash32, toBytes(privateKeyHex), { prehash: false }));
}

/** Verify a compact sig (hex) over a 32-byte digest by a public key (hex). */
export function verifyHashSignature(sigHex: string, hash32: Uint8Array, publicKeyHex: string): boolean {
  try {
    return secp.verify(toBytes(sigHex), hash32, toBytes(publicKeyHex), { prehash: false });
  } catch {
    return false;
  }
}

/**
 * Verify a P2PKH spend: the scriptSig's pubkey must hash to the output's
 * hash160, and its signature must be valid over `sigHash`.
 * scriptSig encoding: <64-byte compact sig hex (128)> ‖ <33-byte pubkey hex (66)>.
 */
export function verifyP2PKHSpend(
  scriptSig: string,
  scriptPubKey: string,
  sigHash: Uint8Array,
): { ok: boolean; error?: string } {
  if (scriptSig.length !== 128 + 66) {
    return { ok: false, error: "malformed scriptSig (expected sig‖pubkey)" };
  }
  const sigHex = scriptSig.slice(0, 128);
  const pubHex = scriptSig.slice(128);
  const expected = hash160FromP2PKH(scriptPubKey);
  if (expected === null) {
    return { ok: false, error: "scriptPubKey is not P2PKH" };
  }
  if (hash160Hex(pubHex) !== expected) {
    return { ok: false, error: "pubkey does not match output hash160" };
  }
  return verifyHashSignature(sigHex, sigHash, pubHex)
    ? { ok: true }
    : { ok: false, error: "spend signature invalid" };
}

/** Build a P2PKH scriptSig from a signature hex and compressed pubkey hex. */
export function p2pkhScriptSig(sigHex: string, publicKeyHex: string): string {
  return sigHex + publicKeyHex;
}

/**
 * Verify a contribution's signature AND that its address is derived from its
 * public key. Returns { ok } or { ok: false, error }.
 */
export function verifyContributionSignature(
  c: MinerComputeContribution,
  height: number,
): { ok: boolean; error?: string } {
  if (addressFromPublicKey(c.publicKey) !== c.minerAddress) {
    return { ok: false, error: "minerAddress is not derived from publicKey" };
  }
  try {
    const ok = secp.verify(toBytes(c.signature), contributionSigHash(c, height), toBytes(c.publicKey), { prehash: false });
    return ok ? { ok: true } : { ok: false, error: "ECDSA signature verification failed" };
  } catch (e) {
    return { ok: false, error: `signature/key decode error: ${String(e)}` };
  }
}
