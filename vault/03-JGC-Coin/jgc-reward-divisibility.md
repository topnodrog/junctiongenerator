---
name: jgc-reward-divisibility
description: LOCKED — JGC uses 16 decimals + single-absorber dust; wire format must use >64-bit money field
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c068aa4-5366-42b6-b8f5-01e71bf2c4a0
---

**DECISION (2026-06-14, implemented & locked — do not reopen):** JGC base-unit divisibility = **16 decimals** (1 JGC = 10^16 base units); dust policy = **single absorber** (epoch floor-residual → lowest-TFLOPS miner).

**Why 16:** the epoch pro-rata pool is split among ALL compute contributors; at 8 decimals (Bitcoin) small/late-era contributors round to zero. 16 decimals gives era-0 pool = 7.2×10^19 base units — safe for any plausible participant count for ~a century+.

**Implemented in [[project-jgc]]:** `emission.ts` adds `DECIMALS=16`, `BASE_UNITS_PER_JGC=10n**16n`, `INITIAL_BLOCK_REWARD_SATOSHIS=50n*BASE`, `HARD_CAP_SATOSHIS=21_000_000n*BASE`. `epoch.ts computeEpochSettlement` uses EXACT BigInt pro-rata (last/lowest miner absorbs floor residual) — fixes a latent `Number()` precision bug. `validation.ts` MAX_MONEY = HARD_CAP_SATOSHIS. Display helpers updated /1e8→/1e16. Jest test: 100k-miner epoch → all payouts > 0 + exact sum.

**OPEN (direct consequence):** 21M × 10^16 = 2.1×10^23 exceeds signed int64. Future canonical binary tx wire serialization MUST use a >64-bit money field (u128 / varint). `JGCSatoshis`/`*_SATOSHIS` naming kept (documented as "base units").

**How to apply:** divisibility + dust policy are LOCKED. Size the future wire money field for 2.1×10^23 (u128/varint), never int64.
