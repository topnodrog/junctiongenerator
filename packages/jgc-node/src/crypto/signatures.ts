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
