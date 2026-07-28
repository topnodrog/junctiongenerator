/**
 * @file src/broker/audit-protocol.ts
 * @description Network-safe lifecycle for historical compute audits.
 *
 * Audit assignments are deterministic and therefore need no trusted
 * coordinator signature. Validator votes are ML-DSA signed. A verdict is only
 * produced when a supermajority of the entire assigned committee converges, or
 * when the response deadline passes without such convergence (inconclusive).
 *
 * This module records evidence but deliberately does not slash. Slashing must
 * only occur after the verdict/evidence is committed to active chain state.
 */

import { createHash } from "crypto";
import type { AuditAssignment } from "./audit-schedule.js";
import {
  pqAddressFromPublicKey,
  pqSignHash,
  pqVerifyHashSignature,
} from "../crypto/pq-signatures.js";
import { compareCanonicalBytes } from "../protocol/canonical.js";

export interface AuditRequest {
  auditId: string;
  assignment: AuditAssignment;
  responseDeadlineHeight: number;
}

export interface AuditVote {
  auditId: string;
  validatorId: string;
  validatorPublicKey: string;
  observedCommitment: string;
  submittedAtHeight: number;
  signature: string;
}

export type AuditVerdictKind = "pass" | "fraud" | "inconclusive";

export interface AuditVerdictRecord {
  auditId: string;
  /** Full assignment and deadline needed for independent consensus checks. */
  request: AuditRequest;
  claimId: string;
  claimantId: string;
  claimedCommitment: string;
  verdict: AuditVerdictKind;
  topCommitment?: string;
  topCount: number;
  requiredVotes: number;
  committeeSize: number;
  finalizedAtHeight: number;
  evidence: AuditVote[];
}

export interface AuditLifecycleOptions {
  maxOpenAudits?: number;
  maxResponseBlocks?: number;
}

export interface AuditMutationResult {
  accepted: boolean;
  error?: string;
}

export interface AuditLifecycleState {
  requests: AuditRequest[];
  openVotes: AuditVote[];
  verdicts: AuditVerdictRecord[];
}

export interface AuditRestoreResult {
  restored: number;
  dropped: number;
  finalized: AuditVerdictRecord[];
}

function canonicalDigest(domain: string, fields: Array<string | number>): Uint8Array {
  const h = createHash("sha3-256");
  h.update(domain, "utf8");
  for (const field of fields) {
    const bytes = Buffer.from(String(field), "utf8");
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(bytes.length);
    h.update(length).update(bytes);
  }
  return new Uint8Array(h.digest());
}

interface DerivedVerdictSummary {
  verdict: AuditVerdictKind;
  topCommitment?: string;
  topCount: number;
  requiredVotes: number;
  committeeSize: number;
}

/**
 * Derive the verdict from a complete evidence set. Commitment ties are broken
 * lexicographically so arrival order can never change a consensus result.
 */
function deriveVerdictSummary(
  request: AuditRequest,
  evidence: AuditVote[],
): DerivedVerdictSummary {
  const committeeSize = request.assignment.committee.length;
  const requiredVotes = Math.ceil(committeeSize * 2 / 3);
  const counts = new Map<string, number>();
  for (const vote of evidence) {
    const commitment = vote.observedCommitment.toLowerCase();
    counts.set(commitment, (counts.get(commitment) ?? 0) + 1);
  }

  const top = [...counts.entries()].sort(
    ([aCommitment, aCount], [bCommitment, bCount]) =>
      bCount - aCount || compareCanonicalBytes(aCommitment, bCommitment),
  )[0];
  const topCommitment = top?.[0];
  const topCount = top?.[1] ?? 0;

  let verdict: AuditVerdictKind = "inconclusive";
  if (topCommitment !== undefined && topCount >= requiredVotes) {
    verdict = topCommitment === request.assignment.commitment.toLowerCase()
      ? "pass"
      : "fraud";
  }

  return { verdict, topCommitment, topCount, requiredVotes, committeeSize };
}

