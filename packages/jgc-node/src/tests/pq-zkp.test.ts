import { afterEach, describe, it, expect } from "@jest/globals";
import {
  pqProveCompute,
  pqVerifyComputeProof,
  pqBatchVerifyComputeProofs,
  pqNewNonce,
  pqToComputeProof,
  pqFromComputeProof,
  pqValidateConsensusBinding,
  pqVerifyComputeProofFromConsensus,
  pqVerifyProofForConsensus,
  setPQVerifierMode,
  PQ_CIRCUIT_REGISTRY,
  type PQWitness,
} from "../crypto/pq-zkp.js";
import { PQ_LIMITS } from "../crypto/pq-suite.js";

const CID = "PQ_CIRCUIT_AI_INFERENCE_V1";
const OUTPUT = "dd".repeat(32);
const HEIGHT = 100;

function witness(overrides: Partial<PQWitness> = {}): PQWitness {
  return { taskCommitment: "ee".repeat(32), tflopsWeight: 500, nonce: pqNewNonce(), ...overrides };
}

function proof() {
  return pqProveCompute(CID, OUTPUT, witness(), HEIGHT);
}

afterEach(() => setPQVerifierMode("strict"));

describe("PQ hash commitment prototype", () => {
  it("structurally verifies a commitment in the simulation layer", () => {
    const result = pqVerifyComputeProof(proof(), HEIGHT);
    expect(result.valid).toBe(true);
    expect(result.tflopsWeight).toBe(500);
  });

  it("is bound to one exact block height", () => {
    const p = proof();
    expect(pqVerifyComputeProof(p, HEIGHT + 1).valid).toBe(false);
  });

  it("keeps task commitment and nonce out of the serialised commitment", () => {
    const w = witness();
    const p = pqProveCompute(CID, OUTPUT, w, HEIGHT);
    const serialised = JSON.stringify(p);
    expect(serialised).not.toContain(w.taskCommitment);
    expect(serialised).not.toContain(w.nonce);
  });

  it("rejects malformed public statements and unknown circuits", () => {
    const p = proof();
    (p as any).circuitId = "PQ_NOPE";
    expect(pqVerifyComputeProof(p, HEIGHT).valid).toBe(false);
    expect(() => pqProveCompute(CID, "not-hex", witness(), HEIGHT)).toThrow();
    expect(() => pqProveCompute(CID, OUTPUT, witness({ nonce: "00" }), HEIGHT)).toThrow();
  });

  it("rejects non-integer or inflated TFLOPS claims", () => {
    const p = proof();
    p.tflopsWeight = PQ_CIRCUIT_REGISTRY.get(CID)!.maxTFLOPSPerProof + 1;
    expect(pqVerifyComputeProof(p, HEIGHT).valid).toBe(false);
    expect(() => pqProveCompute(CID, OUTPUT, witness({ tflopsWeight: 1.5 }), HEIGHT)).toThrow();
    expect(() => pqProveCompute(CID, OUTPUT, witness({ tflopsWeight: 0 }), HEIGHT)).toThrow();
  });

  it("rejects root, path, query-count, and duplicate-query tampering", () => {
    const badRoot = proof();
    badRoot.witnessRoot = "00".repeat(32);
    expect(pqVerifyComputeProof(badRoot, HEIGHT).valid).toBe(false);

    const badPath = proof();
    badPath.queries[0]!.path[0] = "ff".repeat(32);
    expect(pqVerifyComputeProof(badPath, HEIGHT).valid).toBe(false);

    const dropped = proof();
    dropped.queries = dropped.queries.slice(1);
    expect(pqVerifyComputeProof(dropped, HEIGHT).valid).toBe(false);

    const duplicate = proof();
    duplicate.queries[1] = duplicate.queries[0]!;
    expect(pqVerifyComputeProof(duplicate, HEIGHT).valid).toBe(false);
  });

  it("batch structural verification rejects any invalid commitment", () => {
    const good = [proof(), proof()];
    expect(pqBatchVerifyComputeProofs(good, HEIGHT)).toBe(true);
    good[1]!.tflopsWeight = -5;
    expect(pqBatchVerifyComputeProofs(good, HEIGHT)).toBe(false);
  });

  it("binds every consensus duplicate to the inner statement", () => {
    const cp = pqToComputeProof(proof());
    expect(pqValidateConsensusBinding(cp, HEIGHT).valid).toBe(true);
    for (const tampered of [
      { ...cp, taskCommitment: "aa".repeat(32) },
      { ...cp, circuitId: "PQ_CIRCUIT_AI_TRAINING_V1" },
      { ...cp, tflopsWeight: cp.tflopsWeight + 1 },
      { ...cp, publicInputs: [...cp.publicInputs.slice(0, 2), String(HEIGHT + 1)] },
    ]) {
      expect(pqValidateConsensusBinding(tampered, HEIGHT).valid).toBe(false);
    }
  });

  it("fails closed in strict consensus because this is not a computation proof", () => {
    const cp = pqToComputeProof(proof());
    setPQVerifierMode("strict");
    expect(pqVerifyComputeProofFromConsensus(cp, HEIGHT)).toBe(false);
    const result = pqVerifyProofForConsensus(cp, HEIGHT, 1);
    expect(result.valid).toBe(false);
    expect(result.verifiedTFLOPS).toBe(0);
    expect(result.error).toMatch(/do not prove useful computation/i);
  });

  it("allows structural commitments only when simnet is explicitly enabled", () => {
    const cp = pqToComputeProof(proof());
    setPQVerifierMode("simnet");
    expect(pqVerifyComputeProofFromConsensus(cp, HEIGHT)).toBe(true);
    expect(pqVerifyProofForConsensus(cp, HEIGHT, 1)).toEqual({ valid: true, verifiedTFLOPS: 500 });
  });

  it("forbids simnet mode in production", () => {
    const old = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => setPQVerifierMode("simnet")).toThrow(/forbidden/i);
    } finally {
      process.env.NODE_ENV = old;
    }
  });

  it("rejects oversized and legacy proof encodings", () => {
    const cp = pqToComputeProof(proof());
    expect(pqFromComputeProof({ ...cp, proofBytes: "x".repeat(PQ_LIMITS.maxProofBytes + 1) })).toBeNull();
    expect(pqFromComputeProof({ ...cp, proofBytes: JSON.stringify({ scheme: "PQ-HASH-IOP-v1" }) })).toBeNull();
    expect(pqFromComputeProof({ ...cp, proofBytes: "[".repeat(33) + "0" + "]".repeat(33) })).toBeNull();
  });

  it("malformed proof objects never throw", () => {
    expect(pqVerifyComputeProof(null as any, HEIGHT).valid).toBe(false);
    expect(pqVerifyComputeProof({ scheme: "x" } as any, HEIGHT).valid).toBe(false);
  });
});
