import { createHash, createPublicKey, sign, verify } from "node:crypto";
import {
  MAINNET_GATE_KEYS,
  MAINNET_READINESS,
  assertMainnetLaunchAllowed,
  type MainnetGateKey,
  type MainnetReadinessRecord,
} from "./mainnet-readiness.js";
import { MAINNET_NETWORK, networkGenesisHash } from "./networks.js";
import {
  evaluateBuiltInProofRegistry,
  evaluateProofRegistryManifest,
  type BuiltInRegistryEvaluation,
  type ProofRegistryEvaluation,
} from "../crypto/proof-registry.js";

/**
 * Gate-closure and launch control.
 *
 * The readiness booleans in mainnet-readiness.ts say *what* must be true. This
 * module says *how a gate becomes true*: every gate has a fixed list of
 * required artifacts, verification commands and (except for the two checked-in
 * engineering gates) an independent reviewer signature. A value-bearing launch
 * additionally requires an M-of-N signed, release-specific launch record bound
 * to the evidence ledger, the reviewed proof registry and the compiled chain
 * identity. With no trusted keys and no evidence in the repository, all of
 * this fails closed.
 *
 * Nothing here marks a gate true. It only verifies evidence that external
 * people and reproducible runs must produce.
 */

export const LAUNCH_CONTROL_SCHEMA_VERSION = 1;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const KEY_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const BASE64_ED25519 = /^[A-Za-z0-9+/]{86}==$/;

export type ReviewerRole = "release-signer" | "independent-reviewer";

export interface TrustedKey {
  readonly keyId: string;
  readonly publicKeyPem: string;
  readonly fingerprint: string;
  readonly role: ReviewerRole;
  readonly organization?: string;
}

export interface LaunchPolicy {
  readonly schemaVersion: 1;
  readonly network: string;
  /** Distinct signatures required on the launch record. */
  readonly threshold: number;
  /** Independent (non-project) signatures required on the launch record. */
  readonly minIndependentReviewers: number;
  readonly trustedKeys: readonly TrustedKey[];
}

export interface EnvelopeSignature {
  readonly keyId: string;
  readonly algorithm: "Ed25519";
  readonly signature: string;
}

export interface SignedEnvelope<T> {
  readonly payload: T;
  readonly signatures: readonly EnvelopeSignature[];
}

export interface GateRequirement {
  readonly summary: string;
  readonly owner: string;
  readonly deliverable: string;
  readonly requiredArtifacts: readonly string[];
  readonly verificationCommands: readonly string[];
  readonly requiresIndependentReview: boolean;
}

