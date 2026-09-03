import { MAINNET_NETWORK } from "./networks.js";

/**
 * The gates that must be true before a value-bearing JGC mainnet can start.
 *
 * This is intentionally stricter than the testnet readiness checks. A mainnet
 * launcher must call assertMainnetLaunchAllowed() after loading its signed,
 * release-specific readiness record. Keeping this guard in the node package
 * makes an accidental testnet/placeholder launch fail closed.
 */
export const MAINNET_GATE_KEYS = [
  "proofSystem",
  "deterministicConsensus",
  "permissionlessProduction",
  "peerAuthentication",
  "validatorEconomics",
  "reproducibleArtifacts",
  "soloSoak",
  "independentSecurityReview",
] as const;

export type MainnetGateKey = typeof MAINNET_GATE_KEYS[number];

export interface MainnetGateRecord {
  readonly proofSystem: boolean;
  readonly deterministicConsensus: boolean;
  readonly permissionlessProduction: boolean;
  readonly peerAuthentication: boolean;
  readonly validatorEconomics: boolean;
  readonly reproducibleArtifacts: boolean;
  readonly soloSoak: boolean;
  readonly independentSecurityReview: boolean;
}

export interface MainnetReadinessRecord {
  readonly schemaVersion: 1;
  readonly status: "blocked" | "candidate" | "ready";
  readonly network: {
    readonly chainId: string;
    readonly consensusVersion: number;
    readonly proofMode: string;
  };
  readonly gates: MainnetGateRecord;
}

/**
 * Baseline checked into source control. It documents the current state rather
 * than pretending that the declared MAINNET_NETWORK is launchable.
 */
export const MAINNET_READINESS: MainnetReadinessRecord = Object.freeze({
  schemaVersion: 1,
  status: "blocked",
  network: {
    chainId: MAINNET_NETWORK.chainId,
    consensusVersion: MAINNET_NETWORK.consensusVersion,
    proofMode: MAINNET_NETWORK.proofMode,
  },
  gates: {
    proofSystem: false,
    deterministicConsensus: false,
    permissionlessProduction: false,
    peerAuthentication: false,
    validatorEconomics: false,
    reproducibleArtifacts: false,
    soloSoak: false,
    independentSecurityReview: false,
  },
});

export interface MainnetPreflightResult {
  readonly ready: boolean;
  readonly status: MainnetReadinessRecord["status"];
  readonly network: MainnetReadinessRecord["network"];
  readonly missingGates: readonly MainnetGateKey[];
}

function isGateRecord(value: unknown): value is MainnetGateRecord {
  if (value === null || typeof value !== "object") return false;
  const gates = value as Record<string, unknown>;
  return MAINNET_GATE_KEYS.every((key) => typeof gates[key] === "boolean");
}

function isReadinessRecord(value: unknown): value is MainnetReadinessRecord {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const network = record.network;
  if (network === null || typeof network !== "object") return false;
  const networkRecord = network as Record<string, unknown>;
  return record.schemaVersion === 1
    && (record.status === "blocked" || record.status === "candidate" || record.status === "ready")
    && typeof networkRecord.chainId === "string"
    && typeof networkRecord.consensusVersion === "number"
    && typeof networkRecord.proofMode === "string"
    && isGateRecord(record.gates);
}

/**
 * Evaluate a readiness record against the compiled mainnet identity.
 * Unknown or malformed records are rejected instead of being interpreted as
 * an empty set of requirements.
 */
export function evaluateMainnetReadiness(value: unknown): MainnetPreflightResult {
  if (!isReadinessRecord(value)) {
    throw new Error("invalid mainnet readiness record");
  }

  if (value.network.chainId !== MAINNET_NETWORK.chainId
      || value.network.consensusVersion !== MAINNET_NETWORK.consensusVersion
      || value.network.proofMode !== MAINNET_NETWORK.proofMode) {
    throw new Error("mainnet readiness record does not match the compiled network identity");
  }

  const missingGates = MAINNET_GATE_KEYS.filter((key) => !value.gates[key]);
  const ready = value.status === "ready" && missingGates.length === 0;
  return {
    ready,
    status: value.status,
    network: value.network,
    missingGates,
  };
}

/**
 * Fail-closed launch guard for a future mainnet launcher.
 */
export function assertMainnetLaunchAllowed(value: unknown = MAINNET_READINESS): void {
  const result = evaluateMainnetReadiness(value);
  if (!result.ready) {
    const missing = result.missingGates.join(", ");
    throw new Error(`mainnet launch is blocked; incomplete gates: ${missing || "status is not ready"}`);
  }
}
