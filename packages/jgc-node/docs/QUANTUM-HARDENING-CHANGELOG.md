# Quantum Hardening Change Log

**Date:** 2026-07-22

**Branch:** `codex/pq-prototype-review`
**Purpose:** remediate or safely contain every finding from the first
post-quantum readiness review without overstating prototype security.

## Changes made

### Versioned crypto policy

- Added `src/crypto/pq-suite.ts` as the single algorithm and limit policy.
- Defined suite `JGC-PQ-SUITE-2`: ML-DSA-65, ML-KEM-768, SHA3-256.
- Added explicit audit, side-channel, and production-approval flags.
- Added a production startup guard that fails closed while the active provider
  remains unaudited and not side-channel hardened.

### Addresses and transaction signatures

- Replaced the truncated 160-bit address commitment with the complete 256-bit
  SHA3-256 digest. New addresses use the breaking `1QG2` prefix.
- Versioned the locking script (`0x52`) and expanded its key hash to 32 bytes.
- Bumped the quantum network signing domain to `JGC-quantum-v2`.
- Replaced delimiter-joined signature preimages with typed, length-prefixed
  canonical encoding.
- Miner signatures now bind payout address, task, circuit, TFLOPS, task type,
  complete proof bytes, every public input, and block height.
- Added strict sizes for secret keys, public keys, signatures, hashes, scripts,
  deterministic seeds, and lowercase hexadecimal encodings.

### Wallet and keystore validation

- Added secret/public keypair correspondence checks using ML-DSA public-key
  derivation.
- Applied the check to direct key import and every decrypted keystore record.
- Added version-2 keystores with a crypto-suite id while allowing validated
  version-1 records to be read for migration.
- Reject weakened scrypt settings, malformed envelope fields, oversized
  ciphertext/plaintext maps, excessive key counts, invalid labels, unknown
  algorithms, and mismatched keypairs.

### Recipient-gated payment discovery

- Removed the public-data construction that exposed a spendable one-time seed.
- Replaced the view key with ML-KEM-768 and added a separate ML-DSA spend key.
- Senders encapsulate to the view public key; recipients must decapsulate with
  the view secret before the destination commitment matches.
- Senders no longer receive a one-time seed or spend key.
- Added negative tests using the correct recipient public data with an
  attacker's secret, mismatched spend keys, and tampered ciphertexts.
- Renamed the security claim to "private payment scanning." This prototype is
  not described as a complete stealth address or shielded pool.

### Proof and reward safety

- Renamed the serialized prototype to `PQ-HASH-COMMITMENT-v2`.
- Marked every current circuit `prototype-only`.
- Strict consensus rejects these commitments with zero credited TFLOPS because
  Merkle openings do not prove useful computation.
- Simnet can explicitly enable the structural fixture; production cannot.
- Bound statements to an exact block height and included that height in the
  commitment challenge.
- Require exact equality between inner and outer output/task commitment,
  circuit id, TFLOPS value, public inputs, and height before verification.
- Added proof-byte, circuit-id, public-input, contribution-count, query-count,
  query-index, leaf, and fixed Merkle-path limits before expensive work.

### Tests and documentation

- Corrected the package-local Jest path so an independent `npm ci` installation
  can execute the suite instead of depending on an absent monorepo-root folder.
- Added adversarial coverage for public-data payment recovery, sender custody,
  wrong keys, ciphertext tampering, inner/outer field mismatches, height replay,
  oversized proofs, malformed hex, delimiter ambiguity, weakened KDF settings,
  keypair mismatch, strict fail-closed behaviour, and production downgrade.
- Updated simulation-only mempool and reorganization tests to enter simnet mode
  explicitly and restore strict mode after every test.
- Rewrote `QUANTUM-READY.md` so it no longer calls the Merkle fixture a ZKP or
  claims Zcash-equivalent privacy.
- Updated type and code comments to distinguish structural simulation from
  production cryptographic assurance.

## Breaking changes

- `1QGC`/20-byte addresses and `0x51` scripts are replaced by `1QG2`/32-byte
  addresses and `0x52` scripts. Existing prototype funds require an explicit
  migration tool before any network reset.
- Contribution signatures use network/domain version 2 and are not compatible
  with earlier signatures.
- Stealth/private-scanning identities now contain ML-KEM view keys plus ML-DSA
  spend keys. Version-1 payment records are intentionally rejected.
- Hash commitments are not reward-eligible in strict mode.

## Work that cannot honestly be completed as a local hardening patch

- Select and integrate a reviewed transparent proof system that constrains a
  precisely specified useful-computation relation.
- Select or design a reviewed post-quantum shielded-payment construction if
  unlinkability after spending is a requirement.
- Replace or isolate the JavaScript crypto provider behind an independently
  audited, side-channel-hardened implementation or hardware service.
- Import official FIPS 203/204 known-answer vectors and run a second,
  independent implementation in interoperability tests.
- Obtain independent protocol and implementation audits before activation.

## Verification performed

- Full test suite: 20 suites passed, 222 tests passed.
- TypeScript check: `npm run typecheck` passed.
- Production compilation: `npm run build` passed.
