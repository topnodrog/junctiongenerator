# Shielded payments V3: design requirements and gap audit

Revision 0, 2026-09-13. **Draft for cryptographic review; not an approved
construction, wire specification, implemented protocol, or gate acceptance.**
`JGC-SHIELDED-v3` below is a proposed domain, not an allocated network version.
The current mainnet candidate remains blocked with `strict-groth16-v1`.

## Source audit and decisions

Paths in this table are relative to `packages/jgc-node/src/crypto`.

| Surface | Evidence and consequence | Required replacement |
|---|---|---|
| `pq-stealth.ts` | `pqStealthCreatePayment` returns the seed from which the spend key is generated. The sender can steal; `viewSecretKey` also spends. Values and spend linkage are public. | Independent recipient spending authority; encrypted shielded notes |
| `pq-signatures.ts` | Address and script binding truncate SHA3-256 to 20 bytes. ML-DSA signatures do not repair that binding. The fixed contribution domain cannot distinguish forks sharing it. | Full-length, domain-separated commitments and explicit network/transaction binding |
| `pq-zkp.ts` | Leaves are hashes of supplied fields; verification checks paths without enforcing a witness relation. Arbitrary work claims can pass simnet. | Reviewed constraint system and proof implementation; retain strict rejection |
| `pq.ts` | Historical `quantum*` facade and `QUANTUM_MODE` do not select a sound PQ computation proof. | Capability names must not be interpreted as readiness |
| `compute-proof.ts`, `zkp.ts` | Dispatch preserves strict rejection of research receipts; real bounded circuits use Groth16/BN254. | PQ computation proof separately reviewed from the payment relation |

This increment corrects the crypto headers and receipt comments and links the
public readiness document here. It audits those entry points, the root/node
READMEs and mainnet documents; it is not an exhaustive audit of historical
marketing, deployed pages, dependencies, side channels or all wallet code.

## Security objective and authority

Hide recipient identity, spent-note linkage and shielded values from ledger
observers, malicious senders and validators, subject to the metadata limits
below. Prevent theft and inflation even when the sender chooses note contents.
Assume attackers can record traffic now and obtain quantum computation later.
Endpoint compromise and voluntary disclosure remain outside ledger privacy.

The recipient generates independent, domain-separated spending, incoming
decryption and nullifier secrets from a high-entropy wallet root. Exported
viewing material must never contain the root or spending derivation material.
The following is a required capability contract, not a key derivation algorithm:

| Holder | Permitted authority | Must not obtain |
|---|---|---|
| Sender | Construct/encrypt a note to a published recipient descriptor | Spend secret, nullifier secret, ability to recognize the future spend |
| Incoming viewer | Decrypt incoming notes and reconstruct commitments | Spend authority or future-spend linkage |
| Full viewer | Incoming viewing plus nullifier derivation and spend tracking; optional outgoing disclosure material | Spend authority |
| Spender | Authorize note consumption and wallet recovery | No reliance on a sender-held secret for authorization |

The descriptor must bind the spending public commitment, encryption key,
nullifier-key commitment, diversifier and suite/network version. The proof must
check that the spender and nullifier secret match the authority committed in the
note. A freely supplied nullifier key would allow repeated spending. Publishing
long-lived descriptors can link off-chain requests; diversification and descriptor
authentication need a reviewed construction, not an ad hoc hash substitution.

## Proposed transaction relation

Use canonical, length-delimited binary encodings and domain separation for every
hash, KDF, commitment and transcript. Reject unknown versions, duplicate fields,
noncanonical integers and trailing bytes. Specify encoding test vectors before
implementation. No current pilot parser accepts this proposed format.

Private notes contain version, network, asset (initially native JGC only), bounded
integer value, recipient authority descriptor, unique note randomness and hiding
randomness. Memos belong in authenticated encrypted plaintext. Commitments must
hide these fields and bind them against maliciously chosen openings. Nullifiers
must be deterministic for a note, domain-separated by network/pool, unlinkable
without full viewing authority, and collision-resistant against malicious senders.
Exact commitment and PRF formulas remain review blockers.

Public transaction inputs include suite/program digest, network/pool, accepted
anchor root, ordered input nullifiers, ordered output commitments and ciphertext
digest, transparent deposit/withdrawal amounts, fee and expiry. A transaction
authorization digest binds all of these. Stable spending public keys and
signatures must not appear on-chain where they would reveal linkage: authorization
must be verified inside the zero-knowledge relation or use a reviewed unlinkable
alternative. Sender and viewing knowledge must not satisfy that relation.

