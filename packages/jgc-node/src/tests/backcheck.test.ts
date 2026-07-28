import { afterEach, describe, expect, it } from "@jest/globals";
import {
  createLocalProofVerifier,
  runProofBackCheck,
  runQualityBackCheck,
  runReplayBackCheck,
  type ProofVerifierBackChecker,
  type QualityBackChecker,
  type ReplayBackChecker,
} from "../broker/backcheck.js";
import {
  FakeInferenceBackend,
  fakeExecutionProfile,
  type VerifiableTask,
} from "../broker/junctioning.js";
import { makeClaim } from "../broker/verification.js";
import {
  pqNewNonce,
  pqProveCompute,
  pqToComputeProof,
  setPQVerifierMode,
} from "../crypto/pq-zkp.js";

const proofContext = { blockHeight: 7, epochBlockIndex: 7, minimumWork: 1 };

function researchProof() {
  const outputCommitment = "ab".repeat(32);
  return pqToComputeProof(pqProveCompute(
    "PQ_CIRCUIT_AI_INFERENCE_V1",
    outputCommitment,
    {
      taskCommitment: "cd".repeat(32),
      tflopsWeight: 10,
      nonce: pqNewNonce(),
    },
  ));
}

function task(): VerifiableTask {
  const model = "gemma2:2b";
  return {
    prompt: "explain useful compute",
    model,
    maxTokens: 64,
    temperature: 0,
    seed: 0,
    executionProfile: fakeExecutionProfile(model),
  };
}

describe("heterogeneous back-checker roles", () => {
  afterEach(() => setPQVerifierMode("simnet"));

  it("lets any architecture verify portable proof data in simnet", async () => {
    const report = await runProofBackCheck(
      createLocalProofVerifier("arm-verifier"),
      researchProof(),
      proofContext,
    );
    expect(report).toMatchObject({
      role: "proof-verifier",
      status: "pass",
      enforcement: "consensus",
      scheme: "pq-hash-iop-research",
      verifiedWork: 10,
    });
  });

  it("rejects the research receipt under strict consensus", async () => {
    const proof = researchProof();
    setPQVerifierMode("strict");
    const report = await runProofBackCheck(
      createLocalProofVerifier("strict-verifier"),
      proof,
      proofContext,
    );
    expect(report.status).toBe("fail");
    expect(report.enforcement).toBe("consensus");
    expect(report.reason).toMatch(/research receipt|not a sound proof/i);
  });

  it("fails closed when a proof-verifier implementation crashes", async () => {
    const checker: ProofVerifierBackChecker = {
      id: "broken-verifier",
      role: "proof-verifier",
      verify() { throw new Error("native verifier unavailable"); },
    };
    const report = await runProofBackCheck(checker, researchProof(), proofContext);
    expect(report.status).toBe("fail");
    expect(report.reason).toMatch(/failed closed/i);
  });

  it("makes an incompatible replay auditor abstain", async () => {
    const spec = task();
    const output = await new FakeInferenceBackend().run(spec);
    const claim = makeClaim(spec, output.text);
    const checker: ReplayBackChecker = {
      id: "different-gpu",
      role: "replay-auditor",
      backend: {
        name: "different-gpu",
        async executionProfile(model) {
          return { ...fakeExecutionProfile(model), numericBackend: "different-gpu" };
        },
        async run() { throw new Error("incompatible replay must not execute"); },
      },
    };
    const report = await runReplayBackCheck(checker, claim);
    expect(report).toMatchObject({
      status: "inconclusive",
      enforcement: "quorum",
      role: "replay-auditor",
    });
  });

  it("keeps quality judgments advisory even when they fail", async () => {
    const checker: QualityBackChecker = {
      id: "customer-policy",
      role: "quality-auditor",
      assess: async () => ({ accepted: false, reason: "answer omitted required citations" }),
    };
    const report = await runQualityBackCheck(checker, task(), "an incomplete answer");
    expect(report).toMatchObject({
      status: "fail",
      enforcement: "advisory",
      role: "quality-auditor",
    });
  });
});
