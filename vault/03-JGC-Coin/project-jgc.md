---
name: project-jgc
description: "Junction Generator Coin — PoUC blockchain; designed, mining, testnet milestone hit 2026-06-15"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c068aa4-5366-42b6-b8f5-01e71bf2c4a0
---

JGC is a cryptocurrency with PoUC (Proof of Useful Computation) consensus. User designed the protocol, has started mining, and is in the verification phase.

**Codebase:** `packages/jgc-node` (TypeScript consensus/network + Rust→WASM ZK verifier at `packages/jgc-node/rust/`). Branch: `add-jgc-node` (now merged into `junctioning`). Build: `npm run build` (tsc). Run from PowerShell — WSL bash throws fork errors.

**Reward model:** mints ONLY at epoch boundary (every 144 blocks). Era-0 pool = 50 JGC/block × 144 = 7,200 JGC per epoch. Pro-rata by TFLOPS. Coinbase matures after 100 blocks. Difficulty retargets every 2016 blocks. See [[jgc-reward-divisibility]] for decimal precision decisions.

**2026-06-15 testnet milestone:** created encrypted wallet (`primary`, address `1JGC1aac9abb4994e690c03ee24bf242d4bb019e5d0e`). Fixed settlement coinbase to pay spendable P2PKH. Added `npm run testnet-verify` (proves 7,200 JGC lands spendable) and `npm run testnet` (persistent 30s-block daemon, datadir `packages/jgc-node/testnet-data/`, restart-safe, retarget-safe). Check balance: `npm run wallet -- balance primary --keystore …\wallet.keystore.json --datadir …\testnet-data`.

**validateCoinbaseTx gap — FIXED 2026-06-18** (commit `c0c6992`): now verifies per-output script AND amount. Gap is closed.

**Junctioning Layer-1 — BUILT 2026-06-18** (branch `junctioning`, 13 commits, all pushed): local inference executor (Ollama/Gemma, backend-agnostic), honest FLOP measurement from real param count, and a four-layer verification model (replay verification → sampling+slashing → multi-challenger quorum). See [[junctioning-milestone]] and [[project-jg-vision]] for the full breakdown. 183/183 tests green.

**Status:** LOCAL-ONLY. No public networking/seeds/explorer yet. Verification model is built (replay fraud proof) but cross-machine determinism and beacon source are still open. Keep network private/permissioned until solved. For Rust build constraints see [[jgc-rust-build-env]].
