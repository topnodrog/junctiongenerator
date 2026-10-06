/**
 * Fail-closed reference runtime for exact-replay challenges on JGTC V1.
 *
 * This backend deliberately supports one model artifact and one Ollama build.
 * It requests CPU-only, single-threaded inference and rechecks live metadata
 * before every replay. A mismatch causes abstention through executionProfile()
 * or an exception from run(); it must never be converted into a fraud vote.
 */
import type {
  ExecutionProfile,
  InferenceBackend,
  InferenceRequest,
  InferenceResult,
} from "./junctioning.js";

export const CANONICAL_CPU_MODEL = "gemma4:e2b";
export const CANONICAL_CPU_MODEL_DIGEST = "7fbdbf8f5e45a75bb122155ed546e765b4d9c53a1285f62fd9f506baa1c5a47e";
export const CANONICAL_CPU_RUNTIME_VERSION = "0.34.0";
export const CANONICAL_CPU_QUANTIZATION = "Q4_K_M";
export const CANONICAL_CPU_NUMERIC_BACKEND = "cpu-x64-single-thread-v1";
export const CANONICAL_CPU_MAX_TOKENS = 1024;
export const CANONICAL_CPU_MAX_PROMPT_BYTES = 64 * 1024;

export const CANONICAL_CPU_PROFILE: Readonly<ExecutionProfile> = Object.freeze({
  protocol: "jgc-exact-replay-v1",
  runtime: "ollama",
  runtimeVersion: CANONICAL_CPU_RUNTIME_VERSION,
  modelDigest: CANONICAL_CPU_MODEL_DIGEST,
  tokenizerDigest: CANONICAL_CPU_MODEL_DIGEST,
  quantization: CANONICAL_CPU_QUANTIZATION,
  numericBackend: CANONICAL_CPU_NUMERIC_BACKEND,
});

interface TagsResponse {
  models?: Array<{ name?: string; model?: string; digest?: string }>;
}

interface VersionResponse { version?: string }

interface ShowResponse {
  details?: { parameter_size?: string; quantization_level?: string };
}

interface ChatResponse {
  model?: string;
  message?: { content?: string; thinking?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  done?: boolean;
  done_reason?: string;
}

type Fetch = typeof fetch;

export interface CanonicalCpuChallengeRuntimeOptions {
  endpoint?: string;
  fetch?: Fetch;
  arch?: string;
}

export class CanonicalCpuChallengeRuntime implements InferenceBackend {
  readonly name = "canonical-cpu";
  private readonly endpoint: string;
  private readonly fetchImpl: Fetch;
  private readonly arch: string;

  constructor(options: CanonicalCpuChallengeRuntimeOptions = {}) {
    this.endpoint = normalizeLoopbackEndpoint(options.endpoint ?? process.env.OLLAMA_ENDPOINT ?? "http://127.0.0.1:11434");
    this.fetchImpl = options.fetch ?? fetch;
    this.arch = options.arch ?? process.arch;
  }

  async executionProfile(model: string): Promise<ExecutionProfile | undefined> {
    if (model !== CANONICAL_CPU_MODEL || this.arch !== "x64") return undefined;
    return await this.matchesFrozenInstallation() ? { ...CANONICAL_CPU_PROFILE } : undefined;
  }

