---
name: junctioning-milestone
description: "What \"junctioning\" is (local Layer-1 compression+inference) and why headroom was removed 2026-06-18"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c068aa4-5366-42b6-b8f5-01e71bf2c4a0
---

**Junctioning** is the project's Layer-1: context compression + **LOCAL** LLM inference on the nodes (Gemma via Ollama/llama.cpp). Data shrinks (compression) and is pushed through the node — compression throughput is an economic parameter of the network. It is the efficiency layer that makes useful-compute viable on weak/mobile hardware. The working git branch `junctioning` is named after this concept. See [[project-jg-vision]].

**headroom — REMOVED 2026-06-18 (wrong layer).** headroom wrapped the Anthropic *cloud* SDK (`headroom-ai`) to meter Claude API calls. That is architecturally misaligned with the node: PoUC rewards LOCAL, provable compute, and an API call produces no local FLOPs to measure or prove — you can't mint JGC for paying Anthropic to think. The 2026-06-16 "junctioning test" (node compute → headroom → Anthropic API) was only a **wiring proof-of-concept** that the plumbing connected end to end; it was never the real architecture. With the memory scattered across folders (see [[session-folder-confusion]]) it had looked load-bearing — it wasn't. `packages/headroom` was moved to `scripts/2BDeleted/headroom` (gitignored staging, per the no-delete rule) on branch `junctioning`. Nothing imported it. The project's own earlier design had already flagged headroom-ai as a "stepping-stone, not the end product."

**The real Layer-1 wiring — SEAM BUILT 2026-06-18** (`packages/jgc-node/src/broker/junctioning.ts`, commit `5af0c99` on `junctioning`): a backend-agnostic `InferenceBackend` interface with `FakeInferenceBackend` (tests/offline) + `OllamaInferenceBackend` (live), a `runJunctioning()` executor (returns output + a token-proxy `tflopsSeconds` estimate — placeholder until circuit-bound), and an optional `JGClusterExecutor` hook on the ComputeBroker (fired when a JG-cluster task is assigned; unset by default so the broker stays pure). Historical milestone tests in `tests/junctioning.test.ts` (142/142 green). End-to-end proof: `npm run junctioning-smoke` (broker → junctioning → Ollama → Gemma).

**LIVE 2026-06-18** (commit `5fbd55b`): the smoke test ran end-to-end — broker → junctioning → Ollama → local Gemma — and produced a real answer + measured compute. This is the architecturally-correct version of the original cloud-headroom test, now with LOCAL inference. The user's installed model is **`gemma4:e2b`** (Gemma 4, ~5.1B params, 6.67 GB) — a **reasoning model**: Ollama's `/api/generate` returned empty (no surfaced output), so the backend uses **`/api/chat`**, which applies the chat template and returns `message.thinking` (reasoning) separately from `message.content` (answer). Reasoning tokens are counted as compute. Default `maxTokens` is 1024 so the model can think AND answer (a small cap truncates it mid-thought → the backend throws a clear error). Inference is CPU-bound (Intel Iris Xe is not GPU-accelerated by Ollama; i5-1335U, ~35 s/run incl. cold load).

**Environment notes:** Ollama server runs on `127.0.0.1:11434`; the `ollama` CLI may not be on a given shell's PATH until restart, but the HTTP API works regardless. Run live: `cd packages/jgc-node; npm run build; $env:JUNCTIONING_MODEL="gemma4:e2b"; npm run junctioning-smoke`.

**Honest compute measurement — BUILT 2026-06-18** (commit `fc6f440`): `OllamaInferenceBackend` now calls `/api/show` to read `general.parameter_count` (e.g. 5,123,179,235 for gemma4:e2b) and computes `flopsPerToken = 2 × params`. Corrected a silent ~2× error (was 1.997 TFLOP-s, now 3.935 TFLOP-s for gemma4:e2b). `InferenceBackend` gains an optional `flopsPerToken(model)` capability; `runJunctioning` resolves: explicit override → backend measured → fallback constant. TRUST CAVEAT in code: a node self-reporting its param count is not trust-hardened — the registered-model→FLOPs/token mapping should be consensus-published in the verification model (L5).

**Verification spine prototype — BUILT 2026-06-18** (commits `e78cac4`,
`95e2ed8`, `eaa0e40`): replay, sampling, a prototype stake/slashing ledger,
and multi-challenger quorum. See [[project-jg-vision]] for the full breakdown.
Files: `broker/verification.ts`, `broker/challenge.ts`, `broker/quorum.ts`.
Historical milestone: 183/183 tests were green at that point. The slashing
ledger was never connected to consensus funds.

**Consensus audit + post-quantum milestone — BUILT 2026-07-23** (commit
`ad9b0a7`): 10-block historical-audit windows, a delayed block-hash beacon,
three-validator committees, ML-DSA-signed votes, persistent/reorg-safe audit
state, and full evidence commitment in consensus-v2 `auditRoot`. Mining, binary
storage, peer sync, restart reconstruction, and adversarial rejection paths are
covered. Current validation baseline: 24 suites / 244 tests and a passing
31-block two-node sync demo. Automatic rewards/slashing remain off until the
bonded validator roster and stake snapshot are consensus-owned.

**Run live:** `cd packages/jgc-node; npm run build; $env:JUNCTIONING_MODEL="gemma4:e2b"; npm run junctioning-smoke` (full broker→inference path); `npm run junctioning-verify-smoke` (replay verification proof).

**STILL a placeholder:** `tflopsSeconds` is a token proxy — real measurement must come from the proving circuit binding the computation into a `ComputeProof` the ZK verifier checks (the deep PoUC/L5 work). Backend-agnostic by design: llama.cpp / phone-side Gemma 3n drop in behind the same `InferenceBackend` interface.

**How to apply:** "junctioning" = local compression + inference, the Layer-1 of the node network. Do NOT reintroduce a cloud-API wrapper as a node component. Claude API usage (like dev sessions) is dev/ops tooling, a separate concern from the node's useful-compute.
