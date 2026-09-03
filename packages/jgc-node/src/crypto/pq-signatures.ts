/**
 * @file src/crypto/pq-signatures.ts
 * @description Post-quantum signatures for JGC — ML-DSA-65 (Dilithium3, NIST
 * FIPS 204) for miner compute contributions and transaction spends.
 *
 * WHY THIS REPLACES secp256k1/ECDSA (src/crypto/signatures.ts):
 *   ECDSA's security rests on the elliptic-curve discrete-logarithm problem,
 *   which Shor's algorithm solves in polynomial time on a cryptographically
 *   relevant quantum computer (CRQC). Any JGC address whose public key has
 *   been revealed (i.e. any spent UTXO or any announced miner key) would be
 *   forgeable. ML-DSA is a lattice-based scheme whose security rests on the
 *   Module-LWE / Module-SIS problems, for which no efficient quantum (or
 *   classical) attack is known. It is the NIST-standardized successor to
 *   Dilithium and the industry default for post-quantum signatures.
 *
 * PARAMETER CHOICE — ML-DSA-65 ("Dilithium3", NIST security category 3):
 *   Category 3 ≈ AES-192 classical strength, giving comfortable margin above
 *   the 128-bit floor. Key/signature sizes are the cost of lattice crypto:
 *     publicKey 1,952 B · secretKey 4,032 B · signature 3,309 B
 *   Verification is extremely fast (a few µs), which preserves the chain's
 *   throughput goals — the signature check is never the bottleneck next to
 *   proof verification.
 *
 * SECURITY MODEL (compute contributions) — mirrors signatures.ts:
 *   A contribution is authentic iff
 *     (1) minerAddress == pqAddressFromPublicKey(publicKey)  — payee is
 *         controlled by the signing key, AND
 *     (2) signature is a valid ML-DSA sig over contributionSigHash by publicKey.
 *   The sighash binds minerAddress, the proven work (taskCommitment, circuitId,
 *   tflopsWeight) and the block height — no replay across payee/claim/height.
 *
 * ADDRESSES: "1QGC" + hex(SHA3-256(compressed pubkey)[:20]).
 *   SHA3-256 is quantum-safe (Grover's only halves preimage security, so a
 *   256-bit digest retains ~128-bit post-quantum security). We drop the
 *   RIPEMD160 leg of Bitcoin's hash160 because 160-bit preimage resistance is
 *   the weaker link and SHA3-256 truncated to 20 bytes gives an equivalent
 *   160-bit address binding from a single modern primitive.
 */

import { createHash } from "crypto";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import type { MinerComputeContribution } from "../types/index.js";

const toBytes = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, "hex"));
const toHex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

/** ML-DSA-65 encoded sizes (bytes) — used for input validation. */
export const PQ_SIZES = ml_dsa65.lengths as {
  secretKey: number; publicKey: number; seed: number; signature: number; signRand: number;
};

/**
 * Network/chain identifier mixed into every sighash so a signature is bound to
 * this chain — a signed contribution or spend cannot be replayed on a fork or
 * testnet. Bumped to v2 for the quantum-ready chain (PQ signatures are not
 * valid on the legacy ECDSA chain and vice versa).
 */
export const JGC_PQ_NETWORK_ID = "JGC-quantum-v1";

/** SHA3-256 digest (quantum-safe hash). */
function sha3_256(data: Uint8Array | string): Buffer {
  return createHash("sha3-256").update(data as any).digest();
}

/**
 * Quantum-ready JGC address from an ML-DSA public key:
 *   "1QGC" + hex( SHA3-256(pk)[0:20] ).
 * Binds an address to exactly one lattice key. 20-byte payload keeps addresses
 * the same length as the legacy "1JGC" hash160 form.
 */
export function pqAddressFromPublicKey(publicKeyHex: string): string {
  return "1QGC" + sha3_256(toBytes(publicKeyHex)).subarray(0, 20).toString("hex");
}

/**
 * Generate a fresh ML-DSA-65 keypair from a 32-byte seed.
 * Returns hex-encoded { privateKey (4032 B), publicKey (1952 B) }.
 * If no seed is given, a random one is used (CSPRNG via noble).
 */
export function pqGenerateKeyPair(seedHex?: string): { privateKey: string; publicKey: string } {
  const seed = seedHex ? toBytes(seedHex) : undefined;
  const kp = ml_dsa65.keygen(seed as any);
  return { privateKey: toHex(kp.secretKey), publicKey: toHex(kp.publicKey) };
}

/** Validate that a hex string is a well-formed ML-DSA-65 public key. */
export function pqIsValidPublicKey(publicKeyHex: string): boolean {
  return /^[0-9a-fA-F]+$/.test(publicKeyHex) && toBytes(publicKeyHex).length === PQ_SIZES.publicKey;
}

/** Validate that a hex string is a well-formed ML-DSA-65 private key. */
export function pqIsValidPrivateKey(privateKeyHex: string): boolean {
  return /^[0-9a-fA-F]+$/.test(privateKeyHex) && toBytes(privateKeyHex).length === PQ_SIZES.secretKey;
}

/** Validate that a hex string is a well-formed ML-DSA-65 signature. */
export function pqIsValidSignature(sigHex: string): boolean {
  return /^[0-9a-fA-F]+$/.test(sigHex) && toBytes(sigHex).length === PQ_SIZES.signature;
}

/**
 * Canonical 32-byte digest a contribution signature commits to:
 *   SHA3-256( networkId | minerAddress | taskCommitment | circuitId |
 *             tflopsWeight | height ).
 * SHA3-256 (not SHA256d) since we are designing the quantum-ready chain clean;
 * the domain separator + single strong hash is sufficient and simpler.
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
 * Quantum-ready counterpart of scriptPubKeyFromAddress: build the PQ
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
 * This is the quantum-safe replacement for verifyP2PKHSpend.
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
