/**
 * Research-only hash/Merkle receipts for simulations.
 * This module checks Merkle paths over prover-chosen hash leaves. It has no
 * computation constraints, polynomial low-degree test, FRI protocol, or
 * zero-knowledge argument. Claimed work need not have been performed.
 * Strict mode rejects receipts; simnet acceptance only exercises plumbing.
 * Hash primitives alone establish neither soundness nor payment privacy.
 * PQ-HASH-IOP-v1 is a historical serialized name, not a security claim.
 */

import { createHash, randomBytes } from "crypto";
import type { ComputeProof } from "../types/index.js";

const toBytes = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, "hex"));
const toHex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

/** Domain separator so PQ proofs can never be confused with any other protocol msg. */
const PQ_PROOF_DOMAIN = "JGC-PQ-PROOF-v1";

/** Quantum-safe hash: SHA3-256. */
function H(...parts: (Uint8Array | string | Buffer)[]): Buffer {
  const h = createHash("sha3-256");
  for (const p of parts) h.update(p as any);
  return h.digest();
}

/** Number of receipt openings; no computation soundness bound. */
const PQ_NUM_QUERIES = 16;

/** Receipt tree size; duplicate sampled indexes are skipped. */
const PQ_DOMAIN_SIZE = 32;

/**
 * `simnet` enables the research receipt solely for local protocol exercises.
 * `strict` is the default and fails closed because this construction does not
 * establish computational soundness.
 */
export type PQVerifierMode = "strict" | "simnet";
let pqVerifierMode: PQVerifierMode = "strict";

export function setPQVerifierMode(mode: PQVerifierMode): void {
  if (mode === "simnet" && process.env["NODE_ENV"] === "production") {
    throw new Error("PQ verifier mode 'simnet' is forbidden when NODE_ENV=production");
  }
  pqVerifierMode = mode;
}

export function getPQVerifierMode(): PQVerifierMode {
  return pqVerifierMode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal Merkle tree (quantum-safe; self-contained so this layer has no deps)
// ─────────────────────────────────────────────────────────────────────────────

function merkleRoot(leaves: Buffer[]): Buffer {
  if (leaves.length === 0) return H(PQ_PROOF_DOMAIN, "empty");
  let level = leaves.map((l) => H(PQ_PROOF_DOMAIN, "leaf", l));
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i]!;
      const b = i + 1 < level.length ? level[i + 1]! : a;
      next.push(H(PQ_PROOF_DOMAIN, "node", a, b));
    }
    level = next;
  }
  return level[0]!;
}

function merklePath(leaves: Buffer[], index: number): Buffer[] {
  const path: Buffer[] = [];
  let level = leaves.map((l) => H(PQ_PROOF_DOMAIN, "leaf", l));
  let idx = index;
  while (level.length > 1) {
    const sib = idx % 2 === 0 ? idx + 1 : idx - 1;
    path.push(sib < level.length ? level[sib]! : level[idx]!);
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i]!;
      const b = i + 1 < level.length ? level[i + 1]! : a;
      next.push(H(PQ_PROOF_DOMAIN, "node", a, b));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return path;
}

function merkleVerify(leaf: Buffer, path: Buffer[], index: number, root: Buffer): boolean {
  let acc = H(PQ_PROOF_DOMAIN, "leaf", leaf);
  let idx = index;
  for (const sib of path) {
    acc = idx % 2 === 0 ? H(PQ_PROOF_DOMAIN, "node", acc, sib) : H(PQ_PROOF_DOMAIN, "node", sib, acc);
    idx = Math.floor(idx / 2);
  }
  return acc.equals(root);
}

// ─────────────────────────────────────────────────────────────────────────────
// PQ circuit registry (transparent — NO trusted setup keys, only public params)
// ─────────────────────────────────────────────────────────────────────────────

export interface PQCircuitParams {
  circuitId: string;
  /** Minimum simulated work claim for this fixture family. */
  minTFLOPSPerProof: number;
  /** Maximum simulated claim; does not establish actual work. */
  maxTFLOPSPerProof: number;
  /** Block height at which this circuit became active (governance path). */
  activeSinceHeight: number;
}

