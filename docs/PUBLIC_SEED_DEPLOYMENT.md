# Public Seed Deployment Gate

**Status:** Design approved for planning; Compute Engine readiness is verified.
Provisioning remains blocked pending the final region/zone, cost, network, DNS,
and deployment approvals. No VM, disk, reserved address, DNS record, or paid
account upgrade has been created.

This runbook defines the minimum safe two-seed shape for `jgc-testnet-v3`. It
does not authorize spending or a live deployment.

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

The quota dashboard reports an existing default-network footprint: one VPC
network, one firewall-rule unit, one static route, and two subnetwork ranges.
Its origin and exact rule contents were not established during this review.
Treat it as pre-existing project state, not as an approved seed network; inspect
it and prefer a dedicated least-privilege VPC before provisioning.

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

Toronto has sufficient quota, but it is not eligible for Google's current
Compute Engine Always Free VM allowance. The cost-controlled candidate is
`us-central1` (Iowa): one non-preemptible `e2-micro`, 30 GB-months of standard
persistent disk, and limited outbound transfer can fall within the published
[Free Tier limits](https://docs.cloud.google.com/free/docs/free-cloud-features).
Before provisioning, spot-check the same allocations in `us-central1`, choose
a zone, and capture an exact current estimate.

Current Google pricing lists an in-use external IPv4 address at USD 0.005/hour
(about USD 3.65 for a 730-hour month). Budget for that charge unless the live
estimate shows a project-specific credit. An unused reserved address costs
more, so do not reserve one ahead of the deployment window. See Google's
[VPC pricing](https://cloud.google.com/vpc/network-pricing). Cloud DNS has no
free tier; prefer an already-controlled DNS provider unless its independence
requirements dictate otherwise.

The free-trial account is not a durable operations state: if the trial expires
without a paid-account upgrade, Google stops trial resources. Any later billing
upgrade requires separate owner approval even if the selected VM remains inside
monthly Free Tier usage.

Before provisioning, the operator must still capture and review:

1. the final `us-central1` zone and a current quota spot-check;
2. the exact recurring estimate, including VM, disk, snapshots, address, data
   transfer, DNS, and monitoring;
3. the dedicated VPC/firewall design and disposition of the default network;
4. the IAM path for administration without opening SSH to the internet; and
5. the free-trial expiry/paid-upgrade decision and recovery plan.

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

The public firewall permits only TCP 443. Administration uses an identity-aware
or source-restricted path; TCP 19444, TCP 7777, Docker control sockets, and
cloud metadata endpoints are never public. Each host has independent DNS and
certificates so one provider failure cannot remove both bootstrap paths.

## Data, monitoring, and recovery

Each seed uses a dedicated versioned data volume and follows
`packages/jgc-node/docs/STORAGE-RECOVERY.md`. Backups are encrypted, stored in a
different failure domain, and tested by restoring to a disposable replacement.
An operator must be able to rebuild either seed without copying secrets from
the surviving host.

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

## Required approvals

Provisioning may begin only after the owner approves all of the following from
a current Console or pricing estimate:

- Google Cloud region, machine type, disk class/size, and monthly estimate;
- independent provider, region, machine type, and monthly estimate for Seed B;
- the two public DNS names and certificate ownership;
- the least-privilege administrator and monitoring identities; and
- the first deployment window and rollback owner.

The CA$25 Google Cloud budget alert is retained as an early warning. It must not
be represented as a hard cap or as approval to create billable resources.
