# Public Seed Deployment Gate

**Status:** Design approved for planning; provisioning is blocked pending quota
and permission verification. No cloud compute, disk, address, DNS, firewall, or
API resources have been created.

This runbook defines the minimum safe two-seed shape for `jgc-testnet-v3`. It
does not authorize spending or a live deployment.

## Google Cloud readiness snapshot

Reviewed 2026-08-03:

- the intended project is signed in and linked to the owner's free-trial
  billing account;
- a CA$25 monthly budget alert is active (an alert, not a spending cap);
- Compute Engine is initialized and the project contains no VMs, instance
  groups, disks, snapshots, images, or reservations;
- the project currently reports no Compute Engine usage or cost; and
- no VM, persistent disk, reserved address, DNS record, firewall rule, paid
  account upgrade, or additional API was created during the review.

The review could not verify regional CPU quota, persistent-disk quota, static
address quota, or the full security posture. The Console's quota view did not
finish loading, and a Compute Engine security panel reported missing read
permissions, including instance, region, quota, and monitoring access. Treat
this as a hard provisioning gate rather than evidence that capacity exists.

Before provisioning, an operator with the appropriate read access must capture
and review:

1. the proposed region and zone;
2. regional vCPU quota for the selected machine family;
3. persistent-disk capacity and snapshot availability;
4. regional static external IPv4 availability;
5. the exact recurring estimate, including VM, disk, snapshots, address, data
   transfer, DNS, and monitoring; and
6. the IAM path for administration without opening SSH to the internet.

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
