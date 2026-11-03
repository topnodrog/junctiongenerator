import { createHash } from "node:crypto";
import { MAINNET_NETWORK } from "../config/networks.js";
import { CIRCUIT_REGISTRY } from "./zkp.js";

/**
 * Machine-checkable proof-system gate evidence.
 *
 * The checked-in `CIRCUIT_REGISTRY` in zkp.ts uses short, repeated placeholder
 * strings instead of BN254 points. A strict verifier must never be able to
 * start with those keys: whoever generated a placeholder key could forge
 * proofs for it. This module defines the *only* shape a production registry may
 * take, so the `proofSystem` gate has a concrete, verifiable finish line rather
 * than an open-ended "replace the placeholders" note.
 *
 * This does not perform a trusted-setup ceremony or cryptographic review. It
 * verifies the shape, binding and review attestation of the artifact that a
 * ceremony and external reviewers must produce.
 */

export const PROOF_REGISTRY_SCHEMA_VERSION = 1;

const HEX_64_BYTES = /^0x[0-9a-f]{128}$/; // G1 uncompressed
const HEX_128_BYTES = /^0x[0-9a-f]{256}$/; // G2 uncompressed
const SHA256 = /^[0-9a-f]{64}$/;
const CIRCUIT_ID = /^[A-Z0-9_]{1,64}$/;

export interface ProofRegistryKey {
  readonly circuitId: string;
  readonly alpha: string;
  readonly beta: string;
  readonly gamma: string;
  readonly delta: string;
  readonly ic: readonly string[];
  readonly numPublicInputs: number;
  readonly minTFLOPSPerProof: number;
  readonly maxTFLOPSPerProof: number;
  readonly activeSinceHeight: number;
}

export interface ProofRegistryManifest {
  readonly schemaVersion: 1;
  readonly network: {
    readonly chainId: string;
    readonly consensusVersion: number;
    readonly proofMode: string;
  };
  readonly ceremony: {
    readonly id: string;
    readonly transcriptSha256: string;
    readonly participants: readonly string[];
    readonly completedAt: string;
  };
  readonly review: {
    readonly status: "no-unresolved-high-or-critical";
    readonly reportSha256: string;
    readonly reviewerKeyIds: readonly string[];
    readonly reviewedAt: string;
  };
  readonly keys: readonly ProofRegistryKey[];
}

export interface ProofRegistryEvaluation {
  readonly status: "reviewed" | "blocked";
  readonly reasons: readonly string[];
  readonly registrySha256: string | null;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function isoDate(value: unknown): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)
    && Number.isFinite(Date.parse(value));
}

function validateKey(key: unknown, index: number): string[] {
  const reasons: string[] = [];
  if (key === null || typeof key !== "object" || Array.isArray(key)) {
    return [`keys[${index}] is not an object`];
  }
  const k = key as Record<string, unknown>;
  if (typeof k.circuitId !== "string" || !CIRCUIT_ID.test(k.circuitId)) {
    reasons.push(`keys[${index}].circuitId is malformed`);
  }
  for (const field of ["alpha"] as const) {
    if (typeof k[field] !== "string" || !HEX_64_BYTES.test(k[field] as string)) {
      reasons.push(`keys[${index}].${field} is not a 64-byte G1 point`);
    }
  }
  for (const field of ["beta", "gamma", "delta"] as const) {
    if (typeof k[field] !== "string" || !HEX_128_BYTES.test(k[field] as string)) {
      reasons.push(`keys[${index}].${field} is not a 128-byte G2 point`);
    }
  }
  if (!Number.isSafeInteger(k.numPublicInputs) || (k.numPublicInputs as number) < 0
      || (k.numPublicInputs as number) > 64) {
    reasons.push(`keys[${index}].numPublicInputs is out of range`);
    return reasons;
  }
  if (!Array.isArray(k.ic) || k.ic.length !== (k.numPublicInputs as number) + 1
      || k.ic.some((point) => typeof point !== "string" || !HEX_64_BYTES.test(point as string))) {
    reasons.push(`keys[${index}].ic must contain numPublicInputs + 1 G1 points`);
  }
  for (const field of ["minTFLOPSPerProof", "maxTFLOPSPerProof", "activeSinceHeight"] as const) {
    if (!Number.isSafeInteger(k[field]) || (k[field] as number) < 0) {
      reasons.push(`keys[${index}].${field} must be a non-negative integer`);
    }
  }
  if (Number.isSafeInteger(k.minTFLOPSPerProof) && Number.isSafeInteger(k.maxTFLOPSPerProof)
      && (k.minTFLOPSPerProof as number) > (k.maxTFLOPSPerProof as number)) {
    reasons.push(`keys[${index}].minTFLOPSPerProof exceeds its maximum`);
  }
  return reasons;
}

