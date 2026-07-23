# JGC Node

JGC is the Junction Generator proof-of-useful-compute Layer 1. This package
contains its consensus engine, post-quantum wallet, miner, peer networking, and
local testnet tools.

## Requirements

- Node.js 20 or newer
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

- uses strict post-quantum proof and ML-DSA signature verification;
- stores chain data under `./data/testnet`;
- listens for peers at `ws://127.0.0.1:19444`;
- exposes read-only status at `http://127.0.0.1:7777/status`;
- starts with no seed peers, so it is safe for local testing.

Connect two machines or processes by giving the second node the first node as a
seed:

```text
npm run testnet -- --port 19445 --status-port 7778 --datadir ./data/testnet-2 --seed ws://127.0.0.1:19444
```

Repeat `--seed` to configure more than one bootstrap peer.

## Network exposure

Inbound P2P stays on loopback unless `--host 0.0.0.0` is explicitly supplied.
Do not expose the P2P port to the public internet yet. Peer traffic now uses a
bounded, versioned binary envelope with network identity and SHA3-256 checksums,
but peer misbehavior scoring and connection-rate limits are still
public-testnet gates.

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
```

This is an early testnet node, not mainnet software.

The consensus-committed ten-block historical compute audit schedule is documented in
[`docs/AUDIT-PROTOCOL.md`](docs/AUDIT-PROTOCOL.md).
