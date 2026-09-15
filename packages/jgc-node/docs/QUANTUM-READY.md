# JGC Quantum-Readiness Status

**Status:** signatures and several hashing paths are quantum-oriented; a sound
post-quantum proof of useful computation is not yet implemented. The repository
supports a valueless public JGTC pilot; no value-bearing JGC mainnet is ready.

## Current security boundary

| Layer | Current implementation | Production status |
|---|---|---|
| Miner and spend signatures | ML-DSA-65 | Implemented; requires independent review |
| Hashing | SHA3-256 on PQ paths | Implemented |
| Payment destinations | Experimental ML-KEM-768 V2 key encapsulation | Standalone primitive; not shielded payments or recipient-exclusive spending |
| Useful-compute proof | Groth16 circuits for limited Conv1D/MatVec kernels | Soundness path exists; BN254 is not post-quantum and production keys are not installed |
| `PQ-HASH-IOP-v1` | Merkle receipt over prover-chosen witness values | Simulation only; not a proof of computation |
| General post-quantum compute | Transparent STARK/zkVM or equivalent | Required before production |

## Why the hash/Merkle receipt is simulation-only

`src/crypto/pq-zkp.ts` commits to values supplied by the prover and checks
Fiat–Shamir-selected Merkle openings. It does not contain polynomial or virtual
machine constraints establishing that an inference, training run, or claimed
number of operations occurred. A dishonest prover can construct a structurally
valid receipt without performing useful work.

Consequently:

- strict verification rejects `PQ-HASH-IOP-v1`;
- `simnet` must be selected explicitly and is forbidden when
  `NODE_ENV=production`;
- simulation receipts receive no production consensus or marketing claim of
  computational soundness;
- a missing strict Groth16 verifier fails closed rather than falling back to an
  accept-all JavaScript stub.

## Payment privacy boundary (2026-09-11)

The old `pq-stealth.ts` V1 construction ignored the recipient secret and derived
the spending seed from the recipient public key and public payment fields.
Anyone knowing that public key could recover the spending key. V1 must never
be used, and its records and ML-DSA view identities are rejected by V2.

V2 uses the existing noble ML-KEM-768 implementation to encapsulate a secret,
then binds the derived ML-DSA seed to the secret, recipient public key, and
ciphertext. Regression tests cover an attacker using the actual recipient
public key with an absent or unrelated secret. V2 meta-addresses use `st2qgc`
and a full 256-bit digest; they are not interchangeable with V1 addresses.

This does not complete privacy. The sender still knows the derived spending
seed; the historical `viewSecretKey` also grants spend access. The primitive is
not wired into wallet transactions or consensus. It hides neither amounts nor
the spend graph and has no audited anonymity guarantee. Existing `1QGC`
destinations truncate hashes to 160 bits (roughly 80-bit generic quantum
preimage cost), so ML-DSA alone does not establish a 128-bit post-quantum
security floor for the whole payment system. Changing those addresses needs
a versioned network migration, not a silent change to the running pilot.

Production requires recipient-exclusive spending keys, separate viewing keys,
encrypted notes, nullifiers, value conservation and range proofs, a reviewed
post-quantum proof system, and a wallet/consensus migration. Zcash shielded
transactions hide addresses, amounts and memo fields; one-time destinations
alone do not provide that property.

References: [noble API](https://github.com/paulmillr/noble-post-quantum),
[Zcash value pools](https://zcash.readthedocs.io/en/master/rtd_pages/addresses.html).

## Heterogeneous verification

Different computers do not need to reproduce the miner's native execution to
check a portable cryptographic proof. JGC separates three back-checker roles:

1. `proof-verifier` checks a machine-independent proof and participates in
   consensus validity;
2. `replay-auditor` performs exact replay only when its execution profile
   matches, with decisions made through a quorum;
3. `quality-auditor` checks usefulness and customer policy, but its judgment is
   advisory and cannot independently slash a miner.

See `BACK-CHECKER-ARCHITECTURE.md` and `CONSENSUS-V3.md`.

## Production path

1. Keep the research receipt for transport and simulation tests only.
2. Use the existing real Groth16 Conv1D/MatVec circuits for bounded development
   demonstrations, with registered keys from a controlled setup.
3. Integrate and independently audit a transparent general-compute proof system
   such as a STARK/zkVM.
4. Bind every proof to the assigned task, approved program or circuit digest,
   input commitment, output commitment, work metric, miner identity, network,
   and epoch anti-replay value.
5. Add cross-platform golden vectors and at least two independent verifier
   implementations before activating rewards or slashing.

## Relevant files

| File | Role |
|---|---|
| `src/crypto/compute-proof.ts` | portable proof dispatch and fail-closed routing |
| `src/crypto/zkp.ts` | real Groth16 verifier and limited useful-compute circuits |
| `src/crypto/pq-zkp.ts` | simulation-only hash/Merkle receipt |
| `src/broker/backcheck.ts` | proof, replay, and quality back-checker roles |
| `src/crypto/pq-signatures.ts` | ML-DSA-65 contribution and spend signatures |

## Privacy and quantum design continuation

See the [V3 shielded-payment requirements draft](../../../docs/mainnet/SHIELDED_PAYMENTS_V3_DESIGN.md)
for the bounded gap audit, authority separation, transaction relation,
parameter/review blockers and versioned migration requirements. No backend is
selected and no privacy or quantum gate is completed by this draft.
