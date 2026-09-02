# Run a JGTC Testnet Node

This guide is for anyone who wants to run the JGTC network: JGC monetary and
settlement rules with valueless test coins. The
safest default is an outbound-only validator/back-checker: it connects to the
public seed, verifies what it receives, keeps its own chain data, and does not
open an inbound peer port on your computer.

## Before you start

JGTC is early, valueless testnet software. It is not mainnet. A participant node
can earn valueless JGTC according to signed pilot receipts, but those
coins have no cash value and do not promise a future payment. The network may
be reset while the protocol is under development.

The public pilot currently has two reachable bootstrap nodes in independent
provider failure domains:

- Seed A: `wss://seed-a.junctiongenerator.net`
- Seed B: `wss://jgc-testnet-seed-b.fly.dev`

The public runner dials both. If either seed is unavailable, your node keeps
its local data and can stay connected through the other seed while retrying.

### Supported setup

- Windows, macOS, or Linux on an x64 computer
- Node.js 20.19–20.x, Node.js 22.x, or Node.js 24.x
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
[testnet] network: jgtc-testnet-v2 (simnet-receipts-v1)
[testnet] seeds:   wss://seed-a.junctiongenerator.net, wss://jgc-testnet-seed-b.fly.dev
[testnet] role:    validator/back-checker
```

Leave that terminal open. Press `Ctrl+C` to stop the node cleanly. Its chain
data remains in `data/testnet` and is reused on the next start.

### Use the pinned closed-beta release

Known closed-beta operators should use the `jgc-node-v0.1.0` GitHub prerelease
instead of a moving `main` branch. Download its ZIP and `SHA256SUMS.txt`, verify
the archive as described in the release notes, extract it, then run `npm ci`
and the same `npm run testnet:public` or `npm run testnet:participate` command.
The included `RELEASE-MANIFEST.json` must report:

- `"version": "0.1.0"`;
- `"network": "jgtc-testnet-v2"`;
- genesis `da5c0c28e076211e13e75f8cd28fe98f81080dafefc5ad803620961d16ee1d77`;
- the full release commit used to build the archive.

### Record your participation

To do more than validate, stop the ordinary runner and start participant mode:

```text
npm run testnet:participate
```

The first run creates `data/testnet/participant-identity.json`, prints its
`1QGC...` address, and submits one equal-weight signed pilot receipt for each
new block slot. That address and its receipts are committed to the blockchain;
at the 144-block epoch boundary, the normal consensus settlement creates and
distributes valueless JGTC proportionally among recorded participants.

There is no JGTC premine and no genesis-funded faucet. Genesis has zero
spendable supply. Era 0 accumulates 50 JGTC for each ten-minute block, and the
settlement creates 7,200 JGTC after 144 blocks. Settlement outputs then follow
the same coinbase-maturity rule as JGC.

Back up the identity file privately. It establishes control of your testnet
participation address. Never publish it and never reuse it on a valuable
network. The receipt proves that this identity joined a block slot; the current
simulation receipt does **not** prove useful AI computation.

Use the live explorer at
[junctiongenerator.net/testnet](https://junctiongenerator.net/testnet).

For a closed-beta check-in, send the coordinator only your assigned runner ID,
role, OS/architecture, Node.js version, release tag and commit, start time, and
the public `1QGC...` address if you participate. Never send
`participant-identity.json`, a wallet keystore, private provider output, or raw
logs containing credentials. The operator-side template is
`deploy/ops/closed-beta-checkin.template.json`; copy it into `.tmp` before
filling it out so it cannot be committed accidentally.

On Windows, if PowerShell says that `npm.ps1` cannot be loaded because script
execution is disabled, replace `npm` with `npm.cmd` in the two npm commands.

### Start automatically on Windows

From `packages/jgc-node`, run:

```text
npm run windows:install
```

This builds the node with the active supported Node.js executable, registers a
per-user Windows scheduled task that starts after sign-in, starts the node now,
and creates a branded `JGC Node On-Off` shortcut on the desktop. The task runs
with normal user permissions and keeps the status and peer ports bound to
loopback unless you explicitly change the node configuration.

Use the desktop shortcut to switch the node off or on. Off disables the task so
it remains off after a restart; on re-enables automatic startup and launches the
node immediately. Windows displays a short confirmation for each action.

To remove the scheduled task and shortcut without deleting chain data or a
participant identity, run:

```text
npm run windows:uninstall
```

## Check that it is working

While the node is running, open
[http://127.0.0.1:7777/status](http://127.0.0.1:7777/status) in a browser.
Look for:

- `"running": true`
- `"network": "jgtc-testnet-v2"`
- `"peerCount": 1` or higher
- `"producer": { "enabled": false, ... }`

The designated producer targets one block every ten minutes and includes signed
pilot participation receipts. Seed A
provides an anchor receipt so the chain continues when no outside participant
is online; additional participant nodes are recorded alongside it.

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

To participate through Docker, set `JGC_PARTICIPATE=true` before `up`. The
identity is stored in the persistent `runner-data` volume:

```text
# PowerShell
$env:JGC_PARTICIPATE="true"
docker compose -f compose.runner.yml up --build -d
```

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
