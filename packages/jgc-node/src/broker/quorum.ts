/**
 * @file src/broker/quorum.ts
 * @description Multi-challenger quorum — hardens replay verification against
 * collusion (and against cross-machine non-determinism).
 *
 * THE PROBLEM IT FIXES
 * ────────────────────
 * challenge.ts resolves a claim with ONE challenger. If that challenger is itself
 * a node, a liar can collude with it: the verifier rubber-stamps a forged claim
 * (false PASS) or griefs an honest one (false SLASH). A single verdict is only as
 * honest as a single party.
 *
 * THE MECHANISM
 * ─────────────
 *   1. SORTITION — for each claim, independently draw a subset of challengers via
 *      sha256(commitment ‖ beacon ‖ challengerId). Unpredictable before the
 *      beacon is known (so a liar can't pre-collude with exactly its checkers),
 *      verifiable after (anyone recomputes who was eligible).
 *   2. INDEPENDENT REPLAY — each selected challenger replays the spec and reports
 *      the commitment it computed (its "vote"). Reuses verifyReplay.
 *   3. CONVERGENCE — tally the votes. A verdict is reached only if a SUPERMAJORITY
 *      converge on one commitment:
 *        • converged == claim          → PASS  (no slash)
 *        • converged ≠  claim          → SLASH (network agrees on a different
 *                                         output than the prover claimed)
 *        • no supermajority converges  → INCONCLUSIVE (don't slash)
 *
 * WHY CONVERGENCE, NOT JUST "MOST DISAGREE"
 * ─────────────────────────────────────────
 * Slashing on "≥t challengers differ from the claim" would punish an honest
 * prover whenever honest challengers merely SCATTER (the cross-machine
 * determinism caveat — different hardware, different FP reduction order). By
 * requiring the disagreers to AGREE WITH EACH OTHER on a single replacement
 * commitment, real fraud (everyone converges on X, prover said Y) is separated
 * from non-determinism (everyone differs) — the latter is INCONCLUSIVE, never a
 * wrongful slash.
 *
 * SECURITY BOUND (honest scope — see [[trusted-compute-research]])
 * ────────────────────────────────────────────────────────────────
 * With a 2/3 agreement threshold this tolerates < 1/3 colluding/faulty
 * challengers (classic BFT bound): a forged claim is slashed as long as an honest
 * supermajority is selected, and an honest claim survives a colluding minority.
 * Beyond 1/3 collusion the guarantee breaks. The cross-machine determinism
 * problem is mitigated (scatter ⇒ inconclusive) but NOT solved — a canonical
 * reference runtime is still the real fix.
 */

import { StakeLedger, verifiableDraw } from "./challenge.js";
import { verifyReplay, type JunctioningClaim } from "./verification.js";
import type { InferenceBackend } from "./junctioning.js";

/** An independent verifier: an id plus the backend it replays on. */
export interface Challenger {
  id:      string;
  backend: InferenceBackend;
}

/** One challenger's reported result for a claim. */
export interface ChallengerVote {
  id:         string;
  commitment: string;
}

export type QuorumVerdict = "pass" | "slash" | "inconclusive";

/** Pure tally of a set of votes against a claim's commitment. */
export interface QuorumTally {
  verdict:       QuorumVerdict;
  total:         number;
  /** Most-agreed commitment among the votes (undefined if no votes). */
  topCommitment?: string;
  topCount:      number;
  /** topCount / total — the convergence level. */
  agreement:     number;
  matchesClaim:  boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sortition
// ─────────────────────────────────────────────────────────────────────────────

/** Verifiable per-challenger selection: drawn iff
 *  sha256(commitment ‖ beacon ‖ id) < probability. */
export function isChallengerSelected(
  commitment:  string,
  beacon:      string,
  challengerId: string,
  probability: number,
): boolean {
  if (probability >= 1) return true;
  if (probability <= 0) return false;
  return verifiableDraw(commitment, beacon, challengerId) < probability;
}

/** Filter a challenger set down to those selected for this claim+beacon. */
export function selectChallengers(
  commitment:  string,
  beacon:      string,
  challengers: Challenger[],
  probability: number,
): Challenger[] {
  return challengers.filter((c) => isChallengerSelected(commitment, beacon, c.id, probability));
}

// ─────────────────────────────────────────────────────────────────────────────
// Voting + tally
// ─────────────────────────────────────────────────────────────────────────────

/** Have each challenger independently replay the claim and report its commitment. */
export async function collectVotes(
  claim:       JunctioningClaim,
  challengers: Challenger[],
): Promise<ChallengerVote[]> {
  const votes = await Promise.all(
    challengers.map(async (c) => {
      const { actualCommitment, compatible } = await verifyReplay(claim, c.backend);
      return compatible ? { id: c.id, commitment: actualCommitment } : undefined;
    }),
  );
  return votes.filter((vote): vote is ChallengerVote => vote !== undefined);
}

/**
 * Tally votes (commitments) against the claim. PASS/SLASH only when a
 * supermajority converges; scattered honest disagreement is INCONCLUSIVE.
 */
export function tallyQuorum(
  claimCommitment: string,
  votes:           string[],
  params:          { agreementThreshold?: number; minQuorum?: number } = {},
): QuorumTally {
  const total     = votes.length;
  const threshold = params.agreementThreshold ?? 2 / 3;
  const minQuorum = params.minQuorum ?? 1;

  const counts = new Map<string, number>();
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1);

