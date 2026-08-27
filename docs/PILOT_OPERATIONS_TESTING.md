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

Public chain and supply-conservation snapshot:

```powershell
npm run collect-soak-evidence -- --append .tmp/pilot-evidence/public-soak.jsonl
```

After an approved recoverable reset, retain the pre-reset failed snapshot and
append a new post-reset record. Confirm the same genesis hash, zero premine,
exact `accountedSupplyJGTC === expectedSupplyJGTC`, preserved participant
identities, correct producer roles, and a newly produced block before resuming
the measured soak window. A fresh chain may initially warn that there are not
enough recent blocks to measure timing; that warning clears as the window fills.

This read-only collector records the canonical explorer snapshot and checks the
frozen network identity, ten-minute target, 144-block settlement cadence,
recent tip continuity, epoch progress, participation totals, zero-premine
claims, and supply conservation. Supply conservation compares all canonical
UTXO value plus the pending reward pool against consensus-scheduled emission at
the current height. Keep the JSON Lines history for the full soak so block
timing, settlements, participant growth, and any warning or failure remain
auditable. The output is sanitized public chain data, but it still belongs in
`.tmp` unless a reviewed evidence excerpt is deliberately published.

For a manual or offline fallback, copy
`deploy/ops/pilot-readiness.template.json` to a private working location,
replace the placeholders with current authenticated observations, then run:

```powershell
npm run pilot-readiness -- --input <snapshot.json> --append .tmp/pilot-evidence/readiness.jsonl
```

The evaluator checks:

- both expected provider failure domains;
- `jgtc-testnet-v2` identity and no more than one block of height difference;
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
4. verify `jgtc-testnet-v2`, expected producer role, height convergence, and at
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
states that native billing alerts are not supported. The repository's daily
external resource-cost guard is connected with a 90-day read-only Fly token;
its verified run passed the approved one-Machine, one-volume footprint and
automatically resolved its test alert. Private JSON evidence remains under
`.tmp` and is not committed.

Both restore drills completed on 2026-08-13. Seed B was restored to an
encrypted temporary Fly volume and booted with the pinned production image in
a non-producing, unexposed Machine. It reported height 0, two peers, and the
expected role. Seed A was restored to a temporary Google disk and rebuilt in
an isolated VPC with IAP-only SSH and temporary outbound NAT. It reported
height 0, two peers, and producer enabled. All temporary Fly and Google
resources were deleted, then both live seeds again reported height 0 and two
peers. A final authenticated collection after the Fly guard recovery produced
23 passes, zero warnings, and zero failures. Phase 3 public-testnet readiness
is complete; the next operational activity is the multi-day closed soak.

## JGTC launch evidence captured 2026-08-15

The two live seeds were upgraded to Node.js 22.23.2 and reset from archived
`jgc-testnet-v3` state onto `jgtc-testnet-v1`. The frozen genesis hash is
`738588b974ed62ed52e74a946371bc8b6d84508b6c38203f56ada38fce4bab36`;
genesis has zero spendable supply, the target interval is ten minutes, and
JGTC becomes spendable only through 144-block settlement.

Block 1 synchronized across Seed A, Seed B, and an ordinary workstation
participant with tip
`0799949e151a538eadc5d296f9abcf83f21a14db96ff808b9f3709aa0811e328`.
It recorded two equal 1000-weight contributions, projecting equal settlement
shares for the seed anchor and workstation address. Seed A reported three
peers, one produced block, and no producer error; Seed B reported three peers;
the workstation reported two peers. The displayed 100 JGTC pending pool is
unsettled accounting, not a premine or faucet balance.

## Settlement-ID recovery evidence captured 2026-08-26

The live v1 soak reached Seed A height 1,697 and Seed B height 1,696 before the
approved recoverable reset. Repeated 7,200-JGTC settlement transactions had
shared transaction IDs, so later unspent outpoints replaced earlier ones. The
last public v1 snapshot accounted for 41,650 JGTC against 84,850 JGTC
expected, a 43,200-JGTC gap from six overwritten settlements. The recovery
release commits the boundary height in every settlement transaction,
rejects unspent coinbase-outpoint replacement, and isolates the repaired chain
as `jgtc-testnet-v2` with genesis
`da5c0c28e076211e13e75f8cd28fe98f81080dafefc5ad803620961d16ee1d77`.

The two-seed rollout used reviewed merge commit
`7d023cf5f6793cb487a6244f70aec7eff287ead7`, resetting non-producing Seed B
before producing Seed A. Both providers retained their v1 chain files in the
reset-specific `jgtc-testnet-v1-reset-settlement-txid-v1-to-da5c0c28e076`
archive. Seed A's participant identity fingerprint was unchanged; Seed B had
participation disabled and no identity file. No private identity data or
fingerprint is included in repository evidence.

Block 1 synchronized across both seeds at tip
`5ede97f62db16224900e17df3d910c30eb61b16b0c679a30af879b50352d5aca`.
Seed A reported producer enabled with one produced block and no error; Seed B
reported producer disabled at the same height. Public explorer accounting was
zero premine, 100 JGTC pending, 100 JGTC accounted, 100 JGTC expected, and
`supplyConserved: true`. Both public WSS probes passed. The first public soak
snapshot recorded 9 passes, 1 expected fresh-chain timing warning, and 0
failures.
