/** Bounded useful-work rehearsal. No consensus rewards or external payments.
 * Each successful transition is an exclusive, fsynced journal entry. Readers
 * replay and validate the whole journal; partial writes fail closed on restart.
 * Competing writers cannot overwrite the same revision. Storage is trusted local
 * operator state, not authenticated consensus evidence.
 */
import { createHash, randomBytes } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pqIsValidPublicKey, pqVerifyHashSignature, PQ_SIZES } from "../crypto/pq-signatures.js";

const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const VECTOR_PROGRAM = hash("jgc/vector-dot/v1: signed int32 vectors; exact bigint sum; decimal output");
const MAX_TERMS = 4096;
const MAX_EVENTS = 10000;

export interface WorkJob {
  jobId: string;
  network: string;
  epoch: number;
  programDigest: string;
  inputCommitment: string;
  resourceUnits: number;
  left: number[];
  right: number[];
  lease?: { leaseId: string; miner: string; startedAt: number; deadline: number };
  result?: { output: string; commitment: string };
}
type Event =
  | { kind: "create"; jobId: string; network: string; epoch: number; left: number[]; right: number[] }
  | { kind: "lease"; jobId: string; leaseId: string; miner: string; deadline: number; now: number }
  | { kind: "complete"; jobId: string; leaseId: string; miner: string; output: string; commitment: string; now: number; publicKey?: string; signature?: string };

/** Full key commitment for work identities; not a payment address. */
export function workMinerIdentity(publicKey: string): string {
  if (!pqIsValidPublicKey(publicKey)) throw new Error("Invalid worker public key");
  return "workkey:" + createHash("sha3-256").update(Buffer.from(publicKey, "hex")).digest("hex");
}

/** Domain-separated signature digest binds the complete assigned context. */
export function workResultSignatureHash(job: WorkJob, output: string): Uint8Array {
  return createHash("sha3-256").update(JSON.stringify([
    "jgc/assigned-result-signature/v1", workResultCommitment(job, output),
  ])).digest();
}

function identifier(value: string): void {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value)) throw new Error("Invalid identifier");
}
function integer(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid integer");
}
function vectors(left: number[], right: number[]): void {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || left.length > MAX_TERMS || left.length !== right.length) {
    throw new Error("Invalid bounded vectors");
  }
  for (const n of [...left, ...right]) {
    if (!Number.isInteger(n) || n < -2147483648 || n > 2147483647) throw new Error("Expected int32 input");
  }
}
export function executeVectorDot(left: number[], right: number[]): string {
  vectors(left, right);
  return left.reduce((sum, n, i) => sum + BigInt(n) * BigInt(right[i]), 0n).toString();
}

/** Bind the result to every part of the assigned execution context. */
export function workResultCommitment(job: WorkJob, output: string): string {
  if (!job.lease) throw new Error("No lease");
  return hash(["jgc/assigned-result/v1", job.network, job.epoch, job.jobId,
    job.programDigest, job.inputCommitment, job.resourceUnits, job.lease.leaseId,
    job.lease.miner, job.lease.startedAt, job.lease.deadline, output]);
}

function transition(jobs: Map<string, WorkJob>, event: Event, network: string): void {
  identifier(event.jobId);
  if (event.kind === "create") {
    if (event.network !== network || jobs.has(event.jobId)) throw new Error("Wrong network or duplicate job");
    integer(event.epoch);
    vectors(event.left, event.right);
    jobs.set(event.jobId, {
      jobId: event.jobId, network, epoch: event.epoch, programDigest: VECTOR_PROGRAM,
      inputCommitment: hash(["jgc/vector-input/v1", event.left, event.right]),
      resourceUnits: event.left.length, left: event.left, right: event.right,
    });
    return;
  }
  const job = jobs.get(event.jobId);
  if (!job || job.result) throw new Error("Unknown or completed job");
  integer(event.now);
  identifier(event.miner);
  identifier(event.leaseId);
  if (event.kind === "lease") {
    integer(event.deadline);
    if (event.deadline <= event.now || event.deadline - event.now > 3600) throw new Error("Invalid lease deadline");
    if (job.lease && event.now < job.lease.deadline) throw new Error("Lease still active");
    if (job.lease?.leaseId === event.leaseId) throw new Error("Reused lease");
    job.lease = { leaseId: event.leaseId, miner: event.miner, startedAt: event.now, deadline: event.deadline };
    return;
  }
  if (event.kind !== "complete") throw new Error("Unknown event");
  if (!job.lease || job.lease.leaseId !== event.leaseId || job.lease.miner !== event.miner || event.now < job.lease.startedAt || event.now >= job.lease.deadline) {
    throw new Error("Invalid or expired lease");
  }
  if (typeof event.output !== "string" || event.output.length > 64 || event.output !== executeVectorDot(job.left, job.right)) {
    throw new Error("Incorrect computation");
  }
  if (event.commitment !== workResultCommitment(job, event.output)) throw new Error("Result context mismatch");
  if (event.miner.startsWith("workkey:") || event.publicKey !== undefined || event.signature !== undefined) {
    if (typeof event.publicKey !== "string" || typeof event.signature !== "string"
        || event.signature.length !== PQ_SIZES.signature * 2
        || !/^[0-9a-fA-F]+$/.test(event.signature)
        || workMinerIdentity(event.publicKey) !== event.miner
        || !pqVerifyHashSignature(event.signature, workResultSignatureHash(job, event.output), event.publicKey)) {
      throw new Error("Invalid worker signature");
    }
  }
  job.result = { output: event.output, commitment: event.commitment };
}

