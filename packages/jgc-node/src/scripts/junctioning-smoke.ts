/**
 * @file src/scripts/junctioning-smoke.ts
 * @description End-to-end smoke test for the junctioning Layer-1 path.
 *
 * Drives a JG-cluster task all the way through the real wiring:
 *   ComputeBroker (assigns the task) → junctioning executor → Ollama → Gemma
 * and prints the model's answer plus the measured compute. This is the honest
 * successor to the old "node → headroom → Anthropic" wiring test, except the
 * inference now happens LOCALLY (real FLOPs the node spends), which is the whole
 * point of Proof-of-Useful-Compute.
 *
 * Prereqs (your install track):
 *   1. Install Ollama (https://ollama.com/download)
 *   2. ollama pull gemma2:2b
 *   3. npm run build && npm run junctioning-smoke   (from packages/jgc-node)
 *
 * Override the model with JUNCTIONING_MODEL, the server with OLLAMA_ENDPOINT.
 */

import { ComputeBroker } from "../broker/compute-broker.js";
import type { NodeCapacity, JGClusterTask } from "../broker/compute-broker.js";
import { OllamaInferenceBackend, runJunctioning } from "../broker/junctioning.js";
import type { JunctioningResult } from "../broker/junctioning.js";
import { ComputeTaskType } from "../types/index.js";

async function main(): Promise<void> {
  const model   = process.env.JUNCTIONING_MODEL ?? "gemma2:2b";
  const backend = new OllamaInferenceBackend();
  const broker  = new ComputeBroker();
  const now     = Math.floor(Date.now() / 1000);

  console.log("══════════════════════════════════════════════════════════════");
  console.log("  Junctioning smoke test — broker → local inference (Gemma)");
  console.log(`  model=${model}  backend=${backend.name}`);
  console.log("══════════════════════════════════════════════════════════════");

  // Capture the executor's result so we can await + print it (the broker fires
  // the executor fire-and-forget, so we bridge it through a promise here).
  let resolve!: (r: JunctioningResult) => void;
  let reject!:  (e: unknown) => void;
  const done = new Promise<JunctioningResult>((res, rej) => { resolve = res; reject = rej; });

  broker.setJGClusterExecutor(async (task) => {
    try { resolve(await runJunctioning(task, backend, { model, maxTokens: 1024 })); }
    catch (err) { reject(err); }
  });

  const node: NodeCapacity = {
    nodePublicKey:   "02" + "0".repeat(64),
    minerAddress:    "1JGC" + "0".repeat(40),
    totalTFLOPS:     1000,
    consensusTFLOPS: 0,
    jgClusterTFLOPS: 0,
    brokerTFLOPS:    0,
    idleTFLOPS:      1000,
    supportedTaskTypes: [ComputeTaskType.AI_INFERENCE],
    lastHeartbeatAt: now,
    hardwareProfile: { gpuModel: "local", gpuVRAMGB: 8, cpuCores: 8, networkMbps: 100 },
  };
  broker.registerNode(node);

  const task: JGClusterTask = {
    taskId:          "smoke-1",
    taskType:        ComputeTaskType.AI_INFERENCE,
    description:     "junctioning smoke task",
    prompt:          "In one sentence, what is proof of useful compute?",
    requiredTFLOPS:  100,
    deadlineSecs:    60,
    taskPayloadHash: "0".repeat(64),
    priority:        0,
  };

  console.log(`[Smoke] Queueing JG task ${task.taskId}: "${task.prompt}"`);
  broker.queueJGClusterTask(task);   // → assigns → fires junctioning executor

  const result = await done;

  console.log("──────────────────────────────────────────────────────────────");
  if (result.thinking && result.thinking.trim().length > 0) {
    const trace = result.thinking.trim();
    const preview = trace.length > 400 ? trace.slice(0, 400) + " …" : trace;
    console.log(`[Smoke] Reasoning trace (${trace.length} chars):\n  ${preview}`);
    console.log("──────────────────────────────────────────────────────────────");
  }
  console.log(`[Smoke] Model answer:\n  ${result.text.trim()}`);
  console.log("──────────────────────────────────────────────────────────────");
  console.log(`[Smoke] prompt tokens:  ${result.promptTokens}`);
  console.log(`[Smoke] output tokens:  ${result.outputTokens} (reasoning + answer)`);
  console.log(`[Smoke] elapsed:        ${result.elapsedMs} ms`);
  console.log(`[Smoke] est. compute:   ${result.tflopsSeconds.toExponential(3)} TFLOP-seconds (token-proxy)`);
  console.log("──────────────────────────────────────────────────────────────");
  console.log("[Smoke] ✓ broker → junctioning → Ollama → Gemma path is live");
}

main().catch((err: unknown) => {
  console.error("[Smoke] FAILED:", err instanceof Error ? err.message : err);
  console.error(
    "[Smoke] Is Ollama running and the model pulled?  " +
    "Try:  ollama pull gemma2:2b  then  ollama list"
  );
  process.exitCode = 1;
});
