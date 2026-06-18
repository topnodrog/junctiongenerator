/**
 * @file src/tests/junctioning.test.ts
 * @description Tests for the junctioning Layer-1 inference seam.
 *
 * Covers the deterministic fake backend, the executor's compute accounting,
 * the description→prompt fallback, and the broker's JG-cluster execution hook
 * firing end-to-end (broker → executor) with no model installed.
 */

import {
  FakeInferenceBackend,
  runJunctioning,
  DEFAULT_FLOPS_PER_TOKEN,
  DEFAULT_SEED,
  type InferenceBackend,
  type InferenceRequest,
  type InferenceResult,
} from "../broker/junctioning.js";
import {
  ComputeBroker,
  type JGClusterTask,
  type NodeCapacity,
} from "../broker/compute-broker.js";
import { ComputeTaskType } from "../types/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function jgTask(overrides: Partial<JGClusterTask> = {}): JGClusterTask {
  return {
    taskId:          "task-1",
    taskType:        ComputeTaskType.AI_INFERENCE,
    description:     "audit this contract",
    requiredTFLOPS:  100,
    deadlineSecs:    60,
    taskPayloadHash: "0".repeat(64),
    priority:        0,
    ...overrides,
  };
}

function nodeCapacity(now: number, overrides: Partial<NodeCapacity> = {}): NodeCapacity {
  return {
    nodePublicKey:   "02" + "a".repeat(64),
    minerAddress:    "1JGC" + "b".repeat(40),
    totalTFLOPS:     1000,
    consensusTFLOPS: 0,
    jgClusterTFLOPS: 0,
    brokerTFLOPS:    0,
    idleTFLOPS:      1000,
    supportedTaskTypes: [ComputeTaskType.AI_INFERENCE],
    lastHeartbeatAt: now,
    hardwareProfile: { gpuModel: "test", gpuVRAMGB: 8, cpuCores: 8, networkMbps: 100 },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fake backend
// ─────────────────────────────────────────────────────────────────────────────

describe("FakeInferenceBackend", () => {
  it("is deterministic for the same input", async () => {
    const backend = new FakeInferenceBackend();
    const req: InferenceRequest = { prompt: "hello world", model: "gemma2:2b", maxTokens: 512 };
    const a = await backend.run(req);
    const b = await backend.run(req);
    expect(a).toEqual(b);
    expect(a.backend).toBe("fake");
    expect(a.promptTokens).toBeGreaterThan(0);
    expect(a.outputTokens).toBeGreaterThan(0);
  });

  it("respects the maxTokens cap on output", async () => {
    const backend = new FakeInferenceBackend();
    const res = await backend.run({ prompt: "x".repeat(400), model: "m", maxTokens: 3 });
    expect(res.outputTokens).toBeLessThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Executor
// ─────────────────────────────────────────────────────────────────────────────

describe("runJunctioning", () => {
  it("computes tflopsSeconds from total tokens × flopsPerToken", async () => {
    const backend = new FakeInferenceBackend();
    const res = await runJunctioning(jgTask(), backend, { flopsPerToken: 1e12 });
    const expected = (res.promptTokens + res.outputTokens) * 1e12 / 1e12;
    expect(res.tflopsSeconds).toBeCloseTo(expected, 9);
    expect(res.taskId).toBe("task-1");
    expect(res.backend).toBe("fake");
    expect(res.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("uses task.prompt when present, else falls back to description", async () => {
    // A backend that echoes the prompt length back so we can assert which was used.
    const echo: InferenceBackend = {
      name: "echo",
      async run(req: InferenceRequest): Promise<InferenceResult> {
        return { text: req.prompt, promptTokens: req.prompt.length, outputTokens: 0, backend: "echo", model: req.model };
      },
    };
    const withPrompt = await runJunctioning(jgTask({ prompt: "explicit prompt" }), echo);
    expect(withPrompt.promptTokens).toBe("explicit prompt".length);

    const fallback = await runJunctioning(jgTask({ description: "desc only" }), echo);
    expect(fallback.promptTokens).toBe("desc only".length);
  });

  it("exposes a sane default flopsPerToken", () => {
    expect(DEFAULT_FLOPS_PER_TOKEN).toBeGreaterThan(0);
  });

  it("defaults to deterministic sampling (temperature 0, fixed seed)", async () => {
    let captured: InferenceRequest | undefined;
    const capture: InferenceBackend = {
      name: "capture",
      async run(req: InferenceRequest): Promise<InferenceResult> {
        captured = req;
        return { text: "", promptTokens: 1, outputTokens: 1, backend: "capture", model: req.model };
      },
    };
    await runJunctioning(jgTask(), capture);
    expect(captured?.temperature).toBe(0);
    expect(captured?.seed).toBe(DEFAULT_SEED);
  });

  it("lets callers override sampling controls", async () => {
    let captured: InferenceRequest | undefined;
    const capture: InferenceBackend = {
      name: "capture",
      async run(req: InferenceRequest): Promise<InferenceResult> {
        captured = req;
        return { text: "", promptTokens: 1, outputTokens: 1, backend: "capture", model: req.model };
      },
    };
    await runJunctioning(jgTask(), capture, { temperature: 0.7, seed: 42 });
    expect(captured?.temperature).toBe(0.7);
    expect(captured?.seed).toBe(42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Broker → executor wiring
// ─────────────────────────────────────────────────────────────────────────────

describe("ComputeBroker JG-cluster executor hook", () => {
  it("fires the wired executor when a JG task is assigned", async () => {
    const broker = new ComputeBroker();
    const now = Math.floor(Date.now() / 1000);

    const seen: string[] = [];
    broker.setJGClusterExecutor((task) => { seen.push(task.taskId); });

    broker.registerNode(nodeCapacity(now));
    broker.queueJGClusterTask(jgTask({ taskId: "jg-42" }));

    // Executor fires synchronously from allocation here (sync callback).
    await Promise.resolve();
    expect(seen).toContain("jg-42");
  });

  it("does nothing (no throw) when no executor is wired", () => {
    const broker = new ComputeBroker();
    const now = Math.floor(Date.now() / 1000);
    broker.registerNode(nodeCapacity(now));
    expect(() => broker.queueJGClusterTask(jgTask())).not.toThrow();
  });
});
