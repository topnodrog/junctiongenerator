---
name: local-model-operations-boundary
description: "Approved role and limits for a local model in JGC public-testnet operations"
metadata:
  node_type: memory
  type: decision
  originSessionId: 019fb460-5a72-7b72-bcb1-d403bd4499bf
---

# Local model for deployment and operations

Decision recorded 2026-07-31: evaluate a local model on the owner's Windows
machine as the next public-testnet-readiness task.

The model may assist with repository-aware infrastructure drafts, configuration
review, local validation, monitoring summaries, runbook lookup, and incident
triage. Benchmark it on a representative Phase 3 task and record the model,
quantization, memory use, speed, output quality, and failure modes.

The model is advisory. It must not receive production secrets in prompts,
approve its own live changes, or make destructive/recovery decisions without a
human-reviewed plan. Live infrastructure writes remain gated by explicit tools,
credentials, diffs, and verification.

It does not replace two publicly reachable persistent seed hosts, separate
failure domains, durable disks, DNS/TLS, monitoring, encrypted backups, or the
multi-day soak. Hosting a seed from the owner's laptop is not the planned
public-testnet architecture.

Google Cloud is the planned provider for the first seed. Confirm quota, billing
safeguards, region, static address, and persistent disk before provisioning.
Select a separate provider or independently operated failure domain for the
second seed unless the owner approves a temporary two-zone pilot.