export function computeAuditId(
  assignment: AuditAssignment,
  responseDeadlineHeight: number,
): string {
  return Buffer.from(canonicalDigest("jgc-audit-request-v1", [
    assignment.windowIndex,
    assignment.claimId,
    assignment.claimantId,
    assignment.commitment,
    assignment.claimHeight,
    assignment.beaconHeight,
    assignment.beaconHash.toLowerCase(),
    [...assignment.committee].sort().join(","),
    responseDeadlineHeight,
  ])).toString("hex");
}

export function makeAuditRequest(
  assignment: AuditAssignment,
  responseWindowBlocks = 10,
): AuditRequest {
  if (!Number.isInteger(responseWindowBlocks) || responseWindowBlocks < 1) {
    throw new Error("responseWindowBlocks must be a positive integer");
  }
  const responseDeadlineHeight = assignment.beaconHeight + responseWindowBlocks;
  return {
    auditId: computeAuditId(assignment, responseDeadlineHeight),
    assignment,
    responseDeadlineHeight,
  };
}

export function auditVoteDigest(vote: Omit<AuditVote, "signature">): Uint8Array {
  return canonicalDigest("jgc-audit-vote-v1", [
    vote.auditId,
    vote.validatorId,
    vote.validatorPublicKey.toLowerCase(),
    vote.observedCommitment.toLowerCase(),
    vote.submittedAtHeight,
  ]);
}

export function createAuditVote(
  request: AuditRequest,
  observedCommitment: string,
  submittedAtHeight: number,
  keyPair: { publicKey: string; privateKey: string },
): AuditVote {
  const unsigned: Omit<AuditVote, "signature"> = {
    auditId: request.auditId,
    validatorId: pqAddressFromPublicKey(keyPair.publicKey),
    validatorPublicKey: keyPair.publicKey,
    observedCommitment: observedCommitment.toLowerCase(),
    submittedAtHeight,
  };
  return { ...unsigned, signature: pqSignHash(keyPair.privateKey, auditVoteDigest(unsigned)) };
}

export function verifyAuditVote(vote: AuditVote): boolean {
  if (!/^[0-9a-f]{64}$/i.test(vote.auditId)) return false;
  if (!/^[0-9a-f]{64}$/i.test(vote.observedCommitment)) return false;
  if (!Number.isSafeInteger(vote.submittedAtHeight) || vote.submittedAtHeight < 0) return false;
  try {
    if (pqAddressFromPublicKey(vote.validatorPublicKey) !== vote.validatorId) return false;
    const { signature: _signature, ...unsigned } = vote;
    return pqVerifyHashSignature(vote.signature, auditVoteDigest(unsigned), vote.validatorPublicKey);
  } catch {
    return false;
  }
}

/**
 * Canonical leaf committed by a block's auditRoot. The full request, verdict
 * summary, signed votes, and signatures are covered by the digest.
 */
export function auditVerdictCommitment(record: AuditVerdictRecord): string {
  const assignment = record.request.assignment;
  const evidence = [...record.evidence].sort((a, b) =>
    compareCanonicalBytes(a.validatorId, b.validatorId)
  );
  const fields: Array<string | number> = [
    record.auditId,
    assignment.windowIndex,
    assignment.claimId,
    assignment.claimantId,
    assignment.commitment.toLowerCase(),
    assignment.claimHeight,
    assignment.beaconHeight,
    assignment.beaconHash.toLowerCase(),
    [...assignment.committee].sort().join(","),
    assignment.reason,
    record.request.responseDeadlineHeight,
    record.claimId,
    record.claimantId,
    record.claimedCommitment.toLowerCase(),
    record.verdict,
    record.topCommitment?.toLowerCase() ?? "",
    record.topCount,
    record.requiredVotes,
    record.committeeSize,
    record.finalizedAtHeight,
    evidence.length,
  ];
  for (const vote of evidence) {
    fields.push(
      vote.auditId,
      vote.validatorId,
      vote.validatorPublicKey.toLowerCase(),
      vote.observedCommitment.toLowerCase(),
      vote.submittedAtHeight,
      vote.signature.toLowerCase(),
    );
  }
  return Buffer.from(canonicalDigest("jgc-audit-verdict-v1", fields)).toString("hex");
}

/**
 * Validate a finalized verdict using only the record and its signed evidence.
 * Active-chain claim/beacon checks are performed by block validation because
 * they require historical blocks.
 */