For every real input, the proof checks membership under the anchor, note opening,
recipient authorization over the transaction digest, and correct nullifier
derivation. For outputs it checks well-formed commitments and bounded values.
Encryption consistency with the committed note must be proved or supplied by a
reviewed equivalent; otherwise a valid output may be unscannable. Resolve that
cost explicitly. The integer relation is:

`sum(inputs) + publicDeposit = sum(outputs) + publicWithdrawal + fee`.

Range constraints must prevent negative values, field wraparound and overflow
of aggregate sums. Public legs must be bound to actual ledger debits/credits;
maintain a nonnegative pool balance. Padding/dummy notes need constrained flags,
zero values and no reusable real-input nullifiers. Fix supported transaction
shapes only after measuring privacy and verifier costs.

Consensus rejects nullifiers duplicated within a transaction, block or canonical
chain. Verify against an explicitly bounded canonical anchor window, then apply
nullifiers, commitments and public balances atomically. Persist rollback data;
reorgs remove orphan effects and restore the prior tree and spent set. Revalidate
mempool transactions after anchor changes and restart. No new proof scheme may
fall back to receipts or Groth16 if its verifier is unavailable.

## Note encryption, scanning and recovery

ML-KEM is a candidate for establishing note-encryption keys, not spend keys.
The KEM shared secret is known to the sender and must never authorize spending.
An authenticated KEM/KDF/AEAD envelope must bind suite, network, output index,
commitment and recipient context, with fresh randomness and bounded padded
plaintext. Pin nonce generation, invalid-ciphertext behavior and test vectors.
IND-CCA secrecy alone is insufficient: require evidence of recipient/key privacy
for the chosen envelope, including malicious keys and ciphertexts. Do not assume
ML-KEM standardization supplies anonymous payments or forward secrecy.

Wallets scan bounded ciphertexts locally without exposing a viewing key to an
RPC server. Trial-decryption failures must not create network responses or
recipient-specific errors. Successful decryption must reproduce the commitment,
check the descriptor and value, and record block hash, position and witness.
Persist scan checkpoints by block hash; rewind at a common ancestor on reorg.
Refresh witnesses and nullifier state before spending. Recover from the wallet
root plus versioned account/diversifier derivation data and birthday (or scan
from genesis). Validate recovery from chain data without trusting cached balances.

Change uses the same note protections. Outgoing disclosure requires a separate
scoped key and authenticated encrypted record, never a spend seed. Selective
disclosure exports only a chosen note/transaction opening with verification
context; users must understand that recipients of disclosure can retain it.
Full-viewing exports deliberately expose spend linkage. Static decryption-key
compromise may expose historical notes; rotation and backup retention must state
this limit instead of claiming forward secrecy.

## Proof and parameter decision record

No proof backend is selected. Evaluate a transparent, explicitly zero-knowledge
STARK/IOP or equivalent with a reviewed quantum-security argument. Do not add an
elliptic-curve compression wrapper, curve-based commitment, or recursive verifier
that reintroduces the broken assumption. FRI proximity testing alone does not
give zero knowledge; masking and the complete transcript require analysis.

Before selecting any implementation, reviewers must receive:

- Exact constraint program and digest, field/extension, commitment hash and
  output length, hiding randomness, FRI blowup/query/grinding parameters where
  applicable, recursion configuration and Fiat-Shamir transcript encoding.
- Concrete classical and quantum soundness, knowledge and zero-knowledge
  arguments, including quantum random-oracle assumptions and multi-target
  losses. A 256-bit hash gives roughly 128-bit generic quantum preimage work;
  collision-based uses need separate analysis and potentially wider outputs.
  Do not infer a system security floor from that preimage estimate.
- Pinned library/compiler versions, licenses, audit coverage, unresolved
  advisories/errata, deterministic verification vectors and independent verifier
  agreement. Review ML-KEM-768/ML-DSA-65 as candidate primitives; their existing
  use is not approval of this composition.
- Measured proof bytes, prover time/memory, verifier time/peak allocation on the
  weakest supported node, and adversarial malformed-proof costs. Set numeric
  consensus caps for transaction/proof/ciphertext bytes, inputs/outputs, tree
  depth, field elements and verifier work; bound queues before decoding.
  **All caps and proof parameters are presently unresolved: activation blocked.**

## End-to-end migration and confidentiality

Use complete commitments of at least 32 bytes for new address/key binding; choose
wider hashes where the collision-security analysis requires them. New addresses
need explicit network/pool/suite encoding and checksum. Never reinterpret `1QGC`,
`5114`, V1 or V2 stealth records. No automatic import of a V2 shared spending
seed as a recipient-exclusive V3 secret. No pilot-token conversion is authorized.

