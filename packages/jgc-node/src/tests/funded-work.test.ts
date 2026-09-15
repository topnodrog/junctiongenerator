import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { AssignedWorkJournal, workMinerIdentity, workResultCommitment, workResultSignatureHash, type WorkJob } from "../broker/assigned-work.js";
import { pqGenerateKeyPair, pqSignHash } from "../crypto/pq-signatures.js";

describe("funded assigned-work rehearsal", () => {
  let directory: string;
  let now: number;
  let journal: AssignedWorkJournal;
  const key = pqGenerateKeyPair();
  const worker = workMinerIdentity(key.publicKey);
  const restart = () => new AssignedWorkJournal(directory, "funded-test", () => now);
  const create = (id = "job", units = "60") => journal.createFunded(id, 7, [2, -3], [4, 5], "buyer", units, 200);
  const complete = (job: WorkJob, target = journal) => target.completeSigned(job.jobId, key.publicKey,
    job.lease!.leaseId, "-7", workResultCommitment(job, "-7"), pqSignHash(key.privateKey, workResultSignatureHash(job, "-7")));
  const conserved = (available: bigint, reserved: bigint, paid: bigint) => {
    expect(journal.balance("buyer")).toBe(available);
    expect(journal.balance(worker)).toBe(paid);
    const job = journal.get("job");
    expect(job?.reservation?.status === "reserved" ? BigInt(job.reservation.amount) : 0n).toBe(reserved);
    expect(available + reserved + paid).toBe(100n);
  };
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "jgc-funded-"));
    now = 100;
    journal = restart();
    journal.credit("deposit", "buyer", "100");
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("reserves once and records verified completion and worker credit in one durable event", () => {
    create();
    conserved(40n, 60n, 0n);
    journal = restart();
    const job = journal.leaseToKey("job", key.publicKey, 60);
    const before = readdirSync(directory).length;
    complete(job);
    expect(readdirSync(directory).length).toBe(before + 1);
    journal = restart(); // Includes a response lost after the durable completion.
    expect(journal.get("job")?.result?.output).toBe("-7");
    expect(journal.get("job")?.reservation?.status).toBe("paid");
    conserved(40n, 0n, 60n);
    expect(() => complete(job)).toThrow("completed");
    expect(() => journal.refund("job", "buyer")).toThrow("completed");
    conserved(40n, 0n, 60n);
  });

  it("rejects repeated funding, duplicate jobs and overspending from a second journal instance", () => {
    const competing = restart();
    create();
    expect(() => journal.credit("deposit", "buyer", "100")).toThrow("Duplicate");
    expect(() => create()).toThrow("duplicate");
    expect(() => competing.createFunded("other", 7, [1], [1], "buyer", "60", 200)).toThrow("Insufficient");
    expect(competing.get("other")).toBeUndefined();
    conserved(40n, 60n, 0n);
  });

  it.each(["0", "-1", "01", "1.0", "1e2", "9".repeat(31), "NaN"])("rejects noncanonical or excessive credit amount %s", units => {
    expect(() => journal.credit("bad", "buyer", units)).toThrow("amount");
    expect(() => create("job", units)).toThrow("amount");
    expect(journal.balance("buyer")).toBe(100n);
    expect(journal.get("job")).toBeUndefined();
  });

  it("refunds an unleased reservation once and prevents dispatch or reuse", () => {
    create();
    expect(() => journal.refund("job", "intruder")).toThrow("Unauthorized");
    journal.refund("job", "buyer");
    journal = restart();
    conserved(100n, 0n, 0n);
    expect(() => journal.refund("job", "buyer")).toThrow("refunded");
    expect(() => journal.leaseToKey("job", key.publicKey, 60)).toThrow("refunded");
    expect(() => create()).toThrow("duplicate");
  });

  it("protects active work then refunds at the exact lease deadline without paying a late worker", () => {
    create();
    const job = journal.leaseToKey("job", key.publicKey, 60);
    expect(() => journal.refund("job", "buyer")).toThrow("active");
    now = 160;
    expect(() => complete(job)).toThrow("expired");
    journal.refund("job", "buyer");
    expect(() => complete(job)).toThrow("refunded");
    journal = restart();
    conserved(100n, 0n, 0n);
  });

  it("rejects unsigned work, leases beyond funding expiry and expired reservations", () => {
    create();
    expect(() => journal.lease("job", "miner", 60)).toThrow("worker key");
    expect(() => journal.leaseToKey("job", key.publicKey, 101)).toThrow("deadline");
    const job = journal.leaseToKey("job", key.publicKey, 100);
    expect(() => journal.complete("job", worker, job.lease!.leaseId, "-7", workResultCommitment(job, "-7"))).toThrow("signature");
    now = 200;
    expect(() => complete(job)).toThrow("Expired reservation");
    expect(() => journal.leaseToKey("job", key.publicKey, 1)).toThrow("Expired reservation");
    journal.refund("job", "buyer");
    conserved(100n, 0n, 0n);
  });

  it("keeps credits reserved when output or signed funding terms are incorrect", () => {
    create();
    const job = journal.leaseToKey("job", key.publicKey, 60);
    for (const change of [{ amount: "59" }, { buyer: "intruder" }, { expiresAt: 199 }]) {
      const altered = { ...job, reservation: { ...job.reservation!, ...change } };
      expect(() => journal.completeSigned("job", key.publicKey, job.lease!.leaseId, "-7", workResultCommitment(job, "-7"),
        pqSignHash(key.privateKey, workResultSignatureHash(altered, "-7")))).toThrow("signature");
    }
    expect(() => journal.completeSigned("job", key.publicKey, job.lease!.leaseId, "999", workResultCommitment(job, "999"),
      pqSignHash(key.privateKey, workResultSignatureHash(job, "999")))).toThrow("Incorrect");
    conserved(40n, 60n, 0n);
  });

  it("fails closed after a torn settlement write instead of paying or refunding again", () => {
    create();
    journal.leaseToKey("job", key.publicKey, 60);
    writeFileSync(join(directory, "00000003.json"), '{"previous":');
    expect(() => restart()).toThrow();
    expect(() => journal.balance(worker)).toThrow();
    expect(() => journal.refund("job", "buyer")).toThrow();
  });

  it("rechecks funding during replay even when a corrupt event has a fresh checksum", () => {
    create();
    const path = join(directory, "00000001.json");
    const record = JSON.parse(readFileSync(path, "utf8"));
    record.event.funding.amount = "101";
    record.checksum = createHash("sha256").update(JSON.stringify([record.previous, record.event])).digest("hex");
    writeFileSync(path, JSON.stringify(record));
    expect(() => restart()).toThrow("Insufficient");
  });
});
