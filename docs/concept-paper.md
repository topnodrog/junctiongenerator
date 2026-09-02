# Junction Generator: Proof-of-Useful-Compute

**A Protocol for Redirecting Mining Compute to Real AI Workloads**

*Version 0.6 — Implementation-aligned draft, 2026-09-01*

> **Implementation status:** JGC currently runs as early, valueless testnet
> software. Independent Google Cloud and Fly.io public pilot seeds on the
> repaired `jgtc-testnet-v2` network have completed six zero-premine
> settlements with exact supply conservation; the independent multi-machine
> soak remains incomplete. Consensus V3
> commits delayed-beacon, ML-DSA-signed historical-audit
> evidence through `auditRoot`, uses portable canonical encodings and integer
> work weights, separates heterogeneous verification roles, and uses versioned,
> checksum-protected, network-bound persistent storage. Forty suites /
> 329 tests under Node.js 24, a 31-block two-node sync demo, and a bounded six-proof strict WASM
> run pass. Mandatory bonded-validator activation, economic rewards/slashing,
> the marketplace, and mainnet are not deployed. See the
> [node-runner guide](../packages/jgc-node/docs/RUN-A-NODE.md) for the supported
> pilot path and its limitations.

---

## Abstract

Proof-of-work spends computation to secure a ledger, while AI systems have
growing demand for useful compute. Junction Generator proposes
**Proof-of-Useful-Compute (PoUC)**, a protocol intended to connect useful AI
work with independently auditable consensus evidence. The current
implementation validates a narrower foundation: local inference contribution,
delayed historical sampling, signed quorum evidence, and block commitment.
Token rewards, broad workload support, marketplace economics, and environmental
impact remain hypotheses to validate rather than deployed results.

---

## 1. The Problem

### 1.1 Mining Compute Is Wasted at Massive Scale

Bitcoin's Proof-of-Work consensus requires miners to repeatedly compute SHA-256 hashes, searching for a nonce that produces a hash below a target threshold. This process is intentionally wasteful — the difficulty exists solely to limit block production speed, not to produce any useful output.

Before external publication, add current primary-source citations for energy
use, hardware economics, and the distinction between ledger security and
application-useful output. Those market figures are intentionally not frozen
into this implementation note.

The energy and hardware are real. The useful output is not.

### 1.2 AI Companies Are Desperate for Compute

The artificial-intelligence industry has substantial demand for training and
inference compute. Exact growth rates, GPU-hour prices, and capacity forecasts
change quickly and must be sourced when used externally.

Some general-purpose GPU capacity may be suitable for AI workloads; ASIC mining
hardware generally is not. Hardware compatibility, bandwidth, memory, latency,
and model licensing all constrain the addressable supply.

### 1.3 The Gap

On one side: billions of dollars in GPU hardware burning electricity to solve meaningless puzzles. On the other: companies willing to pay for the exact same hardware to do real work. Junction Generator bridges this gap.

---

## 2. The Solution: Proof-of-Useful-Compute

### 2.1 Core Concept

The target PoUC design replaces hash puzzles with auditable useful-work
completion. In the proposed full network, compute providers would:

1. **Receive AI workloads** from the JGC network (inference requests, training batches, fine-tuning tasks)
2. **Execute the workload** on their GPU hardware
3. **Submit the result** with signed execution evidence
4. **Earn $JGC tokens** under a consensus-owned reward policy

The local node already meters contributed inference and commits sampled audit
evidence. It does not yet activate the reward transition in step 4.

### 2.2 Workload Types

The long-term design considers several categories of AI workloads:

| Workload Type | Description | Typical Duration | GPU Requirements |
|---|---|---|---|
| **Inference** | Running trained models on new inputs | Milliseconds–seconds | Any CUDA GPU |
| **Batch Inference** | Processing large datasets through a model | Minutes–hours | Mid-range GPU |
| **Fine-Tuning** | Adapting a pre-trained model to specific data | Hours–days | High-VRAM GPU |
| **Distributed Training** | Splitting large training jobs across many GPUs | Days–weeks | Multi-GPU clusters |

The current Junctioning seam supports local inference. Batch inference,
fine-tuning, distributed training, and broad hardware eligibility require
additional protocol, reproducibility, scheduling, and security work.

### 2.3 Verification

The critical challenge of Proof-of-Useful-Compute is verification: how do you prove that a miner actually ran the workload correctly, rather than returning garbage data?

Consensus V3 currently implements:

1. **Contribution commitments**: blocks bind useful-work records to model, input,
   output, and execution metadata.
2. **Delayed historical sampling**: ten-block windows use a two-block-delayed
   chain hash so the audited contribution is not chosen from a proposer-controlled
   future value.
3. **Signed quorum observations**: assigned validators sign replay results with
   ML-DSA identities.
4. **Consensus commitment**: complete verdict evidence is summarized by
   `auditRoot`, then reverified during block validation, sync, restart, and reorg.

This provides tamper-evident evidence under the tested local conditions.
Execution profiles make incompatible replay hardware abstain instead of making
false fraud accusations, while portable proof verifiers can run independently
of the producer architecture. It does not yet provide a general post-quantum
proof for arbitrary AI inference, mandatory bonded-validator activation, or
economic security. Automatic slashing remains deliberately disabled.

---

## 3. Network Architecture

### 3.1 Participants

The proposed public JGC network has four participant roles:

- **Miners**: GPU operators who execute AI workloads and earn $JGC rewards
- **Compute Buyers**: AI companies that submit workloads and pay for compute
- **Validators**: Nodes that verify workload completion and maintain consensus
- **Stakers**: future $JGC holders who would bond tokens under the validator
  economics design

