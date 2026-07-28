# JGC Layer-2 Enablement — Design Options

**Status:** Draft for review, implementation-aligned 2026-07-23 · **Scope:**
design only, no L2 consensus changes
**Audience:** JGC protocol engineering
**Prerequisite reading:** `src/types/index.ts` (core types),
`src/consensus/validation.ts` (validation pipeline), `src/crypto/compute-proof.ts`
(portable proof dispatch), and `docs/QUANTUM-READY.md`

> The hash/Merkle receipt is simulation-only. Groth16 can prove limited
> registered kernels but is not post-quantum. Any production L2 design requires
> a sound, independently reviewed proof system.

---

## 1. Background & framing

### 1.1 What JGC is

JGC is a **sovereign Layer 1**: it has its own consensus mechanism
(Proof-of-Useful-Compute), its own genesis block and emission schedule
(`src/consensus/emission.ts`, 21M hard cap), its own P2P network
(`src/network/node.ts`), and its own UTXO ledger (`src/types/index.ts`).
Nothing in the protocol depends on another chain for security or settlement.

### 1.2 What "Ethereum as an L2" would actually mean

Ethereum is itself a Layer 1 and will never re-anchor onto another chain.
The layering only runs one direction: **new L2 protocols are built that derive
security from an existing L1**. Arbitrum and Base are L2s *of Ethereum*; they
publish data to Ethereum, settle proofs on Ethereum, and bridge through
Ethereum contracts.

The meaningful design question for JGC is therefore:

> **Can a new L2 — including an EVM-compatible one — be built on top of JGC,
> deriving its security from JGC consensus?**

### 1.3 What an L1 must provide to host a true L2

An L2 inherits L1 security if and only if the L1 enforces three things:

| Requirement | Ethereum's mechanism | What it guarantees |
|---|---|---|
| **(a) Data availability** | calldata / EIP-4844 blobs | Anyone can reconstruct L2 state from L1 data alone |
| **(b) Proof verification** | Rollup contract verifies validity proofs (ZK) or adjudicates fraud proofs (optimistic) | Invalid L2 state transitions cannot finalize |
| **(c) Enforceable bridge** | Lock/mint + exit logic in an L1 contract | Users can always exit to L1 without the L2 operator's cooperation |

A construction missing any of (a)–(c) is a **sidechain**, not an L2 — its
users trust an external operator or federation, not JGC consensus.

---

## 2. Current capability inventory

### 2.1 What JGC already has that an L2 needs

**Post-quantum proof-verification seam.**
JGC already verifies hash-based transparent PoUC proofs inside consensus:

- `src/crypto/pq-zkp.ts` implements the current proof format and
  `PQ_CIRCUIT_REGISTRY`.
- `src/crypto/pq.ts` exposes `quantumVerifyProofForConsensus()` and the
  batch-verification facade used by consensus.

That is a useful integration pattern, but it is **not** a ready-made L2 state
transition verifier. The current Merkle-IOP is sized for bounded PoUC claims;
hosting a validity rollup requires a production-scale post-quantum proof system,
new public inputs, resource limits, and external cryptographic review.

**Header extension points.**
The 192-byte header (`src/consensus/block.ts`, `serializeBlockHeader()`)
already carries three non-Bitcoin Merkle roots (`computeRoot`, `epochRoot`,
and `auditRoot`) plus a 4-byte `reserved` field. Adding a fourth commitment root for L2 data
follows an established pattern rather than inventing one.

**Enshrined special-transaction precedent.**
JGC already validates a protocol-defined transaction without any VM: the
epoch settlement coinbase. `validateBlock()` step 6
(`src/consensus/validation.ts`) recomputes the expected settlement via
`computeEpochSettlement()` (`src/consensus/epoch.ts`) and rejects blocks whose
coinbase outputs deviate. An enshrined L2 settlement transaction would be
validated the same way — by recomputation, not by script execution.

**A compute marketplace that wants proving jobs.**
`src/broker/compute-broker.ts` routes idle TFLOPS to bidders
(JG cluster → commercial → scientific fallback). **ZK proof generation is
itself useful compute**: an L2 sequencer needing a state-transition proof is
a natural `COMMERCIAL` (or dedicated) task type. This is a JGC-specific
synergy no other L1 has — the same miners securing the chain can be paid to
prove the rollups settling on it (see §6).

### 2.2 What is missing (the gaps)

