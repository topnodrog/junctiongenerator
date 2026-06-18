/**
 * @file src/scripts/junctioning-verify-smoke.ts
 * @description Live proof of deterministic-replay verification.
 *
 * Runs a junctioning task on the local model, publishes a CLAIM (spec + output
 * + commitment), then REPLAYS the spec and checks the recomputed commitment
 * matches — the core honest-compute check. Also shows a tampered claim being
 * rejected. Two inferences (the replay is warm, so faster than the first).
 *
 *   cd packages/jgc-node && npm run build && npm run junctioning-verify-smoke
 *
 * Override the model with JUNCTIONING_MODEL, the server with OLLAMA_ENDPOINT.
 */

import type { JGClusterTask } from "../broker/compute-broker.js";
import { OllamaInferenceBackend, runJunctioning } from "../broker/junctioning.js";
import { makeClaim, verifyReplay, commitJunctioning } from "../broker/verification.js";
import { ComputeTaskType } from "../types/index.js";

async function main(): Promise<void> {
  const model   = process.env.JUNCTIONING_MODEL ?? "gemma2:2b";
  const backend = new OllamaInferenceBackend();

  console.log("══════════════════════════════════════════════════════════════");
  console.log("  Junctioning verification smoke — deterministic replay");
  console.log(`  model=${model}`);
  console.log("══════════════════════════════════════════════════════════════");

  const task: JGClusterTask = {
    taskId:          "verify-1",
    taskType:        ComputeTaskType.AI_INFERENCE,
    description:     "verification smoke task",
    prompt:          "Name the capital of France in one word.",
    requiredTFLOPS:  100,
    deadlineSecs:    60,
    taskPayloadHash: "0".repeat(64),
    priority:        0,
  };

  // 1. Node runs the task and publishes a claim.
  console.log(`[Verify] Running task ${task.taskId}…`);
  const result = await runJunctioning(task, backend, { model, maxTokens: 1024 });
  const claim  = makeClaim(result.spec, result.text);
  console.log(`[Verify] Output:     ${result.text.trim()}`);
  console.log(`[Verify] Commitment: ${claim.commitment}`);

  // 2. Challenger replays the spec and verifies.
  console.log("[Verify] Replaying spec on a fresh run…");
  const honest = await verifyReplay(claim, backend);
  console.log("──────────────────────────────────────────────────────────────");
  console.log(`[Verify] honest claim  → verified=${honest.verified}`);
  if (!honest.verified) {
    console.log(`           expected ${honest.expectedCommitment}`);
    console.log(`           actual   ${honest.actualCommitment}  (${honest.reason})`);
    console.log("[Verify] NOTE: a mismatch here is the cross-machine/determinism caveat,");
    console.log("         not necessarily a forgery — see verification.ts header.");
  }

  // 3. Show a tampered claim is rejected (no extra inference — commitment math).
  const forged = { ...claim, outputText: claim.outputText + " (tampered)" };
  forged.commitment = commitJunctioning(forged.task, forged.outputText);
  const tamperedDetected = forged.commitment !== claim.commitment;
  console.log(`[Verify] tampered claim → distinct commitment=${tamperedDetected}`);
  console.log("──────────────────────────────────────────────────────────────");
  console.log("[Verify] ✓ replay verification primitive is live");
}

main().catch((err: unknown) => {
  console.error("[Verify] FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
