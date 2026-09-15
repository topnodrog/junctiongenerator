/**
 * ML-DSA-65 (FIPS 204) contribution and transaction signatures.
 * Primitive security is not end-to-end quantum readiness. Public keys are
 * 1,952 bytes, secret keys 4,032 bytes, and signatures 3,309 bytes.
 * Legacy 1QGC addresses and 5114 scripts truncate SHA3-256 to 160 bits:
 * roughly 80-bit generic quantum preimage work, not a 128-bit PQ floor.
 * Preserve pilot encodings; full-length commitments need versioned migration.
 * Independent review of the complete protocol remains required.
 */

import { createHash, randomBytes } from "crypto";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import type { MinerComputeContribution } from "../types/index.js";

const toBytes = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, "hex"));
const toHex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

/** ML-DSA-65 encoded sizes (bytes) — used for input validation. */
export const PQ_SIZES = ml_dsa65.lengths as {
  secretKey: number; publicKey: number; seed: number; signature: number; signRand: number;
};

/** Historical signature domain; does not isolate forks sharing this domain. */
export const JGC_PQ_NETWORK_ID = "JGC-quantum-v1";

/** SHA3-256 digest (quantum-safe hash). */
function sha3_256(data: Uint8Array | string): Buffer {
  return createHash("sha3-256").update(data as any).digest();
}

/**
 * Legacy ML-DSA JGC address from an ML-DSA public key:
 *   "1QGC" + hex( SHA3-256(pk)[0:20] ).
 * Commits to a truncated hash of a lattice key. 20-byte payload keeps addresses
 * the same length as the legacy "1JGC" hash160 form.
 */
export function pqAddressFromPublicKey(publicKeyHex: string): string {
  return "1QGC" + sha3_256(toBytes(publicKeyHex)).subarray(0, 20).toString("hex");
}

/**
 * Generate a fresh ML-DSA-65 keypair from a 32-byte seed.
 * Returns hex-encoded { privateKey (4032 B), publicKey (1952 B) }.
 * If no seed is given, Node's OS-backed CSPRNG supplies 32 bytes. Failure throws.
 */
export function pqGenerateKeyPair(seedHex?: string): { privateKey: string; publicKey: string } {
  if (seedHex !== undefined && !/^[0-9a-fA-F]{64}$/.test(seedHex)) throw new Error("ML-DSA seed must be exactly 32 bytes of hex");
  const seed = seedHex === undefined ? randomBytes(32) : toBytes(seedHex);
  try {
    const kp = ml_dsa65.keygen(seed);
    return { privateKey: toHex(kp.secretKey), publicKey: toHex(kp.publicKey) };
  } finally { seed.fill(0); }
}

/** Check both encoded lengths and that the secret actually controls the public key. */
export function pqIsMatchingKeyPair(privateKey: string, publicKey: string): boolean {
  if (!pqIsValidPrivateKey(privateKey) || !pqIsValidPublicKey(publicKey)) return false;
  try {
    const message = sha3_256("JGC wallet keypair validation v1");
    return ml_dsa65.verify(ml_dsa65.sign(message, toBytes(privateKey)), message, toBytes(publicKey));
  } catch { return false; }
}

/** Validate that a hex string is a well-formed ML-DSA-65 public key. */
export function pqIsValidPublicKey(publicKeyHex: string): boolean {
  return typeof publicKeyHex === "string" && new RegExp(`^[0-9a-fA-F]{${PQ_SIZES.publicKey * 2}}$`).test(publicKeyHex);
}

/** Validate that a hex string is a well-formed ML-DSA-65 private key. */
export function pqIsValidPrivateKey(privateKeyHex: string): boolean {
  return typeof privateKeyHex === "string" && new RegExp(`^[0-9a-fA-F]{${PQ_SIZES.secretKey * 2}}$`).test(privateKeyHex);
}

/** Validate that a hex string is a well-formed ML-DSA-65 signature. */
export function pqIsValidSignature(sigHex: string): boolean {
  return /^[0-9a-fA-F]+$/.test(sigHex) && toBytes(sigHex).length === PQ_SIZES.signature;
}

/**
 * Canonical 32-byte digest a contribution signature commits to:
 *   SHA3-256( networkId | minerAddress | taskCommitment | circuitId |
 *             tflopsWeight | height ).
 * The fixed historical domain does not isolate forks sharing that domain.
 */
export function pqContributionSigHash(c: MinerComputeContribution, height: number): Uint8Array {
  const preimage = [
    JGC_PQ_NETWORK_ID,
    c.minerAddress,
    c.proof.taskCommitment,
    c.proof.circuitId,
    String(c.proof.tflopsWeight),
    String(height),
  ].join("|");
  return Uint8Array.from(sha3_256(preimage));
}

/** Sign a contribution with the miner's ML-DSA secret key (hex) → signature hex. */
export function pqSignContribution(
  privateKeyHex: string,
  c: MinerComputeContribution,
  height: number
): string {
  const msg = pqContributionSigHash(c, height);
  return toHex(ml_dsa65.sign(msg, toBytes(privateKeyHex)));
}

