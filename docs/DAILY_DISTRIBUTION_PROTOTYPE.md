# Ten-day JGC daily-distribution prototype

This prototype exercises a proposed UTC/height-based distribution policy
without changing or deploying the current `jgc-testnet-v3` consensus rules.

## Scenario

- Ten earning windows of exactly 144 blocks each.
- Height 0 is anchored to 2026-08-01 00:00:00 UTC for readable evidence; the
  first window is heights 0-143.
- The completed window's 7,200 test JGC is issued after a fixed 24-block delay.
  At the ten-minute target this appears at 04:00 UTC, but block height—not the
  wall clock—activates distribution.
- Ten reproducibly derived ML-DSA wallet identities receive 720 JGC each per
  day. ML-DSA spend signatures use fresh entropy, so transaction and tip hashes
  are intentionally different on separate runs even though all balances and
  schedule invariants are identical.
- All ten wallets send 1 JGC around the ring at offsets 48, 72, 96, and 120 in
  each 144-block window. These nominally display as 08:00, 12:00, 16:00, and
  20:00 UTC; direction alternates so value moves back and forth.
- After the tenth distribution reaches the existing 100-block coinbase
  maturity, wallets 03-10 consolidate without fees into wallets 01 and 02.
- The result is exactly 36,000 JGC in each of two wallets and zero in the other
  eight, with 72,000 JGC conserved.

Because the tenth issuance cannot be spent until its existing 100-block
maturity passes, the evidence chain covers 1,565 blocks: heights 0-1564.

## Run it

From `packages/jgc-node`:

```powershell
npm run build
npm run ten-day-ledger -- --output .tmp/ten-day-chain
```

The command writes:

- `blocks.jsonl`: linked headers, transaction bodies, Merkle commitments, and
  post-block state roots;
- `summary.json`: distribution windows, wallet addresses, transfer counts,
  final balances, supply, and tip identity.

Generated evidence stays under `.tmp` and is not committed by default.

## Consensus boundary

The public testnet currently settles each 144-block epoch immediately at its
boundary block. This prototype instead records an earning window as complete at
the next boundary and distributes it 24 blocks later. Consensus never evaluates
a timezone, local date, daylight-saving transition, or host clock to decide
whether issuance is due. UTC labels are derived from the target interval only
for human-readable reports; if production blocks run early or late, settlement
still occurs at the same deterministic height.

A versioned consensus proposal still needs to define reorg handling across the
earning boundary and delayed settlement height, fee attribution during the
24-block delay, and how a missed settlement transaction is recovered. Until
then these blocks remain `daily-distribution-prototype-v1` evidence and must not
be presented as valid current `jgc-testnet-v3` blocks.