/** The concrete unblock contract for every mainnet gate. */
export const GATE_EVIDENCE_REQUIREMENTS: Readonly<Record<MainnetGateKey, GateRequirement>> = Object.freeze({
  proofSystem: {
    summary: "Real, externally reviewed proving/verifying keys; no simulation receipts or placeholder keys.",
    owner: "Cryptography lead + independent ZK reviewers",
    deliverable: "Versioned ceremony transcript, signed proof-registry manifest, strict verifier tests",
    requiredArtifacts: ["proof-registry", "ceremony-transcript", "verifier-binary", "external-crypto-review"],
    verificationCommands: [
      "npm test -- --runTestsByPath src/tests/proof-registry.test.ts",
      "npm run proof:registry -- --check",
    ],
    requiresIndependentReview: true,
  },
  postQuantumSecurity: {
    summary: "End-to-end quantum-safe proofs, commitments, transport, backup and upgrade keys.",
    owner: "Cryptography lead + independent PQ reviewers",
    deliverable: "Full-length commitments, PQ proof backend, key-migration spec, adversarial tests",
    requiredArtifacts: ["pq-threat-model", "pq-migration-spec", "pq-adversarial-tests", "external-crypto-review"],
    verificationCommands: [
      "npm test -- --runTestsByPath src/tests/pq-signatures.test.ts src/tests/pq-zkp.test.ts",
      "npm run pq:evaluate",
    ],
    requiresIndependentReview: true,
  },
  paymentPrivacy: {
    summary: "Zcash-like shielded value with recipient-exclusive spending and separate viewing keys.",
    owner: "Protocol + wallet leads + external privacy reviewers",
    deliverable: "Implemented V3 shielded transaction, wallet scanning/recovery, value-conservation tests",
    requiredArtifacts: ["shielded-spec", "shielded-adversarial-tests", "wallet-recovery-tests", "external-crypto-review"],
    verificationCommands: [
      "npm test -- --runTestsByPath src/tests/shielded-payments.test.ts src/tests/wallet-recovery.test.ts",
    ],
    requiresIndependentReview: true,
  },
  usefulServices: {
    summary: "Authenticated funded dispatch, verifiable completion/availability and exactly-once settlement.",
    owner: "Broker + consensus leads",
    deliverable: "Remote dispatch API, consensus ledger settlement, storage availability challenges",
    requiredArtifacts: ["service-settlement-spec", "funded-work-tests", "recovery-tests"],
    verificationCommands: [
      "npm test -- --runTestsByPath src/tests/funded-work.test.ts src/tests/assigned-work.test.ts",
      "npm test -- --runTestsByPath src/tests/reorg.test.ts",
    ],
    requiresIndependentReview: false,
  },
  governance: {
    summary: "Bounded authority, versioned upgrades, budgets and tested emergency recovery.",
    owner: "Protocol lead + independent governance reviewer",
    deliverable: "Governance spec, authority-limit tests, upgrade/recovery drills",
    requiredArtifacts: ["governance-spec", "governance-tests", "recovery-drill-evidence"],
    verificationCommands: ["npm test -- --runTestsByPath src/tests/governance.test.ts"],
    requiresIndependentReview: true,
  },
  deterministicConsensus: {
    summary: "Exact arithmetic, canonical fork ordering, replay and restart determinism.",
    owner: "Consensus lead",
    deliverable: "Pinned cross-platform vectors and restart validation",
    requiredArtifacts: ["consensus-vectors", "restart-evidence"],
    verificationCommands: [
      "npm test -- --runTestsByPath src/tests/candidate-consensus.test.ts src/tests/canonical.test.ts",
    ],
    requiresIndependentReview: false,
  },
  permissionlessProduction: {
    summary: "No designated producer; proposer identity bound into headers and enforced by validation/fork choice.",
    owner: "Consensus lead + independent consensus reviewer",
    deliverable: "Enforced proposer schedule, adversarial proposer tests, activation height",
    requiredArtifacts: ["proposer-spec", "proposer-adversarial-tests", "activation-plan"],
    verificationCommands: [
      "npm test -- --runTestsByPath src/tests/proposer.test.ts src/tests/network-identity.test.ts",
    ],
    requiresIndependentReview: true,
  },
  peerAuthentication: {
    summary: "Authenticated P2P identities, sessions, messages and replay protection.",
    owner: "Networking lead",
    deliverable: "Mutual handshake, sequence/replay and transport-bound acceptance tests",
    requiredArtifacts: ["session-acceptance-tests", "transport-bounds-tests"],
    verificationCommands: [
      "npm test -- --runTestsByPath src/tests/network-authentication.test.ts src/tests/auth-session.test.ts src/tests/transport-bounds.test.ts",
    ],
    requiresIndependentReview: false,
  },
  validatorEconomics: {
    summary: "Specified, tested issuance, fees, bonds, rewards, slashing and activation heights.",
    owner: "Economics + consensus leads + independent economics reviewer",
    deliverable: "Consensus-owned bond ledger, adversarial reward/slash tests, activation spec",
    requiredArtifacts: ["economics-spec", "bond-adversarial-tests", "activation-plan"],
    verificationCommands: [
      "npm test -- --runTestsByPath src/tests/validator-bonds.test.ts src/tests/emission.test.ts",
    ],
    requiresIndependentReview: true,
  },
  reproducibleArtifacts: {
    summary: "Clean rebuilds produce matching signed binaries, containers, SBOMs and genesis manifests.",
    owner: "Release engineer",
    deliverable: "Two independent rebuilds with identical digests and signatures",
    requiredArtifacts: ["release-manifest", "sbom", "independent-rebuild-attestation"],
    verificationCommands: ["npm run release:check", "npm run release:verify"],
    requiresIndependentReview: false,
  },
  soloSoak: {
    summary: "Owner-controlled multi-host accelerated and real-cadence rehearsals with immutable evidence.",
    owner: "Operations lead + independent operators",
    deliverable: "Restart, seed-loss, reorg and 72-hour/cadence soak evidence",
    requiredArtifacts: ["soak-evidence", "restore-drill-evidence", "inventory"],
    verificationCommands: ["npm run solo-soak -- --blocks 100000 --nodes 5", "npm run gates:status"],
    requiresIndependentReview: false,
  },
  independentSecurityReview: {
    summary: "External consensus, cryptography, network and economics review with no unresolved high/critical findings.",
    owner: "Independent reviewers (not the project owner)",
    deliverable: "Signed reports, resolved findings, re-review, public disclosure record",
    requiredArtifacts: ["external-review-reports", "findings-register", "remediation-attestation", "disclosure-record"],
    verificationCommands: ["npm run gates:evidence -- --verify"],
    requiresIndependentReview: true,
  },
});

