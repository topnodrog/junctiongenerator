# Run a JGC Node

This guide is for anyone who wants to run an early JGC testnet node. The
safest default is an outbound-only validator/back-checker: it connects to the
public seed, verifies what it receives, keeps its own chain data, and does not
open an inbound peer port on your computer.

## Before you start

JGC is early, valueless testnet software. It is not mainnet, and running a node
does not currently earn coins or rewards. The network may be reset while the
protocol is under development.

The public pilot currently has two reachable bootstrap nodes in independent
provider failure domains:

- Seed A: `wss://seed-a.junctiongenerator.net`
- Seed B: `wss://jgc-testnet-seed-b.fly.dev`

The public runner dials both. If either seed is unavailable, your node keeps
its local data and can stay connected through the other seed while retrying.

### Supported setup

- Windows, macOS, or Linux on an x64 computer
- Node.js 20.19–20.x or Node.js 22.x
- Git
- about 2 GB of free memory and 2 GB of free disk space for a starter node

Native ARM64 execution has not yet been verified in CI. Docker Desktop is an
alternative if you do not want to install Node.js and Git locally.

## Fastest setup: Node.js

Open Terminal, PowerShell, or Command Prompt and run:

```text
git clone https://github.com/topnodrog/junctiongenerator.git
cd junctiongenerator/packages/jgc-node
npm ci
npm run testnet:public
```

The last command builds the node automatically and starts it. A successful
startup prints lines like these:

```text
[testnet] network: jgc-testnet-v3 (simnet-receipts-v1)
[testnet] seeds:   wss://seed-a.junctiongenerator.net, wss://jgc-testnet-seed-b.fly.dev
[testnet] role:    validator/back-checker
```

Leave that terminal open. Press `Ctrl+C` to stop the node cleanly. Its chain
data remains in `data/testnet` and is reused on the next start.

On Windows, if PowerShell says that `npm.ps1` cannot be loaded because script
execution is disabled, replace `npm` with `npm.cmd` in the two npm commands.

## Check that it is working

While the node is running, open
[http://127.0.0.1:7777/status](http://127.0.0.1:7777/status) in a browser.
Look for:

- `"running": true`
- `"network": "jgc-testnet-v3"`
- `"peerCount": 1` or higher
- `"producer": { "enabled": false, ... }`

A height of `0` can be normal during this pilot. The designated producer waits
for enough signed compute contributions, and the testnet does not fabricate
work just to increase the height.

## Docker alternative

Install Docker Desktop, clone or download this repository, open a terminal in
`packages/jgc-node`, and run:

```text
docker compose -f compose.runner.yml up --build -d
```

Check the node at
[http://127.0.0.1:7777/status](http://127.0.0.1:7777/status). Useful Docker
commands are:

```text
docker compose -f compose.runner.yml logs -f
docker compose -f compose.runner.yml stop
docker compose -f compose.runner.yml start
docker compose -f compose.runner.yml down
```

`down` removes the container but keeps the `runner-data` volume. Do not add
`-v` unless you deliberately want to erase the node's testnet data.

## Update the node

Stop the node, then run these commands from `packages/jgc-node`:

```text
git pull --ff-only
npm ci
npm run testnet:public
```

For Docker, stop it, pull the update, and repeat the `docker compose ... up
--build -d` command. Read the release notes before an upgrade because an early
testnet release may require a fresh data directory.

## Run privately or use another seed

For a standalone node that does not contact the public pilot:

```text
npm run testnet
```

To use a different bootstrap peer:

```text
npm run testnet -- --seed wss://seed.example.org
```

Repeat `--seed` to add more peers. Command-line values override the container
environment variables documented in the package README.

## Make a node publicly reachable

The default runner is intentionally outbound-only. Operating a public seed is
an advanced task: put TLS/WSS on TCP 443 in front of the node, publish an
`--advertise wss://...` address, keep the status endpoint private, use
persistent storage and backups, and monitor peer health and disk integrity.
Do not expose raw TCP 19444 or status port 7777 directly to the internet.

See [`../deploy/README.md`](../deploy/README.md) for the reference two-provider
seed design and [`STORAGE-RECOVERY.md`](STORAGE-RECOVERY.md) before backup,
restore, reset, or recovery work.

## Get help

When reporting a problem, include your operating system, Node.js version, the
startup command, and the error text. Do not post wallet keystores, private keys,
tokens, or environment files.

Open an issue at
[github.com/topnodrog/junctiongenerator/issues](https://github.com/topnodrog/junctiongenerator/issues).