export function validateAuditVerdictRecord(
  record: AuditVerdictRecord,
  maxResponseBlocks = 100,
): string | null {
  if (!record || !record.request) return "missing audit request";
  const requestError = validateRequestShape(record.request, maxResponseBlocks);
  if (requestError) return requestError;
  const { assignment } = record.request;

  if (record.auditId !== record.request.auditId ||
      record.claimId !== assignment.claimId ||
      record.claimantId !== assignment.claimantId ||
      record.claimedCommitment.toLowerCase() !== assignment.commitment.toLowerCase()) {
    return "verdict identity does not match its request";
  }
  if (!Number.isSafeInteger(record.finalizedAtHeight) ||
      record.finalizedAtHeight < assignment.beaconHeight) {
    return "invalid verdict finalization height";
  }
  if (!Array.isArray(record.evidence) || record.evidence.length > assignment.committee.length) {
    return "invalid audit evidence count";
  }
  if (record.finalizedAtHeight <= record.request.responseDeadlineHeight &&
      record.evidence.length < assignment.committee.length) {
    return "audit verdict finalized before the committee or deadline";
  }

  const validators = new Set<string>();
  let previousValidator = "";
  for (const vote of record.evidence) {
    if (vote.auditId !== record.auditId) return "vote belongs to a different audit";
    if (!assignment.committee.includes(vote.validatorId)) return "vote is from an unassigned validator";
    if (validators.has(vote.validatorId)) return "validator voted more than once";
    if (previousValidator && compareCanonicalBytes(previousValidator, vote.validatorId) >= 0) {
      return "audit evidence is not in canonical validator order";
    }
    if (vote.submittedAtHeight < assignment.beaconHeight ||
        vote.submittedAtHeight > record.request.responseDeadlineHeight ||
        vote.submittedAtHeight > record.finalizedAtHeight) {
      return "vote is outside the response window";
    }
    if (!verifyAuditVote(vote)) return "invalid audit vote signature";
    validators.add(vote.validatorId);
    previousValidator = vote.validatorId;
  }

  const derived = deriveVerdictSummary(record.request, record.evidence);
  if (record.verdict !== derived.verdict ||
      record.topCommitment?.toLowerCase() !== derived.topCommitment ||
      record.topCount !== derived.topCount ||
      record.requiredVotes !== derived.requiredVotes ||
      record.committeeSize !== derived.committeeSize) {
    return "verdict summary does not match signed evidence";
  }
  return null;
}

export function verifyAuditVerdictRecord(record: AuditVerdictRecord): boolean {
  return validateAuditVerdictRecord(record) === null;
}

interface OpenAudit {
  request: AuditRequest;
  votes: Map<string, AuditVote>;
}

function validateRequestShape(request: AuditRequest, maxResponseBlocks: number): string | null {
  const { assignment } = request;
  if (request.auditId !== computeAuditId(assignment, request.responseDeadlineHeight)) return "invalid audit id";
  if (!/^[0-9a-f]{64}$/i.test(assignment.commitment)) return "invalid claim commitment";
  if (!/^[0-9a-f]{64}$/i.test(assignment.beaconHash)) return "invalid beacon hash";
  if (!assignment.claimId || !assignment.claimantId) return "missing claim identity";
  if (!Number.isSafeInteger(assignment.beaconHeight) || !Number.isSafeInteger(assignment.claimHeight)) {
    return "invalid audit height";
  }
  if (assignment.claimHeight > assignment.beaconHeight) return "claim cannot follow beacon";
  if (assignment.committee.length < 3) return "audit committee must contain at least three validators";
  if (new Set(assignment.committee).size !== assignment.committee.length) return "audit committee contains duplicates";
  if (assignment.committee.includes(assignment.claimantId)) return "claimant cannot audit itself";
  if (request.responseDeadlineHeight <= assignment.beaconHeight) return "deadline must follow beacon";
  if (request.responseDeadlineHeight - assignment.beaconHeight > maxResponseBlocks) return "audit deadline is too far away";
  return null;
}

function validateRequest(request: AuditRequest, currentHeight: number, maxResponseBlocks: number): string | null {
  const shapeError = validateRequestShape(request, maxResponseBlocks);
  if (shapeError) return shapeError;
  const { assignment } = request;
  if (currentHeight < assignment.beaconHeight) return "audit beacon is not final yet";
  if (currentHeight > request.responseDeadlineHeight) return "audit request has expired";
  return null;
}

