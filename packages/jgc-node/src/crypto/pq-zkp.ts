/**
 * @file src/crypto/pq-zkp.ts
 * @description Hash-commitment prototype for JGC compute-proof experiments.
 *
 * WHY GROTH16/BN254 HAD TO GO
 * ───────────────────────────
 * Groth16's security rests on pairings over the BN254 curve — discrete-log
 * assumptions that Shor's algorithm breaks on a CRQC. A quantum adversary could
 * forge "I did the compute" proofs and mint JGT for work never performed,
 * destroying the chain's core value. Groth16 also requires a per-circuit
 * trusted setup (a toxic-waste ceremony). This prototype is hash-only and
 * transparent, but a Merkle opening does NOT prove useful computation. Strict
 * consensus therefore rejects it; simnet uses it only to exercise data flow.
 *
 * PRIVACY LIMIT
 * ─────────────
 * The committed witness fields are not serialised, but hiding fields is not a
 * zero-knowledge proof. No claim of Zcash-equivalent privacy or computation
 * soundness is made by this module.
 *
 * CONSTRUCTION (commitment-integrity test fixture)
 * ─────────────────────────────────────────────────────────────
 *   witness   w = (taskCommitment, nonce, tflopsWeight)         [private]
 *   leaf      L = H( circuitId | outputCommitment | w | nonce )
 *   tree      a small Merkle tree over the witness polynomials
 *   root      R = MerkleRoot                                     [committed]
 *   Fiat–Shamir challenge  c = H( domain | R | publicInputs )
 *   queries   k leaves opened with Merkle authentication paths
 *   bound     the opened leaves + tflopsWeight are bound into R so the
 *             claimed work cannot be inflated after the fact
 * These checks provide commitment integrity only. They provide no execution
 * soundness and must never authorize production rewards.
 *
 * This module is self-contained so simulations can test malformed inputs,
 * canonical bindings, and consensus fail-closed behaviour without a prover.
 *
 * CIRCUIT NAMING: post-quantum circuit ids carry the "PQ_" prefix
 * (e.g. "PQ_CIRCUIT_AI_INFERENCE_V1") so they are unambiguous next to the
 * legacy pairing-based registry entries.
 */

import { createHash, randomBytes } from "crypto";
import type { ComputeProof } from "../types/index.js";
import {
  PQ_CRYPTO_SUITE,
  PQ_LIMITS,
  decodeCanonicalHex,
  encodeTaggedFields,
  isCanonicalHex,
  jsonDepthWithinLimit,
  utf8ByteLength,
} from "./pq-suite.js";

const toBytes = (hex: string): Uint8Array => decodeCanonicalHex(hex);
const toHex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

/** Domain separator so PQ proofs can never be confused with any other protocol msg. */
const PQ_PROOF_DOMAIN = "JGC-PQ-PROOF-v1";

/** Quantum-safe hash: SHA3-256. */
function H(...parts: (Uint8Array | string | Buffer)[]): Buffer {
  const fields = parts.map((part, index) => [String(index), part] as const);
  return createHash("sha3-256").update(encodeTaggedFields(PQ_PROOF_DOMAIN, fields)).digest();
}

/** Number of Fiat–Shamir query openings per proof (soundness ≈ 2^-queries·log). */
const PQ_NUM_QUERIES = 16;

/**
 * Witness polynomial evaluation-domain size (number of leaves). Larger than
 * PQ_NUM_QUERIES so the Fiat–Shamir query set is collision-free with high
 * probability; the prover retries on the (rare) collision to always emit
 * PQ_NUM_QUERIES DISTINCT openings, which the verifier strictly requires.
 */
const PQ_DOMAIN_SIZE = 32;

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
  /** Minimum TFLOPS-seconds this circuit can credibly attest to. */
  minTFLOPSPerProof: number;
  /** Maximum TFLOPS-seconds (caps fraudulent inflation). */
  maxTFLOPSPerProof: number;
  /** Block height at which this circuit became active (governance path). */
  activeSinceHeight: number;
  /** Prototype commitments are never reward-eligible in strict consensus. */
  consensusStatus: "prototype-only" | "approved";
}

/**
 * Post-quantum circuit registry. NOTE the absence of alpha/beta/gamma/delta/IC:
 * a transparent scheme has no trusted-setup verification key — only honest,
 * public bounds. This removes the toxic-waste ceremony Groth16 required.
 */
