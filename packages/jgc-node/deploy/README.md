# Continuous two-seed pilot

> Current rollout, 2026-08-13: Google Seed A and independent Fly.io Seed B are
> online and accept external JGC peers at `wss://seed-a.junctiongenerator.net`
> and `wss://jgc-testnet-seed-b.fly.dev`. Ordinary node runners should use
> [`../docs/RUN-A-NODE.md`](../docs/RUN-A-NODE.md); this document is for seed
> operators.

The target deployment keeps two `jgc-testnet-v3` nodes online in separate
provider failure domains:

| Seed | Provider | Region | Role | Persistent data |
| --- | --- | --- | --- | --- |
| A | Google Compute Engine | `us-east1-b` | designated producer | 20 GB `pd-standard` |
| B | Fly.io | Toronto (`yyz`) | validator/back-checker | 10 GB Fly Volume |

Seed A advertises `wss://seed-a.junctiongenerator.net`; Seed B advertises its
provider-independent `wss://jgc-testnet-seed-b.fly.dev` hostname. Each dials
the other continuously. The status service remains private on both machines.
Only the WebSocket edge on TCP 443 is public.

The producer will remain healthy but wait at the genesis height until it
receives enough signed compute contributions. Do not deploy
`compose.smoke.yml` or the smoke contributor to make the public chain move.

## Expected pilot cost

Confirm the provider estimates immediately before deployment. At the time this
manifest was prepared, Google advertised one eligible `e2-micro` and 30 GB of
standard persistent disk in its Compute Engine Free Tier. An in-use external
IPv4 address, snapshots, logging, and excess network transfer remain billable.

Fly.io's Toronto `shared-cpu-1x` with 512 MB RAM plus a 10 GB volume is roughly
USD 5-6 per month before transfer and snapshot usage. Fly has no general free
tier for new accounts. Keep the existing CA$25 Google budget alert and add a
separate Fly usage alert in its dashboard.

## Prerequisites

- Google Cloud CLI authenticated to the intended project.
- Fly CLI authenticated to the intended organization with billing enabled.
- `seed-a.junctiongenerator.net` controlled in the existing DNS provider.
- This deployment commit pushed to the repository.

No credential belongs in this directory or in instance metadata.

## 1. Provision Google Seed A

From the repository root:

```powershell
& packages/jgc-node/deploy/google/provision.ps1 -ProjectId "YOUR_PROJECT_ID"
```

The script is idempotent. It creates a dedicated custom VPC and subnet, allows
public TCP 443 only, restricts SSH to Google's IAP range, reserves one regional
address, creates the VM and its separate data disk, and attaches a seven-day
daily snapshot policy. The runtime service account has no API scopes or IAM
roles.

Create an unproxied DNS `A` record for `seed-a.junctiongenerator.net` pointing
to the printed address. Caddy obtains and renews TLS after DNS resolves. Inspect
startup output and then verify:

```powershell
gcloud compute instances get-serial-port-output jgc-seed-a --zone us-east1-b
curl.exe --fail https://seed-a.junctiongenerator.net/healthz
```

## 2. Provision Fly Seed B

Run from `packages/jgc-node` so the Docker build context is correct:

```powershell
flyctl apps create jgc-testnet-seed-b
flyctl volumes create jgc_seed_b_data --app jgc-testnet-seed-b --region yyz --size 10 --yes
flyctl deploy --config deploy/fly/fly.toml --ha=false --wg=false
flyctl status --app jgc-testnet-seed-b
```

The Fly configuration disables automatic stopping and requires one running
Machine. Fly Proxy terminates TLS/WSS and forwards only to the P2P service;
port 7777 is neither declared nor publicly reachable.

## 3. Verify the peer link

Read each private status endpoint through its provider administration path:

```powershell
gcloud compute ssh jgc-seed-a --zone us-east1-b --tunnel-through-iap --command "curl -fsS http://127.0.0.1:7777/status"
flyctl ssh console --app jgc-testnet-seed-b --command "node -e fetch(String.fromCharCode(104,116,116,112,58,47,47,49,50,55,46,48,46,48,46,49,58,55,55,55,55,47,115,116,97,116,117,115)).then(r=>r.text()).then(console.log)"
```

Both responses must report `network: jgc-testnet-v3` and `peerCount` of at
least one. The heights must agree. Seed A alone must report
`producer.enabled: true`.

An ordinary external runner must also connect successfully when Seed B is its
only configured bootstrap peer. Seed B's first deployment passed this check on
2026-08-13 and reported `producer.enabled: false`.

## 4. Collect readiness evidence

Use the authenticated collector in `../../../docs/PILOT_OPERATIONS_TESTING.md`
to turn both private status responses, disk usage, provider snapshots, and TLS
certificate expiries into one sanitized readiness snapshot. The only manual
inputs are explicit operator attestations for billing alerts, restore drills,
log review, and external-runner continuity. Generated snapshots belong under
`.tmp` and must not be committed.

## Upgrades and rollback

Pin `-RepositoryRef` to the reviewed commit when provisioning. For an upgrade,
update the instance metadata to a new reviewed commit and rerun the startup
script, then deploy the same commit to Fly. Upgrade the back-checker first,
confirm compatibility, then upgrade the producer. Follow
`../docs/STORAGE-RECOVERY.md` before restoring or resetting either data volume.

Deleting a VM or app does not necessarily delete its address, disk, volume, or
snapshots. Inventory those separately during teardown to avoid continuing
charges.
