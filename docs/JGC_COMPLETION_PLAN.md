# JGC completion plan

Updated 2026-09-11. Product direction: a semi-private, quantum-ready blockchain
that rewards useful compute, inference and storage in JGC. Network resources
serve a central intelligence and paid compute and inference services. That
intelligence should ultimately administer the project under explicit protocol
authority and accountable upgrades.

## What is real today

The node has ML-DSA signatures, UTXO accounting, epoch settlement, persistence,
networking, bounded proof demonstrations and a designated-producer testnet.
The pilot pays valueless JGTC for signed presence receipts. It does not yet
prove useful work. Existing increasing work thresholds are consensus policy,
not evidence of a completed useful-resource market. Do not change the running
pilot's retarget rules without a new network version.

Local inference execution and the compute broker are prototypes. The legacy
broker completion path now rejects all claims, preventing unverified payments.
A separate bounded vector-work journal verifies assigned results and persists
leases across restart; it is not connected to consensus or payment. Storage service
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
4. **Paid compute and inference service.** Expose a queued, metered API backed
   by eligible workers, with published pricing, per-user limits, overload
   handling and measurable latency. Charge for compute and inference to cover
   infrastructure and other bills. Use remaining realized surplus to purchase
   JGC, with the aim of supporting a fair market for participants who wish to
   sell. Purchases cannot guarantee a price or liquidity. Any free access needs
   an explicit, bounded subsidy. Pin execution profiles and identify when
   prompts leave the user's machine.
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

### Deterministic-consensus acceptance work (2026-09-13)

Candidate fork ties now choose the lowest header hash at equal exact work;
inactive-parent orphan handling no longer strands heavier descendants.
Synchronous verification/application removes an interleaving gap. Candidate
restart fully verifies the active log and rebuilds balances instead of trusting
a snapshot's matching tip. Exact proof thresholds, receipt-context binding and
canonical header/difficulty boundaries have regression coverage. Published
pilot retargeting and first-seen ties remain unchanged.

The local release rehearsal passed 53 suites / 451 tests plus four manifest
tests. The real Conv1D mining demonstration now passes six proofs in three
blocks after repairing its admission path; that demonstration is also in CI.
The gate is awaiting supported-platform evidence. See
[deterministic-consensus acceptance](mainnet/DETERMINISTIC_CONSENSUS.md).

### Peer-authentication gate and privacy priorities (2026-09-13)

The candidate peer-authentication engineering gate is complete: fresh challenge
handshakes bind full ML-DSA keys to connections; signed session sequences reject
replay across reconnects/restart. Handshakes expire, discovery waits for proof,
and transport queues and host-defense records have explicit bounds. Local tests
and Node 20 on Windows/macOS/Linux plus Node 22/24 on Linux passed, including
authenticated WebSocket block sync. See the [acceptance record](mainnet/PEER_AUTHENTICATION.md).

Eleven launch gates remain incomplete. The owner reaffirmed Zcash-like payment
privacy and end-to-end quantum readiness as essential. The existing stealth
prototype, public amounts/spends, truncated wallet addresses and simulation
receipts do not fulfill them. The [findings and todo list](mainnet/FINDINGS_AND_TODO.md)
records their design, implementation and review criteria before further launch work.

### Signed useful-work results (2026-09-13)

Key-assigned vector jobs now require ML-DSA-65 result signatures. Worker
identities use full SHA3-256 public-key commitments, separate from wallet
addresses. Signature evidence binds the assignment context and is persisted
and reverified on journal replay. Unsigned bypass, impersonation, changed
context, stale leases and duplicate completion are rejected. Name-assigned
jobs remain trusted local rehearsal operations; remote dispatch authorization,
production storage and funded settlement remain outstanding.

Validation: release rehearsal passed 49 node suites / 413 tests, four release
manifest tests, typecheck, build and staged bundle verification. All 12 mainnet
gates remain incomplete. This adds result authentication without activating
payments or changing pilot consensus.

### Wallet recovery and participation direction (2026-09-12)

Keep every mainnet gate mandatory. Build a native multi-network wallet, with
BTC remaining on Bitcoin and other assets on their own networks; bridges are
not required for native deposit/withdrawal. Native Bitcoin and Ethereum
test-network adapters now pass local receive/restore/send rehearsals against
Bitcoin Core and Anvil. Public test-network rehearsals, Base and other networks,
and real-asset activation remain outstanding. See
[wallet and participation requirements](mainnet/WALLET_AND_PARTICIPATION.md).

The JGTC CLI now supports 24-word recovery wallets with mandatory full-word
confirmation before setup completes, hidden secret input, sequential account
recovery and versioned encrypted metadata. Existing keystores retain their
file-based recovery path. Imports and decrypted files validate matching ML-DSA
keypairs. Key generation uses OS-backed cryptographic randomness and rejects
malformed seed input. These changes do not repair the pilot's truncated address
commitments or satisfy the end-to-end quantum-security gate.

Validation: the full release rehearsal passed 49 node suites / 409 tests plus
four release-manifest tests, including a pinned recovery-derivation fixture.
Bitcoin Core 31.1 and Anvil 1.8.1 local native-asset round trips passed,
including recovery, wrong-network checks and reverted-state handling. The CLI
refuses noninteractive setup, preserves existing destination files and blocks
mainnet. The node dependency audit reports zero known vulnerabilities. CI now
includes the pinned native-network rehearsals; its new run must pass separately.

### Owner clarification and assigned-work foundation (2026-09-11)

“Intelligence must be free” is the founder's prediction about intelligence
resisting containment, not a promise of zero-cost compute or inference. The
white paper records this distinction and the surplus-funded JGC purchase policy.

The assigned-work journal pins the bounded integer vector-dot program, network,
epoch, input commitment, resource units, miner, lease deadline and output
commitment. It rejects forged output, duplicate completion and stale leases,
and validates its journal on restart. It is a local rehearsal foundation:
authenticated remote dispatch, funded settlement, inference verification and
storage availability are still outstanding. See [assigned work](mainnet/ASSIGNED_WORK.md).

Validation: 46 node suites / 389 tests, four release-manifest tests, typecheck,
node build, staged release verification, website lint and production build pass.
Mainnet preflight still reports all 12 gates incomplete. The latest pre-change
GitHub node and website workflows passed; the new commit requires its own CI run.

### Previous foundation increment

- Replace public-data V1 stealth recovery with versioned ML-KEM decapsulation;
  add regression tests for stolen-key attempts, tampering and backup recovery.
- Require privacy, post-quantum security, useful services and governance in the
  fail-closed mainnet readiness record.
- Supply the two required synthetic participant addresses to the monitor's CI
  container; keep the monitor unarmed during its health test.
- Update release checks to require the same 12 incomplete mainnet gates.
- Patch the nine dependency alerts reported by GitHub: Next.js and its ESLint
  config to 16.3.3, sharp to 0.35.4, js-yaml to 4.3.2 (website) and 3.15.2
  (node), and browser baseline metadata to a compatible patched version.
  Website, API and node dependency audits report zero known vulnerabilities.

Local validation: 45 node suites / 374 tests, four release-manifest tests,
typecheck, node build, staged release verification, website lint and production
build all pass. Mainnet preflight correctly remains blocked. Audit results
are dependency database checks, not external cryptographic review.

This increment repairs foundations. It does not constitute a finished chain,
a deployment of new consensus, a completed soak, or a mainnet launch.
