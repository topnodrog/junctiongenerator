# JGC pilot operations testing

This runbook turns the two-seed readiness requirements into repeatable evidence.
It does not change either live seed. Public WSS checks are safe and read-only;
private status, snapshot, restore, disk, and billing evidence must be collected
through each provider's authenticated administration path.

## Evidence tools

Run from `packages/jgc-node` after `npm ci` and `npm run build`.

Authenticated evidence collector:

1. Install and authenticate the Google Cloud CLI and Fly CLI. The collector
   uses their existing credential stores; it never reads or writes access
   tokens itself.
2. Copy `deploy/ops/pilot-attestations.template.json` into `.tmp`, then record
   only observations that require human confirmation: billing/cost safeguards,
   the most recent restore drill, corruption-log review, repeated peer bans,
   and external runner continuity. Do not put credentials or raw provider
   output in it.
3. Get Seed B's volume ID with `flyctl volumes list --app
   jgc-testnet-seed-b`, then run:

```powershell
npm run collect-pilot-evidence -- `
  --google-project <project-id> `
  --fly-volume <volume-id> `
  --attestations .tmp/pilot-attestations.json `
  --append .tmp/pilot-evidence/readiness.jsonl
```

The command collects both private `/status` responses through authenticated
SSH, disk usage, the newest ready Google disk snapshot, the newest Fly volume
snapshot, and both public TLS certificate expiries. It writes a sanitized
snapshot to `.tmp/pilot-evidence/current.json`, evaluates it immediately, and
returns a failing exit code until the readiness gate passes. Provider CLI
errors are recorded as bounded, single-line collection failures; missing data
is never converted into a healthy default.

Google snapshot discovery uses `gcloud compute snapshots list`; Fly snapshot
discovery uses `flyctl volumes snapshots list <volume-id> --json`. These
interfaces are documented by the providers at
<https://cloud.google.com/sdk/gcloud/reference/compute/snapshots/list> and
<https://fly.io/docs/flyctl/volumes-snapshots-list/>.

Public TLS/WSS transport probe:

```powershell
npm run public-seed-probe -- --append .tmp/pilot-evidence/public-wss.jsonl
```

The probe opens each public WSS endpoint and records reachability and latency.
It does not claim that private status, chain height, backups, or billing are
healthy.

For a manual or offline fallback, copy
`deploy/ops/pilot-readiness.template.json` to a private working location,
replace the placeholders with current authenticated observations, then run:

```powershell
npm run pilot-readiness -- --input <snapshot.json> --append .tmp/pilot-evidence/readiness.jsonl
```

The evaluator checks:

- both expected provider failure domains;
- `jgc-testnet-v3` identity and no more than one block of height difference;
- at least one peer per active seed;
- Seed A producer enabled and Seed B producer disabled;
- disk thresholds, corruption errors, and repeated peer bans;
- certificate, snapshot, restore-test, and billing-alert evidence.

The append files use JSON Lines so each run is immutable and easy to compare.
Do not put provider credentials, tokens, private keys, or raw secrets in a
snapshot or commit `.tmp` evidence to the public repository.

## Seed-loss drills

Only perform a live interruption in an approved maintenance window. Capture a
baseline first, stop or isolate exactly one seed, and run the evaluator with
the expected outage declared:

```powershell
npm run pilot-readiness -- --input <seed-a-outage.json> --expected-outage seed-a --append .tmp/pilot-evidence/readiness.jsonl
```

Set `externalRunnerConnected` only after an ordinary outbound-only runner is
observed continuing through the surviving seed. Repeat for Seed B. Restore the
removed seed, verify network identity, height convergence, peers, producer
role, and disk state, then capture a new healthy snapshot.

## Recovery drill

For each provider independently:

1. preserve the failed volume and logs rather than repairing them in place;
2. create a disposable replacement from the pinned deployment configuration;
3. restore an encrypted snapshot or resync from the surviving seed;
4. verify `jgc-testnet-v3`, expected producer role, height convergence, and at
   least one peer;
5. record `lastRestoreTestAt`, snapshot age, disk use, and any incident notes;
6. destroy the disposable replacement after the evidence is reviewed.

For Google, a VM without a public IP also needs an outbound path to install
packages and clone the pinned repository. Keep recovery isolated from the live
seed VPC: use a temporary custom VPC, IAP-only SSH rule, and Cloud NAT scoped to
the temporary subnet, then delete the VM, restored disk, NAT, router, firewall
rule, subnet, and VPC after verification. Do not add a public IP to a restored
data VM or add recovery NAT to the production seed subnet.

For Fly, restore the snapshot to a temporary app and encrypted volume, run the
same pinned node image without public services, and keep the restored node in
the non-producing role. Verify private status through `flyctl ssh console`,
then delete the exact temporary Machine, volume, and app.

The readiness report must pass before beginning the multi-day closed soak. A
transport-only pass is necessary but is not operational-readiness evidence.

## Evidence captured 2026-08-13

The public WSS probe and the authenticated collector succeeded from a Windows
operator workstation against both public endpoints and provider administration
paths:

- `wss://seed-a.junctiongenerator.net`
- `wss://jgc-testnet-seed-b.fly.dev`

Both seeds reported `jgc-testnet-v3`, height `0`, two peers, and 1% disk use.
Seed A was the only producer. Its certificate expires 2026-11-08; Seed B's
expires 2026-09-19. Fresh snapshots completed on both providers. A bounded log
review found no corruption signatures or peer guard rejections in Seed A's
prior 24 hours or Seed B's current provider log buffer.

Google billing is linked and has a CAD 25 monthly budget with current-spend
thresholds at 50%, 90%, 100%, and 150%. Fly's current
[cost-management documentation](https://fly.io/docs/about/cost-management/)
states that native billing alerts are not supported, so Seed B's
billing gate remains failed until the repository's external resource-cost
guard is connected with its read-only Fly token. Private JSON evidence remains
under `.tmp` and is not committed.

Both restore drills completed on 2026-08-13. Seed B was restored to an
encrypted temporary Fly volume and booted with the pinned production image in
a non-producing, unexposed Machine. It reported height 0, two peers, and the
expected role. Seed A was restored to a temporary Google disk and rebuilt in
an isolated VPC with IAP-only SSH and temporary outbound NAT. It reported
height 0, two peers, and producer enabled. All temporary Fly and Google
resources were deleted, then both live seeds again reported height 0 and two
peers. The resulting gate is 22 passes, zero warnings, and one failure: the
external Fly cost guard still needs its GitHub secret connected and its first
scheduled-path run verified.
