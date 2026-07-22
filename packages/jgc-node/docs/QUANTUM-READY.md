# JGC Post-Quantum Security Status

> **Status: hardened research prototype — not production-ready**

JGC now has versioned post-quantum signatures, 256-bit addresses, canonical
message encodings, strict key validation, and a private-scanning experiment
based on ML-KEM-768. It does **not** yet have a sound proof of useful
computation or a reviewed shielded-payment protocol.

The node fails closed in production and in strict consensus:

- The JavaScript post-quantum provider is marked prototype-only because it is
  not independently audited or side-channel hardened.
- Hash/Merkle commitments in `pq-zkp.ts` are accepted only by explicit simnet
  mode. They receive zero production reward and are rejected in strict mode.
- Every duplicated consensus field must exactly match the inner statement.
- Simnet mode is forbidden when `NODE_ENV=production`.

## Implemented security controls

| Area | Current control |
|---|---|
| Signatures | ML-DSA-65 (FIPS 204), strict encoded sizes, versioned suite id |
| Addresses | `1QG2` plus the full 256-bit SHA3-256 public-key commitment |
| Scripts | Versioned suite-2 script with a 32-byte key commitment |
| Signed messages | Typed, length-prefixed fields; proof bytes, payout, work, and height are bound |
| Wallet import | Secret/public key sizes and keypair correspondence are validated |
| Keystore | Versioned suite id, fixed scrypt policy, envelope and plaintext limits |
| Private scanning | ML-KEM-768 decapsulation requires the recipient view secret |
| Compute prototype | Strict consensus rejection; simnet-only structural testing |
| Parsing | Proof, query, path, contribution, script, label, and keystore limits |
| Algorithm changes | Central `PQ_CRYPTO_SUITE` policy and versioned network/address/script encodings |

## Important limitations

1. `pq-zkp.ts` is a commitment-integrity fixture, not a ZKP, STARK, FRI
   implementation, or proof of computation. An approved transparent proof
   backend with an explicit execution relation is still required.
2. `pq-stealth.ts` provides recipient-gated private scanning, not a complete
   Zcash-style shielded pool. Spending can reveal the long-term spend public
   key and link already-spent notes.
3. `@noble/post-quantum` 0.6.1 states that it lacks independent audit and
   side-channel protection. Mainnet requires an audited, hardened provider or
   hardware boundary.
4. Official NIST known-answer vectors, cross-implementation tests, protocol
   review, implementation audit, and migration drills remain release gates.

See `QUANTUM-HARDENING-CHANGELOG.md` for the exact changes and
`QUANTUM-READINESS-REVIEW.md` for the original findings.
