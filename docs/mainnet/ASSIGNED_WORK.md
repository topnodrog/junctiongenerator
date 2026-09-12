# Assigned useful-work foundation

The local `AssignedWorkJournal` in `packages/jgc-node/src/broker/assigned-work.ts`
supports one bounded program: the exact dot product of two signed int32 vectors
of equal length, from 1 to 4,096 terms. BigInt arithmetic produces a canonical
decimal result without floating point rounding. Resource units count terms;
they are not a claim of measured TFLOPS, energy or elapsed execution time.

Jobs bind a network, epoch, unique job ID, program digest and input commitment.
Leases bind a fresh ID, miner and deadline. Results commit to all those fields,
the assigned units and the output. The verifier re-executes the calculation.
An incorrect output, wrong context, wrong miner, expired or superseded lease,
or second completion is rejected before any result is recorded.

## Persistence and operation

Use a dedicated directory per network. Each accepted event is written with
exclusive creation and fsynced before returning. Every operation replays and
validates the checksum-linked journal. Competing writers cannot overwrite the
same revision; a writer encountering a conflict must retry from current state.
Returned objects are copies. There is a hard limit of 10,000 events; this is a
bounded rehearsal store, not a production database.

A partial write, missing entry, unexpected file, corrupt checksum or wrong
network causes a hard failure. Do not discard a broken entry and resume issuing
claims automatically. Preserve it and recover from a verified backup. This
does not authenticate storage against a malicious operator, detect a rolled-back
or truncated tail, or guarantee directory-entry durability on every filesystem.
Those properties need a transactional production store and external checkpoints.

## Integration boundary

The legacy `ComputeBroker.completeAssignment` now always returns false. Its
unbound `ComputeProof` objects cannot authorize assignment payments. The new
journal is intentionally separate from the running pilot and has no payout API.
Its `miner` argument must be supplied by an authenticated caller when a remote
transport is built; accepting a miner name from a request body is insufficient.
Inputs are stored in plaintext, so use synthetic or public vectors only.

Next steps are authenticated dispatch, production persistence and recovery,
buyer funding and reservation, idempotent settlement tied to a ledger transaction,
and reward/reorg accounting. Verifying the output proves correctness of this
small calculation, not that a particular machine spent time or energy doing it.
It does not establish general LLM correctness, useful demand, storage service,
permissionless consensus, or mainnet readiness.