  async run(req: InferenceRequest): Promise<InferenceResult> {
    validateCanonicalRequest(req);
    if (this.arch !== "x64") throw new Error(`canonical CPU replay requires x64, got ${this.arch}`);
    if (!await this.matchesFrozenInstallation()) {
      throw new Error("canonical CPU replay installation does not match the frozen execution profile");
    }

    const res = await this.fetchImpl(`${this.endpoint}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: CANONICAL_CPU_MODEL,
        messages: [{ role: "user", content: req.prompt }],
        stream: false,
        options: {
          num_predict: CANONICAL_CPU_MAX_TOKENS,
          temperature: 0,
          seed: 0,
          num_gpu: 0,
          num_thread: 1,
        },
      }),
    });
    if (!res.ok) throw new Error(`canonical Ollama replay failed: ${res.status} ${res.statusText}`);

    const data = await parseJson<ChatResponse>(res, "chat");
    if (data.done !== true) throw new Error("canonical Ollama replay returned an incomplete response");
    if (data.model !== undefined && data.model !== CANONICAL_CPU_MODEL) {
      throw new Error("canonical Ollama replay returned the wrong model");
    }
    const text = data.message?.content;
    if (typeof text !== "string" || text.length === 0) {
      throw new Error(data.done_reason === "length"
        ? "canonical Ollama replay exhausted its token budget without an answer"
        : "canonical Ollama replay returned no answer");
    }
    if (!isTokenCount(data.prompt_eval_count) || !isTokenCount(data.eval_count)) {
      throw new Error("canonical Ollama replay returned invalid token accounting");
    }

    return {
      text,
      thinking: data.message?.thinking,
      promptTokens: data.prompt_eval_count,
      outputTokens: data.eval_count,
      backend: this.name,
      model: CANONICAL_CPU_MODEL,
    };
  }

  private async matchesFrozenInstallation(): Promise<boolean> {
    try {
      const [tagsRes, versionRes, showRes] = await Promise.all([
        this.fetchImpl(`${this.endpoint}/api/tags`),
        this.fetchImpl(`${this.endpoint}/api/version`),
        this.fetchImpl(`${this.endpoint}/api/show`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: CANONICAL_CPU_MODEL }),
        }),
      ]);
      if (!tagsRes.ok || !versionRes.ok || !showRes.ok) return false;
      const tags = await parseJson<TagsResponse>(tagsRes, "tags");
      const version = await parseJson<VersionResponse>(versionRes, "version");
      const show = await parseJson<ShowResponse>(showRes, "show");
      const installed = tags.models?.find((entry) => entry.name === CANONICAL_CPU_MODEL || entry.model === CANONICAL_CPU_MODEL);
      return installed?.digest?.toLowerCase() === CANONICAL_CPU_MODEL_DIGEST
        && version.version === CANONICAL_CPU_RUNTIME_VERSION
        && show.details?.parameter_size === "5.1B"
        && show.details.quantization_level === CANONICAL_CPU_QUANTIZATION;
    } catch {
      return false;
    }
  }
}

function validateCanonicalRequest(req: InferenceRequest): void {
  if (req.model !== CANONICAL_CPU_MODEL) throw new Error(`canonical CPU replay requires model ${CANONICAL_CPU_MODEL}`);
  if (req.maxTokens !== CANONICAL_CPU_MAX_TOKENS) throw new Error(`canonical CPU replay requires maxTokens=${CANONICAL_CPU_MAX_TOKENS}`);
  if ((req.temperature ?? 0) !== 0) throw new Error("canonical CPU replay requires temperature=0");
  if ((req.seed ?? 0) !== 0) throw new Error("canonical CPU replay requires seed=0");
  if (Buffer.byteLength(req.prompt, "utf8") > CANONICAL_CPU_MAX_PROMPT_BYTES) {
    throw new Error(`canonical CPU replay prompt exceeds ${CANONICAL_CPU_MAX_PROMPT_BYTES} bytes`);
  }
}

function normalizeLoopbackEndpoint(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" || (url.hostname !== "127.0.0.1" && url.hostname !== "[::1]")) {
    throw new Error("canonical CPU replay requires a literal loopback HTTP Ollama endpoint");
  }
  if (url.username || url.password || (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    throw new Error("canonical CPU replay endpoint must contain only scheme, loopback host and port");
  }
  return url.origin;
}

async function parseJson<T>(response: Response, label: string): Promise<T> {
  try { return await response.json() as T; }
  catch { throw new Error(`canonical Ollama ${label} response was not valid JSON`); }
}

function isTokenCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
