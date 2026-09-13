# Mainnet findings and todo

Updated 2026-09-13. Owner priorities: **Zcash-like payment privacy and
end-to-end quantum readiness are mandatory**, alongside verifiable useful work.
Treat Zcash-like as a privacy requirement, not a decision to copy a particular
cryptographic construction. No mainnet gate may be waived to accelerate launch.

## Findings from the current code

- **Payment privacy is incomplete.** `src/crypto/pq-stealth.ts` explicitly says
  amounts and spends remain public, the sender knows the spending seed, and
  the historically named viewing secret grants spending authority. This is not
  a shielded payment system. V2 repairs the prior public-key recovery defect
  but cannot satisfy `paymentPrivacy`.
- **Quantum readiness is incomplete.** ML-DSA signatures and experimental
  ML-KEM destinations exist, but the declared mainnet proof mode is still
  `strict-groth16-v1`. `src/crypto/pq-zkp.ts` explicitly identifies its hash/Merkle
  receipts as simulation-only and unable to prove computation. Wallet address
  commitments in `pq-signatures.ts` are truncated to 20 bytes. These boundaries
  must be resolved together, not hidden behind a quantum-ready label.
- **Bounded crypto claim audit completed.** Facade, signature, receipt and
  Groth16 headers now distinguish primitive behavior from system security.
  [Shielded payments V3 draft](SHIELDED_PAYMENTS_V3_DESIGN.md) records the
  authority model, transaction relation, migration and unresolved review choices.
  This is a design draft, not an accepted construction or completed gate.
- **Useful-work correctness now has worker authentication.** Key-assigned
  bounded vector jobs require persisted ML-DSA signatures. This is neither
  a funded service nor a proof of general inference correctness.
- **Peer authentication had connection replay gaps.** The prior node accepted
  the first signed message without challenge-response, and evicted replay-cache
  entries while their timestamps could remain acceptable. Connection challenges,
  sequence checks, handshake expiry and deferred discovery now pass acceptance
  tests; see [peer-authentication evidence](PEER_AUTHENTICATION.md).
- **Transport queues needed bounds.** Frame-size checks alone did not bound the
  serialized incoming backlog or outbound buffered bytes. Explicit queue limits
  pass adversarial tests with the session changes.
- **Deterministic consensus passes its engineering gate.**
  The candidate now uses exact proof thresholds, canonical equal-work fork
  ordering and complete restart validation. The audit also found and repaired
  snapshot trust, asynchronous state-application, inactive-parent orphan,
  compact-encoding and inner/outer receipt-accounting defects. Tests pin the
  settlement state across live execution and restart on the supported CI
  platforms. The published pilot's
  first-seen tie and retarget policy remains separate. See
  [the acceptance record](DETERMINISTIC_CONSENSUS.md) for evidence and limits.

Paths above are relative to `packages/jgc-node`. Gate status is authoritative in
`src/config/mainnet-readiness.ts`; in-progress work is not completed evidence.

## Prioritized todo and acceptance criteria

### 1. Privacy and quantum design blockers

Revision 0 requirements are recorded in [the V3 design](SHIELDED_PAYMENTS_V3_DESIGN.md).
The items below remain open until construction choices and review are complete.

- [ ] Specify shielded payments: hidden sender/recipient linkage and values,
  recipient-exclusive spending, separate incoming/full viewing authority,
  encrypted notes, commitments, nullifiers and confidential value conservation.
- [ ] Define wallet scanning, recovery, change, selective disclosure and reorg
  behavior; state which network metadata remains observable.
- [ ] Select a reviewed proof approach compatible with the quantum requirement;
  document assumptions, concrete parameters, soundness and zero-knowledge
  arguments, implementation maturity, proof sizes and verifier resource limits.
  Do not substitute unconstrained hash receipts for a proof system.
- [ ] Specify full-length address/key commitments and versioned migration, plus
  the security of transport confidentiality, backup encryption and upgrade keys.
- [ ] Implement the reviewed design behind a new protocol version; test sender
  theft, viewing-key theft, forged/inflationary spends, duplicate nullifiers,
  note tampering, malformed proofs, wallet recovery and adversarial reorgs.
- [ ] Remove stale privacy/proof/security claims from crypto comments and public
  material; distinguish implemented primitives from reviewed system security.
- [ ] Obtain external cryptographic review and resolve high/critical findings
  before marking either privacy or quantum readiness complete.

### 2. Finish a tractable engineering gate

- [x] Complete peer session tests: mutual handshake, unsigned/early messages,
  tampering, wrong key/network, reflection, reconnect/restart replay, sequence
  gaps/duplicates, timeout cleanup and actual WebSocket exchange.
- [x] Verify incoming/outgoing queue bounds and retained defensive state.
- [x] Run release checks and the supported-platform CI matrix; record immutable
  commit/run evidence and update `peerAuthentication`: complete. See the linked
  acceptance record.
- [x] Audit deterministic validation, encoding, arithmetic, fork choice and
  replay; extend pinned vectors to uncovered consensus paths and
  mark `deterministicConsensus` complete after supported-platform and real-proof
  CI acceptance. Ten remaining gates still block mainnet launch.

### 3. Remaining launch work

- [ ] Authorized worker enrollment and remote dispatch; confidential transport
  and per-user admission/rate limits.
- [ ] Buyer funding/reservation, exactly-once ledger settlement, cancellation,
  crash recovery and reward/reorg accounting.
- [ ] Encrypted storage contracts with unpredictable continuing-availability
  challenges, replication, repair and funded settlement.
- [ ] Permissionless proposer enforcement and consensus-owned validator
  economics, with adversarial bond/reward/slash tests.
- [ ] Governance authority limits, approved budgets, versioned upgrades and
  tested emergency recovery; model output cannot directly authorize consensus.
- [ ] Reproducible signed release artifacts, SBOM and pinned genesis manifests.
- [ ] Measured multi-host soak with restart/seed-loss/reorg evidence; distinguish
  owner-controlled rehearsal from independent operation.
- [ ] External consensus, network and economics reviews, then repeat the full
  release-specific launch preflight. Keep valuable mainnet disabled until all
  gates are satisfied.