/** Verify a release-specific, externally reviewed production proof registry. */
export function evaluateProofRegistryManifest(value: unknown): ProofRegistryEvaluation {
  const reasons: string[] = [];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { status: "blocked", reasons: ["proof registry manifest is missing or not an object"], registrySha256: null };
  }
  const manifest = value as Record<string, unknown>;
  const network = manifest.network as Record<string, unknown> | undefined;
  const ceremony = manifest.ceremony as Record<string, unknown> | undefined;
  const review = manifest.review as Record<string, unknown> | undefined;

  if (manifest.schemaVersion !== PROOF_REGISTRY_SCHEMA_VERSION) reasons.push("unsupported proof registry schemaVersion");
  if (!network || network.chainId !== MAINNET_NETWORK.chainId
      || network.consensusVersion !== MAINNET_NETWORK.consensusVersion
      || network.proofMode !== MAINNET_NETWORK.proofMode) {
    reasons.push("proof registry does not match the compiled mainnet identity");
  }
  if (!ceremony || typeof ceremony.id !== "string" || !/^[a-z0-9-]{3,64}$/.test(ceremony.id)
      || typeof ceremony.transcriptSha256 !== "string" || !SHA256.test(ceremony.transcriptSha256)
      || !Array.isArray(ceremony.participants) || ceremony.participants.length < 2
      || ceremony.participants.some((p) => typeof p !== "string" || !p.trim())
      || !isoDate(ceremony.completedAt)) {
    reasons.push("ceremony transcript, participant list, or completion date is missing");
  }
  if (!review || review.status !== "no-unresolved-high-or-critical"
      || typeof review.reportSha256 !== "string" || !SHA256.test(review.reportSha256)
      || !Array.isArray(review.reviewerKeyIds) || review.reviewerKeyIds.length < 2
      || !isoDate(review.reviewedAt)) {
    reasons.push("external cryptographic review attestation is missing or incomplete");
  }
  if (!Array.isArray(manifest.keys) || manifest.keys.length === 0 || manifest.keys.length > 64) {
    reasons.push("proof registry must contain 1..64 reviewed circuit keys");
  } else {
    const ids = new Set<string>();
    for (const [index, key] of manifest.keys.entries()) {
      reasons.push(...validateKey(key, index));
      const id = (key as Record<string, unknown> | null)?.circuitId;
      if (typeof id === "string") {
        if (ids.has(id)) reasons.push(`duplicate circuitId ${id}`);
        ids.add(id);
      }
    }
  }

  const registrySha256 = reasons.length === 0 ? digest(manifest) : null;
  return {
    status: reasons.length === 0 ? "reviewed" : "blocked",
    reasons,
    registrySha256,
  };
}

export interface BuiltInRegistryEvaluation {
  readonly status: "placeholder" | "reviewed";
  readonly circuitCount: number;
  readonly reasons: readonly string[];
}

/**
 * Report whether strict verification has a usable registry. The compiled-in
 * registry contains placeholders, so a release must load a reviewed,
 * release-specific manifest at startup and pass it here. The release bundle's
 * `reproducibleArtifacts` evidence is what proves that loading actually happens.
 */
export function evaluateBuiltInProofRegistry(releaseRegistry?: unknown): BuiltInRegistryEvaluation {
  const reasons: string[] = [];
  for (const [index, key] of [...CIRCUIT_REGISTRY.values()].entries()) {
    reasons.push(...validateKey(key, index).map((reason) => `built-in ${key.circuitId}: ${reason}`));
  }
  if (CIRCUIT_REGISTRY.size === 0) reasons.push("built-in registry is empty");
  if (releaseRegistry !== undefined && releaseRegistry !== null) {
    const reviewed = evaluateProofRegistryManifest(releaseRegistry);
    const keys = (releaseRegistry as { keys?: unknown }).keys;
    if (reviewed.status === "reviewed") {
      return {
        status: "reviewed",
        circuitCount: Array.isArray(keys) ? keys.length : 0,
        reasons: ["release-specific reviewed registry is present"],
      };
    }
    return {
      status: "placeholder",
      circuitCount: CIRCUIT_REGISTRY.size,
      reasons: [...reviewed.reasons, ...reasons],
    };
  }
  return {
    status: reasons.length === 0 ? "reviewed" : "placeholder",
    circuitCount: CIRCUIT_REGISTRY.size,
    reasons,
  };
}

/** Fail closed if strict verification is attempted with the built-in registry. */
export function assertReviewedProofRegistry(value: unknown = null): string {
  const result = evaluateProofRegistryManifest(value);
  if (result.status !== "reviewed") {
    throw new Error(`proofSystem gate is blocked: ${result.reasons.join("; ")}`);
  }
  return result.registrySha256!;
}