/** Simulation policy bounds; absence of setup keys is not proof soundness. */
export const PQ_CIRCUIT_REGISTRY: Map<string, PQCircuitParams> = new Map([
  ["PQ_CIRCUIT_AI_INFERENCE_V1", { circuitId: "PQ_CIRCUIT_AI_INFERENCE_V1", minTFLOPSPerProof: 1, maxTFLOPSPerProof: 1_000_000, activeSinceHeight: 0 }],
  ["PQ_CIRCUIT_AI_TRAINING_V1",  { circuitId: "PQ_CIRCUIT_AI_TRAINING_V1",  minTFLOPSPerProof: 10, maxTFLOPSPerProof: 10_000_000, activeSinceHeight: 0 }],
  ["PQ_CIRCUIT_FOLD_SIM_V1",     { circuitId: "PQ_CIRCUIT_FOLD_SIM_V1",     minTFLOPSPerProof: 1, maxTFLOPSPerProof: 5_000_000, activeSinceHeight: 0 }],
  ["PQ_CIRCUIT_SCI_COMPUTE_V1",  { circuitId: "PQ_CIRCUIT_SCI_COMPUTE_V1",  minTFLOPSPerProof: 1, maxTFLOPSPerProof: 5_000_000, activeSinceHeight: 0 }],
  ["PQ_CIRCUIT_COMMERCIAL_V1",   { circuitId: "PQ_CIRCUIT_COMMERCIAL_V1",   minTFLOPSPerProof: 1, maxTFLOPSPerProof: 1_000_000, activeSinceHeight: 0 }],
]);

// ─────────────────────────────────────────────────────────────────────────────
// Proof shape
// ─────────────────────────────────────────────────────────────────────────────

/** A single opened Merkle query (leaf + authentication path). */
export interface PQQueryOpening {
  index: number;
  leaf: string;      // hex
  path: string[];    // hex siblings, bottom-up
}

/** Serialized simulation receipt; historical type name retained. */
export interface PQComputeProof {
  scheme: "PQ-HASH-IOP-v1";
  circuitId: string;
  /** Public output commitment (e.g. hash of the model/result the task produced). */
  outputCommitment: string;
  /** Merkle root over prover-chosen hash leaves. */
  witnessRoot: string;
  /** Claimed TFLOPS-seconds (bound into the proof; checked against registry). */
  tflopsWeight: number;
  /** Fiat–Shamir query openings. */
  queries: PQQueryOpening[];
}

/** The private witness a prover holds. Never sent on-chain. */
export interface PQWitness {
  taskCommitment: string;  // hex — private commitment to the actual work trace
  tflopsWeight: number;
  nonce: string;           // hex — prover randomness for hiding
}

// ─────────────────────────────────────────────────────────────────────────────
// Prover
// ─────────────────────────────────────────────────────────────────────────────

function buildWitnessLeaves(w: PQWitness, circuitId: string, outputCommitment: string): Buffer[] {
  // Hash witness fields into leaves; no polynomial constraints are enforced.
  const leaves: Buffer[] = [];
  for (let i = 0; i < PQ_DOMAIN_SIZE; i++) {
    leaves.push(
      H(PQ_PROOF_DOMAIN, "wit", circuitId, outputCommitment, w.taskCommitment, w.nonce, String(w.tflopsWeight), String(i))
    );
  }
  return leaves;
}

function fiatShamirChallenge(circuitId: string, outputCommitment: string, root: Buffer, tflops: number): Buffer {
  return H(PQ_PROOF_DOMAIN, "fs", circuitId, outputCommitment, root, String(tflops));
}

/**
 * Produce a simulation receipt from prover-chosen fields.
 * Unserialized witness fields do not establish zero knowledge.
 */
