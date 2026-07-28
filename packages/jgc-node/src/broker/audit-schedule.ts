/**
 * @file src/broker/audit-schedule.ts
 * @description Deterministic scheduling for historical compute audits.
 *
 * Claims are grouped into fixed block windows. A later block hash acts as the
 * randomness beacon, so a claimant cannot know which of its claims or which
 * validators will be selected before committing the work. Every claimant with
 * a claim in the window receives one coverage audit; additional claims may be
 * sampled independently.
 *
 * This module schedules historical verification only. Reachability and
 * currently-advertised capacity are liveness signals and must not be treated as
 * evidence that an earlier compute claim was honest.
 */

import { createHash } from "crypto";
import { compareCanonicalBytes } from "../protocol/canonical.js";

export interface AuditableComputeClaim {
  /** Unique claim identifier (normally its on-chain commitment or tx id). */
  claimId: string;
  /** Bonded node that asserted the compute contribution. */
  claimantId: string;
  /** Commitment verified by replay or checkpoint sampling. */
  commitment: string;
  /** Height at which the claim became part of the active chain. */
  blockHeight: number;
}

export interface AuditValidator {
  validatorId: string;
  bondedStake: bigint;
  active: boolean;
}

export interface AuditWindow {
  index: number;
  startHeight: number;
  endHeight: number;
  beaconHeight: number;
}

export interface AuditPolicy {
  windowSize: number;
  beaconDelayBlocks: number;
  committeeSize: number;
  minimumBond: bigint;
  /** Probability that each non-coverage claim receives an additional audit. */
  extraClaimProbability: number;
}

export const DEFAULT_AUDIT_POLICY: Readonly<AuditPolicy> = {
  windowSize: 10,
  beaconDelayBlocks: 2,
  committeeSize: 3,
  minimumBond: 1n,
  extraClaimProbability: 0,
};

export interface AuditAssignment {
  windowIndex: number;
  claimId: string;
  claimantId: string;
  commitment: string;
  claimHeight: number;
  beaconHeight: number;
  beaconHash: string;
  /** Independently selected bonded validators; never contains the claimant. */
  committee: string[];
  /** Coverage means the one guaranteed audit for this claimant in the window. */
  reason: "coverage" | "random-sample";
}

