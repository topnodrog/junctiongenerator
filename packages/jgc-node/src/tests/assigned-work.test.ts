import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AssignedWorkJournal, executeVectorDot, workResultCommitment } from "../broker/assigned-work.js";
import { ComputeBroker } from "../broker/compute-broker.js";
import { ComputeTaskType, type ComputeAssignment, type ComputeProof } from "../types/index.js";

describe("assigned useful work", () => {
  let directory: string;
  let now: number;
  let journal: AssignedWorkJournal;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "jgc-work-"));
    now = 100;
    journal = new AssignedWorkJournal(directory, "test-a", () => now);
    journal.create("job-a", 7, [2, -3], [4, 5]);
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("verifies exact output and preserves completion across restart", () => {
    const job = journal.lease("job-a", "miner-a", 60);
    const commitment = workResultCommitment(job, "-7");
    journal.complete(job.jobId, "miner-a", job.lease!.leaseId, "-7", commitment);
    const restarted = new AssignedWorkJournal(directory, "test-a", () => now);
    expect(restarted.get("job-a")!.result).toEqual({ output: "-7", commitment });
    expect(() => restarted.complete(job.jobId, "miner-a", job.lease!.leaseId, "-7", commitment)).toThrow("completed");
    expect(() => restarted.create("job-a", 7, [2], [3])).toThrow("duplicate");
  });

  it("rejects fabricated output even with its matching commitment", () => {
    const job = journal.lease("job-a", "miner-a", 60);
    expect(() => journal.complete(job.jobId, "miner-a", job.lease!.leaseId, "999", workResultCommitment(job, "999"))).toThrow("Incorrect");
    expect(journal.get(job.jobId)!.result).toBeUndefined();
  });

  it("rejects another miner, an unleased job and a premature reassignment", () => {
    expect(() => journal.complete("job-a", "miner-a", "none", "-7", "fake")).toThrow("lease");
    const job = journal.lease("job-a", "miner-a", 60);
    expect(() => journal.complete(job.jobId, "miner-b", job.lease!.leaseId, "-7", workResultCommitment(job, "-7"))).toThrow("lease");
    expect(() => journal.lease("job-a", "miner-b", 60)).toThrow("active");
  });

  it("expires at the deadline and rejects old leases after reassignment and restart", () => {
    const old = journal.lease("job-a", "miner-a", 60);
    now = 160;
    expect(() => journal.complete(old.jobId, "miner-a", old.lease!.leaseId, "-7", workResultCommitment(old, "-7"))).toThrow("expired");
    const job = new AssignedWorkJournal(directory, "test-a", () => now).lease("job-a", "miner-b", 60);
    expect(() => journal.complete(old.jobId, "miner-a", old.lease!.leaseId, "-7", workResultCommitment(old, "-7"))).toThrow("lease");
    expect(journal.complete(job.jobId, "miner-b", job.lease!.leaseId, "-7", workResultCommitment(job, "-7")).result).toBeDefined();
  });

  it.each(["network", "epoch", "jobId", "programDigest", "inputCommitment", "resourceUnits"] as const)("binds %s into result evidence", field => {
    const job = journal.lease("job-a", "miner-a", 60);
    const other = { ...job, [field]: typeof job[field] === "number" ? 999 : "other" };
    expect(() => journal.complete(job.jobId, "miner-a", job.lease!.leaseId, "-7", workResultCommitment(other, "-7"))).toThrow("context");
  });

  it("rejects journal corruption and use on a different network", () => {
    expect(() => new AssignedWorkJournal(directory, "test-b")).toThrow("Corrupt");
    const path = join(directory, "00000000.json");
    writeFileSync(path, readFileSync(path, "utf8").replace('"epoch":7', '"epoch":8'));
    expect(() => new AssignedWorkJournal(directory, "test-a")).toThrow("Corrupt");
  });

  it("fails closed on an interrupted write", () => {
    writeFileSync(join(directory, "00000001.json"), '{"previous":');
    expect(() => new AssignedWorkJournal(directory, "test-a")).toThrow();
  });

  it("bounds inputs and computes beyond floating point integer precision", () => {
    expect(executeVectorDot([2147483647, 2147483647], [2147483647, 2147483647])).toBe("9223372028264841218");
    for (const input of [[], [NaN], [1.5], [2147483648], new Array(4097).fill(1)]) {
      expect(() => executeVectorDot(input, input)).toThrow();
    }
    expect(() => journal.lease("job-a", "miner-a", 3601)).toThrow();
  });

  it("does not expose mutable internal state", () => {
    const job = journal.get("job-a")!;
    job.left[0] = 99;
    expect(journal.get("job-a")!.left[0]).toBe(2);
  });

  it("keeps the legacy broker payment path closed for arbitrary submitted proofs", () => {
    const broker = new ComputeBroker();
    broker.registerNode({
      nodePublicKey: "miner-a", minerAddress: "address-a", totalTFLOPS: 10,
      consensusTFLOPS: 0, jgClusterTFLOPS: 0, brokerTFLOPS: 0, idleTFLOPS: 10,
      supportedTaskTypes: [ComputeTaskType.AI_INFERENCE], lastHeartbeatAt: Math.floor(Date.now() / 1000),
      hardwareProfile: { gpuModel: "test", gpuVRAMGB: 1, cpuCores: 1, networkMbps: 10 },
    });
    broker.queueJGClusterTask({ taskId: "internal", taskType: ComputeTaskType.AI_INFERENCE,
      description: "test", requiredTFLOPS: 1, deadlineSecs: 60, taskPayloadHash: "0".repeat(64), priority: 0 });
    // Inspect the actual assigned ID; a nonexistent ID would also pass before the fix.
    const assignments = (broker as unknown as { assignments: Map<string, ComputeAssignment> }).assignments;
    const id = [...assignments.keys()][0];
    expect(id).toBeDefined();
    expect(broker.completeAssignment(id, {} as ComputeProof)).toBe(false);
    expect(assignments.get(id)!.status).toBe("IN_PROGRESS");
    expect(broker.drainPendingPayments()).toEqual([]);
  });
});
