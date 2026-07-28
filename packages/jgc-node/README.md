# JGC Node

JGC is the Junction Generator proof-of-useful-compute Layer 1. This package
contains its consensus engine, post-quantum wallet, miner, peer networking, and
local testnet tools.

## Requirements

- Node.js 20 or 22
- npm

## Verify the node

```text
npm install
npm run typecheck
npm test
npm run build
```

## Run a safe testnet node

```text
npm run build
npm run testnet
```

The default preset:

- uses simulation-only compute receipts while still enforcing ML-DSA
  contribution signatures and all other consensus checks;
- stores chain data under `./data/testnet`;
- listens for peers at `ws://127.0.0.1:19444`;
- exposes read-only status at `http://127.0.0.1:7777/status`;
- starts with no seed peers, so it is safe for local testing.
- identifies itself as `jgc-testnet-v3` and rejects peers with a different
  genesis hash, consensus version, or proof mode before accepting chain data.

Simulation receipts exercise networking and consensus plumbing but do not prove
that useful computation occurred. Strict production verification rejects them.

Connect two machines or processes by giving the second node the first node as a
seed:

```text
npm run testnet -- --port 19445 --status-port 7778 --datadir ./data/testnet-2 --seed ws://127.0.0.1:19444
```

Repeat `--seed` to configure more than one bootstrap peer.

Run exactly one designated producer for a small testnet:

```text
npm run testnet:producer -- --block-interval 30
```

The producer waits for enough signed compute contributions, constructs its
template from the node's live chain state, submits it through full validation,
and resumes from persisted state after restart. Other nodes should omit
`--produce` and operate as validators/back-checkers.

## Testnet wallet and faucet

Wallet chain commands default to testnet. Pass `--network mainnet` only when
deliberately reading mainnet-format data. The testnet genesis contains an
immediately spendable, valueless faucet allocation whose deterministic key is
public by design:

```text
npm run wallet -- faucet <1QGC-address> 100 --datadir ./data/testnet --broadcast ws://127.0.0.1:19444
```

Never reuse the testnet faucet key or any testnet wallet on a valuable network.

## Containerized two-node testnet

```text
docker compose -f compose.testnet.yml up --build
```

This starts one designated producer and one separate back-checker with distinct
persistent volumes. The producer still waits for signed compute receipts; the
container does not fabricate mining work.

To exercise the complete container path in CI or local development, add the
smoke-only override:

```text
docker compose -f compose.testnet.yml -f compose.smoke.yml up -d --build
npm run test:compose
docker compose -f compose.testnet.yml -f compose.smoke.yml down -v
```

The override starts a guarded, testnet-only contributor that submits signed
simulation receipts for one block. It requires `JGC_ENABLE_SMOKE_CONTRIBUTOR=1`,
exits after the target height, and is not evidence of useful computation. Never
include `compose.smoke.yml` in a valuable or public network deployment.

## Network exposure

Inbound P2P stays on loopback unless `--host 0.0.0.0` is explicitly supplied.
Do not expose the P2P port to the public internet yet. Peer traffic uses a
bounded, versioned binary envelope with network identity and SHA3-256 checksums.
The node now also enforces per-host inbound caps, per-peer message budgets,
misbehavior scores, and temporary host bans. A real-network adversarial soak
test remains a public-testnet gate.

## Bonded audit validators

Validator membership can now be derived from consensus-owned UTXOs. A
`JGCBOND` output wraps the validator identity and its ordinary post-quantum
owner script. Its value is bonded stake; spending the output unbonds it.
Snapshots aggregate all unspent bond outputs at an exact chain height and are
stable across restart and reorg because the UTXO set is the source of truth.

When a beacon-height snapshot contains bonds, block validation independently
reconstructs the roster and deterministic audit committee instead of trusting
the committee carried by a verdict. Existing bond-free development
chains remain supported as a transition rule. A future network-version
activation must make a non-empty bonded roster mandatory before rewards or
slashing are enabled.

Keep the status service on its default loopback address. If remote monitoring
is needed, place it behind an authenticated tunnel instead of changing
`--status-host`.

## Useful options

```text
--host <address>         P2P bind address (default 127.0.0.1)
--port <port>            P2P port (default 19444)
--status-host <address>  status bind address (default 127.0.0.1)
--status-port <port>     status port (default 7777)
--datadir <path>         persistent chain directory (default ./data/testnet)
--advertise <ws-url>     dialable URL announced to peers
--seed <ws-url>          bootstrap peer; may be repeated
--produce                enable the designated producer role on this node
--block-interval <sec>   production attempt interval (default 30)
```

Consensus V3 corrected the genesis timestamp and body commitments. Delete or
archive any older local `data/testnet` directory before first use; V2 and early
V3 development data are intentionally incompatible with this testnet identity.

This is an early testnet node, not mainnet software.

Architecture references:

- [`docs/CONSENSUS-V3.md`](docs/CONSENSUS-V3.md) — portable encodings and V3 invariants;
- [`docs/BACK-CHECKER-ARCHITECTURE.md`](docs/BACK-CHECKER-ARCHITECTURE.md) — heterogeneous verifier roles and proof authority;
- [`docs/AUDIT-PROTOCOL.md`](docs/AUDIT-PROTOCOL.md) — consensus-committed historical audits;
- [`docs/QUANTUM-READY.md`](docs/QUANTUM-READY.md) — current post-quantum boundaries and open proof-system work.
