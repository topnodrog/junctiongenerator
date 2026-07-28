# Historical Compute Audit Protocol

JGC audits committed compute claims, not merely node availability.

## Schedule

- Claims are grouped into fixed 10-block windows.
- The hash two blocks after a window closes is the audit randomness beacon.
- Every claimant has one claim selected from the completed window.
- Additional claims may be sampled according to the network audit probability.
- Each selected claim receives three distinct bonded validators by default.
- The claimant can never be a member of its own audit committee.

Because the beacon is produced after the claims are committed, miners cannot
know which work will be inspected when they submit it. Given the same active
chain, validator roster, and policy, every node derives the same assignments.

## Verdict

The selected validators replay the task or verify randomly requested committed
checkpoints. The existing quorum rule applies:

- two-thirds converge on the claimed commitment: pass;
- two-thirds converge on another commitment: fraud evidence;
- no convergent supermajority: inconclusive, never slash.

The peer protocol now carries:

- `AUDIT_REQUEST`: a deterministic assignment bound to a claim and delayed
  beacon on the receiving node's active chain;
- `AUDIT_VOTE`: an ML-DSA-signed validator observation;
- `AUDIT_VERDICT`: evidence that a node accepts only when it can reproduce the
  same result from its locally held signed votes.

Consensus V3 also carries finalized verdicts in the block body. The 192-byte
header's `auditRoot` commits the complete request, assignment, deadline,
derived result, and every ML-DSA-signed vote. Verdicts are ordered by audit id,
votes are ordered by validator id, and commitment ties use a lexical
tie-breaker so message arrival order cannot split consensus.

Full nodes reject an audit-bearing block unless they can independently verify:

- every vote signature and committee membership;
- the quorum calculation and derived verdict;
- the exact claim contribution and delayed beacon on the active chain;
- the deterministic 10-block window and two-block beacon delay;
- that the verdict predates its containing block; and
- that the audit id has not already been committed.

This lets a newly syncing node reconstruct the audit index from block data
alone. The separate `audits.json` file is only a recoverable working index for
open requests and uncommitted evidence.

The response deadline is measured in block heights. A verdict requires a
two-thirds supermajority of the entire assigned committee, not merely a
majority of whichever validators responded. Missing or scattered votes become
inconclusive after the deadline.

Requests, votes, and verdict evidence are atomically persisted under the node
data directory. Restart recovery revalidates request structure, every ML-DSA
signature, and both active-chain anchors before restoring an audit. Malformed
stores are quarantined instead of trusted.

After a chain reorganization, the node reconciles all audit evidence against
the replacement active chain. If the claim block or delayed beacon is no longer
active, the request, its votes, and any verdict are discarded and the cleaned
state is persisted.

Verdicts remain deliberately non-punitive today. The evidence commitment is
now consensus-enforced, but automatic rewards and slashing must wait for a
consensus-owned bond/validator registry. Until the validator roster and stake
snapshot used for committee selection are themselves reconstructible from
chain state, an audit verdict is durable evidence—not authority to move funds.

## Liveness is separate

Reachability, model availability, prompt response, and current capacity are
liveness signals. They can influence job assignment and node reputation, but
they do not prove that previously rewarded compute was performed.

## Initial safety parameters

| Parameter | Initial value |
|---|---:|
| Window size | 10 blocks |
| Beacon delay | 2 blocks |
| Committee size | 3 validators |
| Agreement threshold | 2/3 |
| Response window | 10 blocks |
| Guaranteed coverage | 1 claim per claimant per window |
| Extra random sampling | 0% initially |

Before public activation, set the minimum bond, slash amount, audit deadline,
checkpoint granularity, and validator reward from measured task cost and block
time. Public exposure also requires peer rate limits and misbehavior scoring.
