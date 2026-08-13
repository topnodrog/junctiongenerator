# Ten-day JGC daily-distribution prototype

This prototype exercises a proposed calendar-based distribution policy without
changing or deploying the current `jgc-testnet-v3` consensus rules.

## Scenario

- Ten earning days: 2026-08-01 through 2026-08-10 in `America/Toronto`.
- Each earning window is local `00:00:00` through `23:59:59`.
- The completed day's 7,200 test JGC is issued at exactly 04:00 Toronto time the
  following morning (EDT/UTC-04:00 during this scenario).
- Ten reproducibly derived ML-DSA wallet identities receive 720 JGC each per
  day. ML-DSA spend signatures use fresh entropy, so transaction and tip hashes
  are intentionally different on separate runs even though all balances and
  schedule invariants are identical.
- All ten wallets send 1 JGC around the ring at 08:00, 12:00, 16:00, and 20:00;
  direction alternates so value moves back and forth.
- After the tenth distribution reaches the existing 100-block coinbase
  maturity, wallets 03-10 consolidate without fees into wallets 01 and 02.
- The result is exactly 36,000 JGC in each of two wallets and zero in the other
  eight, with 72,000 JGC conserved.

Because the tenth daily issuance cannot be spent until its existing 100-block
maturity passes, the evidence chain covers the ten earning days plus the final
16 hours and 40 minutes required for maturity and consolidation.

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

The public testnet currently settles 144-block height epochs at the boundary
block. A fixed 04:00 payment for the prior civil day is a different rule: it
requires a versioned consensus specification for timezone/calendar behavior,
late and missing blocks, reorgs across a cutoff, fee attribution, and daylight
saving transitions. For that reason these blocks are explicitly labeled
`daily-distribution-prototype-v1` and must not be presented as valid current
`jgc-testnet-v3` blocks.

Before adopting the policy, choose whether the production cutoff is fixed UTC
or a named civil timezone. This scenario uses Toronto time to make the requested
4 a.m. operating schedule concrete; a production chain should strongly prefer
a UTC/height-derived rule to avoid daylight-saving ambiguity.