export class AuditLifecycle {
  private readonly open = new Map<string, OpenAudit>();
  private readonly requests = new Map<string, AuditRequest>();
  private readonly verdicts = new Map<string, AuditVerdictRecord>();
  private readonly maxOpenAudits: number;
  private readonly maxResponseBlocks: number;

  constructor(options: AuditLifecycleOptions = {}) {
    this.maxOpenAudits = options.maxOpenAudits ?? 1024;
    this.maxResponseBlocks = options.maxResponseBlocks ?? 100;
  }

  registerRequest(request: AuditRequest, currentHeight: number): AuditMutationResult {
    const error = validateRequest(request, currentHeight, this.maxResponseBlocks);
    if (error) return { accepted: false, error };
    if (this.verdicts.has(request.auditId)) return { accepted: false, error: "audit already finalized" };
    if (this.open.has(request.auditId)) return { accepted: false, error: "audit already registered" };
    if (this.open.size >= this.maxOpenAudits) return { accepted: false, error: "open audit limit reached" };
    this.requests.set(request.auditId, request);
    this.open.set(request.auditId, { request, votes: new Map() });
    return { accepted: true };
  }

  submitVote(vote: AuditVote, currentHeight: number): AuditMutationResult {
    const audit = this.open.get(vote.auditId);
    if (!audit) return { accepted: false, error: "unknown or finalized audit" };
    if (!audit.request.assignment.committee.includes(vote.validatorId)) {
      return { accepted: false, error: "validator is not assigned to this audit" };
    }
    if (audit.votes.has(vote.validatorId)) return { accepted: false, error: "validator already voted" };
    if (vote.submittedAtHeight < audit.request.assignment.beaconHeight ||
        vote.submittedAtHeight > audit.request.responseDeadlineHeight ||
        vote.submittedAtHeight > currentHeight) {
      return { accepted: false, error: "vote is outside the response window" };
    }
    if (!verifyAuditVote(vote)) return { accepted: false, error: "invalid audit vote signature" };
    audit.votes.set(vote.validatorId, vote);
    return { accepted: true };
  }

  finalize(auditId: string, currentHeight: number): AuditVerdictRecord | null {
    const audit = this.open.get(auditId);
    if (!audit) return this.verdicts.get(auditId) ?? null;

    const committeeSize = audit.request.assignment.committee.length;
    if (currentHeight <= audit.request.responseDeadlineHeight && audit.votes.size < committeeSize) return null;

    const evidence = [...audit.votes.values()]
      .sort((a, b) => compareCanonicalBytes(a.validatorId, b.validatorId));
    const summary = deriveVerdictSummary(audit.request, evidence);

    const record: AuditVerdictRecord = {
      auditId,
      request: audit.request,
      claimId: audit.request.assignment.claimId,
      claimantId: audit.request.assignment.claimantId,
      claimedCommitment: audit.request.assignment.commitment,
      ...summary,
      finalizedAtHeight: currentHeight,
      evidence,
    };
    this.open.delete(auditId);
    this.verdicts.set(auditId, record);
    return record;
  }

  finalizeDue(currentHeight: number): AuditVerdictRecord[] {
    const finalized: AuditVerdictRecord[] = [];
    for (const [auditId, audit] of this.open) {
      if (audit.votes.size === audit.request.assignment.committee.length ||
          currentHeight > audit.request.responseDeadlineHeight) {
        const verdict = this.finalize(auditId, currentHeight);
        if (verdict) finalized.push(verdict);
      }
    }
    return finalized;
  }

  getRequest(auditId: string): AuditRequest | undefined {
    return this.requests.get(auditId);
  }

  getOpenRequests(): AuditRequest[] {
    return [...this.open.values()].map((audit) => audit.request);
  }

  getVotes(auditId: string): AuditVote[] {
    return [...(this.open.get(auditId)?.votes.values() ?? [])];
  }

  getVerdicts(): AuditVerdictRecord[] {
    return [...this.verdicts.values()];
  }

