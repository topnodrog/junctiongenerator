/**
 * Compatibility facade for ML-DSA signatures and simulation receipts.
 * Historical quantum* names and QUANTUM_MODE select APIs, not readiness.
 * 1QGC addresses retain a 160-bit key hash. Experimental V2 destinations
 * permit sender spending and hide neither values nor spends. Hash/Merkle
 * receipts cannot prove computation. Mainnet still declares Groth16.
 * See docs/mainnet/SHIELDED_PAYMENTS_V3_DESIGN.md at the repository root.
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

/** True iff an address belongs to the legacy ML-DSA (1QGC) family. */
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

/** Batch simulation adapter; strict mode rejects nonempty receipts. */
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
