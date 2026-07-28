/**
 * Heterogeneous back-checker roles.
 *
 * Proof verification is portable and consensus-enforced. Exact replay is
 * profile-specific and becomes slashable only through its quorum coordinator.
 * Quality review is deliberately advisory because usefulness is a policy and
 * customer-acceptance question, not a cryptographic equality check.
 */

import type { ComputeProof } from "../types/index.js";
import {
  verifyPortableComputeProof,
  type PortableProofContext,
  type PortableProofResult,
} from "../crypto/compute-proof.js";
import type {
  InferenceBackend,
  VerifiableTask,
} from "./junctioning.js";
import {
  verifyReplay,
  type JunctioningClaim,
} from "./verification.js";

export type BackCheckerRole =
  | "proof-verifier"
  | "replay-auditor"
  | "quality-auditor";

export type BackCheckStatus = "pass" | "fail" | "inconclusive";
export type BackCheckEnforcement = "consensus" | "quorum" | "advisory";

export interface BackCheckReport {
  checkerId: string;
  role: BackCheckerRole;
  status: BackCheckStatus;
  enforcement: BackCheckEnforcement;
  reason?: string;
  scheme?: PortableProofResult["scheme"];
  verifiedWork?: number;
}

type MaybePromise<T> = T | Promise<T>;

export interface ProofVerifierBackChecker {
  id: string;
  role: "proof-verifier";
  verify(proof: ComputeProof, context: PortableProofContext): MaybePromise<PortableProofResult>;
}

export interface ReplayBackChecker {
  id: string;
  role: "replay-auditor";
  backend: InferenceBackend;
}

export interface QualityAssessment {
  accepted: boolean;
  reason?: string;
}

export interface QualityBackChecker {
  id: string;
  role: "quality-auditor";
  assess(task: VerifiableTask, output: string): MaybePromise<QualityAssessment>;
}

export type BackChecker =
  | ProofVerifierBackChecker
  | ReplayBackChecker
  | QualityBackChecker;

/** A portable checker suitable for nodes on any CPU/GPU architecture. */
export function createLocalProofVerifier(id: string): ProofVerifierBackChecker {
  return {
    id,
    role: "proof-verifier",
    verify: verifyPortableComputeProof,
  };
}

export async function runProofBackCheck(
  checker: ProofVerifierBackChecker,
  proof: ComputeProof,
  context: PortableProofContext,
): Promise<BackCheckReport> {
  try {
    const result = await checker.verify(proof, context);
    return {
      checkerId: checker.id,
      role: checker.role,
      status: result.valid ? "pass" : "fail",
      enforcement: "consensus",
      reason: result.error,
      scheme: result.scheme,
      verifiedWork: result.verifiedTFLOPS,
    };
  } catch (error) {
    return {
      checkerId: checker.id,
      role: checker.role,
      status: "fail",
      enforcement: "consensus",
      reason: `proof verifier failed closed: ${String(error)}`,
      verifiedWork: 0,
    };
  }
}

export async function runReplayBackCheck(
  checker: ReplayBackChecker,
  claim: JunctioningClaim,
): Promise<BackCheckReport> {
  const result = await verifyReplay(claim, checker.backend);
  if (!result.compatible) {
    return {
      checkerId: checker.id,
      role: checker.role,
      status: "inconclusive",
      enforcement: "quorum",
      reason: result.reason,
    };
  }

  return {
    checkerId: checker.id,
    role: checker.role,
    status: result.verified ? "pass" : "fail",
    enforcement: "quorum",
    reason: result.reason,
  };
}

export async function runQualityBackCheck(
  checker: QualityBackChecker,
  task: VerifiableTask,
  output: string,
): Promise<BackCheckReport> {
  try {
    const result = await checker.assess(task, output);
    return {
      checkerId: checker.id,
      role: checker.role,
      status: result.accepted ? "pass" : "fail",
      enforcement: "advisory",
      reason: result.reason,
    };
  } catch (error) {
    return {
      checkerId: checker.id,
      role: checker.role,
      status: "inconclusive",
      enforcement: "advisory",
      reason: `quality checker unavailable: ${String(error)}`,
    };
  }
}