export function pqProveCompute(
  circuitId: string,
  outputCommitment: string,
  witness: PQWitness
): PQComputeProof {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("PQ-HASH-IOP-v1 is a research receipt and cannot prove production compute");
  }
  const params = PQ_CIRCUIT_REGISTRY.get(circuitId);
  if (!params) throw new Error(`unknown PQ circuit: ${circuitId}`);
  if (witness.tflopsWeight < params.minTFLOPSPerProof || witness.tflopsWeight > params.maxTFLOPSPerProof) {
    throw new Error(`tflopsWeight ${witness.tflopsWeight} outside [${params.minTFLOPSPerProof}, ${params.maxTFLOPSPerProof}]`);
  }
  const leaves = buildWitnessLeaves(witness, circuitId, outputCommitment);
  const root = merkleRoot(leaves);
  const challenge = fiatShamirChallenge(circuitId, outputCommitment, root, witness.tflopsWeight);
  // Derive PQ_NUM_QUERIES DISTINCT indexes by iterating the Fiat–Shamir stream
  // until enough unique leaves are selected (verifier rejects duplicates).
  const queries: PQQueryOpening[] = [];
  const used = new Set<number>();
  let q = 0;
  while (queries.length < PQ_NUM_QUERIES) {
    const idx = H(PQ_PROOF_DOMAIN, "q", challenge, String(q)).readUInt32BE(0) % leaves.length;
    q++;
    if (used.has(idx)) continue;
    used.add(idx);
    queries.push({ index: idx, leaf: toHex(leaves[idx]!), path: merklePath(leaves, idx).map(toHex) });
  }
  return {
    scheme: "PQ-HASH-IOP-v1",
    circuitId,
    outputCommitment,
    witnessRoot: toHex(root),
    tflopsWeight: witness.tflopsWeight,
    queries,
  };
}