// ── Canonical signing ────────────────────────────────────────────────────────

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number cannot be signed");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => {
      if (record[key] === undefined) throw new Error(`undefined field ${key} cannot be signed`);
      return `${JSON.stringify(key)}:${canonicalJson(record[key])}`;
    }).join(",")}}`;
  }
  throw new Error("unsupported value cannot be signed");
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function keyFingerprint(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex");
}

export function signPayload<T>(payload: T, privateKeyPem: string, keyId: string): EnvelopeSignature {
  return {
    keyId,
    algorithm: "Ed25519",
    signature: sign(null, Buffer.from(canonicalJson(payload), "utf8"), privateKeyPem).toString("base64"),
  };
}

// ── Policy and signature verification ────────────────────────────────────────

export interface PolicyEvaluation {
  readonly valid: boolean;
  readonly reasons: readonly string[];
  readonly keyById: ReadonlyMap<string, TrustedKey>;
}

export function evaluateLaunchPolicy(policy: unknown): PolicyEvaluation {
  const reasons: string[] = [];
  const keyById = new Map<string, TrustedKey>();
  if (policy === null || typeof policy !== "object" || Array.isArray(policy)) {
    return { valid: false, reasons: ["launch policy is missing or not an object"], keyById };
  }
  const p = policy as Record<string, unknown>;
  if (p.schemaVersion !== LAUNCH_CONTROL_SCHEMA_VERSION) reasons.push("unsupported launch policy schemaVersion");
  if (p.network !== MAINNET_NETWORK.chainId) reasons.push("launch policy is bound to a different network");
  if (!Number.isSafeInteger(p.threshold) || (p.threshold as number) < 2 || (p.threshold as number) > 16) {
    reasons.push("launch policy threshold must be an integer from 2 to 16");
  }
  if (!Number.isSafeInteger(p.minIndependentReviewers) || (p.minIndependentReviewers as number) < 1) {
    reasons.push("launch policy must require at least one independent reviewer signature");
  }
  if (!Array.isArray(p.trustedKeys)) {
    reasons.push("launch policy has no trustedKeys array");
  } else {
    const fingerprints = new Set<string>();
    for (const [index, entry] of p.trustedKeys.entries()) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        reasons.push(`trustedKeys[${index}] is not an object`);
        continue;
      }
      const key = entry as Record<string, unknown>;
      let fingerprint = "";
      try {
        fingerprint = keyFingerprint(String(key.publicKeyPem ?? ""));
        if (key.fingerprint !== fingerprint) reasons.push(`trustedKeys[${index}] fingerprint does not match its public key`);
      } catch {
        reasons.push(`trustedKeys[${index}] publicKeyPem is not a valid Ed25519 public key`);
      }
      if (typeof key.keyId !== "string" || !KEY_ID.test(key.keyId) || keyById.has(key.keyId)) {
        reasons.push(`trustedKeys[${index}] keyId is malformed or duplicated`);
      }
      if (key.role !== "release-signer" && key.role !== "independent-reviewer") {
        reasons.push(`trustedKeys[${index}] role is invalid`);
      }
      if (fingerprints.has(fingerprint)) reasons.push(`trustedKeys[${index}] reuses a public key`);
      fingerprints.add(fingerprint);
      if (KEY_ID.test(String(key.keyId ?? "")) && !keyById.has(String(key.keyId))) {
        keyById.set(String(key.keyId), entry as unknown as TrustedKey);
      }
    }
    if (p.trustedKeys.length < (p.threshold as number)) reasons.push("threshold exceeds the number of trusted keys");
    if (!p.trustedKeys.some((k) => (k as TrustedKey | null)?.role === "independent-reviewer")) {
      reasons.push("launch policy has no independent reviewer key");
    }
  }
  return { valid: reasons.length === 0, reasons, keyById };
}

export interface EnvelopeEvaluation {
  readonly valid: boolean;
  readonly reasons: readonly string[];
  readonly signers: readonly TrustedKey[];
}

export function verifyEnvelope(
  envelope: unknown,
  policyEval: PolicyEvaluation,
  expectedKind: string,
  minimumSigners = 1,
  requireIndependent = false,
): EnvelopeEvaluation {
  const reasons: string[] = [];
  if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope)) {
    return { valid: false, reasons: ["signed envelope is missing or not an object"], signers: [] };
  }
  const e = envelope as Record<string, unknown>;
  const payload = e.payload as Record<string, unknown> | null;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, reasons: ["signed envelope has no object payload"], signers: [] };
  }
  if (payload.kind !== expectedKind || payload.schemaVersion !== LAUNCH_CONTROL_SCHEMA_VERSION) {
    reasons.push("signed payload kind or schemaVersion does not match");
  }
  if (!Array.isArray(e.signatures) || e.signatures.length === 0 || e.signatures.length > 32) {
    return { valid: false, reasons: [...reasons, "signed envelope has no usable signatures"], signers: [] };
  }
  const signers: TrustedKey[] = [];
  const seen = new Set<string>();
  let bytes: Buffer;
  try {
    bytes = Buffer.from(canonicalJson(payload), "utf8");
  } catch (error) {
    return { valid: false, reasons: [...reasons, (error as Error).message], signers: [] };
  }
  for (const [index, raw] of e.signatures.entries()) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      reasons.push(`signatures[${index}] is not an object`);
      continue;
    }
    const s = raw as Record<string, unknown>;
    const key = policyEval.keyById.get(String(s.keyId ?? ""));
    if (!key || s.algorithm !== "Ed25519" || typeof s.signature !== "string"
        || !BASE64_ED25519.test(s.signature)) {
      reasons.push(`signatures[${index}] is unknown, malformed, or uses the wrong algorithm`);
      continue;
    }
    if (seen.has(key.keyId)) {
      reasons.push(`signatures[${index}] duplicates signer ${key.keyId}`);
      continue;
    }
    try {
      if (!verify(null, bytes, createPublicKey(key.publicKeyPem), Buffer.from(s.signature, "base64"))) {
        reasons.push(`signatures[${index}] does not verify`);
        continue;
      }
    } catch {
      reasons.push(`signatures[${index}] does not verify`);
      continue;
    }
    seen.add(key.keyId);
    signers.push(key);
  }
  const independents = signers.filter((k) => k.role === "independent-reviewer").length;
  if (signers.length < minimumSigners) reasons.push(`only ${signers.length} valid signatures; ${minimumSigners} required`);
  if (requireIndependent && independents < 1) reasons.push("no independent reviewer signature");
  return { valid: reasons.length === 0, reasons, signers };
}

// ── Gate evidence ledger ──────────────────────────────────────────────────────

export interface GateArtifact {
  readonly kind: string;
  readonly path: string;
  readonly sha256: string;
}

export interface GateEvidencePayload {
  readonly schemaVersion: 1;
  readonly kind: "jgc-gate-evidence";
  readonly gate: MainnetGateKey;
  readonly status: "satisfied";
  readonly releaseCommit: string;
  readonly summary: string;
  readonly artifacts: readonly GateArtifact[];
  readonly verificationCommands: readonly string[];
  readonly ciRun?: string;
  readonly externalReview?: {
    readonly reportSha256: string;
    readonly reviewerKeyIds: readonly string[];
    readonly findings: "none-high-or-critical";
  };
}

export interface GateEvidenceLedger {
  readonly schemaVersion: 1;
  readonly releaseCommit: string;
  readonly records: readonly SignedEnvelope<GateEvidencePayload>[];
}

export interface GateEvidenceState {
  readonly gate: MainnetGateKey;
  readonly baselineGate: boolean;
  readonly evidenceSatisfied: boolean;
  readonly reasons: readonly string[];
  readonly requirement: GateRequirement;
}

export interface GateLedgerEvaluation {
  readonly satisfied: boolean;
  readonly ledgerSha256: string;
  readonly gates: Readonly<Record<MainnetGateKey, GateEvidenceState>>;
  readonly reasons: readonly string[];
}

export function evaluateGateLedger(
  ledger: unknown,
  policyEval: PolicyEvaluation,
  releaseCommit?: string,
): GateLedgerEvaluation {
  const reasons: string[] = [];
  const states = {} as Record<MainnetGateKey, GateEvidenceState>;
  const records = new Map<MainnetGateKey, SignedEnvelope<GateEvidencePayload>>();
  const l = ledger as Record<string, unknown> | null;
  if (!l || typeof l !== "object" || Array.isArray(l)) {
    reasons.push("gate evidence ledger is missing or not an object");
  } else {
    if (l.schemaVersion !== LAUNCH_CONTROL_SCHEMA_VERSION) reasons.push("unsupported gate ledger schemaVersion");
    if (typeof l.releaseCommit !== "string" || !COMMIT.test(l.releaseCommit)) {
      reasons.push("gate ledger releaseCommit must be a full 40-character Git commit hash");
    }
    if (releaseCommit && l.releaseCommit !== releaseCommit) reasons.push("gate ledger is bound to a different release commit");
    if (!Array.isArray(l.records) || l.records.length > 64) reasons.push("gate ledger records are missing or oversized");
    else for (const raw of l.records) {
      const payload = (raw as Record<string, unknown> | null)?.payload as GateEvidencePayload | undefined;
      if (!payload || !MAINNET_GATE_KEYS.includes(payload.gate)) {
        reasons.push("gate ledger contains a record with an unknown gate");
        continue;
      }
      if (records.has(payload.gate)) reasons.push(`duplicate evidence record for ${payload.gate}`);
      else records.set(payload.gate, raw as SignedEnvelope<GateEvidencePayload>);
    }
  }

  for (const gate of MAINNET_GATE_KEYS) {
    const requirement = GATE_EVIDENCE_REQUIREMENTS[gate];
    const gateReasons: string[] = [];
    const record = records.get(gate);
    if (!record) {
      gateReasons.push("no signed evidence record");
    } else {
      const p = record.payload;
      if (p.status !== "satisfied") gateReasons.push("evidence status is not satisfied");
      if (typeof p.releaseCommit !== "string" || !COMMIT.test(p.releaseCommit)
          || (releaseCommit && p.releaseCommit !== releaseCommit)) {
        gateReasons.push("evidence is not bound to this release commit");
      }
      const expected = [...requirement.requiredArtifacts].sort();
      const present = Array.isArray(p.artifacts)
        ? [...new Set(p.artifacts.map((a) => String(a?.kind ?? "")))].sort()
        : [];
      if (JSON.stringify(present) !== JSON.stringify(expected)) {
        gateReasons.push(`artifacts do not match the required set: ${expected.join(", ")}`);
      }
      if (Array.isArray(p.artifacts)) {
        for (const artifact of p.artifacts) {
          if (!artifact || typeof artifact.path !== "string" || !artifact.path.trim()
              || typeof artifact.sha256 !== "string" || !SHA256.test(artifact.sha256)) {
            gateReasons.push("an artifact has no path or a malformed sha256");
            break;
          }
        }
      }
      const expectedCommands = [...requirement.verificationCommands].sort();
      const actualCommands = Array.isArray(p.verificationCommands)
        ? [...p.verificationCommands].sort()
        : [];
      if (JSON.stringify(actualCommands) !== JSON.stringify(expectedCommands)) {
        gateReasons.push("verification commands do not match the gate contract");
      }
      if (requirement.requiresIndependentReview) {
        if (!p.externalReview || !SHA256.test(String(p.externalReview.reportSha256 ?? ""))
            || !Array.isArray(p.externalReview.reviewerKeyIds)
            || p.externalReview.reviewerKeyIds.length < 1
            || p.externalReview.findings !== "none-high-or-critical") {
          gateReasons.push("independent review attestation is missing or has unresolved findings");
        } else if (!policyEval.keyById.size
            || p.externalReview.reviewerKeyIds.some((id) => policyEval.keyById.get(id)?.role !== "independent-reviewer")) {
          gateReasons.push("reviewer key ids are not trusted independent reviewers in the launch policy");
        }
      }
      const envelope = verifyEnvelope(record, policyEval, "jgc-gate-evidence", 1,
        requirement.requiresIndependentReview);
      if (!envelope.valid) gateReasons.push(...envelope.reasons);
    }
    states[gate] = {
      gate,
      baselineGate: MAINNET_READINESS.gates[gate],
      evidenceSatisfied: gateReasons.length === 0,
      reasons: gateReasons.length ? gateReasons : ["signed evidence accepted"],
      requirement,
    };
  }

  const ledgerSha256 = sha256Canonical(ledger ?? null);
  const unsatisfied = MAINNET_GATE_KEYS.filter((gate) => !states[gate].evidenceSatisfied);
  if (unsatisfied.length) reasons.push(`unsigned or incomplete evidence for: ${unsatisfied.join(", ")}`);
  return {
    satisfied: reasons.length === 0,
    ledgerSha256,
    gates: states,
    reasons,
  };
}

// ── Signed launch record ─────────────────────────────────────────────────────

export interface MainnetLaunchPayload {
  readonly schemaVersion: 1;
  readonly kind: "jgc-mainnet-launch-record";
  readonly network: {
    readonly chainId: string;
    readonly consensusVersion: number;
    readonly proofMode: string;
    readonly genesisHash: string;
  };
  readonly releaseCommit: string;
  readonly artifactSha256: string;
  readonly proofRegistrySha256: string;
  readonly ledgerSha256: string;
  readonly readiness: MainnetReadinessRecord;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly activation: {
    readonly valueBearing: true;
    readonly earliestActivationHeight: number;
  };
}

export interface LaunchEvaluation {
  readonly ready: boolean;
  readonly status: "blocked" | "candidate" | "ready";
  readonly reasons: readonly string[];
  readonly signers: readonly string[];
  readonly gates: Readonly<Record<MainnetGateKey, GateEvidenceState>>;
  readonly proofRegistry: ProofRegistryEvaluation;
  readonly builtInProofRegistry: BuiltInRegistryEvaluation;
}

export function evaluateLaunchRequest(input: {
  policy: unknown;
  launchRecord: unknown;
  ledger: unknown;
  proofRegistry: unknown;
  now?: number;
}): LaunchEvaluation {
  const now = input.now ?? Date.now();
  const reasons: string[] = [];
  const policyEval = evaluateLaunchPolicy(input.policy);
  if (!policyEval.valid) reasons.push(...policyEval.reasons);

  const record = input.launchRecord as { payload?: MainnetLaunchPayload } | null;
  const payload = record?.payload;
  const ledgerEval = evaluateGateLedger(input.ledger, policyEval, payload?.releaseCommit);
  const proofRegistry = evaluateProofRegistryManifest(input.proofRegistry);
  const builtInProofRegistry = evaluateBuiltInProofRegistry(input.proofRegistry);

  if (!payload) {
    reasons.push("no signed, release-specific mainnet launch record is configured");
  } else {
    const envelope = verifyEnvelope(input.launchRecord, policyEval, "jgc-mainnet-launch-record",
      Math.max(2, Number((input.policy as LaunchPolicy | null)?.threshold ?? 2)), true);
    if (!envelope.valid) reasons.push(...envelope.reasons);
    const signatures = envelope.signers.map((key) => key.keyId);

    if (payload.network?.chainId !== MAINNET_NETWORK.chainId
        || payload.network?.consensusVersion !== MAINNET_NETWORK.consensusVersion
        || payload.network?.proofMode !== MAINNET_NETWORK.proofMode
        || payload.network?.genesisHash !== networkGenesisHash(MAINNET_NETWORK)) {
      reasons.push("launch record does not match the compiled mainnet identity and genesis");
    }
    if (typeof payload.releaseCommit !== "string" || !COMMIT.test(payload.releaseCommit)) {
      reasons.push("launch record releaseCommit is malformed");
    }
    if (typeof payload.artifactSha256 !== "string" || !SHA256.test(payload.artifactSha256)) {
      reasons.push("launch record artifactSha256 is malformed");
    }
    if (payload.ledgerSha256 !== ledgerEval.ledgerSha256) {
      reasons.push("launch record is not bound to the current gate evidence ledger");
    }
    if (payload.proofRegistrySha256 !== proofRegistry.registrySha256) {
      reasons.push("launch record is not bound to a reviewed proof registry");
    }
    if (proofRegistry.status !== "reviewed") reasons.push(`proofSystem: ${proofRegistry.reasons.join("; ")}`);
    if (builtInProofRegistry.status !== "reviewed") {
      reasons.push("compiled-in proof registry still contains placeholder keys; a release-specific registry is mandatory");
    }
    const issued = Date.parse(payload.issuedAt ?? "");
    const expires = Date.parse(payload.expiresAt ?? "");
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now || expires <= now) {
      reasons.push("launch record is missing, not yet valid, or expired");
    }
    if (!payload.activation || payload.activation.valueBearing !== true
        || !Number.isSafeInteger(payload.activation.earliestActivationHeight)) {
      reasons.push("launch record has no explicit value-bearing activation height");
    }
    try {
      assertMainnetLaunchAllowed(payload.readiness);
    } catch (error) {
      reasons.push((error as Error).message);
    }
    if (!ledgerEval.satisfied) reasons.push(...ledgerEval.reasons);
    return {
      ready: reasons.length === 0,
      status: reasons.length === 0 ? "ready" : "blocked",
      reasons,
      signers: signatures,
      gates: ledgerEval.gates,
      proofRegistry,
      builtInProofRegistry,
    };
  }

  reasons.push(...ledgerEval.reasons);
  if (proofRegistry.status !== "reviewed") reasons.push(`proofSystem: ${proofRegistry.reasons.join("; ")}`);
  return {
    ready: false,
    status: "blocked",
    reasons,
    signers: [],
    gates: ledgerEval.gates,
    proofRegistry,
    builtInProofRegistry,
  };
}

