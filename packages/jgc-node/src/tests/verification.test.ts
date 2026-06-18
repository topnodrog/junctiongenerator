/**
 * @file src/tests/verification.test.ts
 * @description Tests for deterministic-replay verification of junctioning compute.
 *
 * Covers commitment determinism/sensitivity, replay accepting an honest claim
 * (deterministic backend reproduces the output), and replay rejecting a forged
 * claim (output that the model wouldn't produce).
 */

import {
  commitJunctioning,
  makeClaim,
  verifyReplay,
} from "../broker/verification.js";
import {
  FakeInferenceBackend,
  type InferenceBackend,
  type InferenceRequest,
  type InferenceResult,
  type VerifiableTask,
} from "../broker/junctioning.js";

function task(overrides: Partial<VerifiableTask> = {}): VerifiableTask {
  return { prompt: "what is PoUC?", model: "gemma2:2b", maxTokens: 1024, temperature: 0, seed: 0, ...overrides };
}

describe("commitJunctioning", () => {
  it("is deterministic for identical spec + output", () => {
    const a = commitJunctioning(task(), "answer");
    const b = commitJunctioning(task(), "answer");
    expect(a).toBe(b);
    expect(a).toHaveLength(64); // sha256 hex
  });

  it("changes when the output changes", () => {
    expect(commitJunctioning(task(), "answer")).not.toBe(commitJunctioning(task(), "different"));
  });

  it("changes when any determining input changes", () => {
    const base = commitJunctioning(task(), "answer");
    expect(commitJunctioning(task({ seed: 1 }),        "answer")).not.toBe(base);
    expect(commitJunctioning(task({ model: "x" }),     "answer")).not.toBe(base);
    expect(commitJunctioning(task({ temperature: 1 }), "answer")).not.toBe(base);
    expect(commitJunctioning(task({ prompt: "x" }),    "answer")).not.toBe(base);
  });
});

describe("verifyReplay", () => {
  it("accepts an honest claim (deterministic backend reproduces output)", async () => {
    // FakeInferenceBackend is deterministic: same spec → same text.
    const backend = new FakeInferenceBackend();
    const t = task();
    const produced = await backend.run(t);
    const claim = makeClaim(t, produced.text);

    const result = await verifyReplay(claim, backend);
    expect(result.verified).toBe(true);
    expect(result.actualCommitment).toBe(result.expectedCommitment);
  });

  it("rejects a forged claim (output the model wouldn't produce)", async () => {
    const backend = new FakeInferenceBackend();
    const t = task();
    const claim = makeClaim(t, "a fabricated answer the node never computed");

    const result = await verifyReplay(claim, backend);
    expect(result.verified).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.actualCommitment).not.toBe(result.expectedCommitment);
  });

  it("rejects when the claimant used a different model than the spec says", async () => {
    // A backend whose output depends on the model id; the claim asserts model A
    // but the honest output for model A differs from the forged text.
    const modelSensitive: InferenceBackend = {
      name: "model-sensitive",
      async run(req: InferenceRequest): Promise<InferenceResult> {
        return { text: `output-of-${req.model}`, promptTokens: 1, outputTokens: 1, backend: "model-sensitive", model: req.model };
      },
    };
    // Node ran model B but claims it ran model A with B's output.
    const claim = makeClaim(task({ model: "model-A" }), "output-of-model-B");
    const result = await verifyReplay(claim, modelSensitive);
    expect(result.verified).toBe(false); // replay of model-A yields "output-of-model-A"
  });
});
