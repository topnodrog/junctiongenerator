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
  /** Sampling temperature. 0 = greedy/deterministic (the PoUC default). */
  temperature?: number;
  /** RNG seed. Pins sampling when temperature > 0; harmless at 0. */
  seed?:        number;
}

/** Raw inference output plus the token accounting the backend reports. */
export interface InferenceResult {
  text:         string;
  /** Reasoning trace for thinking models (Gemma 4 etc.); undefined otherwise.
   *  These tokens ARE compute — they're included in outputTokens. */
  thinking?:    string;
  promptTokens: number;
  outputTokens: number;   // all generated tokens (reasoning + answer)
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
  /**
   * Optional honest compute basis: FLOPs per token processed for `model`,
   * ≈ 2 × parameter count (one multiply-add per parameter per token in a
   * transformer forward pass). Returns undefined if undeterminable.
   *
   * TRUST CAVEAT: a value the node derives from its own model is NOT yet
   * trust-hardened — a cheater could claim a bigger model. In the verification
   * model (L5) this registered-model → FLOPs/token mapping should be
   * consensus-published, not self-reported. See [[project-jg-vision]].
   */
  flopsPerToken?(model: string): Promise<number | undefined>;
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

/** Subset of Ollama's POST /api/show response we rely on. */
interface OllamaShowResponse {
  details?:    { parameter_size?: string };       // human, e.g. "5.1B"
  model_info?: Record<string, unknown>;           // has "general.parameter_count"
}

/** Subset of Ollama's POST /api/chat response we rely on. */
interface OllamaChatResponse {
  message?: {
    content?:  string;
    thinking?: string;   // reasoning trace on thinking models (Gemma 4 etc.)
  };
  prompt_eval_count?: number;   // tokens in the prompt
  eval_count?:        number;   // tokens generated (reasoning + answer)
  done_reason?:       string;   // "stop" | "length" | ...
}

/**
 * Live backend talking to a local Ollama server (default 127.0.0.1:11434).
 * Override the endpoint with OLLAMA_ENDPOINT.
 *
 * Uses non-streaming /api/chat (NOT /api/generate): Gemma models are
 * instruction-tuned and need the chat template applied, and chat returns
 * `message.thinking` separately from `message.content` for reasoning models.
 * prompt_eval_count / eval_count give exact token accounting.
 */
export class OllamaInferenceBackend implements InferenceBackend {
  readonly name = "ollama";
  private readonly endpoint: string;
  /** model → FLOPs/token, cached (one /api/show per model). */
  private readonly flopsCache = new Map<string, number>();

  constructor(endpoint?: string) {
    this.endpoint = endpoint ?? process.env.OLLAMA_ENDPOINT ?? "http://127.0.0.1:11434";
  }

  /** Honest FLOPs/token ≈ 2 × parameter count, read from /api/show (cached). */
  async flopsPerToken(model: string): Promise<number | undefined> {
    const cached = this.flopsCache.get(model);
    if (cached !== undefined) return cached;

    const res = await fetch(`${this.endpoint}/api/show`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ model }),
    });
    if (!res.ok) return undefined;

    const params = extractParamCount((await res.json()) as OllamaShowResponse);
    if (params === undefined) return undefined;

    const fpt = 2 * params;
    this.flopsCache.set(model, fpt);
    return fpt;
  }

  async run(req: InferenceRequest): Promise<InferenceResult> {
    // Pass only defined sampling controls through to Ollama's options.
    const options: Record<string, number> = { num_predict: req.maxTokens };
    if (req.temperature !== undefined) options.temperature = req.temperature;
    if (req.seed !== undefined)        options.seed        = req.seed;

    const res = await fetch(`${this.endpoint}/api/chat`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model:    req.model,
        messages: [{ role: "user", content: req.prompt }],
        stream:   false,
        options,
      }),
    });
    if (!res.ok) {
      throw new Error(`Ollama ${res.status} ${res.statusText}: ${await res.text()}`);
    }
    const data = (await res.json()) as OllamaChatResponse;
    const content = data.message?.content ?? "";

    // A thinking model can burn the whole token budget reasoning and never reach
    // the answer (done_reason "length" + empty content). Surface that clearly
    // rather than returning a silently-empty result.
    if (content.length === 0 && data.done_reason === "length") {
      throw new Error(
        `Ollama hit the token cap (num_predict=${req.maxTokens}) while still reasoning — ` +
        `no answer produced. Raise maxTokens for this reasoning model.`
      );
    }

    return {
      text:         content,
      thinking:     data.message?.thinking,
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
  /** Reasoning trace for thinking models; undefined otherwise. */
  thinking?:     string;
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
  /** Output token cap. Default 1024 — enough headroom for a reasoning model to
   *  think AND answer (a 512-class cap truncates thinking models mid-thought). */
  maxTokens?:     number;
  /** FLOPs per token processed (≈ 2 × model param count). Default ~2.6B-param. */
  flopsPerToken?: number;
  /** Sampling temperature. Default 0 (deterministic — required for replay). */
  temperature?:   number;
  /** RNG seed. Default DEFAULT_SEED. */
  seed?:          number;
}