export interface AuditSchedule {
  window: AuditWindow;
  assignments: AuditAssignment[];
  /** Claimants that could not receive the required independent committee. */
  uncoveredClaimants: string[];
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

function validatePolicy(policy: AuditPolicy): void {
  requirePositiveInteger(policy.windowSize, "windowSize");
  if (!Number.isInteger(policy.beaconDelayBlocks) || policy.beaconDelayBlocks < 1) {
    throw new Error("beaconDelayBlocks must be a positive integer");
  }
  requirePositiveInteger(policy.committeeSize, "committeeSize");
  if (policy.minimumBond < 0n) {
    throw new Error("minimumBond must be non-negative");
  }
  if (policy.extraClaimProbability < 0 || policy.extraClaimProbability > 1) {
    throw new Error("extraClaimProbability must be between 0 and 1");
  }
}

/** Window zero covers heights 1..windowSize; genesis height zero is excluded. */
export function auditWindow(
  index: number,
  policy: AuditPolicy = DEFAULT_AUDIT_POLICY,
): AuditWindow {
  validatePolicy(policy);
  if (!Number.isInteger(index) || index < 0) throw new Error("window index must be a non-negative integer");
  const startHeight = index * policy.windowSize + 1;
  const endHeight = startHeight + policy.windowSize - 1;
  return {
    index,
    startHeight,
    endHeight,
    beaconHeight: endHeight + policy.beaconDelayBlocks,
  };
}

function digest(...parts: string[]): Buffer {
  const h = createHash("sha3-256");
  for (const part of parts) {
    const bytes = Buffer.from(part, "utf8");
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(bytes.length);
    h.update(length).update(bytes);
  }
  return h.digest();
}

/** Stable identity for a contribution at an exact active-chain position. */
export function computeAuditClaimId(blockHash: string, contributionIndex: number): string {
  if (!/^[0-9a-f]{64}$/i.test(blockHash)) throw new Error("block hash must be 32-byte hex");
  if (!Number.isSafeInteger(contributionIndex) || contributionIndex < 0) {
    throw new Error("contribution index must be a non-negative integer");
  }
  return digest("jgc-audit-claim-v1", blockHash.toLowerCase(), String(contributionIndex)).toString("hex");
}

function draw(...parts: string[]): number {
  return Number(digest(...parts).readBigUInt64BE(0)) / 2 ** 64;
}

function rank<T>(items: T[], key: (item: T) => string, ...seed: string[]): T[] {
  return [...items].sort((a, b) => {
    const ah = digest(...seed, key(a));
    const bh = digest(...seed, key(b));
    return Buffer.compare(ah, bh) || compareCanonicalBytes(key(a), key(b));
  });
}

function selectCommittee(
  claim: AuditableComputeClaim,
  validators: AuditValidator[],
  beaconHash: string,
  size: number,
  minimumBond: bigint,
): string[] {
  const eligible = validators.filter((validator) =>
    validator.active &&
    validator.bondedStake >= minimumBond &&
    validator.validatorId !== claim.claimantId
  );
  return rank(
    eligible,
    (validator) => validator.validatorId,
    "jgc-audit-committee-v1",
    beaconHash,
    claim.commitment,
  ).slice(0, size).map((validator) => validator.validatorId);
}

/**
 * Build the auditable schedule once the exact delayed beacon block is known.
 * The same active-chain claims, validator roster, policy, and beacon always
 * produce the same result, so every node can independently verify assignments.
 */
export function buildAuditSchedule(
  window: AuditWindow,
  beacon: { height: number; hash: string },
  claims: AuditableComputeClaim[],
  validators: AuditValidator[],
  policy: AuditPolicy = DEFAULT_AUDIT_POLICY,
): AuditSchedule {
  validatePolicy(policy);
  if (beacon.height !== window.beaconHeight) {
    throw new Error(`audit beacon must be block ${window.beaconHeight}`);
  }
  if (!/^[0-9a-fA-F]{64}$/.test(beacon.hash)) throw new Error("audit beacon hash must be 32-byte hex");

  const claimIds = new Set<string>();
  for (const claim of claims) {
    if (!claim.claimId || claimIds.has(claim.claimId)) {
      throw new Error(`duplicate or empty audit claim id: ${claim.claimId}`);
    }
    claimIds.add(claim.claimId);
  }
  const validatorIds = new Set<string>();
  for (const validator of validators) {
    if (!validator.validatorId || validatorIds.has(validator.validatorId)) {
      throw new Error(`duplicate or empty audit validator id: ${validator.validatorId}`);
    }
    validatorIds.add(validator.validatorId);
  }

  const inWindow = claims.filter((claim) =>
    claim.blockHeight >= window.startHeight && claim.blockHeight <= window.endHeight
  );
  const byClaimant = new Map<string, AuditableComputeClaim[]>();
  for (const claim of inWindow) {
    const group = byClaimant.get(claim.claimantId) ?? [];
    group.push(claim);
    byClaimant.set(claim.claimantId, group);
  }

  const selected = new Map<string, { claim: AuditableComputeClaim; reason: AuditAssignment["reason"] }>();

  // Coverage floor: one unpredictable claim from every claimant in the window.
  for (const [claimantId, group] of [...byClaimant.entries()].sort(([a], [b]) => compareCanonicalBytes(a, b))) {
    const coverage = rank(
      group,
      (claim) => claim.claimId,
      "jgc-audit-coverage-v1",
      beacon.hash,
      claimantId,
    )[0]!;
    selected.set(coverage.claimId, { claim: coverage, reason: "coverage" });
  }

  // Optional independent sampling adds depth without weakening the coverage floor.
  for (const claim of inWindow) {
    if (selected.has(claim.claimId)) continue;
    if (draw("jgc-audit-extra-v1", beacon.hash, claim.commitment) < policy.extraClaimProbability) {
      selected.set(claim.claimId, { claim, reason: "random-sample" });
    }
  }

  const assignments: AuditAssignment[] = [];
  const uncovered = new Set<string>();
  for (const { claim, reason } of selected.values()) {
    const committee = selectCommittee(
      claim,
      validators,
      beacon.hash,
      policy.committeeSize,
      policy.minimumBond,
    );
    if (committee.length < policy.committeeSize) {
      if (reason === "coverage") uncovered.add(claim.claimantId);
      continue;
    }
    assignments.push({
      windowIndex: window.index,
      claimId: claim.claimId,
      claimantId: claim.claimantId,
      commitment: claim.commitment,
      claimHeight: claim.blockHeight,
      beaconHeight: beacon.height,
      beaconHash: beacon.hash.toLowerCase(),
      committee,
      reason,
    });
  }

  assignments.sort((a, b) => compareCanonicalBytes(a.claimId, b.claimId));
  return {
    window,
    assignments,
    uncoveredClaimants: [...uncovered].sort(),
  };
}
