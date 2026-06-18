/**
 * @file src/broker/junctioning.ts
 * @description Junctioning — the Layer-1 LOCAL-inference executor for the node.
 *
 * WHAT THIS IS
 * ────────────
 * "Junctioning" is the project's Layer 1: context compression + LOCAL LLM
 * inference performed ON the node (Gemma via Ollama/llama.cpp; phone-side
 * Gemma 3n later). It is the useful-work that Proof-of-Useful-Compute rewards —
 * real FLOPs the node spends, which can be measured and (eventually) bound into
 * a ComputeProof the ZK verifier checks.
 *
 * WHY A SEAM (and not a hard dependency on one runtime)
 * ─────────────────────────────────────────────────────
 * The network must run the same logical work across very different backends:
 * Ollama on a dev box today, llama.cpp on a headless miner, Gemma 3n on a phone
 * tomorrow. So inference sits behind a narrow `InferenceBackend` interface. The
 * broker's JG-cluster lane (see compute-broker.ts) calls the executor; the
 * executor calls whatever backend is wired in. Swapping runtimes is a one-line
 * change, and tests run against a deterministic fake with no model installed.
 *
 * NOT headroom. headroom wrapped the Anthropic CLOUD SDK — an API call produces
 * no local FLOPs to prove, so it could never be the PoUC work layer. It was
 * removed 2026-06-18. This module is the real Layer 1.
 *
 * COMPUTE MEASUREMENT (honest placeholder)
 * ────────────────────────────────────────
 * tflopsSeconds here is a token-count proxy: forward-pass FLOPs for a
 * transformer are ≈ 2 × params × tokens, so we expose `flopsPerToken`
 * (= 2 × param_count for the model in use) and multiply by tokens processed.
 * This is a stand-in for real measurement — the authoritative number will come
 * from the proving circuit that binds the computation to a ComputeProof. Until
 * that exists, treat tflopsSeconds as an estimate, not a settled quantity.
 */

import type { JGClusterTask } from "./compute-broker.js";

// ─────────────────────────────────────────────────────────────────────────────
// Inference Backend Seam
// ─────────────────────────────────────────────────────────────────────────────

/** A single local-inference request. `model` is a backend-specific id. */
export interface InferenceRequest {
  prompt:    string;
  model:     string;   // e.g. "gemma2:2b" for Ollama
  maxTokens: number;
}

/** Raw inference output plus the token accounting the backend reports. */
export interface InferenceResult {
  text:         string;
  promptTokens: number;
  outputTokens: number;
  backend:      string;   // backend identifier, e.g. "ollama" | "fake"
  model:        string;
}

/**
 * The pluggable local-inference seam. Implementations: FakeInferenceBackend
 * (tests/offline), OllamaInferenceBackend (live), llama.cpp / Gemma 3n later.
 */
export interface InferenceBackend {
  readonly name: string;
  run(req: InferenceRequest): Promise<InferenceResult>;
}

/**
 * Deterministic, network-free backend. Produces stable token counts derived
 * from the input so tests and offline dev never depend on a running model.
 */
export class FakeInferenceBackend implements InferenceBackend {
  readonly name = "fake";

  async run(req: InferenceRequest): Promise<InferenceResult> {
    const promptTokens = approxTokens(req.prompt);
    const text         = `[fake:${req.model}] processed ${promptTokens} prompt token(s)`;
    const outputTokens = Math.min(req.maxTokens, approxTokens(text));
    return { text, promptTokens, outputTokens, backend: this.name, model: req.model };
  }
}

/** Subset of Ollama's POST /api/generate response we rely on. */
interface OllamaGenerateResponse {
  response?:          string;
  prompt_eval_count?: number;   // tokens in the prompt
  eval_count?:        number;   // tokens generated
}

/**
 * Live backend talking to a local Ollama server (default 127.0.0.1:11434).
 * Override the endpoint with OLLAMA_ENDPOINT. Uses non-streaming /api/generate;
 * Ollama returns prompt_eval_count / eval_count for exact token accounting.
 */
export class OllamaInferenceBackend implements InferenceBackend {
  readonly name = "ollama";
  private readonly endpoint: string;

  constructor(endpoint?: string) {
    this.endpoint = endpoint ?? process.env.OLLAMA_ENDPOINT ?? "http://127.0.0.1:11434";
  }

  async run(req: InferenceRequest): Promise<InferenceResult> {
    const res = await fetch(`${this.endpoint}/api/generate`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model:   req.model,
        prompt:  req.prompt,
        stream:  false,
        options: { num_predict: req.maxTokens },
      }),
    });
    if (!res.ok) {
      throw new Error(`Ollama ${res.status} ${res.statusText}: ${await res.text()}`);
    }
    const data = (await res.json()) as OllamaGenerateResponse;
    return {
      text:         data.response ?? "",
      promptTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
      backend:      this.name,
      model:        req.model,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Junctioning Executor
// ─────────────────────────────────────────────────────────────────────────────

/** Result of running one JG-cluster task through local inference. */
export interface JunctioningResult {
  taskId:        string;
  text:          string;
  promptTokens:  number;
  outputTokens:  number;
  elapsedMs:     number;
  /** Estimated useful-compute (token-count proxy — see file header). */
  tflopsSeconds: number;
  backend:       string;
  model:         string;
}

/** Options for {@link runJunctioning}. */
export interface JunctioningOptions {
  /** Backend model id. Default: JUNCTIONING_MODEL env, else "gemma2:2b". */
  model?:         string;
  /** Output token cap. Default 512 (small — these are mining tasks, not chats). */
  maxTokens?:     number;
  /** FLOPs per token processed (≈ 2 × model param count). Default ~2.6B-param. */
  flopsPerToken?: number;
}

/** Default ≈ 2 × 2.6e9 params (gemma2:2b-class). Override per model. */
export const DEFAULT_FLOPS_PER_TOKEN = 5.2e9;

/**
 * Run one JG-cluster task through a local-inference backend and return the
 * output plus a compute measurement. Backend-agnostic: pass a FakeInference
 * backend in tests, an Ollama backend in production.
 */
export async function runJunctioning(
  task:    JGClusterTask,
  backend: InferenceBackend,
  opts:    JunctioningOptions = {},
): Promise<JunctioningResult> {
  const model         = opts.model ?? process.env.JUNCTIONING_MODEL ?? "gemma2:2b";
  const maxTokens     = opts.maxTokens ?? 512;
  const flopsPerToken = opts.flopsPerToken ?? DEFAULT_FLOPS_PER_TOKEN;
  const prompt        = task.prompt ?? task.description;

  const startedAt = Date.now();
  const inf       = await backend.run({ prompt, model, maxTokens });
  const elapsedMs = Date.now() - startedAt;

  const totalTokens   = inf.promptTokens + inf.outputTokens;
  const tflopsSeconds = (totalTokens * flopsPerToken) / 1e12;

  return {
    taskId:        task.taskId,
    text:          inf.text,
    promptTokens:  inf.promptTokens,
    outputTokens:  inf.outputTokens,
    elapsedMs,
    tflopsSeconds,
    backend:       inf.backend,
    model:         inf.model,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cheap token approximation (~4 chars/token) for the fake backend only. Real
 * backends report exact counts; never use this for billing or proofs.
 */
function approxTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
