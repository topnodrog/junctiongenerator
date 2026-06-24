---
name: project-vision
description: The big-picture goal of JunctionGenerator and how JGC/JGT/junctioning fit
metadata: 
  node_type: memory
  type: project
  originSessionId: 18c714bb-bc71-4e56-913b-8b161e98ff26
---

**JunctionGenerator** is a useful-compute project. End goal: AI agents run JunctionGenerator, powered by the compute the project itself generates, plus a Gemma model running across the user's phone + this computer.

- **JGC** (Junction Generator Coin) — the coin, minted against verified useful-compute (TFLOPS) proofs checked by the `jgc_verifier` ZK-SNARK. See [[project-layout]].
- **JGT** — a separate promo ERC-20 token on Base, meant for financial backing of the project (NOT the coin). Website clarifies JGC-vs-JGT.
- **junctioning** — Layer-1 context-compression + LOCAL inference on the nodes (Gemma via Ollama/llama.cpp). This is the efficiency layer that makes useful-compute viable on weak hardware. See [[junctioning-milestone]].
- Website: **junctiongenerator.net** (Next.js app in this repo; newsletter signup wired to `/api/subscribe`).

The project becomes permissionless once the verification model is trusted; until then it stays private. This is why the Rust verifier ("certification") is the load-bearing piece the user is protective of.

**Founder's motivation (stated 2026-06-17):** the user is building JunctionGenerator to fight crypto scamming — they've been burned (leaked deployer key, compromised JGT, suspicion of inflated/scam fees) and want a verify-don't-trust system. Frame work around protecting the user from scams (e.g., flag drainer sites / wrong-network fee quotes) and toward provable integrity, not hype.
