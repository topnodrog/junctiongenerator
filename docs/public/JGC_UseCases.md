# Use cases and evidence boundaries

Updated 2026-09-05 UTC. Document owner: James Gordon.

These are research directions, not customer case studies or deployed commercial
services. The current public pilot records signed testnet participation using
valueless JGTC. Production inference proofs and economic enforcement remain open.

| Direction | What could be evaluated | What the current project establishes |
|---|---|---|
| Reproducible local AI work | Compare inference and reference replay under a pinned execution profile. | Local implementation and tests; broad cross-hardware agreement still needs evidence. |
| Auditable work records | Preserve claimed work and independent signed audit verdicts through synchronization, restart, and reorganization. | Consensus-committed evidence paths and automated tests; receipt authenticity alone does not prove useful computation. |
| Operator reliability | Measure participation, settlement accounting, seed convergence, and recovery across real machines. | A public pilot, runner release, explorer, and evidence tools; the measured soak remains pending. |
| Future verification services | Investigate whether bounded proof systems can support useful application workloads. | Research only; no enterprise deployment, revenue, compliance certification, or customer outcome is claimed. |

A proof of execution would not by itself establish that input data is true,
an investment return is attainable, a medical decision is appropriate, or a
bridge or contract is safe. Application correctness and domain requirements
need their own specifications and review.

Older drafts claimed a 50-validator pilot, sub-two-second inference, automatic
slashing, and enterprise readiness. Those results are unsupported by the
reviewed evidence and are withdrawn from current public materials.

Use [the live explorer](https://junctiongenerator.net/testnet) for current pilot
state and [the next-steps plan](../NEXT_STEPS_PLAN.md) for acceptance criteria.
