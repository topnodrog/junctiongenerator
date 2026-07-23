---
name: project-vision
description: The big-picture goal of JunctionGenerator and how JGC/JGT/junctioning fit
metadata: 
  node_type: memory
  type: project
  originSessionId: 18c714bb-bc71-4e56-913b-8b161e98ff26
---

**JunctionGenerator** is a useful-compute project. End goal: AI agents run JunctionGenerator, powered by the compute the project itself generates, plus a Gemma model running across the user's phone + this computer.

- **JGC** (Junction Generator Coin) — the coin, minted locally against
  useful-compute claims verified through the post-quantum hash-based proof
  path. The current node uses ML-DSA identities/signatures and
  consensus-committed historical audit evidence. The old `jgc_verifier`
  Groth16 crate is legacy reference code, not live consensus. See
  [[project-layout]] and [[project-jgc]].
- **JGT** — a separate promo ERC-20 token on Base, meant for financial backing of the project (NOT the coin). Website clarifies JGC-vs-JGT.
- **junctioning** — Layer-1 context-compression + LOCAL inference on the nodes (Gemma via Ollama/llama.cpp). This is the efficiency layer that makes useful-compute viable on weak hardware. See [[junctioning-milestone]].
- Website: **junctiongenerator.net** (Next.js app in this repo; newsletter signup wired to `/api/subscribe`).

The project becomes permissionless only after the verification model,
validator identity/bonds, cross-machine replay, and public P2P protections are
trusted; until then it stays local/private. The load-bearing path is the
post-quantum consensus verifier plus consensus-committed audit evidence—not
the legacy Rust Groth16 crate.

**Founder's motivation (stated 2026-06-17):** the user is building JunctionGenerator to fight crypto scamming — they've been burned (leaked deployer key, compromised JGT, suspicion of inflated/scam fees) and want a verify-don't-trust system. Frame work around protecting the user from scams (e.g., flag drainer sites / wrong-network fee quotes) and toward provable integrity, not hype.
