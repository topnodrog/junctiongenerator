# Continuous two-seed pilot

> Current rollout, completed 2026-08-26 (America/Toronto): Google Seed A and
> independent Fly.io Seed B run Node.js 22.23.2 on `jgtc-testnet-v2`. Block 1
> synchronized across both seeds with conserved supply. The seeds
> online and accept external JGC peers at `wss://seed-a.junctiongenerator.net`
> and `wss://jgc-testnet-seed-b.fly.dev`. Ordinary node runners should use
> [`../docs/RUN-A-NODE.md`](../docs/RUN-A-NODE.md); this document is for seed
> operators.

> The isolated recovery network uses genesis
> `da5c0c28e076211e13e75f8cd28fe98f81080dafefc5ad803620961d16ee1d77`
> to isolate the settlement-ID recovery from every v1 peer and archive.

The target deployment keeps two `jgtc-testnet-v2` nodes online in separate
provider failure domains:

| Seed | Provider | Region | Role | Persistent data |
| --- | --- | --- | --- | --- |
| A | Google Compute Engine | `us-east1-b` | designated producer | 20 GB `pd-standard` |
| B | Fly.io | Toronto (`yyz`) | validator/back-checker | 10 GB Fly Volume |

Seed A advertises `wss://seed-a.junctiongenerator.net`; Seed B advertises its
provider-independent `wss://jgc-testnet-seed-b.fly.dev` hostname. Each dials
the other continuously. The status service remains private on both machines.
Only the WebSocket edge on TCP 443 is public.

Seed A runs the designated producer at the JGTC ten-minute target and one
persistent anchor participant. The
anchor submits an equal-weight, signed pilot receipt so the chain continues
when no external runner is online. External `testnet:participate` nodes are
recorded alongside it and share valueless epoch payouts. These pilot receipts
record presence; they are not proof of useful computation. Do not deploy
`compose.smoke.yml` or the CI-only smoke contributor on the public chain.

## Expected pilot cost

Confirm the provider estimates immediately before deployment. At the time this
manifest was prepared, Google advertised one eligible `e2-micro` and 30 GB of
standard persistent disk in its Compute Engine Free Tier. An in-use external
IPv4 address, snapshots, logging, and excess network transfer remain billable.

Fly.io's Toronto `shared-cpu-1x` with 512 MB RAM plus a 10 GB volume is roughly
USD 5-6 per month before transfer and snapshot usage. Fly has no general free
tier for new accounts. Keep the existing CA$25 Google budget alert. Because
Fly does not offer native billing alerts, keep the repository's daily
`Fly resource-cost guard` workflow enabled with its read-only organization
token. It alerts through a GitHub issue if the approved one-Machine,
one-volume footprint expands. Dedicated IP and transfer charges still require
invoice review because Fly's read-only organization token cannot list IP
assignments.

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

Seed A also publishes two narrow read-only HTTP endpoints through Caddy while keeping
the full operator status endpoint private:

- `GET /explorer` — height, recent blocks, aggregate health, JGTC issuance, and epoch participants;
- `GET /balance?address=1QGC...` — public JGTC UTXO balance for one address.

JGTC has no premine or genesis faucet; participants receive newly created test
coins only through the 144-block settlement. The anchor identity lives on the
persistent data disk. Never route `/status` through Caddy or expose port 7777 directly.

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

Both responses must report `network: jgtc-testnet-v2` and `peerCount` of at
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

## 5. Verify Fly's cost-bearing footprint

The scheduled `.github/workflows/fly-cost-guard.yml` job runs the same check as:

```powershell
npm run fly-cost-guard -- --app jgc-testnet-seed-b
```

It requires a short-lived, read-only organization token stored as the
`FLY_API_TOKEN` repository secret. The guard expects exactly one started
`shared-cpu-1x` Machine with 512 MB RAM, one encrypted 10 GB Toronto volume,
and five-day automatic snapshots. A drift opens or updates a GitHub issue;
recovery closes it. Rotate the token before expiry and continue reviewing
dedicated IP, transfer, and invoice totals because Fly exposes no native spend
alert and does not allow its read-only organization token to list IP addresses.

## Upgrades and rollback

Pin `-RepositoryRef` to the reviewed commit when provisioning. For an upgrade,
update the instance metadata to a new reviewed commit and rerun the startup
script, then deploy the same commit to Fly. Upgrade the back-checker first,
confirm compatibility, then upgrade the producer. Follow
`../docs/STORAGE-RECOVERY.md` before restoring or resetting either data volume.