### 3.2 Target Workload Lifecycle

```
AI Company                  JGC Network                    Miner
    |                           |                            |
    |-- Submit Workload ------->|                            |
    |   (model, data, budget)   |                            |
    |                           |-- Route to Miner(s) ------>|
    |                           |   (based on GPU match)     |
    |                           |                            |-- Execute on GPU
    |                           |                            |-- Generate proof
    |                           |<-- Submit Result + Proof --|
    |                           |                            |
    |                           |-- Verify (multi-layer) --->|
    |                           |                            |
    |<-- Return Result ---------|-- Distribute $JGC -------->|
    |                           |                            |
```

### 3.3 Workload Marketplace

The roadmap includes a decentralized marketplace where:

- **AI companies** post workloads with compute requirements, deadlines, and budgets
- **Miners** bid on workloads they can fulfill based on their hardware capabilities
- **Pricing** is determined by market dynamics — supply of compute vs. demand for workloads
- **SLAs** could be enforced through future consensus-owned bonds and penalties

The marketplace and any cost advantage remain unvalidated. Pricing claims
require measured pilots against comparable cloud hardware, workload, support,
availability, and data-transfer costs.

---

## 4. Token Economics ($JGC)

### 4.1 Utility

$JGC is intended to serve multiple roles:

- **Mining Rewards**: Compute providers could earn $JGC for verified workloads
- **Compute Payment**: Buyers could purchase compute using $JGC
- **Staking**: Validators and delegators could bond $JGC under a
  consensus-owned policy
- **Governance**: A future governance design may coordinate protocol parameters
- **OSCRP Rewards**: A future contributor program may distribute $JGC

None of these reward, staking, governance, or contributor-payment transitions
is active in the current local testnet.

### 4.2 Supply

The following supply mechanics are design candidates, not active policy:

- **Mining Rewards**: Emitted per block, proportional to useful compute completed
- **Halving Schedule**: Block rewards decrease over time, similar to Bitcoin, but triggered by total useful compute milestones rather than block count
- **Burn Mechanism**: A percentage of compute marketplace fees is burned, creating deflationary pressure as network usage grows

Detailed tokenomics require a separate specification, simulations, security
review, and community review before activation.

---

## 5. OSCRP — Open-Source Contributor Reward Protocol

### 5.1 Motivation

Junction Generator is an open-source project. OSCRP is a proposal intended to
let contributors—not just investors—share in the network's success. No
automatic JGC or equity payout is active.

### 5.2 How It Works

Under the proposed design, when a qualifying contribution is merged:

1. **Impact Assessment**: The contribution is scored based on scope, complexity, and criticality (documentation fix vs. security patch vs. core protocol implementation)
2. **Immediate Reward**: The contributor receives an immediate $JGC payout proportional to their impact score
3. **Autonomy Equity (AE)**: The contributor also receives a stake in the protocol's treasury — a non-voting claim that appreciates as the network grows
4. **Vesting**: AE stakes vest over time, incentivizing long-term participation

The legal form, valuation, eligibility rules, funding source, and on-chain
enforcement of OSCRP remain unresolved. “Autonomy Equity” must not be described
as issued equity or a guaranteed claim before those questions are settled.

---

## 6. Roadmap

| Phase | Status | Description |
|---|---|---|
| **1. Concept & architecture** | ✅ Complete | Core PoUC direction and sovereign-node architecture established. |
| **2. Local node foundation** | ✅ Complete | UTXO ledger, wallets, PoUC records, local inference seam, and safe loopback testnet. |
| **3. Consensus V3 portability and audit foundation** | ✅ Complete | Canonical encodings, integer work, execution profiles, delayed sampling, ML-DSA quorum evidence, `auditRoot`, bond-derived rosters, persistence, sync, and adversarial validation. |
| **4. Public-testnet deployment** | ✅ Live pilot | Frozen zero-premine JGTC identity, compatibility handshake, designated producer, 144-block settlement, container and CI, two-provider TLS/WSS seeds, explorer, and storage/recovery evidence are deployed; block 1 synchronized across three nodes. Native ARM CI and the multi-day soak remain. |
| **5. Marketplace and pilots** | ⬜ Planned | Buyer/provider scheduling, pricing, privacy, SLA design, and measured research pilots. |
| **6. Mainnet** | ⬜ Not scheduled | Requires successful public soak tests, audited economics, operations, governance, and security review. |

---

## 7. Why This Matters

The compute problem is real and urgent. AI companies are spending billions building private data centers because the existing compute supply is locked up in mining operations that produce no useful output. Meanwhile, GPU miners face declining profitability as competition increases and energy costs rise.

Junction Generator doesn't require new hardware. It doesn't require new infrastructure. It requires **a new consensus mechanism** — one that values useful work over wasted work.

The GPU hardware is already deployed. The AI demand is already there. Junction Generator connects them.

---

## 8. Get Involved

Junction Generator is open source and actively seeking contributors:

- **GitHub**: [github.com/junctiongenerator/junction-generator](https://github.com/junctiongenerator/junction-generator)
- **Developers**: See [CONTRIBUTING.md](../CONTRIBUTING.md) for how to start contributing
- **Miners**: Join the early miner waitlist to test the mining client
- **AI Companies**: Register interest as a compute buyer
- **Researchers**: Help formalize the Proof-of-Useful-Compute specification

Contributions are welcome, but no OSCRP reward is currently guaranteed or
automatically issued.

---

*This is a living document. We welcome feedback, critique, and contributions. Open an issue or submit a pull request to help improve it.*
