import { describe, expect, it } from "@jest/globals";
import {
  assertReviewedProofRegistry,
  evaluateBuiltInProofRegistry,
  evaluateProofRegistryManifest,
  type ProofRegistryManifest,
} from "../crypto/proof-registry.js";
import { MAINNET_NETWORK } from "../config/networks.js";

const g1 = "0x" + "a1".repeat(64);
const g2 = "0x" + "b2".repeat(128);
const digest = "c3".repeat(32);

function validManifest(): ProofRegistryManifest {
  return {
    schemaVersion: 1,
    network: {
      chainId: MAINNET_NETWORK.chainId,
      consensusVersion: MAINNET_NETWORK.consensusVersion,
      proofMode: MAINNET_NETWORK.proofMode,
    },
    ceremony: {
      id: "jgc-ceremony-2027-01",
      transcriptSha256: digest,
      participants: ["reviewer-a", "reviewer-b", "community-observer"],
      completedAt: "2027-01-15T12:00:00Z",
    },
    review: {
      status: "no-unresolved-high-or-critical",
      reportSha256: digest,
      reviewerKeyIds: ["crypto-review-a", "crypto-review-b"],
      reviewedAt: "2027-01-20T12:00:00Z",
    },
    keys: [
      {
        circuitId: "CIRCUIT_AI_INFERENCE_V1",
        alpha: g1, beta: g2, gamma: g2, delta: g2,
        ic: [g1, g1, g1, g1],
        numPublicInputs: 3, minTFLOPSPerProof: 100, maxTFLOPSPerProof: 1_000_000,
        activeSinceHeight: 0,
      },
    ],
  };
}

describe("production proof registry gate", () => {
  it("reports the compiled-in registry as unusable placeholder keys", () => {
    const result = evaluateBuiltInProofRegistry();
    expect(result.status).toBe("placeholder");
    expect(result.circuitCount).toBeGreaterThan(0);
    expect(result.reasons.join(" ")).toMatch(/G1 point|G2 point/);
    expect(() => assertReviewedProofRegistry()).toThrow(/proofSystem gate is blocked/);
  });

  it("accepts a complete, reviewed, release-specific registry", () => {
    const manifest = validManifest();
    const result = evaluateProofRegistryManifest(manifest);
    expect(result.status).toBe("reviewed");
    expect(result.reasons).toEqual([]);
    expect(result.registrySha256).toMatch(/^[0-9a-f]{64}$/);
    expect(assertReviewedProofRegistry(manifest)).toBe(result.registrySha256);
    expect(evaluateBuiltInProofRegistry(manifest).status).toBe("reviewed");
  });

  it("rejects short placeholder points, wrong network, and missing review", () => {
    const short = structuredClone(validManifest());
    (short.keys[0] as { alpha: string }).alpha = "0x" + "a1".repeat(32);
    expect(evaluateProofRegistryManifest(short).status).toBe("blocked");

    const wrongNetwork = structuredClone(validManifest());
    (wrongNetwork.network as { chainId: string }).chainId = "jgtc-testnet-v2";
    expect(evaluateProofRegistryManifest(wrongNetwork).reasons).toContain(
      "proof registry does not match the compiled mainnet identity",
    );

    const noReview = structuredClone(validManifest()) as unknown as Record<string, unknown>;
    delete noReview.review;
    expect(evaluateProofRegistryManifest(noReview).status).toBe("blocked");

    const singleParticipant = structuredClone(validManifest());
    (singleParticipant.ceremony as unknown as { participants: string[] }).participants = ["one"];
    expect(evaluateProofRegistryManifest(singleParticipant).status).toBe("blocked");
  });

  it("rejects duplicate circuit IDs and mismatched IC lengths", () => {
    const duplicate = structuredClone(validManifest());
    (duplicate as unknown as { keys: unknown[] }).keys = [duplicate.keys[0]!, duplicate.keys[0]!];
    expect(evaluateProofRegistryManifest(duplicate).reasons.join(" ")).toMatch(/duplicate circuitId/);

    const badIc = structuredClone(validManifest());
    (badIc.keys[0] as unknown as { ic: string[] }).ic = [g1, g1];
    expect(evaluateProofRegistryManifest(badIc).reasons.join(" ")).toMatch(/numPublicInputs \+ 1/);
  });
});
