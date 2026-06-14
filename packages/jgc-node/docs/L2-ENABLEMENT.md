# JGC Layer-2 Enablement — Design Options

**Status:** Draft for review · **Scope:** design only, no consensus changes
**Audience:** JGC protocol engineering
**Prerequisite reading:** `src/types/index.ts` (core types), `src/consensus/validation.ts` (validation pipeline), `src/crypto/zkp.ts` (Groth16 verifier layer)

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

**Enshrined Groth16 verification (the headline asset).**
Unlike Bitcoin — where SNARK verification would require new opcodes — JGC
already runs Groth16 pairing checks *inside consensus* for PoUC:

- `src/crypto/zkp.ts` — `verifyComputeProof()` / `batchVerifyComputeProofs()`
  (batch path amortizes pairing cost ~3×), backed by the Rust verifier in
  `rust/src/zkp_verify.rs`.
- `CIRCUIT_REGISTRY` (`src/crypto/zkp.ts`) maps `circuitId → VerificationKey`
  with an `activeSinceHeight` field — an existing **governance activation
  path** for registering new circuit families without a hard-fork mechanism
  redesign. An L2 state-transition circuit is "just another circuit family"
  from the registry's perspective.

This is requirement **(b)** nearly for free: the most expensive and
security-critical component of a ZK-rollup host already exists and is already
consensus-critical code.

**Header extension points.**
The 160-byte header (`src/consensus/block.ts`, `serializeBlockHeader()`)
already carries two non-Bitcoin Merkle roots (`computeRoot`, `epochRoot`)
plus a 4-byte `reserved` field. Adding a third commitment root for L2 data
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
| Groth16 verifier currently falls back to an accept-all JS stub when `rust/pkg` is absent | `loadVerifierWasm()` in `src/crypto/zkp.ts` | (b) — must be build-mandatory before any L2 work |

---

## 3. Option A — Enshrined ZK-rollup settlement *(recommended)*

A Bitcoin-philosophy answer with an Ethereum-grade result: instead of a
general-purpose VM, the protocol defines **one new special transaction type**
that consensus validates by recomputation — exactly like the epoch settlement
coinbase — using the Groth16 machinery that already exists.

### 3.1 Components

**1. L2 circuit family in the registry.**
Register `CIRCUIT_L2_STATE_TRANSITION_V1` in `CIRCUIT_REGISTRY` with public
inputs `[prevStateRoot, newStateRoot, daCommitment, withdrawalsRoot]`.
Activation via the existing `activeSinceHeight` mechanism. The circuit itself
(a zkEVM if EVM compatibility is the goal, or a simpler custom L2 VM) is an
external dependency — see §3.4.

**2. Settlement transaction.**
A protocol-defined tx (mirroring the coinbase convention: no script
execution) carrying `{ rollupId, prevStateRoot, newStateRoot, daCommitment,
withdrawalsRoot, proofBytes }`. Validation slots in as a new step in
`validateBlock()`:

- `prevStateRoot` must equal the rollup's last finalized root (per-rollup
  state tracked in `ChainState`, alongside the existing epoch state).
- Proof verified through `batchVerifyComputeProofs()` — same code path as
  PoUC proofs, same batch amortization.

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

Full L1 security via validity proofs. No fraud-proof window, no challenge
games, no honest-minority assumption — if the proof verifies, the state root
is correct; if data is unavailable, the settlement is invalid. This is the
strongest L2 security class (ZK-rollup).

### 3.3 Cost

The largest consensus diff of the three options: new tx type, header change,
per-rollup chain state, DA gossip and fee rules. Mitigated by the fact that
the two hardest pieces (SNARK verification in consensus; enshrined-tx
validation pattern) already exist and are already tested in production paths.

### 3.4 External dependency

The L2 VM circuit. For EVM compatibility, a zkEVM proving stack is a major
external dependency (multi-year efforts elsewhere). De-risk by making the
settlement layer **circuit-agnostic** (any registered circuit family) and
launching first with a minimal payment-VM circuit; zkEVM becomes a later
registry addition, not a protocol change.

---

## 4. Option B — General script layer with a SNARK-verify opcode

Implement the deferred script interpreter (P2PKH/P2WPKH validation is already
a production TODO), then extend it with covenant opcodes and an
`OP_GROTH16_VERIFY` that exposes the Rust verifier to user scripts. Rollup
bridges become **user-space constructions** (BitVM-style or covenant-based),
permissionlessly deployable without further protocol changes.

- **Pros:** maximal generality; one protocol change enables many L2 designs;
  no per-rollup state in consensus.
- **Cons:** the largest *security surface* of any option — a script VM with
  pairing-check opcodes and covenants is far harder to bound than one
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

| | A — Enshrined ZK settlement | B — Script + SNARK opcode | C — Federated sidechain |
|---|---|---|---|
| Security inherited from JGC | **Full (validity proofs)** | Full, if covenant bridges proven sound | None (federation trust) |
| Consensus diff size | Large but bounded | Largest (script VM) | ~None |
| Security surface added | One tx type, validated by recomputation | Entire script VM + opcode pricing | Bridge keys (off-protocol) |
| EVM-compatibility path | zkEVM circuit in registry | User-space (research-grade) | Immediate (but trusted) |
| Reuses existing code | Verifier, registry, enshrined-tx pattern, Merkle proofs | Verifier (via opcode) | Almost nothing |
| Time to ship | Quarters | Year+ | Weeks |

**Recommendation: Option A**, phased:

- **Phase 0 — Hardening (prerequisite, independently necessary):**
  implement UTXO script validation and real fee accounting (both existing
  production TODOs in `src/network/node.ts`); make the Rust verifier build
  mandatory — remove the accept-all JS stub fallback outside test builds
  (`loadVerifierWasm()` in `src/crypto/zkp.ts`).
- **Phase 1 — DA:** `l2Data` block section, `daRoot` header commitment,
  per-byte fee policy, P2P gossip messages.
- **Phase 2 — Settlement:** per-rollup chain state, enshrined settlement tx
  + deposit/exit outputs, `CIRCUIT_L2_STATE_TRANSITION_V1` registry entry,
  validation step in `validateBlock()`.
- **Phase 3 — Ecosystem:** broker-routed proving market (`L2_PROVING` task
  type); zkEVM circuit family for EVM compatibility.
- *(Optional interim)*: an explicitly-labeled Option-C sidechain as an EVM
  tooling testbed — never marketed as an L2.

---

## 8. Open questions (decisions needed before Phase 1)

1. **DA pricing:** flat satoshis/byte, or a target-utilization adjusting fee
   (EIP-4844-style)? Interacts with the stubbed fee plumbing.
2. **Circuit governance:** `activeSinceHeight` exists, but the process that
   sets it (foundation multisig → on-chain votes per the comment in
   `src/crypto/zkp.ts`) is unspecified. L2 VK registration inherits whatever
   is decided.
3. **Proving TFLOPS and consensus weight:** count broker-routed L2 proving
   toward epoch settlement shares, or keep it revenue-only? (§6.)
4. **Per-rollup limits:** max rollups, max settlement frequency, max DA bytes
   per block — DoS bounds for the new validation step.
5. **Withdrawal latency:** settle-on-inclusion (every settlement tx final
   when its block is buried N deep) vs. an additional finality delay.