### Settlement transaction-ID recovery reset

The public soak accounting rollout on 2026-08-20 detected that settlement
blocks 431 and 575 had identical transaction IDs. The later UTXO replaced the
earlier unspent outpoint, leaving canonical accounting 7,200 JGTC below the
emission schedule. No ordinary transactions had occurred.

The recovery release commits every settlement boundary height in the
transaction locktime, rejects overwriting an unspent coinbase outpoint, and sets
`JGC_RESET_ID=settlement-txid-v1`. It also freezes the isolated
`jgtc-testnet-v2` genesis at
`da5c0c28e076211e13e75f8cd28fe98f81080dafefc5ad803620961d16ee1d77`,
so no v1 peer can repopulate the reset volume. Deploy/reset the non-producing
Seed B first,
verify its previous state is present in a reset-specific archive and any
participant identity remains present, then deploy/reset producing Seed A. Do
not accept the reset as complete until both nodes agree from genesis, Seed A
produces a new block, and public soak evidence reports conserved supply.

### Completed coordinated `jgtc-testnet-v2` recovery

The settlement-ID recovery completed on 2026-08-26 (America/Toronto; block 1
was observed at 2026-08-27 00:09 UTC) from reviewed merge commit
`7d023cf5f6793cb487a6244f70aec7eff287ead7`. Seed B was reset first, followed
by producing Seed A. Seed B's v1 state ended at height 1,696 and Seed A's at
height 1,697. The last public v1 snapshot accounted for 41,650 JGTC against
84,850 JGTC expected, a 43,200-JGTC gap from six overwritten 7,200-JGTC
settlements. Their four chain-specific files were retained at:

- Seed B: `/data/archive/jgtc-testnet-v1-reset-settlement-txid-v1-to-da5c0c28e076/`;
- Seed A: `/var/lib/jgc/archive/jgtc-testnet-v1-reset-settlement-txid-v1-to-da5c0c28e076/`.

Both volumes contain the reset-specific marker. Seed A's participant identity
fingerprint matched before and after the reset; Seed B had participation
disabled and therefore had no participant identity file to preserve. The
private identity file and its fingerprint are not published.

Both seeds accepted v2 block 1 at tip
`5ede97f62db16224900e17df3d910c30eb61b16b0c679a30af879b50352d5aca`.
The public explorer reported zero premine, 100 JGTC pending, 100 JGTC
accounted, 100 JGTC expected, and `supplyConserved: true`. Both public WSS
probes passed. The initial soak snapshot reported 9 passes, 1 timing warning,
and 0 failures; the timing warning is expected until the frozen genesis has
enough post-recovery blocks for a representative interval window.

### Completed coordinated `jgtc-testnet-v1` reset

The reset completed on 2026-08-15. The zero-premine JGTC genesis is
intentionally incompatible with the former
`jgc-testnet-v3` data. Reset in this order so the producer is the last old node
to stop:

1. deploy the reviewed JGTC commit to Seed B with
   `JGC_RESET_TO_GENESIS=738588b974ed62ed52e74a946371bc8b6d84508b6c38203f56ada38fce4bab36`;
   its startup guard moves chain-specific files into `/data/archive/` before
   opening storage and preserves `participant-identity.json`;
2. deploy the same commit and reset token to Seed A. Its startup guard makes the
   same recoverable archive under `/var/lib/jgc/archive/` while retaining the
   anchor participant identity;
3. point Seed A's `jgc-repository-ref` metadata at the same reviewed commit,
   update its startup script, and rerun it;
4. verify both private status responses report `jgtc-testnet-v1`, genesis
   `738588b974ed62ed52e74a946371bc8b6d84508b6c38203f56ada38fce4bab36`,
   height `0`, and the expected producer roles before accepting block 1;
5. keep the archives and `.reset-to-<hash>.done` markers until the new chain
   passes restart and settlement checks. The marker makes the reset idempotent.

The new genesis time is 2026-08-15 04:00:00 UTC. Seed A targets one block every
600 seconds; the first settlement is height 143 because genesis is epoch slot
zero. No command in this reset creates or allocates JGTC.

Deleting a VM or app does not necessarily delete its address, disk, volume, or
snapshots. Inventory those separately during teardown to avoid continuing
charges.