| Gap | Evidence in code | Blocks requirement |
|---|---|---|
| No script interpreter — `scriptSig`/`scriptPubKey` are unvalidated hex | `JGCNode.handleTransaction()` in `src/network/node.ts`: "production: full UTXO script validation"; no script engine module exists | (c) bridge enforcement |
| No covenants / output-spending constraints | UTXO types in `src/types/index.ts` carry raw script strings only | (c) |
| No DA commitment or fee market for L2 data bytes | Header has no DA root; `calculateBlockFees()` in `src/network/node.ts` returns `0n` (fee plumbing is stubbed) | (a) |
| No L2 message types in P2P | `MessageType` enum (`src/types/index.ts`) covers blocks/txs/proofs/bids only | (a) data gossip |
| No production-scale post-quantum L2 state-transition proof verifier | Current `pq-zkp.ts` is a bounded PoUC proof skeleton; legacy Groth16 is not live consensus | (b) |

---

## 3. Option A — Enshrined post-quantum validity settlement *(recommended research direction)*

A Bitcoin-philosophy answer with an Ethereum-grade result: instead of a
general-purpose VM, the protocol defines **one new special transaction type**
that consensus validates by recomputation — exactly like the epoch settlement
coinbase—using a future production-scale, post-quantum validity-proof verifier.

### 3.1 Components

**1. L2 proof family in the registry.**
Register a future `PQ_CIRCUIT_L2_STATE_TRANSITION_V1` in
`PQ_CIRCUIT_REGISTRY` with public
inputs `[prevStateRoot, newStateRoot, daCommitment, withdrawalsRoot]`.
Activation must be bound to consensus height and immutable proof parameters.
The proof system and circuit itself (a post-quantum zkVM if EVM compatibility
is the goal, or a simpler custom L2 VM) are external research dependencies—see
§3.4.

**2. Settlement transaction.**
A protocol-defined tx (mirroring the coinbase convention: no script
execution) carrying `{ rollupId, prevStateRoot, newStateRoot, daCommitment,
withdrawalsRoot, proofBytes }`. Validation slots in as a new step in
`validateBlock()`:

- `prevStateRoot` must equal the rollup's last finalized root (per-rollup
  state tracked in `ChainState`, alongside the existing epoch state).
- Proof verified through a new consensus method behind the post-quantum
  facade. It may reuse the existing verifier interface, but must not silently
  fall back to the legacy Groth16 path.

**3. Data availability.**
- Blocks gain an `l2Data` section; the header's 4-byte `reserved` field is
  replaced by (or supplemented with) a 32-byte `daRoot` committing to it —
  a header format change, i.e. a hard fork, which is why it should ship in
  the same upgrade as the settlement tx.
- The settlement proof's `daCommitment` must match the data actually carried,
  so a block cannot finalize an L2 root whose data was withheld.
- Fee policy: price L2 data per byte in JGC satoshis (requires finishing the
  fee plumbing — `calculateBlockFees()` is currently a stub).

**4. Bridge.**
- **Deposits:** a deposit output type locks JGC under a rollup ID; the L2
  circuit is obligated to mint correspondingly (deposits are public inputs).
- **Exits:** a withdrawal tx spends bridge-locked value by presenting a
  Merkle proof against the `withdrawalsRoot` of a finalized settlement —
  verifiable with the existing `verifyMerkleProof()` (`src/crypto/merkle.ts`).
  No operator cooperation needed: requirement (c) satisfied.

### 3.2 Security model

The target is full L1 security via validity proofs: if the reviewed proof
system verifies and data is available, an invalid state transition cannot
finalize under its security assumptions. This guarantee does not exist until
the L2 proof verifier, data-availability rules, and bridge are implemented and
audited.

### 3.3 Cost

The largest consensus diff of the three options: a new proof verifier and
transaction type, header change, per-rollup chain state, DA gossip, and fee
rules. JGC has reusable verifier and enshrined-transaction interfaces, but the
production-scale L2 proof system remains a major new security component.

### 3.4 External dependency

The L2 VM circuit. For EVM compatibility, a zkEVM proving stack is a major
external dependency (multi-year efforts elsewhere). De-risk by making the
settlement layer **circuit-agnostic** (any registered circuit family) and
launching first with a minimal payment-VM circuit; zkEVM becomes a later
registry addition, not a protocol change.

---

## 4. Option B — General script layer with a post-quantum proof-verify opcode

Implement the deferred script interpreter (P2PKH/P2WPKH validation is already
a production TODO), then extend it with covenant opcodes and an
`OP_PQ_PROOF_VERIFY` that exposes a resource-bounded, post-quantum verifier to
user scripts. Rollup
bridges become **user-space constructions** (BitVM-style or covenant-based),
permissionlessly deployable without further protocol changes.

- **Pros:** maximal generality; one protocol change enables many L2 designs;
  no per-rollup state in consensus.
