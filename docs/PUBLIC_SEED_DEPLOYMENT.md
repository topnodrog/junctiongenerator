# Public Seed Deployment Gate

**Status (2026-08-15):** Seed A is deployed and reachable at
`wss://seed-a.junctiongenerator.net`; its HTTPS health check answers `ok`, and a
fresh external validator/back-checker completed the JGC compatibility handshake.
Seed B is deployed independently on Fly.io in Toronto and reachable at
`wss://jgc-testnet-seed-b.fly.dev`. Its Fly health check passes, its encrypted
10 GB volume is attached, private status reports `peerCount: 2` and
`producer.enabled: false`, and a fresh external runner completed the JGC
compatibility handshake. Both seeds run Node.js 22.23.2 and were reset onto
`jgtc-testnet-v1` after their old state was archived. Block 1 synchronized
across both seeds and a workstation participant. The pilot has two-provider
bootstrap redundancy; the 23-check readiness gate and both restore drills pass.

This runbook records the original `jgc-testnet-v3` deployment evidence. The
live successor is `jgtc-testnet-v1`: a distinct zero-premine genesis with
ten-minute block targets and direct 144-block settlement. Its coordinated
reset procedure is in `packages/jgc-node/deploy/README.md` and preserves the
old seed data in recoverable archives.

External runners should use
[`../packages/jgc-node/docs/RUN-A-NODE.md`](../packages/jgc-node/docs/RUN-A-NODE.md),
not this operator runbook.

## Google Cloud readiness snapshot

Reviewed 2026-08-03:

- the intended project is signed in and linked to the owner's free-trial
  billing account;
- a CA$25 monthly budget alert is active (an alert, not a spending cap);
- the Compute Engine API is enabled and its quota catalogue has populated;
- the Compute Engine overview reports no VMs, instance groups, disks,
  snapshots, images, or reservations;
- the project currently reports no Compute Engine usage or cost; and
- no VM, persistent disk, reserved address, DNS record, paid account upgrade,
  or additional API was created during the review.

The signed-in operator is a project Owner and inherits Organization
Administrator from the organization. The earlier Compute Engine security-panel
warning was not evidence of a missing IAM grant.

The pre-existing `default` VPC is an auto-mode network with 42 subnets, MTU
1460, and four ingress rules. Those rules apply to all targets and allow ICMP,
SSH (TCP 22), and RDP (TCP 3389) from `0.0.0.0/0`, plus all TCP/UDP ports and
ICMP from `10.128.0.0/9`. It is not an approved seed network. Leave it unused
and unchanged unless the owner separately approves cleanup. Seed A instead
uses a dedicated custom-mode VPC with one `us-east1` subnet.

Inherited organization policies do not currently restrict Google Cloud
resource locations or external IPv4 addresses for VM instances. Service
account key creation is blocked and Compute Engine preview features are
disabled; the deployment must preserve those useful guardrails by using an
attached least-privilege service account without downloadable keys and only
generally available features.

Quota verification on 2026-08-03 found the following in Toronto
(`northamerica-northeast2`), all at zero usage:

| Allocation | Available quota |
| --- | ---: |
| Standard CPUs | 100 |
| Standard persistent disk | 4,096 GB |
| SSD persistent disk | 500 GB |
| In-use regional external IPv4 addresses | 8 |
| Static regional external IPv4 addresses | 8 |

