# JGTC Testnet V1 Protocol Freeze

**Status:** Normative for the current public pilot
**Network:** `jgtc-testnet-v2`
**Purpose:** Freeze one interoperable, valueless testnet while useful-compute verification is rehearsed. This document does not authorize mainnet, assign monetary value to JGTC, or claim that pilot receipts prove AI computation.

An implementation conforms only if every consensus and network value below matches. Any incompatible change requires a new chain ID, wire or consensus version as applicable, a new genesis, and an announced reset; existing history must never be silently reinterpreted.

## 1. Model and execution runtime

The sole V1 useful-work rehearsal profile is:

| Field | Frozen value |
|---|---|
| Task model ID | `gemma4:e2b` |
| Model SHA-256 digest | `7fbdbf8f5e45a75bb122155ed546e765b4d9c53a1285f62fd9f506baa1c5a47e` |
| Tokenizer digest | Same as model digest (V1 Ollama artifact boundary) |
| Parameters / quantization | `5.1B` / `Q4_K_M` |
| Replay protocol | `jgc-exact-replay-v1` |
| Runtime | `ollama` `0.34.0`, local HTTP API, non-streaming `/api/chat` |
| Numeric backend | `cpu-x64-single-thread-v1`; exact-profile matching is mandatory |
| Sampling | `temperature=0`, `seed=0`, `maxTokens=1024` |

The complete UTF-8 prompt, model ID, sampling values, execution profile, and output text are length-prefixed and bound by `SHA-256` under `JGC/JUNCTIONING/CLAIM/V1`. A verifier with any profile mismatch must abstain; mismatch is not fraud. This lane is evidence-only in V1: it cannot create rewards or trigger slashing until a canonical reference runner and cross-machine agreement are demonstrated. Reasoning tokens count in measured work, but token-derived TFLOPS remain an estimate.

## 2. Chain and genesis

| Field | Frozen value |
|---|---|
| Chain ID | `jgtc-testnet-v2` |
| Currency symbol | `JGTC` (valueless test coin) |
| Network magic | `0x4a474332` (ASCII `JGC2`) |
| Consensus version | `0x03000000` |
| Proof mode | `simnet-receipts-v1` |
| Genesis timestamp | `2026-08-20T20:00:00Z` (`1787256000`) |
| Genesis message | `JGTC 2026-08-20: Settlement IDs commit boundary height` |
| Genesis hash | `da5c0c28e076211e13e75f8cd28fe98f81080dafefc5ad803620961d16ee1d77` |
| Genesis spendable supply | `0 JGTC` |
| Target block interval | 600 seconds |
| P2P / status ports | `19444` / `7777` (status remains loopback-only) |

Peers must exchange and match chain ID, genesis hash, consensus version, and proof mode before chain data. A mismatch disconnects without importing state.

## 3. Message format

Every P2P message uses wire version `1` and a 16-byte network-order header: `magic:u32 | version:u8 | type:u8 | reserved:u16=0 | payloadLength:u32 | checksum:4 bytes`, followed by exactly `payloadLength` bytes. The checksum is the first four bytes of `SHA3-256(payload)`. The payload is UTF-8 tagged JSON; BigInt and Map use the V1 codec. Maximum frame size is 8 MiB, including the header. Decoders reject wrong magic/version/type, nonzero reserved bytes, length mismatch, corruption, trailing data, excessive nesting or collections, and malformed tagged values.

Authenticated messages bind network magic, type, timestamp, sender key, payload, and connection session using ML-DSA. Maximum age is 900 seconds and maximum future skew is 120 seconds. Connection-bound sequence numbers reject duplicates and replays. V1 message types are the ordered codes defined in `src/network/wire.ts`; reordering or inserting codes is a wire-version change.

## 4. Verification quorum

Historical audits use deterministic 10-block claim windows. The block hash two blocks after a window closes is the selection beacon. Each selected claim is assigned to three distinct bonded validators; the claimant is excluded. The response window is 10 blocks and the initial additional random-sampling rate is 0% (one claim per claimant per window remains guaranteed).

A verdict requires at least two of the full three-member committee to converge: matching the claim is `pass`, converging on a different commitment is fraud evidence, and every other result—including missing, incompatible, or scattered votes—is `inconclusive`. Votes are ML-DSA signed, canonically ordered, and committed through `auditRoot`. V1 verdicts are durable evidence only: no automatic slash or verifier reward is active.

## 5. Reward and settlement rules

V1 rewards **pilot participation**, not verified model execution. Each distinct participant identity may submit one equal-weight signed receipt per block slot. The designated producer supplies an anchor receipt for liveness. Duplicate contributions from the same identity and slot are rejected.

- Unit: 1 JGTC = `10^16` base units.
- Era-0 subsidy: 50 JGTC per block, accumulated rather than minted per block.
- Epoch: 144 blocks; boundary height satisfies `height % 144 == 143`.
- Era-0 epoch pool: 7,200 JGTC plus valid accumulated transaction fees.
- Distribution: exact integer pro rata by accepted receipt weight. Payouts sort by descending weight with canonical-address tie-breaking; the final entry absorbs integer-division residue.
- Non-boundary coinbase value: zero. Supply is created only by the consensus-validated boundary settlement.
- Maturity, reorg, persistence, and 21,000,000 JGTC hard-cap checks remain consensus enforced.
- Subsidy is multiplied by `3/4` (integer floor) every 105,000 blocks.

No faucet, premine, off-chain balance adjustment, model self-report, broker invoice, audit verdict, or administrator action may mint or move JGTC. Mainnet rewards, bonds, slashing, and useful-work payments require a later protocol and are outside V1.

## 6. Conformance and change control

Before joining, a node must reproduce the frozen genesis hash and pass the consensus/genesis vectors, wire tests, settlement tests, and strict release-manifest verification. Operators should use the signed `jgc-node-v0.1.0` closed-beta release or a source revision whose manifest records the exact commit. A future V1 documentation correction may clarify behavior but cannot change bytes, eligibility, issuance, quorum, or settlement. Any such behavioral change creates V2.
