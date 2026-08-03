---
name: local-model-operations-boundary
description: "Approved role and limits for a local model in JGC public-testnet operations"
metadata:
  node_type: memory
  type: decision
  originSessionId: 019fb460-5a72-7b72-bcb1-d403bd4499bf
---

# Local model for deployment and operations

Decision updated 2026-08-03: the installed gemma4:e2b and gemma4:e4b models
were evaluated on the owner's Windows machine. Neither passed the JGC operations
safety gate.

The models may assist only with sanitized, non-authoritative drafts and
summaries. They missed required approval boundaries, configuration hazards, and
incident diagnostics. The larger model improved the explicit recovery answer
but was too slow on CPU-only inference and still missed material issues. Full
measurements and failure modes are in docs/LOCAL_MODEL_BENCHMARK.md.

No installed model is approved to receive production secrets, approve or verify
live changes, or make destructive, recovery, failover, firewall, DNS, or
spending decisions. Live infrastructure writes remain gated by explicit tools,
credentials, diffs, deterministic checks, and human verification.

It does not replace two publicly reachable persistent seed hosts, separate
failure domains, durable disks, DNS/TLS, monitoring, encrypted backups, or the
multi-day soak. Hosting a seed from the owner's laptop is not the planned
public-testnet architecture.

Google Cloud is the planned provider for the first seed. Confirm quota, billing
safeguards, region, static address, and persistent disk before provisioning.
Select a separate provider or independently operated failure domain for the
second seed unless the owner approves a temporary two-zone pilot.