Toronto had sufficient quota, but the readiness review did not select it for
the cost-controlled pilot. The review initially evaluated `us-central1`; the
final deployment selected `us-east1-b`. Operators must compare the live
configuration with the current
[Free Tier limits](https://docs.cloud.google.com/free/docs/free-cloud-features)
and billing report rather than assuming the pilot has no cost.

The `us-central1` spot-check on 2026-08-03 also found zero usage and sufficient
headroom:

| Allocation | Available quota |
| --- | ---: |
| Standard CPUs | 200 |
| Standard persistent disk | 4,096 GB |
| SSD persistent disk | 500 GB |
| In-use regional external IPv4 addresses | 8 |
| Static regional external IPv4 addresses | 8 |

The deployed pilot shape is one non-preemptible `e2-micro` in `us-east1-b`, a
10 GB `pd-standard` boot disk, a separate 20 GB `pd-standard` data disk, and one
regional static IPv4 allocated and attached during the deployment window. Use
the existing DNS provider instead of Cloud DNS.

This VM is a seed/producer coordinator, not an Ollama inference worker. The
current local models load at 6.73 GB and 9.43 GB, so neither can run in the
`e2-micro`'s 1 GB memory. A local startup probe of the producer process used
55.8 MiB working set and 38.0 MiB private memory after eight seconds. That is
enough evidence to start a monitored micro pilot, but not a soak result: resize
to `e2-small` if sustained memory exceeds 70%, the process swaps, event-loop
latency grows, or peer/height progress becomes unstable.

Current Google pricing lists an in-use external IPv4 address at USD 0.005/hour
(about USD 3.65 for a 730-hour month). With the VM, 30 GB standard disk, and
limited outbound transfer inside published Free Tier limits, this is the
baseline recurring charge before snapshots, excess transfer, taxes, and
currency conversion. Regional snapshot storage is usage-based, so keep a
short retention window and review the first bill before expanding it. An
unused reserved address costs more, so release it with the VM if the pilot is
removed. See Google's [VPC pricing](https://cloud.google.com/vpc/network-pricing)
and [disk and snapshot pricing](https://cloud.google.com/compute/disks-image-pricing).
Cloud DNS has no free tier; prefer an already-controlled DNS provider unless
its independence requirements dictate otherwise.

The free-trial account is not a durable operations state: if the trial expires
without a paid-account upgrade, Google stops trial resources. Any later billing
upgrade requires separate owner approval even if the selected VM remains inside
monthly Free Tier usage.

The operating record should retain the evidence captured for these deployment
controls:

1. capacity in the selected `us-east1-b` zone and the console's current
   estimate immediately before creation;
2. any change to the recommended seven-daily-snapshot retention, limited
   transfer, or low-volume monitoring/log plan;
3. the free-trial expiry/paid-upgrade decision and recovery plan;
4. the deployment window and owner approval for the live billable resources;
   and
5. Fly.io as Seed B's independent provider, Toronto (`yyz`) as its region, and
   the approved shared CPU, 512 MB RAM, and 10 GB encrypted-volume footprint.

## Two-seed topology

The two public seeds must not share an operator account, provider control
plane, region, DNS failure domain, or backup destination.

| Responsibility | Seed A | Seed B |
| --- | --- | --- |
| Hosting | Google Cloud Compute Engine | Independent provider or operator |
| Consensus role | Designated producer | Validator/back-checker; no `--produce` |
| Public endpoint | TLS/WSS ingress on TCP 443 | TLS/WSS ingress on TCP 443 |
| Node transport | Loopback/private `ws://...:19444` behind ingress | Same |
| Status endpoint | Loopback `http://127.0.0.1:7777/status` | Same |
| Storage | Dedicated persistent data disk | Provider-independent persistent disk |
| Bootstrap | Seed B plus its own persisted peer state | Seed A plus its own persisted peer state |

Each seed advertises only its public `wss://` DNS name. TLS terminates at a
small reverse proxy that supports WebSocket upgrades and forwards to the node
transport on loopback or a private container network. The status service stays
on loopback and is read through an authenticated monitoring path.

The Google Cloud seed uses a custom-mode VPC with one regional subnet. Its
public firewall permits only TCP 443 to the seed target. Administration uses
OS Login through Identity-Aware Proxy, with SSH limited to Google's IAP
forwarding range instead of `0.0.0.0/0`; the VM receives no downloadable
service-account key. TCP 19444, TCP 7777, RDP, Docker control sockets, and
cloud metadata endpoints are never public. Each host has independent DNS and
certificates so one provider failure cannot remove both bootstrap paths.

## Data, monitoring, and recovery

Each seed uses a dedicated versioned data volume and follows
`packages/jgc-node/docs/STORAGE-RECOVERY.md`. Backups are encrypted, stored in a
different failure domain, and tested by restoring to a disposable replacement.
An operator must be able to rebuild either seed without copying secrets from
the surviving host.

For the pilot, snapshot only the 20 GB data disk once per day and retain seven
daily snapshots. Keep routine success/access logs out of Cloud Logging, retain
application warnings and errors for 14 days, and use a five-minute public WSS
uptime check. Review snapshot bytes, outbound transfer, logging ingestion, and
the billing report after the first 24 hours and again before the first full
billing month. Expand retention only after that evidence is reviewed.

Monitoring must alert on:

- endpoint and process availability;
- chain height and divergence between seeds;
- peer count, repeated bans, and malformed-traffic errors;
- designated-producer health;
- disk utilization, I/O errors, and checksum/corruption failures; and
- certificate expiry and backup/restore freshness.

Recovery is replace-not-repair: quarantine the failed data volume, preserve
logs and checksums, create a fresh host from pinned configuration, restore only
a verified compatible backup or resync from the surviving seed, then validate
network identity and height before returning the endpoint to service.

## Remaining controls

Before either seed is materially changed, the owner must approve the applicable
items from a current console or pricing estimate:

- Google Cloud region, machine type, disk class/size, and monthly estimate;
- Fly.io region, machine type, volume size, and monthly estimate for Seed B;
- the two public DNS names and certificate ownership;
- the least-privilege administrator and monitoring identities; and
- the first deployment window and rollback owner.

The CA$25 Google Cloud budget alert is retained as an early warning. It must not
be represented as a hard cap or as approval to create billable resources.
