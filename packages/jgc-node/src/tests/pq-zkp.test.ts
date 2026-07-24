/**
 * @file src/tests/pq-zkp.test.ts
 * @description Tests for the post-quantum hash-based compute proof layer.
 */
import { describe, it, expect } from "@jest/globals";
import {
  pqProveCompute,
  pqVerifyComputeProof,
  pqBatchVerifyComputeProofs,
  pqNewNonce,
  pqToComputeProof,
  pqFromComputeProof,
  pqVerifyComputeProofFromConsensus,
  PQ_CIRCUIT_REGISTRY,
  type PQWitness,
} from "../crypto/pq-zkp.js";

const CID = "PQ_CIRCUIT_AI_INFERENCE_V1";
const outCommit = "dd".repeat(32);

function witness(overrides: Partial<PQWitness> = {}): PQWitness {
  return { taskCommitment: "ee".repeat(32), tflopsWeight: 500, nonce: pqNewNonce(), ...overrides };
}

describe("pq-zkp (hash-based, transparent, PQ)", () => {
  it("proves + verifies a valid computation", () => {
    const p = pqProveCompute(CID, outCommit, witness());
    const r = pqVerifyComputeProof(p, 100);
    expect(r.valid).toBe(true);
    expect(r.tflopsWeight).toBe(500);
  });

  it("keeps the witness private (no taskCommitment/nonce in the proof)", () => {
    const w = witness();
    const p = pqProveCompute(CID, outCommit, w);
    const s = JSON.stringify(p);
    expect(s).not.toContain(w.taskCommitment);
    expect(s).not.toContain(w.nonce);
  });

  it("rejects an unknown circuit", () => {
    const p = pqProveCompute(CID, outCommit, witness());
    (p as any).circuitId = "PQ_NOPE";
    expect(pqVerifyComputeProof(p, 100).valid).toBe(false);
  });

  it("rejects tflops inflation beyond circuit max", () => {
    const p = pqProveCompute(CID, outCommit, witness());
    p.tflopsWeight = PQ_CIRCUIT_REGISTRY.get(CID)!.maxTFLOPSPerProof + 1;
    expect(pqVerifyComputeProof(p, 100).valid).toBe(false);
  });

  it("prover refuses to build a proof outside circuit bounds", () => {
    expect(() => pqProveCompute(CID, outCommit, witness({ tflopsWeight: 0 }))).toThrow();
    expect(() => pqProveCompute(CID, outCommit, witness({ tflopsWeight: 10 ** 9 }))).toThrow();
  });

  it("rejects a tampered witnessRoot (breaks Fiat–Shamir challenge)", () => {
    const p = pqProveCompute(CID, outCommit, witness());
    p.witnessRoot = "00".repeat(32);
    expect(pqVerifyComputeProof(p, 100).valid).toBe(false);
  });

  it("rejects a corrupted Merkle path", () => {
    const p = pqProveCompute(CID, outCommit, witness());
    p.queries[0]!.path[0] = "ff".repeat(32);
    expect(pqVerifyComputeProof(p, 100).valid).toBe(false);
  });

  it("rejects when a Fiat–Shamir query is dropped", () => {
    const p = pqProveCompute(CID, outCommit, witness());
    p.queries = p.queries.slice(1); // now 15 < required 16
    expect(pqVerifyComputeProof(p, 100).valid).toBe(false);
  });

  it("rejects a duplicated query (soundness)", () => {
    const p = pqProveCompute(CID, outCommit, witness());
    p.queries[1] = p.queries[0]!; // duplicate index 0
    expect(pqVerifyComputeProof(p, 100).valid).toBe(false);
  });

  it("batch verify: all-valid true, any-invalid false", () => {
    const good = [pqProveCompute(CID, outCommit, witness()), pqProveCompute(CID, outCommit, witness())];
    expect(pqBatchVerifyComputeProofs(good, 100)).toBe(true);
    const bad = [...good];
    bad[1]!.tflopsWeight = -5;
    expect(pqBatchVerifyComputeProofs(bad, 100)).toBe(false);
  });

  it("round-trips through the consensus ComputeProof adapter", () => {
    const p = pqProveCompute(CID, outCommit, witness());
    const cp = pqToComputeProof(p);
    const back = pqFromComputeProof(cp);
    expect(back).not.toBeNull();
    expect(back!.witnessRoot).toBe(p.witnessRoot);
    expect(pqVerifyComputeProofFromConsensus(cp, 100)).toBe(true);
  });

  it("consensus adapter rejects non-PQ (legacy) proofs", () => {
    const legacy: any = { circuitId: "CIRCUIT_AI_INFERENCE_V1", proofData: "not-json", taskCommitment: "x", tflopsWeight: 1 };
    expect(pqFromComputeProof(legacy)).toBeNull();
    expect(pqVerifyComputeProofFromConsensus(legacy, 100)).toBe(false);
  });

  it("malformed proof never throws, just invalid", () => {
    expect(pqVerifyComputeProof(null as any, 1).valid).toBe(false);
    expect(pqVerifyComputeProof({ scheme: "x" } as any, 1).valid).toBe(false);
  });
});
