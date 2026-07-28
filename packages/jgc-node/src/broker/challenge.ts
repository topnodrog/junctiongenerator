/**
 * @file src/broker/challenge.ts
 * @description Sampling + slashing — the economic layer over replay verification.
 *
 * WHY THIS EXISTS
 * ───────────────
 * verification.ts gives a fraud-proof BASIS (replay a claim, compare commitments).
 * But replaying EVERY task doubles the network's compute — the cost problem that
 * sinks naive verifiable-compute designs (see [[trusted-compute-research]]). The
 * fix is cryptoeconomic, not cryptographic: challenge only a random SAMPLE of
 * claims, and slash a caught liar hard enough that cheating is negative-EV even
 * at a low sample rate.
 *
 *     Cheating is deterred when   p · slash  >  gainPerFakedTask
 *
 * so a small p (cheap verification) is safe if the staked `slash` is large.
 *
 * VERIFIABLE SAMPLING (the subtle part)
 * ─────────────────────────────────────
 * The challenge decision must be UNPREDICTABLE to the prover (so it can't cheat
 * only on un-challenged tasks) yet VERIFIABLE by the network (so everyone agrees
 * who was challenged). We derive it from sha256(commitment ‖ beacon): the prover
 * can't predict `beacon` (an external, after-the-fact randomness source — a future
 * block hash / drand round), but once revealed anyone recomputes the same verdict.
 * Sourcing that beacon is a protocol responsibility; this module just consumes it.
 *
 * WHAT THIS IS NOT (honest scope — see [[trusted-compute-research]])
 * ─────────────────────────────────────────────────────────────────
 *   • The replay verdict still rests on cross-machine determinism (the hard,
 *     deferred part inherited from verification.ts).
 *   • COLLUSION with a SINGLE challenger is unsafe: a liar could be "challenged"
 *     by a colluding verifier who rubber-stamps. The multi-challenger QUORUM in
 *     quorum.ts addresses this (supermajority of independently-sorted
 *     challengers); challengerRewardBps is the incentive to actually verify.
 *   • `p` must be tuned to the EMPIRICAL fraud rate — the open question all these
 *     systems hit. Too low misses rare-but-large fraud; too high and verification
 *     cost dominates.
 */

import { createHash } from "crypto";
import { verifyReplay, type JunctioningClaim } from "./verification.js";
import type { InferenceBackend } from "./junctioning.js";

// ─────────────────────────────────────────────────────────────────────────────
// Economic safety math (pure — reason about parameters before deploying them)
// ─────────────────────────────────────────────────────────────────────────────

/** Expected penalty (p · slash) exceeds the gain from one faked task ⇒ -EV. */
export function isCheatingDeterred(
  challengeProbability: number,
  slashAmount: number,
  gainPerTask: number,
): boolean {
  return challengeProbability * slashAmount > gainPerTask;
}

/** Minimum slash that deters cheating at probability `p`, with a safety margin
 *  (margin 1 = break-even; use >1 to demand strictly -EV cheating). */
export function minSlashToDeter(
  challengeProbability: number,
  gainPerTask: number,
  margin = 1,
): number {
  if (challengeProbability <= 0) return Infinity; // never challenged ⇒ never deterred
  return (gainPerTask * margin) / challengeProbability;
}

/** Minimum challenge probability that deters cheating given a fixed `slash`. */
export function minProbabilityToDeter(
  slashAmount: number,
  gainPerTask: number,
  margin = 1,
): number {
  if (slashAmount <= 0) return Infinity;
  return (gainPerTask * margin) / slashAmount;
}

// ─────────────────────────────────────────────────────────────────────────────
// Verifiable sampling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uniform draw in [0,1) from sha256 of the given parts (order-sensitive). The
 * shared basis for every verifiable, prover-unpredictable random decision in the
 * economic layer: same parts ⇒ same draw, so any verdict derived from it is
 * auditable. Bind in an external beacon to make the draw unpredictable ahead of
 * time. See also quorum.ts (challenger sortition).
 */
export function verifiableDraw(...parts: string[]): number {
  const h = createHash("sha256");
  for (const part of parts) h.update(part);
  return Number(h.digest().readBigUInt64BE(0)) / 2 ** 64;
}

/**
 * Deterministic, prover-unpredictable challenge decision. Draws a uniform value
 * in [0,1) from sha256(commitment ‖ beacon) and challenges if it falls under
 * `probability`. Same inputs ⇒ same verdict, so the network can audit it.
 */
