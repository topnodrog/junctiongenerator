---
name: project-jgc
description: "Junction Generator Coin — local/private PoUC blockchain, post-quantum node, consensus-committed historical audits"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c068aa4-5366-42b6-b8f5-01e71bf2c4a0
---

JGC is a cryptocurrency with PoUC (Proof of Useful Computation) consensus. The
protocol and local mining path are implemented; current work is hardening
verification and public-network preconditions.

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

**Next work:** benchmark a local model as an advisory deployment/operations
copilot, provision the Google Cloud seed, choose the second host, and then add
TLS/WSS, private monitoring, backups, and adversarial transport tests. The local
model cannot host a seed or replace durable infrastructure. See
[[local-model-operations-boundary]].

**Current status (2026-08-11):** EARLY, VALUELESS TESTNET. Google Seed A is
reachable over WSS and a fresh external validator/back-checker has joined it;
Fly.io Seed B, redundant operations, and the multi-machine soak remain
incomplete. No JGC mainnet has been deployed. The delayed beacon is
implemented; the remaining economic
gate is a consensus-owned bonded validator registry/stake snapshot. Until that
exists, verdicts are durable fraud evidence but cannot move funds, reward
validators, or slash claimants. Cross-machine inference determinism remains
the major verification research problem. Ordinary runners should use the
outbound-only preset; only hardened seed infrastructure should accept public
P2P traffic before multi-machine soak testing is complete.
For Rust build constraints see [[jgc-rust-build-env]].