A future approved migration needs independent recipient keys, explicit public
deposit authorization, replay-isolated network identity, versioned wallet backup
and a published activation height. Old observers retain all historical public
linkage. Reorg behavior across activation and retirement heights must be specified
and tested; unknown suites fail closed. This proposal does not allocate heights
or modify `jgtc-testnet-v2` or `jgc-mainnet-v3` rules.

Peer ML-DSA authentication does not encrypt transport. Audit TLS/session key
exchange for harvest-now/decrypt-later exposure; specify an authenticated PQ or
reviewed hybrid exchange with downgrade resistance and ephemeral-key erasure.
RPC, remote proving, telemetry and crash logs must not receive witnesses, seeds
or plaintext notes. Backups need a versioned authenticated encryption format,
high-entropy keys, reviewed password KDF parameters where applicable, restore
tests and clearly separated viewing/spending exports. These are requirements,
not claims about current transport or backup implementations.

Inventory release, upgrade, emergency, validator and genesis signing authorities.
Use reviewed PQ authorization, threshold/quorum rules, delayed upgrades and
recoverable key rotation; pin allowed verifier/program digests in consensus.
An upgrade must not silently weaken proofs, expose notes or bypass readiness.
Emergency authority scope and governance acceptance remain unresolved.

Ledger privacy cannot hide IP addresses, timing, transaction sizes/counts, fees,
public deposits/withdrawals, low anonymity sets or exchange-side records. Address
reuse, remote scanning, memo disclosure and spending timing can correlate users.
Padding, batching and relay privacy require separate measurement and review;
do not promise anonymity solely because the proof hides its witness.

## Acceptance and next bounded work

First select and benchmark a candidate proof backend against the relation above
in an isolated, valueless harness, recording parameters and review gaps. Then
freeze the reviewed descriptor, nullifier, encryption and encoding specification
before wallet/consensus integration. Required adversarial evidence includes:

| Test family | Required failure or recovery property |
|---|---|
| Sender/viewer theft | Sender randomness, IVK and FVK cannot authorize a spend, separately or combined |
| Soundness/inflation | Reject unauthorized notes, wrong membership, alternate nullifier keys, negative/overflow values, forged public deposits and invalid authorization |
| Replay | Reject duplicate nullifiers and cross-network/pool/suite/expiry replay |
| Encryption | Reject tampered/truncated/swapped envelopes; assess key privacy, malformed-key behavior and scan resource exhaustion |
| Privacy | Check public transcript for stable keys, note/value leakage and input/output linkage; independent zero-knowledge analysis |
| State/recovery | Crash at each apply step; reorg spent/change notes and anchors; restore from seed; compare full replay with cached state |
| Resources | Reject oversized/deep/noncanonical encodings before excessive allocation; agree across supported platforms |
| Migration | Preserve pilot vectors; reject legacy reinterpretation and downgrade; test activation-boundary reorgs |

External reviewers must approve the complete composition and resolve high/critical
findings. Engineering tests do not substitute for cryptographic acceptance.
`paymentPrivacy`, `postQuantumSecurity`, `proofSystem` and
`independentSecurityReview` remain false.

## Primary sources consulted 2026-09-13

Local verification for this documentation/comment increment: `npm run
release:check` passed 53 suites / 451 tests, typecheck, build, blocked mainnet
preflight, bundle staging/verification and four manifest tests. Emitted JavaScript
with comments removed matches merged main for all four edited crypto files.
Local documentation links resolve. These checks do not validate the proposed
cryptography; no new protocol implementation or cryptographic test is claimed.

- [NIST FIPS 203](https://csrc.nist.gov/pubs/fips/203/final) standardizes ML-KEM
  for shared-secret establishment. Its page lists potential errata; review the
  applicable errata and implementation conformance before selecting parameters.
- [NIST FIPS 204](https://csrc.nist.gov/pubs/fips/204/final) standardizes ML-DSA
  signatures, not confidential transactions. Its current page also lists errata.
- [Orchard ZIP 224](https://zips.z.cash/zip-0224) and the
  [Zcash protocol specification](https://zips.z.cash/protocol/protocol.pdf)
  provide reference semantics for notes, viewing authority, nullifiers and value
  balance. They are privacy references, not a PQ construction selection.
- [A note on adding zero-knowledge to STARKs](https://eprint.iacr.org/2024/1037)
  discusses the additional work required for zero knowledge in FRI-based STARKs.
  It does not certify a JGC backend or provide this proposal's concrete parameters.

All proposed JGC choices above are engineering requirements/inferences, not
endorsements by these sources. No external review has been commissioned here.