/** Fallback only, when a backend can't report its param count (≈ 2 × 2.6e9,
 *  gemma2:2b-class). Live backends override this via {@link InferenceBackend.flopsPerToken}. */
export const DEFAULT_FLOPS_PER_TOKEN = 5.2e9;

/**
 * Fixed default seed. Combined with temperature 0 (greedy decoding) this makes a
 * task's output reproducible ON THE SAME backend — the precondition for any
 * replay-based verification (L5). Note: bit-exact reproducibility ACROSS
 * different machines is a harder, separate problem (FP reduction order varies
 * with thread count / build), to be addressed when the verification model lands.
 */
export const DEFAULT_SEED = 0;

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
  const model       = opts.model ?? process.env.JUNCTIONING_MODEL ?? "gemma2:2b";
  const maxTokens   = opts.maxTokens ?? 1024;
  const temperature = opts.temperature ?? 0;
  const seed        = opts.seed ?? DEFAULT_SEED;
  const prompt      = task.prompt ?? task.description;

  // Honest compute basis: explicit override → backend's measured value
  // (2 × param count) → documented fallback constant.
  let flopsPerToken = opts.flopsPerToken;
  if (flopsPerToken === undefined && backend.flopsPerToken) {
    flopsPerToken = await backend.flopsPerToken(model);
  }
  flopsPerToken = flopsPerToken ?? DEFAULT_FLOPS_PER_TOKEN;

  const startedAt = Date.now();
  const inf       = await backend.run({ prompt, model, maxTokens, temperature, seed });
  const elapsedMs = Date.now() - startedAt;

  const totalTokens   = inf.promptTokens + inf.outputTokens;
  const tflopsSeconds = (totalTokens * flopsPerToken) / 1e12;

  return {
    taskId:        task.taskId,
    text:          inf.text,
    thinking:      inf.thinking,
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

/** Pull an exact parameter count from an /api/show payload, else parse the
 *  human "parameter_size" (e.g. "5.1B"). Returns undefined if neither works. */
function extractParamCount(show: OllamaShowResponse): number | undefined {
  const exact = show.model_info?.["general.parameter_count"];
  if (typeof exact === "number" && exact > 0) return exact;
  return show.details?.parameter_size ? parseParamSize(show.details.parameter_size) : undefined;
}

/** Parse "5.1B" / "270M" / "7000000000" → a parameter count. */
function parseParamSize(s: string): number | undefined {
  const m = /^([\d.]+)\s*([BMK])?$/i.exec(s.trim());
  if (!m) return undefined;
  const n = parseFloat(m[1]!);
  if (!Number.isFinite(n)) return undefined;
  const suffix = (m[2] ?? "").toUpperCase();
  const mult   = suffix === "B" ? 1e9 : suffix === "M" ? 1e6 : suffix === "K" ? 1e3 : 1;
  return n * mult;
}
