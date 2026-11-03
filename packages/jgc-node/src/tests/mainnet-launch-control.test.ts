import { describe, expect, it } from "@jest/globals";
import { generateKeyPairSync } from "crypto";
import {
  evaluateGateLedger,
  evaluateLaunchPolicy,
  evaluateLaunchRequest,
  GATE_EVIDENCE_REQUIREMENTS,
  keyFingerprint,
  sha256Canonical,
  signPayload,
  type GateEvidencePayload,
  type LaunchPolicy,
  type MainnetLaunchPayload,
  type SignedEnvelope,
  type TrustedKey,
} from "../config/mainnet-launch-control.js";
import { MAINNET_GATE_KEYS, MAINNET_READINESS, type MainnetGateKey } from "../config/mainnet-readiness.js";
import { MAINNET_NETWORK, networkGenesisHash } from "../config/networks.js";
import { evaluateProofRegistryManifest } from "../crypto/proof-registry.js";

const COMMIT = "a".repeat(40);
const SHA = "b".repeat(64);
const NOW = Date.UTC(2027, 0, 25, 12, 0, 0);

interface TestKey extends TrustedKey { privateKeyPem: string }

function key(keyId: string, role: TrustedKey["role"]): TestKey {
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  return {
    keyId, role, publicKeyPem,
    fingerprint: keyFingerprint(publicKeyPem),
    privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

const releaseA = key("release-a", "release-signer");
const releaseB = key("release-b", "release-signer");
const reviewer = key("external-reviewer", "independent-reviewer");
const policy: LaunchPolicy = {
  schemaVersion: 1,
  network: MAINNET_NETWORK.chainId,
  threshold: 2,
  minIndependentReviewers: 1,
  trustedKeys: [releaseA, releaseB, reviewer],
};

const g1 = "0x" + "a1".repeat(64);
const g2 = "0x" + "b2".repeat(128);

function proofRegistry() {
  return {
    schemaVersion: 1,
    network: {
      chainId: MAINNET_NETWORK.chainId,
      consensusVersion: MAINNET_NETWORK.consensusVersion,
      proofMode: MAINNET_NETWORK.proofMode,
    },
    ceremony: {
      id: "jgc-ceremony-2027-01", transcriptSha256: SHA,
      participants: ["a", "b", "c"], completedAt: "2027-01-10T12:00:00Z",
    },
    review: {
      status: "no-unresolved-high-or-critical", reportSha256: SHA,
      reviewerKeyIds: [reviewer.keyId, "second-reviewer"],
      reviewedAt: "2027-01-20T12:00:00Z",
    },
    keys: [{
      circuitId: "CIRCUIT_AI_INFERENCE_V1", alpha: g1, beta: g2, gamma: g2, delta: g2,
      ic: [g1, g1, g1, g1], numPublicInputs: 3,
      minTFLOPSPerProof: 100, maxTFLOPSPerProof: 1_000_000, activeSinceHeight: 0,
    }],
  };
}

function evidenceRecord(gate: MainnetGateKey): SignedEnvelope<GateEvidencePayload> {
  const requirement = GATE_EVIDENCE_REQUIREMENTS[gate];
  const payload: GateEvidencePayload = {
    schemaVersion: 1,
    kind: "jgc-gate-evidence",
    gate,
    status: "satisfied",
    releaseCommit: COMMIT,
    summary: requirement.summary,
    artifacts: requirement.requiredArtifacts.map((kind) => ({
      kind, path: `evidence/${gate}/${kind}.json`, sha256: SHA,
    })),
    verificationCommands: [...requirement.verificationCommands],
    ...(requirement.requiresIndependentReview ? {
      externalReview: {
        reportSha256: SHA,
        reviewerKeyIds: [reviewer.keyId],
        findings: "none-high-or-critical" as const,
      },
    } : {}),
  };
  const signer = requirement.requiresIndependentReview ? reviewer : releaseA;
  return { payload, signatures: [signPayload(payload, signer.privateKeyPem, signer.keyId)] };
}

function ledger(records = MAINNET_GATE_KEYS.map(evidenceRecord)) {
  return { schemaVersion: 1 as const, releaseCommit: COMMIT, records };
}

function launchPayload(ledgerSha256: string): MainnetLaunchPayload {
  const registry = evaluateProofRegistryManifest(proofRegistry());
  return {
    schemaVersion: 1,
    kind: "jgc-mainnet-launch-record",
    network: {
      chainId: MAINNET_NETWORK.chainId,
      consensusVersion: MAINNET_NETWORK.consensusVersion,
      proofMode: MAINNET_NETWORK.proofMode,
      genesisHash: networkGenesisHash(MAINNET_NETWORK),
    },
    releaseCommit: COMMIT,
    artifactSha256: SHA,
    proofRegistrySha256: registry.registrySha256!,
    ledgerSha256,
    readiness: {
      ...MAINNET_READINESS,
      status: "ready",
      gates: Object.fromEntries(MAINNET_GATE_KEYS.map((gate) => [gate, true])) as unknown as typeof MAINNET_READINESS.gates,
    },
    issuedAt: new Date(NOW - 86_400_000).toISOString(),
    expiresAt: new Date(NOW + 86_400_000).toISOString(),
    activation: { valueBearing: true, earliestActivationHeight: 1 },
  };
}

function signedLaunchRecord(payload: MainnetLaunchPayload, signers: TestKey[] = [releaseA, reviewer]) {
  return {
    payload,
    signatures: signers.map((signer) => signPayload(payload, signer.privateKeyPem, signer.keyId)),
  };
}

function validRequest() {
  const policyEval = evaluateLaunchPolicy(policy);
  const ledgerValue = ledger();
  const ledgerSha256 = evaluateGateLedger(ledgerValue, policyEval, COMMIT).ledgerSha256;
  const record = signedLaunchRecord(launchPayload(ledgerSha256));
  return { policy, launchRecord: record, ledger: ledgerValue, proofRegistry: proofRegistry(), now: NOW };
}

describe("gate closure and signed launch control", () => {
  it("has a concrete evidence contract for all twelve gates", () => {
    expect(Object.keys(GATE_EVIDENCE_REQUIREMENTS).sort()).toEqual([...MAINNET_GATE_KEYS].sort());
    for (const gate of MAINNET_GATE_KEYS) {
      const requirement = GATE_EVIDENCE_REQUIREMENTS[gate];
      expect(requirement.requiredArtifacts.length).toBeGreaterThan(0);
      expect(requirement.verificationCommands.length).toBeGreaterThan(0);
      expect(requirement.deliverable.length).toBeGreaterThan(10);
    }
  });

  it("fails closed with an empty policy, empty ledger, and no launch record", () => {
    const emptyPolicy: LaunchPolicy = { ...policy, trustedKeys: [] };
    const result = evaluateLaunchRequest({
      policy: emptyPolicy, launchRecord: null, ledger: ledger([]), proofRegistry: null, now: NOW,
    });
    expect(result.ready).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.reasons.join(" ")).toMatch(/no signed, release-specific mainnet launch record/);
    expect(result.reasons.join(" ")).toMatch(/threshold exceeds the number of trusted keys/);
    expect(result.proofRegistry.status).toBe("blocked");
    expect(result.builtInProofRegistry.status).toBe("placeholder");
    expect(Object.values(result.gates).every((gate) => !gate.evidenceSatisfied)).toBe(true);
  });

  it("accepts a complete, independently signed, release-bound evidence set", () => {
    const result = evaluateLaunchRequest(validRequest());
    expect(result.reasons).toEqual([]);
    expect(result.ready).toBe(true);
    expect(result.status).toBe("ready");
    expect(result.signers).toEqual(["release-a", "external-reviewer"]);
    expect(result.proofRegistry.status).toBe("reviewed");
    expect(Object.values(result.gates).every((gate) => gate.evidenceSatisfied)).toBe(true);
  });

  it("rejects tampered records, duplicate signers, wrong genesis and stale windows", () => {
    const request = validRequest();

    const tampered = structuredClone(request);
    (tampered.launchRecord.payload as { artifactSha256: string }).artifactSha256 = "f".repeat(64);
    expect(evaluateLaunchRequest(tampered).reasons.join(" ")).toMatch(/does not verify/);

    const duplicated = structuredClone(request);
    duplicated.launchRecord.signatures = [
      ...duplicated.launchRecord.signatures,
      duplicated.launchRecord.signatures[0]!,
    ];
    expect(evaluateLaunchRequest(duplicated).reasons.join(" ")).toMatch(/duplicates signer/);

    const wrongGenesis = structuredClone(request);
    (wrongGenesis.launchRecord.payload.network as { genesisHash: string }).genesisHash = SHA;
    expect(evaluateLaunchRequest(wrongGenesis).reasons.join(" ")).toMatch(/does not match the compiled mainnet identity/);

    const expired = structuredClone(request);
    (expired.launchRecord.payload as { expiresAt: string }).expiresAt = new Date(NOW - 1000).toISOString();
    expect(evaluateLaunchRequest(expired).reasons.join(" ")).toMatch(/expired/);
  });

  it("requires a signed evidence record for every gate and the exact artifact set", () => {
    const request = validRequest();
    const missingGate = structuredClone(request);
    (missingGate.ledger as { records: unknown[] }).records.pop();
    const missing = evaluateLaunchRequest(missingGate);
    expect(missing.ready).toBe(false);
    expect(missing.reasons.join(" ")).toMatch(/incomplete evidence/);
    expect(missing.gates.independentSecurityReview.reasons.join(" ")).toMatch(/no signed evidence record/);

    const missingArtifact = structuredClone(request);
    const first = (missingArtifact.ledger as unknown as { records: { payload: { artifacts: unknown[] } }[] }).records[0]!;
    first.payload.artifacts.pop();
    const result = evaluateLaunchRequest(missingArtifact);
    expect(result.ready).toBe(false);
    expect(result.gates.proofSystem.reasons.join(" ")).toMatch(/artifacts do not match/);
  });

  it("rejects a launch record that is not bound to the current evidence ledger", () => {
    const request = validRequest();
    const rebound = structuredClone(request);
    (rebound.launchRecord.payload as { ledgerSha256: string }).ledgerSha256 = SHA;
    expect(evaluateLaunchRequest(rebound).reasons.join(" ")).toMatch(/not bound to the current gate evidence ledger/);
  });

  it("canonical signing is independent of object key order", () => {
    expect(sha256Canonical({ b: 2, a: { d: 4, c: 3 } })).toBe(sha256Canonical({ a: { c: 3, d: 4 }, b: 2 }));
    expect(() => sha256Canonical({ a: undefined })).toThrow(/cannot be signed/);
  });
});