  /**
   * Index a verdict already validated and committed by an active-chain block.
   * This makes fresh-sync and restart state equivalent to live P2P finalization.
   */
  indexCommittedVerdict(record: AuditVerdictRecord): AuditMutationResult {
    const error = validateAuditVerdictRecord(record, this.maxResponseBlocks);
    if (error) return { accepted: false, error };
    const existing = this.verdicts.get(record.auditId);
    if (existing) {
      // The active-chain copy is authoritative over an earlier local/P2P copy
      // whose finalization height may differ.
      if (auditVerdictCommitment(existing) !== auditVerdictCommitment(record)) {
        this.verdicts.set(record.auditId, record);
      }
      this.requests.set(record.auditId, record.request);
      this.open.delete(record.auditId);
      return { accepted: true };
    }
    this.requests.set(record.auditId, record.request);
    this.open.delete(record.auditId);
    this.verdicts.set(record.auditId, record);
    return { accepted: true };
  }

  snapshotState(): AuditLifecycleState {
    return {
      requests: [...this.requests.values()].sort((a, b) => compareCanonicalBytes(a.auditId, b.auditId)),
      openVotes: [...this.open.values()]
        .flatMap((audit) => [...audit.votes.values()])
        .sort((a, b) => compareCanonicalBytes(a.auditId, b.auditId) || compareCanonicalBytes(a.validatorId, b.validatorId)),
      verdicts: [...this.verdicts.values()].sort((a, b) => compareCanonicalBytes(a.auditId, b.auditId)),
    };
  }

  /**
   * Restore a persisted snapshot by re-validating every request, signature, and
   * verdict. Invalid or stale-fork entries are dropped rather than trusted.
   */
  restoreState(
    state: AuditLifecycleState,
    currentHeight: number,
    isChainBound: (request: AuditRequest) => boolean = () => true,
  ): AuditRestoreResult {
    this.open.clear();
    this.requests.clear();
    this.verdicts.clear();
    let dropped = 0;

    for (const request of state.requests ?? []) {
      if (this.requests.size >= this.maxOpenAudits ||
          validateRequestShape(request, this.maxResponseBlocks) !== null ||
          !isChainBound(request) ||
          this.requests.has(request.auditId)) {
        dropped++;
        continue;
      }
      this.requests.set(request.auditId, request);
      this.open.set(request.auditId, { request, votes: new Map() });
    }

    for (const vote of state.openVotes ?? []) {
      const result = this.submitVote(vote, currentHeight);
      if (!result.accepted) dropped++;
    }

    // Rebuild every persisted verdict from its signed evidence. The stored
    // summary is accepted only when the independently derived summary matches.
    for (const stored of state.verdicts ?? []) {
      const audit = this.open.get(stored.auditId);
      if (!audit ||
          stored.request?.auditId !== audit.request.auditId ||
          validateAuditVerdictRecord(stored, this.maxResponseBlocks) !== null) {
        dropped++;
        continue;
      }
      let validEvidence = true;
      for (const vote of stored.evidence ?? []) {
        const result = this.submitVote(vote, currentHeight);
        if (!result.accepted) { validEvidence = false; break; }
      }
      if (!validEvidence) { dropped++; continue; }
      const derived = this.finalize(stored.auditId, stored.finalizedAtHeight);
      if (!derived ||
          auditVerdictCommitment(derived) !== auditVerdictCommitment(stored)) {
        this.verdicts.delete(stored.auditId);
        dropped++;
      }
    }

    const finalized = this.finalizeDue(currentHeight);
    return { restored: this.requests.size, dropped, finalized };
  }

  /**
   * Remove evidence whose claim or beacon no longer belongs to the active chain,
   * then finalize any still-valid request whose deadline has passed.
   */
  reconcile(
    currentHeight: number,
    isChainBound: (request: AuditRequest) => boolean,
  ): { dropped: number; finalized: AuditVerdictRecord[] } {
    let dropped = 0;
    for (const [auditId, request] of this.requests) {
      if (isChainBound(request)) continue;
      this.requests.delete(auditId);
      this.open.delete(auditId);
      this.verdicts.delete(auditId);
      dropped++;
    }
    return { dropped, finalized: this.finalizeDue(currentHeight) };
  }
}