- **Cons:** the largest *security surface* of any option—a script VM with
  proof-verification opcodes and covenants is far harder to bound than one
  protocol-defined transaction validated by recomputation. Bridge UX and
  exit guarantees built from covenants are research-grade, not
  engineering-grade. Fee/DoS pricing for script-level pairing ops needs its
  own design (Ethereum's precompile gas pricing is the cautionary tale).
- **Verdict:** the right *long-term* direction for programmability, wrong
  first move for L2 settlement. Note Option A does not preclude it.

---

## 5. Option C — Federated / SPV sidechain bridge

A separate chain (e.g. an EVM chain) pegged to JGC via a multisig federation
or SPV light-client bridge. Near-zero JGC consensus changes.

- **Pros:** shippable in weeks; immediate EVM compatibility via any existing
  EVM client.
- **Cons:** **not an L2.** Users trust the federation, not JGC consensus —
  none of requirements (a)–(c) are enforced by JGC. Every major federated
  peg in production has been the weakest link of its ecosystem.
- **Verdict:** acceptable only as an explicitly-labeled interim testbed for
  EVM tooling while Option A is built. Must not be marketed as an L2.

---

## 6. The PoUC synergy: a native proving market

Unique to JGC: the consensus workforce is already a general compute market.

- L2 sequencers post proving jobs as broker bids
  (`ComputeBroker.submitBid()`, `src/broker/compute-broker.ts`) — either as
  `COMMERCIAL` tasks or a dedicated `L2_PROVING` task type.
- Miners' proving work is attested the same way all PoUC work is (ZK proof of
  the computation), and paid per the broker's price-ranked allocation.
- Result: rollups settling on JGC get a **decentralized, permissionless
  prover market** as a protocol-adjacent service — on Ethereum this is being
  rebuilt from scratch by third parties.

**Open cryptoeconomic question (flagged for decision, §8):** should L2
proving TFLOPS *also* count toward PoUC consensus weight (epoch settlement
shares), or remain broker-side revenue only? Counting it doubles incentives
for proving but couples L2 demand to consensus security in both directions
(good: demand subsidizes security; bad: an L2 demand crash drops effective
network TFLOPS and difficulty).

---

## 7. Comparison & recommendation

| | A — Enshrined PQ validity settlement | B — Script + PQ-proof opcode | C — Federated sidechain |
|---|---|---|---|
| Security inherited from JGC | **Full (validity proofs)** | Full, if covenant bridges proven sound | None (federation trust) |
| Consensus diff size | Large but bounded | Largest (script VM) | ~None |
| Security surface added | One tx type, validated by recomputation | Entire script VM + opcode pricing | Bridge keys (off-protocol) |
| EVM-compatibility path | zkEVM circuit in registry | User-space (research-grade) | Immediate (but trusted) |
| Reuses existing code | Verifier interface, registry pattern, enshrined-tx pattern, Merkle proofs | Verifier interface (via opcode) | Almost nothing |
| Time to ship | Quarters | Year+ | Weeks |

**Recommendation: Option A**, phased:

- **Phase 0 — Hardening (prerequisite, independently necessary):**
  finish public-network gates, implement UTXO script validation and real fee
  accounting, specify a production-scale post-quantum L2 proof system, and
  obtain external cryptographic review.
- **Phase 1 — DA:** `l2Data` block section, `daRoot` header commitment,
  per-byte fee policy, P2P gossip messages.
- **Phase 2 — Settlement:** per-rollup chain state, enshrined settlement tx
  + deposit/exit outputs, `PQ_CIRCUIT_L2_STATE_TRANSITION_V1` registry entry,
  validation step in `validateBlock()`.
- **Phase 3 — Ecosystem:** broker-routed proving market (`L2_PROVING` task
  type); zkEVM circuit family for EVM compatibility.
- *(Optional interim)*: an explicitly-labeled Option-C sidechain as an EVM
  tooling testbed — never marketed as an L2.

---

## 8. Open questions (decisions needed before Phase 1)

1. **DA pricing:** flat satoshis/byte, or a target-utilization adjusting fee
   (EIP-4844-style)? Interacts with the stubbed fee plumbing.
2. **Proof-parameter governance:** define how immutable post-quantum proof
   parameters activate at a height, how upgrades are reviewed, and how old
   proof families retire. L2 registration inherits that process.
3. **Proving TFLOPS and consensus weight:** count broker-routed L2 proving
   toward epoch settlement shares, or keep it revenue-only? (§6.)
4. **Per-rollup limits:** max rollups, max settlement frequency, max DA bytes
   per block — DoS bounds for the new validation step.
5. **Withdrawal latency:** settle-on-inclusion (every settlement tx final
   when its block is buried N deep) vs. an additional finality delay.
