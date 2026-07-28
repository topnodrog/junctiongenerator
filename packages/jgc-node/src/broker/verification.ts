/**
 * @file src/broker/verification.ts
 * @description Deterministic-replay verification for junctioning compute.
 *
 * THE PROBLEM (L5, make-or-break)
 * ───────────────────────────────
 * PoUC only works if the network can tell honest compute from a lie. A node
 * claims "I ran this inference and got this output" — how does anyone check it
 * without trusting the node?
 *
 * THE PRIMITIVE
 * ─────────────
 * Junctioning inference is deterministic (temperature 0 + fixed seed, see
 * junctioning.ts), so the same VerifiableTask yields the same output. A node
 * publishes a CLAIM: the task spec + its output, bound by a commitment hash. A
 * challenger REPLAYS the spec on its own backend and recomputes the commitment.
 * Match ⇒ the claim is consistent with actually running the model; mismatch ⇒
 * the node fabricated output or ran a different/smaller model.
 *
 * WHAT THIS IS AND ISN'T (read before trusting it)
 * ────────────────────────────────────────────────
 *   • It is a FRAUD-PROOF BASIS, not a succinct proof. A match means *the
 *     challenger* reproduced the output — it's the core check a challenge /
 *     fraud-proof protocol is built on, not a standalone "node X did the work".
 *   • The economic layer is NOT here: who challenges whom, how tasks are
 *     sampled for challenge, staking/slashing on a caught lie. That's the
 *     protocol design that sits on top of this primitive.
 *   • DETERMINISM IS BACKEND-SCOPED. Same Ollama build on similar hardware
 *     reproduces output; ACROSS different runtimes/hardware, floating-point
 *     reduction order can differ and break bit-exact replay. A production
 *     scheme needs a canonical reference runtime (or output tolerance) — the
 *     hard, open part of L5. This module is the verifiable spine, not the
 *     finished verification model.
 */

import { createHash } from "crypto";
import type { ExecutionProfile, InferenceBackend, VerifiableTask } from "./junctioning.js";

/** A node's published claim: a task, the output it produced, and the binding. */
export interface JunctioningClaim {
  task:       VerifiableTask;
  outputText: string;
  /** sha256 over the canonical task spec + output. See {@link commitJunctioning}. */
  commitment: string;
}

/** Outcome of replaying a claim. */
export interface VerificationResult {
  verified:           boolean;
  /** False means this verifier must abstain; incompatibility is not fraud. */
  compatible:         boolean;
  expectedCommitment: string;   // the claim's commitment
  actualCommitment:   string;   // recomputed from the replay
  reason?:            string;
}

/**
 * Canonical, order-fixed serialization of the determining inputs. Hashing a
 * hand-ordered string (not JSON) avoids any dependence on key-ordering quirks.
 */
function canonicalProfile(p: ExecutionProfile): string[] {
  return [p.protocol, p.runtime, p.runtimeVersion, p.modelDigest,
    p.tokenizerDigest, p.quantization, p.numericBackend];
}

function validateProfile(profile: ExecutionProfile): void {
  if (profile.protocol !== "jgc-exact-replay-v1") throw new Error("unsupported execution profile protocol");
  for (const [name, digest] of [["modelDigest", profile.modelDigest], ["tokenizerDigest", profile.tokenizerDigest]]) {
    if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error(`${name} must be lowercase SHA-256 hex`);
  }
  for (const [name, value] of Object.entries(profile)) {
    if (typeof value !== "string" || value.length === 0) throw new Error(`${name} must be a non-empty string`);
  }
}

function validateTask(task: VerifiableTask): void {
  if (!Number.isSafeInteger(task.maxTokens) || task.maxTokens <= 0) throw new Error("maxTokens must be a positive safe integer");
  if (!Number.isSafeInteger(task.seed)) throw new Error("seed must be a safe integer");
  if (!Number.isFinite(task.temperature) || task.temperature < 0) throw new Error("temperature must be finite and non-negative");
  if (task.executionProfile) validateProfile(task.executionProfile);
}

function canonicalTask(t: VerifiableTask): Buffer {
  const profile = t.executionProfile;
  const fields = [
    "JGC/JUNCTIONING/CLAIM/V1",
    t.model,
    String(t.maxTokens),
    String(t.temperature),
    String(t.seed),
    t.prompt,
    ...(profile ? canonicalProfile(profile) : ["UNSCOPED-LEGACY"]),
  ];
  const chunks: Buffer[] = [];
  for (const field of fields) {
    const value = Buffer.from(field, "utf8");
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(value.length);
    chunks.push(length, value);
  }
  return Buffer.concat(chunks);
}

/** Commitment binding a task spec to an output: sha256(canonical || output). */
export function commitJunctioning(task: VerifiableTask, outputText: string): string {
  validateTask(task);
  const output = Buffer.from(outputText, "utf8");
  const outputLength = Buffer.allocUnsafe(4);
  outputLength.writeUInt32BE(output.length);
  return createHash("sha256")
    .update(canonicalTask(task))
    .update(outputLength)
    .update(output)
    .digest("hex");
}

/** Build a publishable claim from a task spec and the output a node produced. */
export function makeClaim(task: VerifiableTask, outputText: string): JunctioningClaim {
  if (!task.executionProfile) {
    throw new Error("Cannot publish a slashable claim without an execution profile");
  }
  validateProfile(task.executionProfile);
  return { task, outputText, commitment: commitJunctioning(task, outputText) };
}

function sameProfile(a: ExecutionProfile, b: ExecutionProfile): boolean {
  return canonicalProfile(a).every((value, index) => value === canonicalProfile(b)[index]);
}

/**
 * Verify a claim by replaying its task on `backend` and comparing commitments.
 * `backend` is the CHALLENGER's — re-running the spec deterministically must
 * reproduce the claimed output (subject to the backend-scoping caveat above).
 */
export async function verifyReplay(
  claim:   JunctioningClaim,
  backend: InferenceBackend,
): Promise<VerificationResult> {
  const { task } = claim;
  if (!task.executionProfile) {
    return {
      verified: false, compatible: false,
      expectedCommitment: claim.commitment, actualCommitment: "",
      reason: "claim has no versioned execution profile",
    };
  }
  const verifierProfile = await backend.executionProfile?.(task.model);
  try {
    if (verifierProfile) validateProfile(verifierProfile);
  } catch {
    return {
      verified: false, compatible: false,
      expectedCommitment: claim.commitment, actualCommitment: "",
      reason: "verifier returned an invalid execution profile",
    };
  }
  if (!verifierProfile || !sameProfile(task.executionProfile, verifierProfile)) {
    return {
      verified: false, compatible: false,
      expectedCommitment: claim.commitment, actualCommitment: "",
      reason: "verifier execution profile is incompatible with the claim",
    };
  }
  const inf = await backend.run({
    prompt:      task.prompt,
    model:       task.model,
    maxTokens:   task.maxTokens,
    temperature: task.temperature,
    seed:        task.seed,
  });

  const actualCommitment = commitJunctioning(task, inf.text);
  const verified = actualCommitment === claim.commitment;

  return {
    verified,
    compatible: true,
    expectedCommitment: claim.commitment,
    actualCommitment,
    reason: verified ? undefined : "replayed output commitment does not match the claim",
  };
}