export class AssignedWorkJournal {
  constructor(private readonly directory: string, private readonly network: string,
    private readonly clock: () => number = () => Math.floor(Date.now() / 1000)) {
    identifier(network);
    mkdirSync(directory, { recursive: true });
    this.read();
  }

  private read(): { jobs: Map<string, WorkJob>; count: number; previous: string } {
    const files = readdirSync(this.directory).sort();
    if (files.length > MAX_EVENTS) throw new Error("Journal capacity exceeded");
    const jobs = new Map<string, WorkJob>();
    let previous = hash(["jgc/assigned-journal/v1", this.network]);
    for (let i = 0; i < files.length; i++) {
      if (files[i] !== `${String(i).padStart(8, "0")}.json`) throw new Error("Unexpected or missing journal entry");
      const path = join(this.directory, files[i]);
      if (statSync(path).size > 128 * 1024) throw new Error("Oversized journal entry");
      const text = readFileSync(path, "utf8");
      const record = JSON.parse(text) as { previous: string; event: Event; checksum: string };
      if (record.previous !== previous || record.checksum !== hash([previous, record.event])) throw new Error("Corrupt journal");
      transition(jobs, record.event, this.network);
      previous = record.checksum;
    }
    return { jobs, count: files.length, previous };
  }

  private append(event: Event): WorkJob {
    const state = this.read();
    if (state.count >= MAX_EVENTS) throw new Error("Journal full");
    transition(state.jobs, event, this.network);
    const record = { previous: state.previous, event, checksum: hash([state.previous, event]) };
    const fd = openSync(join(this.directory, `${String(state.count).padStart(8, "0")}.json`), "wx", 0o600);
    try {
      writeFileSync(fd, JSON.stringify(record));
      fsyncSync(fd);
    } finally { closeSync(fd); }
    return structuredClone(state.jobs.get(event.jobId)!);
  }

  create(jobId: string, epoch: number, left: number[], right: number[]): WorkJob {
    return this.append({ kind: "create", jobId, network: this.network, epoch, left, right });
  }

  lease(jobId: string, miner: string, durationSeconds: number): WorkJob {
    integer(durationSeconds);
    const now = this.clock();
    return this.append({ kind: "lease", jobId, miner, leaseId: randomBytes(24).toString("hex"), now, deadline: now + durationSeconds });
  }

  /** miner must come from the authenticated caller, never a request body claim.
   * This local API is not yet exposed over RPC or connected to a payout adapter. */
  complete(jobId: string, miner: string, leaseId: string, output: string, commitment: string): WorkJob {
    return this.append({ kind: "complete", jobId, miner, leaseId, output, commitment, now: this.clock() });
  }

  /** Operator-authorized dispatch to a pinned worker key. Not a public lease API. */
  leaseToKey(jobId: string, publicKey: string, durationSeconds: number): WorkJob {
    return this.lease(jobId, workMinerIdentity(publicKey), durationSeconds);
  }

  /** Signature evidence is persisted and checked again on every journal replay. */
  completeSigned(jobId: string, publicKey: string, leaseId: string, output: string, commitment: string, signature: string): WorkJob {
    return this.append({ kind: "complete", jobId, miner: workMinerIdentity(publicKey), publicKey,
      leaseId, output, commitment, signature, now: this.clock() });
  }

  get(jobId: string): WorkJob | undefined {
    return structuredClone(this.read().jobs.get(jobId));
  }
}
