# JGC completion plan

Updated 2026-09-11. Product direction: a semi-private, quantum-ready blockchain
that rewards useful compute, inference and storage in JGC. Network resources
serve a central intelligence and free-at-point-of-use inference. That
intelligence should ultimately administer the project under explicit protocol
authority and accountable upgrades.

## What is real today

The node has ML-DSA signatures, UTXO accounting, epoch settlement, persistence,
networking, bounded proof demonstrations and a designated-producer testnet.
The pilot pays valueless JGTC for signed presence receipts. It does not yet
prove useful work. Existing increasing work thresholds are consensus policy,
not evidence of a completed useful-resource market. Do not change the running
pilot's retarget rules without a new network version.

Local inference execution and the compute broker are prototypes. The broker's
completion path currently queues submitted proof objects without verifying
them; no production payout adapter should consume that queue. Storage service
contracts, proof of continuing availability and reward settlement are absent.
AI inference is not equivalent to authorized governance. Historical model
evaluations did not pass the operations safety gate.

The stealth V1 prototype exposed spending keys to public-key observers. V2
repairs that specific defect with ML-KEM but remains experimental: the sender
also knows its spending key. The chain has no shielded note pool. Full privacy
and post-quantum security must be independently reviewed before activation.

## Delivery order and acceptance evidence

1. **Reliable testnet foundation.** Repair failing CI, complete measured soak
   evidence including restart/seed-loss recovery and three settlements, and
   preserve the distinction between owner-operated hosts and independent
   operators. Pass the supported-platform, container and release-bundle checks.
2. **Assigned useful work.** Persist jobs and leases with network, epoch, miner,
   program/model digest, input/output commitments, deadline and resource units.
   Enforce verifier results before payment eligibility. Test forged results,
   duplicate claims, reassignment, restart, and replay across jobs and networks.
   Begin with one bounded deterministic computation; general LLM correctness
   and answer quality are separate verification problems.
3. **Storage service.** Implement encrypted content-addressed objects, explicit
   retention contracts, unpredictable retrieval challenges, replication and
   repair. Verify continuing availability over time, not a one-time upload or
   a self-reported disk size. Test withheld/deleted data, colluding providers,
   recovery, privacy leakage and exactly-once funded payments.
4. **Free inference service.** Expose a queued API backed by eligible workers,
   with per-user limits, a bounded subsidy budget, overload handling and
   measurable latency. Free access consumes real resources; define how JGC
   issuance or service revenue funds it. Do not assume demand or token value
   makes unlimited inference sustainable. Pin execution profiles and identify
   when prompts leave the user's machine.
5. **Privacy and quantum security.** Design recipient-exclusive spending and
   separate viewing authority, encrypted notes, nullifiers and confidential
   value conservation. Select and review a post-quantum proof system and
   full-length address commitments. Integrate wallet backup/recovery and
   scanning with versioned consensus. V2 stealth is not this milestone.
6. **Permissionless consensus and resource economics.** Bind proposer identity
   into blocks, activate bonded membership, specify fork choice, challenge
   budgets and slash evidence, then connect verified service receipts to epoch
   rewards. Test cheap fabricated work, Sybil identities, censorship, resource
   monopolies and reorg accounting. Replace puzzle-style competition with
   assigned useful work only under an explicit versioned consensus design.
7. **Central intelligence governance.** Start with recorded proposals and
   evaluations. Give each executable action a defined scope, budget, expiry,
   authorization and rollback path. Protocol validation remains deterministic;
   model output cannot itself mint funds or change consensus. Test prompt
   injection, compromised models and emergency recovery before delegating
   operational authority. Broader authority requires an approved governance
   activation policy and auditable decisions.
8. **Release candidate.** Reproduce signed artifacts, commission external
   cryptographic/consensus and economic reviews, resolve findings, and repeat
   adversarial multi-operator rehearsals. All mainnet gates must pass with
   release-specific evidence before valuable JGC starts.

## Current implementation increment

- Replace public-data V1 stealth recovery with versioned ML-KEM decapsulation;
  add regression tests for stolen-key attempts, tampering and backup recovery.
- Require privacy, post-quantum security, useful services and governance in the
  fail-closed mainnet readiness record.
- Supply the two required synthetic participant addresses to the monitor's CI
  container; keep the monitor unarmed during its health test.

This increment repairs foundations. It does not constitute a finished chain,
a deployment of new consensus, a completed soak, or a mainnet launch.
