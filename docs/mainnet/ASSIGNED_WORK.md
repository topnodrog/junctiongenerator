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

## Signed worker results

Operator-authorized dispatch can now use `leaseToKey` with a pinned ML-DSA-65
public key. Its `workkey:` identity uses the full SHA3-256 key digest and is
not a wallet payment address. The worker signs `workResultSignatureHash(job,
output)` and submits through `completeSigned`. The domain-separated digest
binds the entire result context, including the network and fresh lease ID.
Key-assigned jobs reject the unsigned completion API. Signature evidence is
stored in the journal and reverified during replay, as well as the computation.

Legacy name-assigned jobs remain a trusted local rehearsal API. Do not expose
`lease`, `leaseToKey`, or unsigned `complete` directly to untrusted clients.
This increment authenticates results; it does not authenticate the dispatcher,
authorize worker enrollment, provide transport confidentiality or prevent a
malicious storage operator from replacing history. Remote APIs still need
authorization, request-size limits, rate limits and secure transport.

## Funded reservation rehearsal

The journal now supports synthetic buyer credits and atomic reservation/settlement
for this bounded program. `credit(creditId, buyer, units)` is a trusted local
operator fixture API, **not a deposit endpoint**. Credit IDs cannot be reused.
Amounts are canonical positive decimal integers of at most 30 digits; accounting
uses BigInt. These balances are valueless rehearsal units, not JGC or wallet funds.

`createFunded` creates a job and subtracts its reservation from available buyer
credits in one event. Insufficient funds and duplicate job IDs fail without an
entry. The caller must already be authorized to act for the buyer. Funded jobs
require a `workkey:` lease, a valid signed result and a lease deadline no later
than reservation expiry. The signed result additionally commits to buyer, amount
and expiry; existing unfunded result commitments retain their original encoding.

Verified completion records the output, marks the reservation paid and credits
the assigned worker identity in **one** fsynced event. There is no separate payout
queue or external side effect. Replaying the journal reconstructs all three
changes together. Duplicate completion is rejected, including after a response
is lost and the caller retries following restart; callers can query the saved
job to reconcile that outcome. This guarantees at-most-once credit effects in a
valid journal, not exactly-once delivery of a response.

`refund` requires the matching buyer and either no lease or an expired lease.
An active lease cannot be cancelled out from under a worker. At the lease
deadline completion is rejected and refund becomes eligible. Refunded jobs are
terminal: they cannot be leased, completed, recreated or refunded twice. Expiry
does not automatically append a refund; an authorized caller must request it.
The existing trusted clock and storage assumptions still apply.

`funded-work.test.ts` checks conservation, replay/restart, duplicate credits and
jobs, competing instances, signed funding-term substitution, invalid results,
deadline boundaries, refunds and torn settlement records. A torn record blocks
all further access until operator recovery; it is not silently repaired. The
30-digit per-event bound and 10,000-event journal cap bound accounting size.

Local validation on 2026-09-13: `npm run release:check` passed 54 suites / 466
tests, typecheck, build, bundle verification and four release-manifest tests.
All ten remaining mainnet gates, including `usefulServices`, remain blocked.

Next steps are authenticated remote dispatch, production persistence and recovery,
real buyer funding, settlement tied to a consensus ledger transaction,
and reward/reorg accounting. Verifying the output proves correctness of this
small calculation, not that a particular machine spent time or energy doing it.
It does not establish general LLM correctness, useful demand, storage service,
permissionless consensus, or mainnet readiness.
