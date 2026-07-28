/**
 * Portable compute-proof dispatch.
 *
 * Verifiers use consensus bytes and cryptographic verification only; they do
 * not need the miner's CPU, GPU, model runtime, or operating system. This is
 * the entry point used by consensus and by heterogeneous proof back-checkers.
 */

import type { ComputeProof } from "../types/index.js";
import {
  pqFromComputeProof,
  pqVerifyProofForConsensus,
} from "./pq-zkp.js";
import {
  verifyComputeProof,
  type VerificationResult,
} from "./zkp.js";

export type ComputeProofScheme = "groth16" | "pq-hash-iop-research";

export interface PortableProofContext {
  blockHeight: number;
  epochBlockIndex: number;
  minimumWork: number;
}

export interface PortableProofResult extends VerificationResult {
  scheme: ComputeProofScheme;
}

export function identifyComputeProofScheme(proof: ComputeProof): ComputeProofScheme {
  return pqFromComputeProof(proof) === null ? "groth16" : "pq-hash-iop-research";
}

/**
 * Verify a proof using a machine-independent verifier.
 *
 * The research hash/Merkle receipt is routed through its fail-closed verifier:
 * it can exercise simnet plumbing but is always rejected in strict mode.
 * Other proofs use the real Groth16 verifier and its registered computation
 * circuit. Any unavailable verifier is converted into an invalid result rather
 * than escaping consensus as an exception.
 */
export function verifyPortableComputeProof(
  proof: ComputeProof,
  context: PortableProofContext,
): PortableProofResult {
  const scheme = identifyComputeProofScheme(proof);

  if (scheme === "pq-hash-iop-research") {
    const result = pqVerifyProofForConsensus(
      proof,
      context.blockHeight,
      context.minimumWork,
    );
    return { ...result, scheme };
  }

  try {
    return {
      ...verifyComputeProof(
        proof,
        context.epochBlockIndex,
        context.minimumWork,
        context.blockHeight,
      ),
      scheme,
    };
  } catch (error) {
    return {
      valid: false,
      error: `portable proof verifier unavailable: ${String(error)}`,
      verifiedTFLOPS: 0,
      scheme,
    };
  }
}
