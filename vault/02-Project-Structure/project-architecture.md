---
name: project-architecture
description: "JunctionGenerator has THREE distinct, separate components — never conflate them"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c068aa4-5366-42b6-b8f5-01e71bf2c4a0
---

Junction Generator has three DISTINCT, SEPARATE components. They were once 3 folders; merged into one monorepo to avoid future merge pain — at the cost of cross-contamination risk. Do NOT conflate them.

1. **JGC — Junction Generator Coin** (CURRENT FOCUS). An L1 coin with PoUC
(Proof of Useful Computation) consensus. Instead of one miner winning every
~10 min (Bitcoin), each participant's compute contribution is tallied through
the day (144-block epoch) and reward dispersed PRO-RATA by TFLOPS provided.
Consensus V3 commits post-quantum signed historical-audit evidence through
`auditRoot`; this is hardened local/private testnet code, not a deployed public
chain. Positioned as a **store of value**. Codebase: `packages/jgc-node`. See
[[project-jgc]].

2. **JGT — Junction Generator Token**. COMPLETELY SEPARATE from JGC. ERC-20 on Base network. Purpose: promote and support the project (marketing/incentives) — NOT a store of value. Deployer key was compromised (see [[leaked-secrets-risk]]); rescue complete (see [[compromised-wallet-7702-sweeper]]). Contracts: `contracts/`. NEVER use JGT's ERC-20 design (18 decimals, etc.) to inform JGC design — unrelated.

3. **junctiongenerator.net** — the project website (Next.js app-router) at `src/app/`. See [[project-website]].

**How to apply:** when the user says "the project," resolve WHICH component before acting. JGC work = `packages/jgc-node`. Keep JGT and JGC design decisions fully independent.