export const PQ_CIRCUIT_REGISTRY: Map<string, PQCircuitParams> = new Map([
  ["PQ_CIRCUIT_AI_INFERENCE_V1", { circuitId: "PQ_CIRCUIT_AI_INFERENCE_V1", minTFLOPSPerProof: 1, maxTFLOPSPerProof: 1_000_000, activeSinceHeight: 0, consensusStatus: "prototype-only" }],
  ["PQ_CIRCUIT_AI_TRAINING_V1",  { circuitId: "PQ_CIRCUIT_AI_TRAINING_V1",  minTFLOPSPerProof: 10, maxTFLOPSPerProof: 10_000_000, activeSinceHeight: 0, consensusStatus: "prototype-only" }],
  ["PQ_CIRCUIT_FOLD_SIM_V1",     { circuitId: "PQ_CIRCUIT_FOLD_SIM_V1",     minTFLOPSPerProof: 1, maxTFLOPSPerProof: 5_000_000, activeSinceHeight: 0, consensusStatus: "prototype-only" }],
  ["PQ_CIRCUIT_SCI_COMPUTE_V1",  { circuitId: "PQ_CIRCUIT_SCI_COMPUTE_V1",  minTFLOPSPerProof: 1, maxTFLOPSPerProof: 5_000_000, activeSinceHeight: 0, consensusStatus: "prototype-only" }],
  ["PQ_CIRCUIT_COMMERCIAL_V1",   { circuitId: "PQ_CIRCUIT_COMMERCIAL_V1",   minTFLOPSPerProof: 1, maxTFLOPSPerProof: 1_000_000, activeSinceHeight: 0, consensusStatus: "prototype-only" }],
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

/** The serialised post-quantum compute proof. */
export interface PQComputeProof {
  scheme: "PQ-HASH-COMMITMENT-v2";
  cryptoSuite: typeof PQ_CRYPTO_SUITE.id;
  circuitId: string;
  /** Public output commitment (e.g. hash of the model/result the task produced). */
  outputCommitment: string;
  /** Merkle root committing to the private witness polynomials. */
  witnessRoot: string;
  /** Claimed TFLOPS-seconds (bound into the proof; checked against registry). */
  tflopsWeight: number;
  /** Exact block height this statement is intended for (anti-replay). */
  statementHeight: number;
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

function buildWitnessLeaves(w: PQWitness, circuitId: string, outputCommitment: string, statementHeight: number): Buffer[] {
  // Expand the witness into a fixed polynomial evaluation domain (PQ_DOMAIN_SIZE leaves).
  const leaves: Buffer[] = [];
  for (let i = 0; i < PQ_DOMAIN_SIZE; i++) {
    leaves.push(
      H(PQ_PROOF_DOMAIN, "wit", PQ_CRYPTO_SUITE.id, circuitId, outputCommitment, w.taskCommitment, w.nonce, String(w.tflopsWeight), String(statementHeight), String(i))
    );
  }
  return leaves;
}

function fiatShamirChallenge(circuitId: string, outputCommitment: string, root: Buffer, tflops: number, statementHeight: number): Buffer {
  return H(PQ_PROOF_DOMAIN, "fs", PQ_CRYPTO_SUITE.id, circuitId, outputCommitment, root, String(tflops), String(statementHeight));
}

/**
 * Produce a post-quantum compute proof from a private witness.
 * `outputCommitment` is public; the witness stays secret (privacy).
 */
export function pqProveCompute(
  circuitId: string,
  outputCommitment: string,
  witness: PQWitness,
  statementHeight = 0
): PQComputeProof {
  const params = PQ_CIRCUIT_REGISTRY.get(circuitId);
  if (!params) throw new Error(`unknown PQ circuit: ${circuitId}`);
  if (utf8ByteLength(circuitId) > PQ_LIMITS.maxCircuitIdBytes) throw new Error("circuitId is too large");
  if (!isCanonicalHex(outputCommitment, 32)) throw new Error("outputCommitment must be 32-byte lowercase hex");
  if (!isCanonicalHex(witness.taskCommitment, 32)) throw new Error("taskCommitment must be 32-byte lowercase hex");
  if (!isCanonicalHex(witness.nonce, 32)) throw new Error("nonce must be 32-byte lowercase hex");
  if (!Number.isSafeInteger(statementHeight) || statementHeight < 0) throw new Error("statementHeight must be a non-negative safe integer");
  if (!Number.isSafeInteger(witness.tflopsWeight)) throw new Error("tflopsWeight must be a safe integer");
  if (witness.tflopsWeight < params.minTFLOPSPerProof || witness.tflopsWeight > params.maxTFLOPSPerProof) {
    throw new Error(`tflopsWeight ${witness.tflopsWeight} outside [${params.minTFLOPSPerProof}, ${params.maxTFLOPSPerProof}]`);
  }
  const leaves = buildWitnessLeaves(witness, circuitId, outputCommitment, statementHeight);
  const root = merkleRoot(leaves);
  const challenge = fiatShamirChallenge(circuitId, outputCommitment, root, witness.tflopsWeight, statementHeight);
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
    scheme: "PQ-HASH-COMMITMENT-v2",
    cryptoSuite: PQ_CRYPTO_SUITE.id,
    circuitId,
    outputCommitment,
    witnessRoot: toHex(root),
    tflopsWeight: witness.tflopsWeight,
    statementHeight,
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
 * Verify a post-quantum compute proof against public inputs only.
 * Returns { valid, reason }. Never throws on malformed input.
 */
export function pqVerifyComputeProof(proof: PQComputeProof, blockHeight: number): PQVerifyResult {
  try {
    if (!proof || proof.scheme !== "PQ-HASH-COMMITMENT-v2") return { valid: false, reason: "bad scheme" };
    if (proof.cryptoSuite !== PQ_CRYPTO_SUITE.id) return { valid: false, reason: "unsupported crypto suite" };
    if (!Number.isSafeInteger(blockHeight) || blockHeight < 0) return { valid: false, reason: "bad block height" };
    if (proof.statementHeight !== blockHeight) return { valid: false, reason: "proof is bound to a different block height" };
    if (!isCanonicalHex(proof.outputCommitment, 32)) return { valid: false, reason: "bad output commitment" };
    if (utf8ByteLength(proof.circuitId) > PQ_LIMITS.maxCircuitIdBytes) return { valid: false, reason: "circuit id too large" };
    const params = PQ_CIRCUIT_REGISTRY.get(proof.circuitId);
    if (!params) return { valid: false, reason: `unknown circuit ${proof.circuitId}` };
    if (blockHeight < params.activeSinceHeight) return { valid: false, reason: "circuit not yet active" };
    if (!Number.isSafeInteger(proof.tflopsWeight) || proof.tflopsWeight < params.minTFLOPSPerProof || proof.tflopsWeight > params.maxTFLOPSPerProof) {
      return { valid: false, reason: "tflops out of bounds" };
    }
    const root = toBytes(proof.witnessRoot);
    if (root.length !== 32) return { valid: false, reason: "bad witnessRoot" };

    // Soundness: the proof must contain EXACTLY PQ_NUM_QUERIES openings with
    // no duplicate leaf indexes. Otherwise a prover could drop a query that a
    // hash collision made redundant (16 queries over a 16-leaf domain) and
    // still cover every distinct required index — weakening the soundness bound.
    if (!Array.isArray(proof.queries) || proof.queries.length !== PQ_NUM_QUERIES) {
      return { valid: false, reason: `expected ${PQ_NUM_QUERIES} queries` };
    }
    const claimedIdx = new Set<number>();
    for (const o of proof.queries) {
      if (!o || !Number.isInteger(o.index) || o.index < 0 || o.index >= PQ_DOMAIN_SIZE) {
        return { valid: false, reason: "bad query index" };
      }
      if (!isCanonicalHex(o.leaf, 32)) return { valid: false, reason: "bad leaf" };
      if (!Array.isArray(o.path) || o.path.length !== Math.log2(PQ_DOMAIN_SIZE)) {
        return { valid: false, reason: "bad merkle path length" };
      }
      if (!o.path.every((part) => isCanonicalHex(part, 32))) return { valid: false, reason: "bad merkle sibling" };
      if (claimedIdx.has(o.index)) return { valid: false, reason: "duplicate query index" };
      claimedIdx.add(o.index);
    }

    const challenge = fiatShamirChallenge(
      proof.circuitId,
      proof.outputCommitment,
      Buffer.from(root),
      proof.tflopsWeight,
      proof.statementHeight
    );

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
      // Re-derive the leaf from the witness-bound hash? We cannot — witness is
      // private. Instead we check the opened leaf is a well-formed 32-byte value
      // with a VALID Merkle path to the committed root. Binding to tflops and
      // circuit is enforced because the root commits to them (prover cannot open
      // a different tflops without a different root, which changes the challenge).
      const leaf = toBytes(opening.leaf);
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
  const proofBytes = JSON.stringify(p);
  if (utf8ByteLength(proofBytes) > PQ_LIMITS.maxProofBytes) throw new Error("PQ proof exceeds the consensus size limit");
  return {
    taskCommitment: p.outputCommitment,
    proofBytes,
    circuitId: p.circuitId,
    publicInputs: [p.outputCommitment, String(p.tflopsWeight), String(p.statementHeight)],
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
    if (utf8ByteLength(raw) > PQ_LIMITS.maxProofBytes) return null;
    if (!jsonDepthWithinLimit(raw)) return null;
    const obj = JSON.parse(raw);
    return obj && obj.scheme === "PQ-HASH-COMMITMENT-v2" ? (obj as PQComputeProof) : null;
  } catch {
    return null;
  }
}

export interface PQConsensusBindingResult {
  valid: boolean;
  error?: string;
  proof?: PQComputeProof;
}

/** Require the consensus envelope to repeat the exact proof statement. */
export function pqValidateConsensusBinding(cp: ComputeProof, blockHeight: number): PQConsensusBindingResult {
  const p = pqFromComputeProof(cp);
  if (!p) return { valid: false, error: "not a bounded post-quantum commitment proof" };
  if (!Number.isSafeInteger(blockHeight) || blockHeight < 0) return { valid: false, error: "invalid block height" };
  if (cp.taskCommitment !== p.outputCommitment) return { valid: false, error: "outer taskCommitment does not match the proof" };
  if (cp.circuitId !== p.circuitId) return { valid: false, error: "outer circuitId does not match the proof" };
  if (cp.tflopsWeight !== p.tflopsWeight) return { valid: false, error: "outer tflopsWeight does not match the proof" };
  if (!Array.isArray(cp.publicInputs) || cp.publicInputs.length !== 3) {
    return { valid: false, error: "proof must have exactly three public inputs" };
  }
  const expected = [p.outputCommitment, String(p.tflopsWeight), String(blockHeight)];
  for (let i = 0; i < expected.length; i++) {
    const value = cp.publicInputs[i];
    if (typeof value !== "string" || utf8ByteLength(value) > PQ_LIMITS.maxPublicInputBytes) {
      return { valid: false, error: `public input ${i} is malformed or too large` };
    }
    if (value !== expected[i]) return { valid: false, error: `public input ${i} does not match the proof statement` };
  }
  if (p.statementHeight !== blockHeight) return { valid: false, error: "proof statement height does not match the block" };
  return { valid: true, proof: p };
}

/**
 * Drop-in PQ replacement for the legacy verifyComputeProof: accepts the
 * consensus ComputeProof, extracts the embedded PQ proof, and verifies it.
 */
export function pqVerifyComputeProofFromConsensus(cp: ComputeProof, blockHeight: number): boolean {
  const binding = pqValidateConsensusBinding(cp, blockHeight);
  if (!binding.valid || !binding.proof) return false;
  const params = PQ_CIRCUIT_REGISTRY.get(binding.proof.circuitId);
  if (!params) return false;
  if (pqVerifierMode === "strict" && params.consensusStatus !== "approved") return false;
  return pqVerifyComputeProof(binding.proof, blockHeight).valid;
}

// ─────────────────────────────────────────────────────────────────────────────
// Verifier mode + per-proof verification (consensus-facing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifier mode. In "simnet" the signature check is relaxed (placeholder sigs);
 * proof verification is ALWAYS enforced — there is no mode that accepts an
 * invalid proof. Default is strict.
 */
export type PQVerifierMode = "strict" | "simnet";
let pqVerifierMode: PQVerifierMode = "strict";
export function setPQVerifierMode(m: PQVerifierMode): void {
  if (m === "simnet" && process.env.NODE_ENV === "production") {
    throw new Error("simnet PQ verifier mode is forbidden in production");
  }
  pqVerifierMode = m;
}
export function getPQVerifierMode(): PQVerifierMode { return pqVerifierMode; }

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
  const binding = pqValidateConsensusBinding(cp, blockHeight);
  if (!binding.valid || !binding.proof) {
    return { valid: false, error: binding.error ?? "invalid proof binding", verifiedTFLOPS: 0 };
  }
  const p = binding.proof;
  const params = PQ_CIRCUIT_REGISTRY.get(p.circuitId);
  if (!params) return { valid: false, error: "unknown circuit", verifiedTFLOPS: 0 };
  if (pqVerifierMode === "strict" && params.consensusStatus !== "approved") {
    return {
      valid: false,
      error: "prototype hash commitments do not prove useful computation and are not reward-eligible in strict mode",
      verifiedTFLOPS: 0,
    };
  }
  const r = pqVerifyComputeProof(p, blockHeight);
  if (!r.valid) return { valid: false, error: r.reason ?? "invalid", verifiedTFLOPS: 0 };
  const tf = r.tflopsWeight ?? 0;
  if (tf < perProofMinTFLOPS) {
    return { valid: false, error: `tflops ${tf} below per-proof minimum ${perProofMinTFLOPS}`, verifiedTFLOPS: 0 };
  }
  return { valid: true, verifiedTFLOPS: tf };
}
