# Provider-neutral seed deployment (no Fly.io, no Google Cloud)

This is the **active** deployment path as of 2026-11-02. It replaces the retired
two-provider pilot (`../google`, `../fly`, `../monitor`) with operator-owned
hardware or VPS hosts. Every operator controls their own DNS, TLS key, data
volume, backups and monitoring. There is no cloud CLI, instance metadata
service, IAM role, managed scheduler, hosted object store, hosted model, or
organization-wide API token.

> This kit runs the **zero-value `jgtc-testnet-v2` pilot only**. It does not
> launch mainnet. `npm run mainnet:launch` remains fail-closed; see
> [`docs/mainnet/LAUNCH_PLAN.md`](../../../../docs/mainnet/LAUNCH_PLAN.md).

## 1. Topology and trust boundaries

| Port | Bind | Exposure | Purpose |
| --- | --- | --- | --- |
| 80/TCP | Caddy | public | ACME HTTP-01 only |
| 443/TCP | Caddy | public | WSS P2P + `/healthz`, `/explorer`, `/balance` |
| 19444 | node container → host loopback | never public | authenticated P2P WebSocket |
| 7777 | node container → host loopback | never public | private operator `/status` |
| 7778 | node container → host loopback | never public | narrow public-read listener |

`Caddyfile` explicitly returns `404` for `/status` and `/`. The node itself also
refuses private routes on a non-loopback bind. Both layers are intentional.

Minimum recommended topology: three seeds in three failure domains with three
distinct operators (see `inventory.example.json`). One owner-operated seed is
fine for a rehearsal; it is **not** decentralization evidence.

## 2. Files

| File | Purpose |
| --- | --- |
| `compose.seed.yml` | Node + Caddy, loopback-only published ports, `no-new-privileges`, dropped capabilities. |
| `Caddyfile` | TLS/WSS edge and explicit route allowlist. |
| `env.example` | Non-secret configuration template (copy to `.env`, git-ignored). |
| `install.sh` | Host firewall, permissions and Compose startup. |
| `verify.sh` | Post-deploy TLS, route, CORS and certificate checks; fails closed. |
| `backup.sh` | Paused-writer volume archive with SHA-256 checksum. |
| `monitor.mjs` / `monitor.test.mjs` | Dependency-free health/supply checks, no cloud APIs, no model decisions. |
| `inventory.example.json` | Independent operators, failure domains and `wss://` seed URLs. |
| `launch-policy.json` | Fail-closed M-of-N Ed25519 launch policy (empty `trustedKeys`). |
| `gate-evidence.json` | Empty signed gate evidence ledger. |
| `proof-registry.json` | Placeholder proving-key manifest; must fail `proof-registry-check.mjs` today. |

`mainnet-launch-record.json` is intentionally **absent**. Creating it requires
independent reviewers and the gate closure protocol.

## 3. Install (each operator)

Prerequisites: a Debian/Ubuntu host you control, Docker + Compose, `ufw`,
`curl`, `openssl`, a DNS `A`/`AAAA` record you control, and TCP 80/443 reachable.

```text
cd packages/jgc-node/deploy/selfhosted
cp env.example .env
# edit .env: your hostname, ACME email, advertise URL and the other wss:// seeds
chmod 600 .env
./install.sh
./verify.sh
```

`install.sh` refuses a missing `.env`, any non-`wss://` seed, and opens only
80/443. It explicitly denies 19444, 7777 and 7778. It never stores a credential.

To join as an ordinary runner (not a seed), from `packages/jgc-node`:

```text
JGC_SEEDS="wss://seed-a.example.net,wss://seed-b.example.org,wss://seed-c.example.net" \
  docker compose -f compose.runner.yml up -d --build
```

## 4. Verify

```text
./verify.sh                      # TLS, health, explorer, /status blocked, CORS, cert expiry
cp inventory.example.json inventory.json   # replace placeholders with real operators
node monitor.mjs --inventory inventory.json
npm run monitor:test             # from packages/jgc-node
npm run infra:guard              # from packages/jgc-node
```

Expected: `PASS` for every `verify.sh` check, `healthy === total` in the monitor,
and an `ok: true` infra guard. Any failure is a deployment blocker.

## 5. Operations

- **Monitoring:** run `monitor.mjs` from an independent machine on a cron or
  systemd timer (e.g. every 5 minutes). It polls only `/healthz` and
  `/explorer`, checks the chain ID and `supplyConserved`, and writes local JSON.
  It never pauses anything, never calls a model, and never mutates state.
- **Backups:** `./backup.sh /var/backups/jgc` pauses the writer, archives the
  named volume, writes a SHA-256 checksum and unpauses. Store the archive
  off-host and rehearse a restore before relying on it. Verify the chain ID,
  genesis hash and reset marker after restore.
- **Upgrades:** pin the reviewed commit, deploy the back-checkers first, verify
  height agreement and genesis, then the producer (pilot only). Keep the previous
  image and a verified backup until the new release is stable.
- **Rotation:** rotate TLS keys through ACME, reviewer keys through
  `launch-policy.json`, and any `JGC_STATUS_TOKEN` out of band. No credential is
  stored in Git, Compose environment files committed to Git, or container images.
- **Cost control:** fixed host count in `inventory.json`, per-provider billing
  alerts, and monthly invoice review. No cloud organization token is needed.
- **Teardown:** delete the app/VM, then separately inventory and delete disks,
  volumes, snapshots, reserved IPs and DNS records. Cloud teardown often leaves
  billable resources behind; here each operator can verify their own host.

## 6. Migration away from the legacy pilot

1. Publish the new `wss://` seed list and a deprecation notice.
2. Stand up B and C with independent operators; verify TLS, genesis, peer auth,
   supply conservation and backups.
3. Repoint `seed-a.junctiongenerator.net` DNS to the owner-controlled host.
4. From an external runner, verify joining with only the new seeds works.
5. Archive the old volumes/snapshots, delete the old app/VM/addresses/disks, and
   confirm no recurring charges.
6. Record the migration as `soloSoak` / `reproducibleArtifacts` evidence.

The retired scheduled Fly cost-guard workflow has been removed. Legacy provider
directories remain in the repository for historical audit only;
`scripts/infra-guard.mjs` fails CI if their CLIs, hostnames or credentials
appear in this active kit.

## 7. Security invariants

1. `/status` is never public. Private status stays on loopback; a token is
   required if an operator deliberately exposes it.
2. All public seeds use `wss://`; cleartext `ws://` is accepted only for
   loopback, RFC 1918 or single-label container names.
3. CORS origins are exactly allowlisted; arbitrary origins and PNA preflights
   are rejected.
4. No secret, wallet keystore, private key or cloud credential is committed.
5. The deployment kit contains no Fly.io or Google Cloud service, CLI, metadata
   endpoint, IAM binding or credential (checked in CI).
6. No command in this directory activates a value-bearing network. Mainnet
   readiness is verified separately by `npm run mainnet:launch`.
