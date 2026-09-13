import { verifyPortableComputeProofExact } from "../crypto/compute-proof.js";
import { makeContribution, DEFAULT_MINERS } from "../sim/harness.js";
import { DIFFICULTY_SCALE } from "../consensus/emission.js";
import { pqVerifyComputeProofFromConsensus } from "../crypto/pq-zkp.js";

describe("exact consensus proof thresholds", () => {
  test.each(["tflopsWeight", "taskCommitment", "circuitId", "publicInputs"] as const)("rejects an outer %s that differs from the embedded receipt", field => {
    const original = makeContribution(DEFAULT_MINERS[0]!, 1).proof;
    const proof = { ...original, [field]: field === "tflopsWeight" ? 999 : field === "publicInputs" ? ["fake", "600", "0"] : "fake" };
    expect(pqVerifyComputeProofFromConsensus(proof, 1)).toBe(false);
    expect(verifyPortableComputeProofExact(proof, { blockHeight: 1, epochBlockIndex: 1, minimumWorkMicros: 1n }).valid).toBe(false);
  });
  test("accepts equality and rejects one micro-unit above the verified work", () => {
    const proof = makeContribution(DEFAULT_MINERS[0]!, 1).proof;
    const context = { blockHeight: 1, epochBlockIndex: 1, minimumWorkMicros: 600n * DIFFICULTY_SCALE };
    expect(verifyPortableComputeProofExact(proof, context).valid).toBe(true);
    expect(verifyPortableComputeProofExact(proof, { ...context, minimumWorkMicros: context.minimumWorkMicros + 1n }).valid).toBe(false);
  });

  test("does not round large thresholds through Number and still enforces scheme limits", () => {
    const proof = { ...makeContribution(DEFAULT_MINERS[0]!, 1).proof, tflopsWeight: Number.MAX_SAFE_INTEGER };
    const minimum = BigInt(Number.MAX_SAFE_INTEGER) * DIFFICULTY_SCALE;
    const check = (minimumWorkMicros: bigint) => verifyPortableComputeProofExact(proof, { blockHeight: 1, epochBlockIndex: 1, minimumWorkMicros });
    expect(check(minimum + 1n).error).toMatch(/exact minimum/);
    expect(check(minimum).valid).toBe(false); // Outside the pinned circuit's allowed range.
    expect(check(minimum).error).not.toMatch(/exact minimum/);
    expect(check(1n << 2000n).error).toMatch(/exact minimum/);
    expect(check(-1n).valid).toBe(false);
  });

  test.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid work %s before arithmetic", tflopsWeight => {
    const proof = { ...makeContribution(DEFAULT_MINERS[0]!, 1).proof, tflopsWeight };
    expect(verifyPortableComputeProofExact(proof, { blockHeight: 1, epochBlockIndex: 1, minimumWorkMicros: 0n }).valid).toBe(false);
  });
});
