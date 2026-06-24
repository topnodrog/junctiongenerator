---
name: trusted-compute-research
description: "Survey of how real projects solve verifiable/trusted compute, and where JGC's deterministic-replay approach sits"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 9c068aa4-5366-42b6-b8f5-01e71bf2c4a0
---

Research done 2026-06-18 on the L5 trusted-compute problem ("how does a network verify a node actually did the compute it claims?"). Informs the JGC verification model — see [[project-jg-vision]] and [[junctioning-milestone]].

**The core finding — a pick-3-of-4 tradeoff.** No project solves all of: **cost** (cheap verification), **latency** (fast finality), **universality** (no trusted hardware), **certainty** (cryptographic vs merely economic). Every real system sacrifices one:

- **ZKML** (Lagrange/DeepProve): crypto-certain, instant verify, universal — but proof generation is 2–10× the cost of just running the model. Constant ~288-byte proofs; proved GPT-2; not yet cheaper than re-execution for general LLMs. Sacrifices **cost**.
- **TEE** (Phala 5yr prod, Secret Network): cheap + instant + deterministic via SGX/TDX/SEV attestation — but trusts Intel/AMD (backdoor = a bet, not a proof), needs special hardware, SGX group-sig can't distinguish which physical machine. Sacrifices **universality + full certainty**.
- **Deterministic replay** (Bacalhau/Filecoin): cheap, universal, no new crypto — but determinism is an architectural wall (FP rounding, syscalls, threads, RNG); still "verifiable in the future" after years. Sacrifices **latency** + struggles with determinism.
- **Interactive fraud proofs** (Optimism/Arbitrum, live, billions TVL): cheap-in-aggregate via bisection to a single VM step, crypto-certain — but weeks to finality, and 2025 research shows malicious proposers can game validator incentives. Sacrifices **latency**.
- **Economic slashing** (EigenAI 2026): incentives replace crypto — but still needs deterministic replay to detect deviation, so it inherits the determinism wall.

**Where JGC sits / why our approach is defensible.** Deterministic-replay corner = cost + universality + crypto-certainty, trading latency. The determinism wall that sinks Bacalhau is **sidestepped by architecture, not engineering**: we don't try to make arbitrary code deterministic — we wrap ONE inference runtime (Ollama/llama.cpp, temp 0 + seed) in a controlled environment. Tiny surface area vs. "deterministic Python in WASM."

**The honest open question (every project hits it):** *who bears verification cost, and how often does fraud actually occur?* It's EMPIRICAL, not cryptographic. If fraud is rare (<1% of tasks) amortized cost is survivable; if systemic (>30%) the network collapses under replay load. Production data (Filecoin/Phala/Optimism) suggests rational actors rarely cheat when slash > reward → low sampling rate `p` can work IF slash stake is high enough. This is exactly what the sampling+slashing layer must tune.

**Still-open for us specifically:** cross-machine determinism (FP reduction order across hardware) still underlies any replay verdict — the genuinely hard part, deferred. Collusion: if challengers are themselves nodes, need multiple independent challengers + challenger rewards.