/**
 * Verify a contribution's ML-DSA signature AND that the payee address is
 * derived from the signing key. Rejects malformed keys/signatures.
 */
export function pqVerifyContributionSignature(c: MinerComputeContribution, height: number): boolean {
  const { minerAddress, publicKey, signature } = c as any;
  if (!pqIsValidPublicKey(publicKey) || !pqIsValidSignature(signature)) return false;
  if (pqAddressFromPublicKey(publicKey) !== minerAddress) return false;
  try {
    return ml_dsa65.verify(toBytes(signature), pqContributionSigHash(c, height), toBytes(publicKey));
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction-spend (PQ "P2PK") primitives
// ─────────────────────────────────────────────────────────────────────────────

/** SHA3-256(pubkey)[0:20], hex — the PQ analogue of hash160 for script binding. */
export function pqHashPublicKey(publicKeyHex: string): string {
  return sha3_256(toBytes(publicKeyHex)).subarray(0, 20).toString("hex");
}

/**
 * PQ pay-to-public-key-hash scriptPubKey. Layout mirrors legacy P2PKH but with
 * a distinct version byte (0x51) so the two script families are unambiguous:
 *   51 14 <20-byte keyHash> 63 ac   (OP_PQCHECK <hash> OP_EQUAL OP_CHECKSIG)
 * (The opcode names are illustrative — JGC validates scripts by recomputation,
 *  not by a VM, so this is a compact, parseable commitment format.)
 */
export function pqScriptPubKey(publicKeyHex: string): string {
  return "5114" + pqHashPublicKey(publicKeyHex) + "63ac";
}

/** Extract the 20-byte key hash (hex) from a PQ scriptPubKey, or null. */
export function pqHashFromScriptPubKey(scriptPubKey: string): string | null {
  const m = /^5114([0-9a-fA-F]{40})63ac$/.exec(scriptPubKey);
  return m ? m[1]!.toLowerCase() : null;
}

/** ML-DSA-sign a 32-byte digest with a secret key (hex) → signature hex. */
export function pqSignHash(privateKeyHex: string, hash32: Uint8Array): string {
  return toHex(ml_dsa65.sign(hash32, toBytes(privateKeyHex)));
}

/**
 * Verify an ML-DSA signature (hex) over a 32-byte digest by a public key (hex).
 * Constant-shape validation; returns false (never throws) on malformed input.
 */
export function pqVerifyHashSignature(sigHex: string, hash32: Uint8Array, publicKeyHex: string): boolean {
  if (!pqIsValidSignature(sigHex) || !pqIsValidPublicKey(publicKeyHex)) return false;
  try {
    return ml_dsa65.verify(toBytes(sigHex), hash32, toBytes(publicKeyHex));
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// scriptSig builders + spend verification (consensus-facing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PQ analogue of p2pkhScriptSig: the unlocking data for a PQ scriptPubKey.
 * Format  "<sigHex> <publicKeyHex>"  (space-separated, like legacy P2PKH).
 */
export function pqScriptSig(signatureHex: string, publicKeyHex: string): string {
  return `${signatureHex} ${publicKeyHex}`;
}

/**
 * Legacy ML-DSA counterpart of scriptPubKeyFromAddress: build the PQ
 * scriptPubKey that pays to a "1QGC" address. Throws on a malformed address.
 * (PQ addresses commit to a 20-byte key hash, so the script can be rebuilt
 *  from the address alone — same ergonomics as legacy P2PKH.)
 */
export function pqScriptPubKeyFromAddress(address: string): string {
  const m = /^1QGC([0-9a-f]{40})$/.exec(address);
  if (!m) throw new Error(`invalid PQ address: ${address}`);
  return "5114" + m[1] + "63ac";
}

export interface PQSpendVerification {
  ok: boolean;
  error?: string;
}

/**
 * Verify a PQ spend: the scriptSig must contain a valid ML-DSA signature over
 * the sighash by a public key whose hash matches the PQ scriptPubKey's key hash.
 * Address binding retains the legacy 160-bit hash limitation.
 */
export function pqVerifySpend(scriptSig: string, scriptPubKey: string, sighash: Uint8Array): PQSpendVerification {
  const keyHash = pqHashFromScriptPubKey(scriptPubKey);
  if (!keyHash) return { ok: false, error: "scriptPubKey is not a PQ (5114…63ac) script" };
  const parts = scriptSig.trim().split(/\s+/);
  if (parts.length !== 2) return { ok: false, error: "scriptSig must be \"<sig> <pubkey>\"" };
  const [sigHex, pubHex] = parts as [string, string];
  if (!pqIsValidPublicKey(pubHex)) return { ok: false, error: "malformed public key in scriptSig" };
  if (!pqIsValidSignature(sigHex)) return { ok: false, error: "malformed signature in scriptSig" };
  if (pqHashPublicKey(pubHex) !== keyHash) {
    return { ok: false, error: "public key does not match scriptPubKey key hash" };
  }
  if (!pqVerifyHashSignature(sigHex, sighash, pubHex)) {
    return { ok: false, error: "ML-DSA signature verification failed" };
  }
  return { ok: true };
}