  let topCommitment: string | undefined;
  let topCount = 0;
  for (const [c, n] of counts) {
    if (n > topCount) { topCount = n; topCommitment = c; }
  }

  const agreement    = total > 0 ? topCount / total : 0;
  const matchesClaim = topCommitment !== undefined && topCommitment === claimCommitment;

  let verdict: QuorumVerdict;
  if (total < minQuorum || topCommitment === undefined || agreement < threshold) {
    verdict = "inconclusive";
  } else {
    verdict = matchesClaim ? "pass" : "slash";
  }

  return { verdict, total, topCommitment, topCount, agreement, matchesClaim };
}

// ─────────────────────────────────────────────────────────────────────────────
// Coordinator
// ─────────────────────────────────────────────────────────────────────────────

export interface QuorumChallengeParams {
  /** Per-challenger sortition probability. */
  selectionProbability: number;
  /** Fraction that must converge on one commitment to decide. Default 2/3. */
  agreementThreshold?: number;
  /** Minimum responding challengers to decide at all. Default 1. */
  minQuorum?: number;
  /** Stake removed from a node whose claim is slashed. */
  slashAmount: number;
  /** Basis points of the slash split among the challengers who voted with the
   *  converged (correct) commitment. Default 0. */
  challengerRewardBps?: number;
}

export interface QuorumResolution {
  challenged:          boolean;
  verdict:             QuorumVerdict;
  /** Ids drawn by sortition for this claim. */
  selected:            string[];
  tally:               QuorumTally;
  slashed:             number;
  /** Total reward, to be split among `rewardedChallengers`. */
  challengerReward:    number;
  /** Challengers who voted with the converged commitment (paid on a slash). */
  rewardedChallengers: string[];
  reason?:             string;
}

/**
 * Resolves claims by quorum: sortition → independent replay → convergence →
 * slash. Hold one per network view; feed it each node's claim plus the beacon.
 */
export class QuorumChallengeCoordinator {
  constructor(
    private readonly params:      QuorumChallengeParams,
    private readonly ledger:      StakeLedger,
    private readonly challengers: Challenger[],
  ) {}

  /** Challengers selected for this claim under the current beacon. */
  select(claim: JunctioningClaim, beacon: string): Challenger[] {
    return selectChallengers(claim.commitment, beacon, this.challengers, this.params.selectionProbability);
  }

  async resolve(
    claim:  JunctioningClaim,
    nodeId: string,
    beacon: string,
  ): Promise<QuorumResolution> {
    const selected  = this.select(claim, beacon);
    const minQuorum = this.params.minQuorum ?? 1;

    // Too few challengers drawn to decide — don't replay, don't slash.
    if (selected.length < minQuorum) {
      return {
        challenged:          selected.length > 0,
        verdict:             "inconclusive",
        selected:            selected.map((c) => c.id),
        tally:               tallyQuorum(claim.commitment, [], this.params),
        slashed:             0,
        challengerReward:    0,
        rewardedChallengers: [],
      };
    }

    const votes = await collectVotes(claim, selected);
    const tally = tallyQuorum(claim.commitment, votes.map((v) => v.commitment), this.params);

    if (tally.verdict !== "slash") {
      return {
        challenged:          true,
        verdict:             tally.verdict,
        selected:            selected.map((c) => c.id),
        tally,
        slashed:             0,
        challengerReward:    0,
        rewardedChallengers: [],
      };
    }

    const slashed             = this.ledger.slash(nodeId, this.params.slashAmount);
    const rewardedChallengers = votes.filter((v) => v.commitment === tally.topCommitment).map((v) => v.id);
    const challengerReward    = Math.floor(slashed * (this.params.challengerRewardBps ?? 0)) / 10000;

    return {
      challenged:          true,
      verdict:             "slash",
      selected:            selected.map((c) => c.id),
      tally,
      slashed,
      challengerReward,
      rewardedChallengers,
      reason:              "quorum converged on a different output than the claim",
    };
  }
}
