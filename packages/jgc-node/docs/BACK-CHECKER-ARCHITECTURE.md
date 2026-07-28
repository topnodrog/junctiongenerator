# Heterogeneous Back-Checker Architecture

JGC uses hardware diversity as a security advantage without assuming that
different GPUs or inference runtimes produce identical native output bytes.

## Roles and authority

| Role | Works across architectures | Result authority |
|---|---:|---|
| Proof verifier | Yes | Consensus pass/fail |
| Exact replay auditor | Only with matching execution profile | Quorum pass/slash/inconclusive |
| Quality auditor | Yes | Advisory acceptance or payment policy |

Only a sound portable proof may establish execution correctness for consensus.
Replay adds fraud detection for compatible runtimes. Quality review answers a
different question—whether the result was useful—and cannot create a
cryptographic fraud verdict by itself.

## Proof statement

A production proof must bind all of the following canonical values:

- network and proof-protocol version;
- miner and assigned task identifiers;
- approved program, circuit, model, and tokenizer digests as applicable;
- canonical input and output commitments;
- an integer work metric derived inside the proven program;
- epoch or challenge entropy preventing replay;
- any private witness required to establish the execution trace.

The verifier checks the proof against these public inputs. It does not need the
miner's processor architecture, GPU model, operating system, or inference
runtime.

## Decision rules

- Invalid or unavailable proof verification fails closed and the contribution
  is excluded from consensus.
- An execution-profile mismatch causes replay abstention, never slashing.
- Replay disagreement becomes slashable only after a compatible quorum
  converges under the configured economic threshold.
- Quality rejection can withhold customer acceptance or trigger review, but it
  cannot independently slash consensus stake.
- Slow hardware affects liveness and response deadlines, not proof validity or
  credited work.

## Current implementation boundary

`PQ-HASH-IOP-v1` is a simulation receipt, not a sound proof of computation. It
is accepted only in explicit simnet mode. Strict consensus can use registered
real Groth16 circuits, but general AI inference requires an audited transparent
STARK/zkVM or equivalent proof system before production activation.