/** Convenience: generate a fresh private witness nonce. */
export function pqNewNonce(): string {
  return randomBytes(32).toString("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// Verifier
// ─────────────────────────────────────────────────────────────────────────────

export interface PQVerifyResult {
  valid: boolean;
  reason?: string;
  tflopsWeight?: number;
}

/**
 * Check receipt structure and Merkle paths; does not verify computation.
 * Returns { valid, reason }. Never throws on malformed input.
 */
export function pqVerifyComputeProof(proof: PQComputeProof, blockHeight: number): PQVerifyResult {
  try {
    if (!proof || proof.scheme !== "PQ-HASH-IOP-v1") return { valid: false, reason: "bad scheme" };
    if (pqVerifierMode !== "simnet") {
      return {
        valid: false,
        reason: "PQ-HASH-IOP-v1 is a research receipt, not a sound proof of computation; strict verification rejects it",
      };
    }
    const params = PQ_CIRCUIT_REGISTRY.get(proof.circuitId);
    if (!params) return { valid: false, reason: `unknown circuit ${proof.circuitId}` };
    if (blockHeight < params.activeSinceHeight) return { valid: false, reason: "circuit not yet active" };
    if (proof.tflopsWeight < params.minTFLOPSPerProof || proof.tflopsWeight > params.maxTFLOPSPerProof) {
      return { valid: false, reason: "tflops out of bounds" };
    }
    const root = toBytes(proof.witnessRoot);
    if (root.length !== 32) return { valid: false, reason: "bad witnessRoot" };

    // Require distinct openings for structural consistency only.
    if (!Array.isArray(proof.queries) || proof.queries.length !== PQ_NUM_QUERIES) {
      return { valid: false, reason: `expected ${PQ_NUM_QUERIES} queries` };
    }
    const claimedIdx = new Set<number>();
    for (const o of proof.queries) {
      if (claimedIdx.has(o.index)) return { valid: false, reason: "duplicate query index" };
      claimedIdx.add(o.index);
    }

    const challenge = fiatShamirChallenge(proof.circuitId, proof.outputCommitment, Buffer.from(root), proof.tflopsWeight);

    // Reconstruct the SAME distinct-index stream the prover used (advance the
    // Fiat–Shamir counter, skipping collisions) and require each selected leaf
    // to be opened with a valid Merkle path.
    const required = new Set<number>();
    {
      let q = 0;
      while (required.size < PQ_NUM_QUERIES) {
        required.add(H(PQ_PROOF_DOMAIN, "q", challenge, String(q)).readUInt32BE(0) % PQ_DOMAIN_SIZE);
        q++;
      }
    }
    for (const expectedIdx of required) {
      const opening = proof.queries.find((o) => o.index === expectedIdx);
      if (!opening) return { valid: false, reason: `missing query ${expectedIdx}` };
      // Membership only: arbitrary leaves and work claims can pass.
      const leaf = toBytes(opening.leaf);
      if (leaf.length !== 32) return { valid: false, reason: "bad leaf" };
      const path = opening.path.map(toBytes);
      if (!merkleVerify(Buffer.from(leaf), path.map((p) => Buffer.from(p)), expectedIdx, Buffer.from(root))) {
        return { valid: false, reason: "bad merkle path" };
      }
    }
    return { valid: true, tflopsWeight: proof.tflopsWeight };
  } catch (e: any) {
    return { valid: false, reason: e?.message ?? "verify error" };
  }
}

/** Batch-verify many PQ proofs; returns true iff ALL are valid. Amortizable. */
export function pqBatchVerifyComputeProofs(proofs: PQComputeProof[], blockHeight: number): boolean {
  return proofs.every((p) => pqVerifyComputeProof(p, blockHeight).valid);
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter to the existing ComputeProof type used by consensus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serialise a PQComputeProof into the `proofData` field of the existing
 * ComputeProof interface, so consensus can carry it without a type break.
 */
export function pqToComputeProof(p: PQComputeProof): ComputeProof {
  // The PQ proof JSON is carried in the `proofBytes` field (base64-encoded by
  // convention — here we embed UTF-8 JSON directly; pqFromComputeProof parses
  // it back). taskCommitment commits to the public output; tflopsWeight is the
  // credited work. publicInputs carries the epoch/anti-replay slot like the
  // legacy layout ([0]=outputCommitment,[1]=tflops,[2]=reserved).
  return {
    taskCommitment: p.outputCommitment,
    proofBytes: JSON.stringify(p),
    circuitId: p.circuitId,
    publicInputs: [p.outputCommitment, String(p.tflopsWeight), "0"],
    tflopsWeight: p.tflopsWeight,
    taskType: 0 as any, // ComputeTaskType.AI_INFERENCE — caller may override
    computeStartedAt: new Date().toISOString(),
  } as unknown as ComputeProof;
}

/** Parse a ComputeProof back into a PQComputeProof, or null if it isn't one. */
export function pqFromComputeProof(cp: ComputeProof): PQComputeProof | null {
  try {
    const raw = (cp as any).proofBytes;
    if (typeof raw !== "string") return null;
    const obj = JSON.parse(raw);
    return obj && obj.scheme === "PQ-HASH-IOP-v1" ? (obj as PQComputeProof) : null;
  } catch {
    return null;
  }
}

/**
 * Simulation adapter for the historical API: accepts the
 * consensus ComputeProof, extracts the embedded PQ proof, and verifies it.
 */
export function pqVerifyComputeProofFromConsensus(cp: ComputeProof, blockHeight: number): boolean {
  return pqVerifyProofForConsensus(cp, blockHeight, 0).valid;
}

// ─────────────────────────────────────────────────────────────────────────────
// Verifier mode + per-proof verification (consensus-facing)
// ─────────────────────────────────────────────────────────────────────────────

export interface PQProofVerification {
  valid: boolean;
  error?: string;
  /** TFLOPS credited to the prover (0 when invalid). */
  verifiedTFLOPS: number;
}

/**
 * Per-proof verification wrapper used by consensus: validates the proof and
 * enforces a per-proof TFLOPS floor (prevents thousands of dust proofs).
 * Returns the credited TFLOPS on success.
 */
export function pqVerifyProofForConsensus(
  cp: ComputeProof,
  blockHeight: number,
  perProofMinTFLOPS: number
): PQProofVerification {
  const p = pqFromComputeProof(cp);
  if (!p) return { valid: false, error: "not a PQ-HASH-IOP-v1 simulation receipt", verifiedTFLOPS: 0 };
  if (!Number.isSafeInteger(cp.tflopsWeight) || cp.tflopsWeight < 0
      || cp.tflopsWeight !== p.tflopsWeight || cp.circuitId !== p.circuitId
      || cp.taskCommitment !== p.outputCommitment
      || !Array.isArray(cp.publicInputs) || cp.publicInputs.length !== 3
      || cp.publicInputs[0] !== p.outputCommitment || cp.publicInputs[1] !== String(p.tflopsWeight)
      || cp.publicInputs[2] !== "0" || !Number.isFinite(perProofMinTFLOPS) || perProofMinTFLOPS < 0) {
    return { valid: false, error: "simulation receipt does not match committed work context", verifiedTFLOPS: 0 };
  }
  const r = pqVerifyComputeProof(p, blockHeight);
  if (!r.valid) return { valid: false, error: r.reason ?? "invalid", verifiedTFLOPS: 0 };
  const tf = r.tflopsWeight ?? 0;
  if (tf < perProofMinTFLOPS) {
    return { valid: false, error: `tflops ${tf} below per-proof minimum ${perProofMinTFLOPS}`, verifiedTFLOPS: 0 };
  }
  return { valid: true, verifiedTFLOPS: tf };
}
