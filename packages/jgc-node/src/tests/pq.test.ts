import { describe, it, expect } from "@jest/globals";
import {
  quantumGenerateKeyPair, quantumAddressFromPublicKey, isQuantumAddress,
  quantumSignContribution, quantumVerifyContributionSignature,
  quantumVerifyComputeProof, quantumBatchVerifyComputeProofs, isQuantumProof,
  pqProveCompute, pqToComputeProof, QUANTUM_MODE,
} from "../crypto/pq.js";
import { pqNewNonce } from "../crypto/pq-zkp.js";

describe("pq facade (quantum mode integration)", () => {
  it("runs in quantum mode", () => { expect(QUANTUM_MODE).toBe(true); });

  it("full miner flow: keygen → address → sign → verify", () => {
    const kp = quantumGenerateKeyPair("ab".repeat(32));
    const addr = quantumAddressFromPublicKey(kp.publicKey);
    expect(isQuantumAddress(addr)).toBe(true);
    const c: any = { minerAddress: addr, publicKey: kp.publicKey, signature: "",
      proof: { taskCommitment: "ff".repeat(32), circuitId: "PQ_CIRCUIT_AI_INFERENCE_V1", tflopsWeight: 100 } };
    c.signature = quantumSignContribution(kp.privateKey, c, 50);
    expect(quantumVerifyContributionSignature(c, 50)).toBe(true);
    expect(quantumVerifyContributionSignature(c, 51)).toBe(false);
  });

  it("full proof flow: prove → wrap → consensus-verify + batch", () => {
    const p = pqProveCompute("PQ_CIRCUIT_AI_INFERENCE_V1", "dd".repeat(32),
      { taskCommitment: "ee".repeat(32), tflopsWeight: 250, nonce: pqNewNonce() });
    const cp = pqToComputeProof(p);
    expect(isQuantumProof(cp)).toBe(true);
    expect(quantumVerifyComputeProof(cp, 100)).toBe(true);
    expect(quantumBatchVerifyComputeProofs([cp], 100)).toBe(true);
  });
});
