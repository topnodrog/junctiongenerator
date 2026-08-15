---
name: project-jgc
description: "Junction Generator Coin — early public JGTC pilot, post-quantum node, consensus-committed historical audits"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c068aa4-5366-42b6-b8f5-01e71bf2c4a0
---

JGC is a cryptocurrency with PoUC (Proof of Useful Computation) consensus. The
protocol and public testnet path are implemented; current work is collecting
multi-machine soak evidence and hardening verification for valuable use.

**Codebase:** `packages/jgc-node` (TypeScript consensus/network + Rust→WASM ZK verifier at `packages/jgc-node/rust/`). Branch: `add-jgc-node` (now merged into `junctioning`). Build: `npm run build` (tsc). Run from PowerShell — WSL bash throws fork errors.

**Reward model:** mints ONLY at epoch boundary (every 144 blocks). Era-0 pool = 50 JGC/block × 144 = 7,200 JGC per epoch. Pro-rata by TFLOPS. Coinbase matures after 100 blocks. Difficulty retargets every 2016 blocks. See [[jgc-reward-divisibility]] for decimal precision decisions.

**2026-06-15 testnet milestone:** created encrypted wallet (`primary`, address `1JGC1aac9abb4994e690c03ee24bf242d4bb019e5d0e`). Fixed settlement coinbase to pay spendable P2PKH. Added `npm run testnet-verify` (proves 7,200 JGC lands spendable) and `npm run testnet` (persistent 30s-block daemon, datadir `packages/jgc-node/testnet-data/`, restart-safe, retarget-safe). Check balance: `npm run wallet -- balance primary --keystore …\wallet.keystore.json --datadir …\testnet-data`.

**validateCoinbaseTx gap — FIXED 2026-06-18** (commit `c0c6992`): now verifies per-output script AND amount. Gap is closed.

**Junctioning Layer-1 — BUILT 2026-06-18:** local inference executor
(Ollama/Gemma, backend-agnostic), honest FLOP measurement from real parameter
count, deterministic replay, sampling, and multi-challenger quorum. The original
`StakeLedger`/slashing coordinator is a tested economic prototype, not a
consensus funds transition. See [[junctioning-milestone]] and
[[project-jg-vision]].

**Quantum-ready audit consensus — BUILT 2026-07-23** (commit `ad9b0a7`,
`junctioning`): consensus v2 adds a 192-byte block header with `auditRoot`.
Claims are grouped into 10-block windows; the block two heights after a window
is the unpredictable beacon; each selected historical contribution receives a
three-validator committee; ML-DSA-signed votes and the complete verdict are
committed to the next block. Full nodes independently validate signatures,
quorum math, claim/beacon anchors, deadlines, canonical ordering, and replay
protection during live acceptance, sync, restart, and reorg. The node also has
post-quantum wallet/signature paths, SHA3-256 checksummed binary P2P envelopes,
a safe loopback testnet preset, and persistent audit state. Validation:
24 suites / 244 tests plus a passing 31-block two-node sync demo.

**2026-07-31 readiness status:** Consensus V3, network identity checks,
designated production, container packaging, and versioned crash-safe storage
are implemented. The storage checkpoint passes 30 suites / 286 tests plus
type-check and build. The owner is creating a Google Cloud free account for the
first seed; quota, billing safeguards, region, static address, and persistent
disk must be verified before provisioning. A separate provider or independently
operated failure domain is still needed for the second seed.

**Current status (2026-08-15):** EARLY, VALUELESS PUBLIC JGTC PILOT. Google
Seed A and independent Fly.io Seed B run Node.js 22.23.2 over WSS. Their old
`jgc-testnet-v3` state was archived and both were reset onto the frozen,
zero-premine `jgtc-testnet-v1` genesis. This workstation joined as an ordinary
participant, and block 1 synchronized across all three nodes. The explorer
reports height, blocks, health, participation, pending issuance, settlements,
and balances from canonical state. It never creates or dispenses coins.

The first block recorded the seed anchor and workstation contributions at equal
weight. JGTC becomes a spendable output only at 144-block settlement; there is
no faucet or genesis allocation. The next work is to recruit independent
runners, observe the first settlement, and complete a multi-day soak with
restart, seed-loss, hostile-traffic, and recovery evidence. No JGC mainnet has
been deployed. The delayed beacon is
implemented; the remaining economic
gate is a consensus-owned bonded validator registry/stake snapshot. Until that
exists, verdicts are durable fraud evidence but cannot move funds, reward
validators, or slash claimants. Cross-machine inference determinism remains
the major verification research problem. Ordinary runners should use the
outbound-only preset; only hardened seed infrastructure should accept public
P2P traffic before multi-machine soak testing is complete.
For Rust build constraints see [[jgc-rust-build-env]].
