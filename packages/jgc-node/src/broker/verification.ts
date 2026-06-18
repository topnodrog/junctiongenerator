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
import type { InferenceBackend, VerifiableTask } from "./junctioning.js";

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
  expectedCommitment: string;   // the claim's commitment
  actualCommitment:   string;   // recomputed from the replay
  reason?:            string;
}

/**
 * Canonical, order-fixed serialization of the determining inputs. Hashing a
 * hand-ordered string (not JSON) avoids any dependence on key-ordering quirks.
 */
function canonicalTask(t: VerifiableTask): string {
  return [
    `model=${t.model}`,
    `temperature=${t.temperature}`,
    `seed=${t.seed}`,
    `maxTokens=${t.maxTokens}`,
    `prompt=${t.prompt}`,
  ].join("\n");
}

/** Commitment binding a task spec to an output: sha256(canonical || output). */
export function commitJunctioning(task: VerifiableTask, outputText: string): string {
  return createHash("sha256")
    .update(canonicalTask(task))
    .update("\n--output--\n")
    .update(outputText)
    .digest("hex");
}

/** Build a publishable claim from a task spec and the output a node produced. */
export function makeClaim(task: VerifiableTask, outputText: string): JunctioningClaim {
  return { task, outputText, commitment: commitJunctioning(task, outputText) };
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
    expectedCommitment: claim.commitment,
    actualCommitment,
    reason: verified ? undefined : "replayed output commitment does not match the claim",
  };
}
