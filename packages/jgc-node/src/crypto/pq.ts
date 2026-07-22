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
 *   compute proofs→ hash-based transparent IOP  via pq-zkp.ts  (replaces Groth16)
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
  pqIsValidAddress,
  JGC_PQ_NETWORK_ID,
} from "./pq-signatures.js";
import { PQ_CRYPTO_SUITE } from "./pq-suite.js";
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
export { JGC_PQ_NETWORK_ID, PQ_CIRCUIT_REGISTRY, PQ_CRYPTO_SUITE };
export type { PQComputeProof };

// ── Keys & addresses ─────────────────────────────────────────────────────────
export const quantumGenerateKeyPair = pqGenerateKeyPair;
export const quantumAddressFromPublicKey = pqAddressFromPublicKey;
export const quantumScriptPubKey = pqScriptPubKey;

/** True iff an address belongs to the versioned suite-2 (1QG2) family. */
export function isQuantumAddress(addr: string): boolean {
  return pqIsValidAddress(addr);
}

// ── Miner contribution signatures ────────────────────────────────────────────
/** PQ replacement for verifyContributionSignature. */
export function quantumVerifyContributionSignature(c: MinerComputeContribution, height: number): boolean {
  return pqVerifyContributionSignature(c, height);
}
export const quantumSignContribution = pqSignContribution;

// ── Compute proofs (PoUC) ────────────────────────────────────────────────────
/** PQ replacement for verifyComputeProof on a consensus ComputeProof. */
export function quantumVerifyComputeProof(cp: ComputeProof, blockHeight: number): boolean {
  return pqVerifyComputeProofFromConsensus(cp, blockHeight);
}

/** PQ replacement for batchVerifyComputeProofs. */
export function quantumBatchVerifyComputeProofs(proofs: ComputeProof[], blockHeight: number): boolean {
  return proofs.every((p) => quantumVerifyComputeProof(p, blockHeight));
}

/** True iff a consensus ComputeProof carries a post-quantum proof. */
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
