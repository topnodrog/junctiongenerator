/**
 * @file src/crypto/pq.ts
 * @description Quantum-ready facade for JGC consensus, wallet, and miner code.
 *
 * This is the single integration point that lets the rest of the node switch
 * from the legacy ECDSA/Groth16 crypto to the post-quantum stack WITHOUT each
 * call site importing three different modules. When the chain runs in quantum
 * mode (the default going forward), validation and the wallet call THESE
 * functions instead of signatures.ts / zkp.ts.
 *
 * WHAT'S QUANTUM-SAFE HERE
 * ────────────────────────
 *   signatures   → ML-DSA-65 (FIPS 204)        via pq-signatures.ts
 *   compute receipts → simulation-only hash/Merkle transport via pq-zkp.ts
 *   privacy      → one-time stealth addresses   via pq-stealth.ts
 *   hashing      → SHA3-256 everywhere          (Grover-resistant)
 *
 * Nothing in this file uses secp256k1, BN254, or any pairing/ECC primitive.
 */

import type { ComputeProof, MinerComputeContribution } from "../types/index.js";
import {
  pqAddressFromPublicKey,
  pqVerifyContributionSignature,
  pqSignContribution,
  pqGenerateKeyPair,
  pqScriptPubKey,
  pqScriptPubKeyFromAddress,
  pqScriptSig,
  pqVerifySpend,
  pqSignHash,
  pqVerifyHashSignature,
  JGC_PQ_NETWORK_ID,
} from "./pq-signatures.js";
import {
  pqVerifyComputeProofFromConsensus,
  pqFromComputeProof,
  pqToComputeProof,
  pqProveCompute,
  pqVerifyProofForConsensus,
  getPQVerifierMode,
  setPQVerifierMode,
  PQ_CIRCUIT_REGISTRY,
  type PQComputeProof,
  type PQProofVerification,
} from "./pq-zkp.js";

export const QUANTUM_MODE = true as const;
export { JGC_PQ_NETWORK_ID, PQ_CIRCUIT_REGISTRY };
export type { PQComputeProof };

// ── Keys & addresses ─────────────────────────────────────────────────────────
export const quantumGenerateKeyPair = pqGenerateKeyPair;
export const quantumAddressFromPublicKey = pqAddressFromPublicKey;
export const quantumScriptPubKey = pqScriptPubKey;

/** True iff an address belongs to the quantum-ready (1QGC) family. */
export function isQuantumAddress(addr: string): boolean {
  return /^1QGC[0-9a-f]{40}$/.test(addr);
}

// ── Miner contribution signatures ────────────────────────────────────────────
/** PQ replacement for verifyContributionSignature. */
export function quantumVerifyContributionSignature(c: MinerComputeContribution, height: number): boolean {
  return pqVerifyContributionSignature(c, height);
}
export const quantumSignContribution = pqSignContribution;

// ── Compute proofs (PoUC) ────────────────────────────────────────────────────
/** Verify a simulation receipt; strict mode rejects it as non-sound. */
export function quantumVerifyComputeProof(cp: ComputeProof, blockHeight: number): boolean {
  return pqVerifyComputeProofFromConsensus(cp, blockHeight);
}

/** PQ replacement for batchVerifyComputeProofs. */
export function quantumBatchVerifyComputeProofs(proofs: ComputeProof[], blockHeight: number): boolean {
  return proofs.every((p) => quantumVerifyComputeProof(p, blockHeight));
}

/** True iff a consensus ComputeProof carries the simulation receipt format. */
export function isQuantumProof(cp: ComputeProof): boolean {
  return pqFromComputeProof(cp) !== null;
}

// ── Transaction spends ───────────────────────────────────────────────────────
export const quantumSignHash = pqSignHash;
export const quantumVerifyHashSignature = pqVerifyHashSignature;
export const quantumScriptPubKeyFromAddress = pqScriptPubKeyFromAddress;
export const quantumScriptSig = pqScriptSig;
export const quantumVerifySpend = pqVerifySpend;

// ── Consensus proof verification (per-proof) + verifier mode ───────────────
export const quantumVerifyProofForConsensus = pqVerifyProofForConsensus;
export const getQuantumVerifierMode = getPQVerifierMode;
export const setQuantumVerifierMode = setPQVerifierMode;
export type { PQProofVerification };

export { pqToComputeProof, pqProveCompute };
