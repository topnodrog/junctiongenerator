# JGC Node

JGC is the Junction Generator proof-of-useful-compute Layer 1. This package
contains its consensus engine, post-quantum wallet, miner, peer networking, and
local testnet tools.

**Want to run a node?** Follow the step-by-step
[`docs/RUN-A-NODE.md`](docs/RUN-A-NODE.md) guide. The shortest path is:

```text
git clone https://github.com/topnodrog/junctiongenerator.git
cd junctiongenerator/packages/jgc-node
npm ci
npm run testnet:public
```

This starts a safe outbound-only validator/back-checker and connects it to the
live two-seed pilot. To add signed participation records and receive valueless
testnet coins, use `npm run testnet:participate`. Test coins have no cash value
and do not promise future compensation.

## Requirements

- Node.js 20.19–20.x or Node.js 22.x (Node 23+ is not supported)
- npm

## Verify the node

```text
npm ci
npm run typecheck
npm test
npm run build
```

## Node modes

Join the public pilot as an outbound-only validator/back-checker:

```text
npm run testnet:public
```

The public pilot has two reachable bootstrap peers: Google Seed A at
`wss://seed-a.junctiongenerator.net` and Fly.io Seed B at
`wss://jgc-testnet-seed-b.fly.dev`. The `testnet:public` command builds before
starting and dials both seeds.

Run an outbound-only participant with a persistent post-quantum identity:

```text
npm run testnet:participate
```

Participant mode submits one equal-weight signed pilot receipt per block slot.
Receipts and epoch payouts are recorded on-chain, but the current simnet receipt
is evidence of testnet presence—not proof of useful computation. Back up
`data/testnet/participant-identity.json` and never reuse it on a valuable
network. Inspect the chain at `https://junctiongenerator.net/testnet`.

Run a standalone node without contacting a public seed:

```text
npm run testnet
```

Both safe presets:

- uses simulation-only compute receipts while still enforcing ML-DSA
  contribution signatures and all other consensus checks;
- stores chain data under `./data/testnet`;
- listens for peers at `ws://127.0.0.1:19444`;
- exposes read-only status at `http://127.0.0.1:7777/status`;
- bind P2P and status to loopback, so they are not exposed to the internet;
- identifies itself as `jgc-testnet-v3` and rejects peers with a different
  genesis hash, consensus version, or proof mode before accepting chain data.

The standalone preset starts with no seed peers. The public preset makes only
outbound connections to both public seeds. Check the local node at
`http://127.0.0.1:7777/status` and press `Ctrl+C` to stop it cleanly.

Simulation receipts exercise networking and consensus plumbing but do not prove
that useful computation occurred. Strict production verification rejects them.

Connect two private processes by giving the second node the first as a seed:

```text
npm run testnet -- --port 19445 --status-port 7778 --datadir ./data/testnet-2 --seed ws://127.0.0.1:19444
```

Repeat `--seed` to configure more than one bootstrap peer.

Containers may use the equivalent `JGC_P2P_HOST`, `JGC_P2P_PORT`,
`JGC_STATUS_HOST`, `JGC_STATUS_PORT`, `JGC_DATA_DIR`, `JGC_ADVERTISE_URL`,
comma-separated `JGC_SEEDS`, `JGC_PRODUCE`, and `JGC_BLOCK_INTERVAL_SEC`
environment variables. Explicit command-line options take precedence.

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

For the simplest single public runner, use:

```text
docker compose -f compose.runner.yml up --build -d
```

This keeps chain data in the `runner-data` volume, connects outbound to both
public seeds, and exposes status only at `http://127.0.0.1:7777/status`. See
[`docs/RUN-A-NODE.md`](docs/RUN-A-NODE.md) for stop, update, and troubleshooting
commands.

For a private two-node developer testnet, use:

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
GitHub Actions runs this topology for every node-package change and requires the
producer and back-checker to report the same non-zero chain height.

## Network exposure

Inbound P2P stays on loopback unless `--host 0.0.0.0` is explicitly supplied.
An ordinary public-pilot runner does not need an inbound port. Public seed
operators should terminate TLS/WSS on TCP 443 and follow
[`deploy/README.md`](deploy/README.md); do not expose raw P2P or status ports to
the internet. Peer traffic uses a
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

Persistent storage is now versioned and bound to the network identity. Block
records are checksum-protected and flushed; an incomplete crash tail is
quarantined and truncated, while corruption inside a complete record fails
closed. See [`docs/STORAGE-RECOVERY.md`](docs/STORAGE-RECOVERY.md) before backup,
restore, upgrade, or reset operations.

This is an early testnet node, not mainnet software.

For the continuously running Google Cloud + Fly.io pilot, see
[`deploy/README.md`](deploy/README.md).

Architecture references:

- [`docs/CONSENSUS-V3.md`](docs/CONSENSUS-V3.md) — portable encodings and V3 invariants;
- [`docs/BACK-CHECKER-ARCHITECTURE.md`](docs/BACK-CHECKER-ARCHITECTURE.md) — heterogeneous verifier roles and proof authority;
- [`docs/AUDIT-PROTOCOL.md`](docs/AUDIT-PROTOCOL.md) — consensus-committed historical audits;
- [`docs/QUANTUM-READY.md`](docs/QUANTUM-READY.md) — current post-quantum boundaries and open proof-system work.