export function shouldChallenge(
  commitment:  string,
  beacon:      string,
  probability: number,
): boolean {
  if (probability >= 1) return true;
  if (probability <= 0) return false;
  return verifiableDraw(commitment, beacon) < probability;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stake ledger
// ─────────────────────────────────────────────────────────────────────────────

/** Tracks each node's bonded stake and whether it has been slashed. */
export class StakeLedger {
  private readonly stakes  = new Map<string, number>();
  private readonly slashed = new Set<string>();

  /** Add bonded stake for a node. */
  bond(nodeId: string, amount: number): void {
    this.stakes.set(nodeId, this.stakeOf(nodeId) + amount);
  }

  stakeOf(nodeId: string): number {
    return this.stakes.get(nodeId) ?? 0;
  }

  isSlashed(nodeId: string): boolean {
    return this.slashed.has(nodeId);
  }

  /** Remove up to `amount` of a node's stake and mark it slashed. Returns the
   *  amount actually removed (capped at the node's remaining stake). */
  slash(nodeId: string, amount: number): number {
    const have    = this.stakeOf(nodeId);
    const removed = Math.min(have, Math.max(0, amount));
    this.stakes.set(nodeId, have - removed);
    this.slashed.add(nodeId);
    return removed;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Challenge coordinator
// ─────────────────────────────────────────────────────────────────────────────

export interface ChallengeParams {
  /** Fraction of claims to challenge, 0..1. Lower = cheaper, riskier. */
  challengeProbability: number;
  /** Stake removed when a node fails a challenge. */
  slashAmount: number;
  /** Basis points (1/10000) of the slashed stake paid to the challenger as the
   *  incentive to actually run verification. Default 0. */
  challengerRewardBps?: number;
}

export type ChallengeOutcome = "not-challenged" | "passed" | "slashed" | "inconclusive";

export interface ChallengeResolution {
  challenged:       boolean;
  /** Replay result, present only when challenged. */
  verified?:        boolean;
  outcome:          ChallengeOutcome;
  /** Stake removed from the node (0 unless slashed). */
  slashed:          number;
  /** Paid to the challenger out of the slash (0 unless slashed). */
  challengerReward: number;
  reason?:          string;
}

/**
 * Ties sampling → replay verification → slashing together. Hold one per network
 * view; feed it each node's claim plus the current randomness beacon.
 */
export class ChallengeCoordinator {
  constructor(
    private readonly params:  ChallengeParams,
    private readonly ledger:  StakeLedger,
    private readonly backend: InferenceBackend,
  ) {}

  /** Verifiable sampling decision for a claim under the current beacon. */
  shouldChallenge(claim: JunctioningClaim, beacon: string): boolean {
    return shouldChallenge(claim.commitment, beacon, this.params.challengeProbability);
  }

  /** Are the current params + this node's stake enough to deter `gainPerTask`? */
  deters(gainPerTask: number, nodeId: string): boolean {
    const slashable = Math.min(this.params.slashAmount, this.ledger.stakeOf(nodeId));
    return isCheatingDeterred(this.params.challengeProbability, slashable, gainPerTask);
  }

  /**
   * Resolve one node's claim: sample it, and if challenged, replay-verify and
   * slash on failure. `beacon` is the external randomness the sampling binds to.
   */
  async resolve(
    claim:  JunctioningClaim,
    nodeId: string,
    beacon: string,
  ): Promise<ChallengeResolution> {
    if (!this.shouldChallenge(claim, beacon)) {
      return { challenged: false, outcome: "not-challenged", slashed: 0, challengerReward: 0 };
    }

    const { verified, compatible, reason } = await verifyReplay(claim, this.backend);
    if (!compatible) {
      return {
        challenged: true, verified: false, outcome: "inconclusive",
        slashed: 0, challengerReward: 0, reason,
      };
    }
    if (verified) {
      return { challenged: true, verified: true, outcome: "passed", slashed: 0, challengerReward: 0 };
    }

    const slashed          = this.ledger.slash(nodeId, this.params.slashAmount);
    const challengerReward = Math.floor(slashed * (this.params.challengerRewardBps ?? 0)) / 10000;
    return {
      challenged: true,
      verified:   false,
      outcome:    "slashed",
      slashed,
      challengerReward,
      reason:     reason ?? "failed replay challenge",
    };
  }
}
