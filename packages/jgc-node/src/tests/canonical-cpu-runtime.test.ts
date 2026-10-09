import { jest } from "@jest/globals";
import {
  CANONICAL_CPU_MAX_TOKENS,
  CANONICAL_CPU_MODEL,
  CANONICAL_CPU_MODEL_DIGEST,
  CANONICAL_CPU_NUMERIC_BACKEND,
  CanonicalCpuChallengeRuntime,
} from "../broker/canonical-cpu-runtime.js";
import { makeClaim, verifyReplay } from "../broker/verification.js";

type Fetch = typeof fetch;

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function mockOllama(overrides: {
  digest?: string;
  version?: string;
  quantization?: string;
  chat?: unknown;
} = {}): { fetch: jest.MockedFunction<Fetch>; chatBodies: unknown[] } {
  const chatBodies: unknown[] = [];
  const fetchImpl = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/tags")) return json({ models: [{ name: CANONICAL_CPU_MODEL, digest: overrides.digest ?? CANONICAL_CPU_MODEL_DIGEST }] });
    if (url.endsWith("/api/version")) return json({ version: overrides.version ?? "0.34.0" });
    if (url.endsWith("/api/show")) return json({ details: { parameter_size: "5.1B", quantization_level: overrides.quantization ?? "Q4_K_M" } });
    if (url.endsWith("/api/chat")) {
      chatBodies.push(JSON.parse(String(init?.body)) as unknown);
      return json(overrides.chat ?? {
        model: CANONICAL_CPU_MODEL,
        message: { content: "canonical answer", thinking: "reasoning" },
        prompt_eval_count: 3,
        eval_count: 7,
        done: true,
        done_reason: "stop",
      });
    }
    return json({}, 404);
  }) as jest.MockedFunction<Fetch>;
  return { fetch: fetchImpl, chatBodies };
}

const request = {
  prompt: "verify this",
  model: CANONICAL_CPU_MODEL,
  maxTokens: CANONICAL_CPU_MAX_TOKENS,
  temperature: 0,
  seed: 0,
};

describe("CanonicalCpuChallengeRuntime", () => {
  test("publishes only the exact frozen execution profile", async () => {
    const ollama = mockOllama();
    const runtime = new CanonicalCpuChallengeRuntime({ fetch: ollama.fetch, arch: "x64" });
    await expect(runtime.executionProfile(CANONICAL_CPU_MODEL)).resolves.toEqual(expect.objectContaining({
      modelDigest: CANONICAL_CPU_MODEL_DIGEST,
      tokenizerDigest: CANONICAL_CPU_MODEL_DIGEST,
      numericBackend: CANONICAL_CPU_NUMERIC_BACKEND,
    }));
    await expect(runtime.executionProfile("other:model")).resolves.toBeUndefined();
  });

  test("forces CPU-only single-threaded deterministic inference", async () => {
    const ollama = mockOllama();
    const runtime = new CanonicalCpuChallengeRuntime({ fetch: ollama.fetch, arch: "x64" });
    await expect(runtime.run(request)).resolves.toEqual({
      text: "canonical answer",
      thinking: "reasoning",
      promptTokens: 3,
      outputTokens: 7,
      backend: "canonical-cpu",
      model: CANONICAL_CPU_MODEL,
    });
    expect(ollama.chatBodies).toHaveLength(1);
    expect(ollama.chatBodies[0]).toEqual(expect.objectContaining({
      model: CANONICAL_CPU_MODEL,
      stream: false,
      options: {
        num_predict: 1024,
        temperature: 0,
        seed: 0,
        num_gpu: 0,
        num_thread: 1,
      },
    }));
  });

  test("plugs into replay verification with the frozen profile", async () => {
    const ollama = mockOllama();
    const runtime = new CanonicalCpuChallengeRuntime({ fetch: ollama.fetch, arch: "x64" });
    const claim = makeClaim({
      ...request,
      executionProfile: {
        protocol: "jgc-exact-replay-v1",
        runtime: "ollama",
        runtimeVersion: "0.34.0",
        modelDigest: CANONICAL_CPU_MODEL_DIGEST,
        tokenizerDigest: CANONICAL_CPU_MODEL_DIGEST,
        quantization: "Q4_K_M",
        numericBackend: CANONICAL_CPU_NUMERIC_BACKEND,
      },
    }, "canonical answer");

    await expect(verifyReplay(claim, runtime)).resolves.toEqual(expect.objectContaining({
      compatible: true,
      verified: true,
    }));
  });

  test.each([
    [{ ...request, model: "gemma4:e4b" }, /requires model/],
    [{ ...request, maxTokens: 512 }, /maxTokens/],
    [{ ...request, temperature: 0.1 }, /temperature/],
    [{ ...request, seed: 1 }, /seed/],
  ])("rejects a non-canonical task before inference", async (candidate, error) => {
    const ollama = mockOllama();
    const runtime = new CanonicalCpuChallengeRuntime({ fetch: ollama.fetch, arch: "x64" });
    await expect(runtime.run(candidate)).rejects.toThrow(error);
    expect(ollama.fetch).not.toHaveBeenCalled();
  });

  test.each([
    [{ digest: "0".repeat(64) }, "digest"],
    [{ version: "0.35.0" }, "runtime"],
    [{ quantization: "Q8_0" }, "quantization"],
  ])("abstains and fails closed for a mismatched %s", async (overrides, _label) => {
    const ollama = mockOllama(overrides);
    const runtime = new CanonicalCpuChallengeRuntime({ fetch: ollama.fetch, arch: "x64" });
    await expect(runtime.executionProfile(CANONICAL_CPU_MODEL)).resolves.toBeUndefined();
    await expect(runtime.run(request)).rejects.toThrow(/frozen execution profile/);
  });

  test("refuses non-x64 hosts and non-loopback endpoints", async () => {
    const ollama = mockOllama();
    const arm = new CanonicalCpuChallengeRuntime({ fetch: ollama.fetch, arch: "arm64" });
    await expect(arm.executionProfile(CANONICAL_CPU_MODEL)).resolves.toBeUndefined();
    await expect(arm.run(request)).rejects.toThrow(/requires x64/);
    expect(() => new CanonicalCpuChallengeRuntime({ endpoint: "https://example.com", fetch: ollama.fetch })).toThrow(/loopback/);
  });

  test("rejects incomplete or malformed inference results", async () => {
    const ollama = mockOllama({ chat: { model: CANONICAL_CPU_MODEL, message: { content: "answer" }, done: false } });
    const runtime = new CanonicalCpuChallengeRuntime({ fetch: ollama.fetch, arch: "x64" });
    await expect(runtime.run(request)).rejects.toThrow(/incomplete/);
  });
});
