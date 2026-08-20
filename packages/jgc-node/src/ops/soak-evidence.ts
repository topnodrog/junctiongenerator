import type { ExplorerSnapshot } from "../network/public-testnet-api.js";
import { parseJGC } from "../wallet/wallet.js";

export type SoakEvidenceSeverity = "pass" | "warn" | "fail";

export interface SoakEvidenceCheck {
  id: string;
  severity: SoakEvidenceSeverity;
  message: string;
}

export interface SoakEvidenceReport {
  capturedAt: string;
  status: SoakEvidenceSeverity;
  checks: SoakEvidenceCheck[];
  observed: {
    height: number;
    tipHash: string;
    settlementsCompleted: number;
    participantCount: number;
    recentAverageBlockIntervalSec: number | null;
  };
  summary: { passed: number; warnings: number; failures: number };
}

const EXPECTED_NETWORK = "jgtc-testnet-v1";
const EXPECTED_PROOF_MODE = "simnet-receipts-v1";
const EXPECTED_GENESIS = "738588b974ed62ed52e74a946371bc8b6d84508b6c38203f56ada38fce4bab36";
const EXPECTED_BLOCK_INTERVAL_SEC = 600;
const EXPECTED_SETTLEMENT_INTERVAL = 144;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`explorer.${key} must be a string`);
  return value;
}

function requireInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`explorer.${key} must be a non-negative integer`);
  }
  return Number(value);
}

/** Validate the public response before preserving it as soak evidence. */
export function parseExplorerEvidence(value: unknown): ExplorerSnapshot {
  if (!isRecord(value)) throw new Error("explorer response must be a JSON object");
  const epoch = value.epoch;
  const issuance = value.issuance;
  const producer = value.producer;
  if (!isRecord(epoch)) throw new Error("explorer.epoch must be a JSON object");
  if (!isRecord(issuance)) throw new Error("explorer.issuance must be a JSON object");
  if (!isRecord(producer)) throw new Error("explorer.producer must be a JSON object");
  if (!Array.isArray(epoch.participants)) throw new Error("explorer.epoch.participants must be an array");
  if (!Array.isArray(value.recentBlocks)) throw new Error("explorer.recentBlocks must be an array");

  requireString(value, "capturedAt");
  requireString(value, "network");
  requireString(value, "proofMode");
  requireString(value, "currencySymbol");
  requireString(value, "genesisHash");
  requireString(value, "tipHash");
  requireString(value, "health");
  requireInteger(value, "height");
  requireInteger(value, "peerCount");
  requireInteger(value, "targetBlockIntervalSec");
  requireInteger(epoch, "blockIndex");
  requireInteger(epoch, "blocksRemaining");
  requireInteger(epoch, "nextSettlementHeight");
  requireInteger(epoch, "totalParticipationWeight");
  requireString(epoch, "pendingRewardPoolJGTC");
  requireInteger(issuance, "settlementIntervalBlocks");
  requireInteger(issuance, "settlementsCompleted");
  for (const key of [
    "preminedJGTC",
    "genesisSpendableSupplyJGTC",
    "utxoSupplyJGTC",
    "pendingEmissionJGTC",
    "accountedSupplyJGTC",
    "expectedSupplyJGTC",
  ]) requireString(issuance, key);
  if (typeof issuance.supplyConserved !== "boolean") {
    throw new Error("explorer.issuance.supplyConserved must be a boolean");
  }
  for (const [index, raw] of value.recentBlocks.entries()) {
    if (!isRecord(raw)) throw new Error(`explorer.recentBlocks[${index}] must be a JSON object`);
    requireInteger(raw, "height");
    requireInteger(raw, "timestamp");
    requireString(raw, "hash");
    requireString(raw, "previousHash");
  }
  for (const [index, raw] of epoch.participants.entries()) {
    if (!isRecord(raw)) throw new Error(`explorer.epoch.participants[${index}] must be a JSON object`);
    requireString(raw, "address");
    requireInteger(raw, "participationWeight");
  }
  return value as unknown as ExplorerSnapshot;
}

function add(
  checks: SoakEvidenceCheck[],
  id: string,
  severity: SoakEvidenceSeverity,
  message: string,
): void {
  checks.push({ id, severity, message });
}

export function evaluateExplorerEvidence(snapshot: ExplorerSnapshot): SoakEvidenceReport {
  const checks: SoakEvidenceCheck[] = [];
  const identityMatches = snapshot.network === EXPECTED_NETWORK &&
    snapshot.proofMode === EXPECTED_PROOF_MODE &&
    snapshot.genesisHash === EXPECTED_GENESIS;
  add(
    checks,
    "chain.identity",
    identityMatches ? "pass" : "fail",
    identityMatches
      ? `network identity is ${EXPECTED_NETWORK}`
      : `unexpected identity ${snapshot.network}/${snapshot.proofMode}/${snapshot.genesisHash}`,
  );

  const cadenceConfigured = snapshot.targetBlockIntervalSec === EXPECTED_BLOCK_INTERVAL_SEC &&
    snapshot.issuance.settlementIntervalBlocks === EXPECTED_SETTLEMENT_INTERVAL;
  add(
    checks,
    "chain.cadence",
    cadenceConfigured ? "pass" : "fail",
    `block target is ${snapshot.targetBlockIntervalSec}s and settlement interval is ${snapshot.issuance.settlementIntervalBlocks}`,
  );

  const zeroPremine = snapshot.issuance.preminedJGTC === "0" &&
    snapshot.issuance.genesisSpendableSupplyJGTC === "0";
  add(checks, "issuance.zero-premine", zeroPremine ? "pass" : "fail", zeroPremine
    ? "zero-premine and zero-genesis-spendable claims hold"
    : "zero-premine issuance claims do not hold");

  let arithmeticConserved = false;
  try {
    const utxoSupply = parseJGC(snapshot.issuance.utxoSupplyJGTC);
    const pendingEmission = parseJGC(snapshot.issuance.pendingEmissionJGTC);
    const accountedSupply = parseJGC(snapshot.issuance.accountedSupplyJGTC);
    const expectedSupply = parseJGC(snapshot.issuance.expectedSupplyJGTC);
    arithmeticConserved = utxoSupply >= 0n && pendingEmission >= 0n &&
      accountedSupply >= 0n && expectedSupply >= 0n &&
      utxoSupply + pendingEmission === accountedSupply &&
      accountedSupply === expectedSupply &&
      snapshot.issuance.pendingEmissionJGTC === snapshot.epoch.pendingRewardPoolJGTC;
  } catch {
    arithmeticConserved = false;
  }
  const supplyConserved = snapshot.issuance.supplyConserved && arithmeticConserved;
  add(
    checks,
    "issuance.conservation",
    supplyConserved ? "pass" : "fail",
    `accounted supply ${snapshot.issuance.accountedSupplyJGTC} JGTC; expected ${snapshot.issuance.expectedSupplyJGTC} JGTC`,
  );

  const expectedSettlements = Math.floor((snapshot.height + 1) / EXPECTED_SETTLEMENT_INTERVAL);
  add(
    checks,
    "issuance.settlements",
    snapshot.issuance.settlementsCompleted === expectedSettlements ? "pass" : "fail",
    `${snapshot.issuance.settlementsCompleted} settlement(s) reported at height ${snapshot.height}`,
  );

  const epochProgressValid = snapshot.epoch.blockIndex >= 0 &&
    snapshot.epoch.blockIndex < EXPECTED_SETTLEMENT_INTERVAL &&
    snapshot.epoch.blocksRemaining === EXPECTED_SETTLEMENT_INTERVAL - snapshot.epoch.blockIndex &&
    snapshot.epoch.nextSettlementHeight === snapshot.height + snapshot.epoch.blocksRemaining;
  add(
    checks,
    "epoch.progress",
    epochProgressValid ? "pass" : "fail",
    `epoch block ${snapshot.epoch.blockIndex}/${EXPECTED_SETTLEMENT_INTERVAL}; next settlement height ${snapshot.epoch.nextSettlementHeight}`,
  );

  const participationWeight = snapshot.epoch.participants.reduce(
    (sum, participant) => sum + participant.participationWeight,
    0,
  );
  add(
    checks,
    "epoch.participation",
    participationWeight === snapshot.epoch.totalParticipationWeight ? "pass" : "fail",
    `${snapshot.epoch.participants.length} participant(s), ${participationWeight} recorded weight`,
  );

  const blocks = snapshot.recentBlocks;
  let linked = blocks.length > 0 && blocks[0]!.height === snapshot.height && blocks[0]!.hash === snapshot.tipHash;
  const intervals: number[] = [];
  for (let index = 0; index < blocks.length - 1; index++) {
    const newer = blocks[index]!;
    const older = blocks[index + 1]!;
    linked = linked && newer.height === older.height + 1 && newer.previousHash === older.hash;
    intervals.push(newer.timestamp - older.timestamp);
  }
  linked = linked && intervals.every(interval => interval > 0);
  add(
    checks,
    "chain.recent-continuity",
    linked ? "pass" : "fail",
    `${blocks.length} recent block(s) form ${linked ? "a contiguous tip segment" : "an invalid tip segment"}`,
  );

  const averageInterval = intervals.length
    ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
    : null;
  if (averageInterval === null) {
    add(checks, "chain.recent-timing", "warn", "not enough recent blocks to measure timing");
  } else {
    const withinPilotBand = averageInterval >= EXPECTED_BLOCK_INTERVAL_SEC * 0.5 &&
      averageInterval <= EXPECTED_BLOCK_INTERVAL_SEC * 1.5;
    add(
      checks,
      "chain.recent-timing",
      withinPilotBand ? "pass" : "warn",
      `recent average block interval is ${averageInterval.toFixed(1)}s`,
    );
  }

  add(
    checks,
    "network.health",
    snapshot.health === "healthy" ? "pass" : snapshot.health === "waiting" ? "warn" : "fail",
    `public producer health is ${snapshot.health} with ${snapshot.peerCount} peer(s)`,
  );

  const summary = {
    passed: checks.filter(check => check.severity === "pass").length,
    warnings: checks.filter(check => check.severity === "warn").length,
    failures: checks.filter(check => check.severity === "fail").length,
  };
  const status: SoakEvidenceSeverity = summary.failures > 0
    ? "fail"
    : summary.warnings > 0
      ? "warn"
      : "pass";
  return {
    capturedAt: snapshot.capturedAt,
    status,
    checks,
    observed: {
      height: snapshot.height,
      tipHash: snapshot.tipHash,
      settlementsCompleted: snapshot.issuance.settlementsCompleted,
      participantCount: snapshot.epoch.participants.length,
      recentAverageBlockIntervalSec: averageInterval,
    },
    summary,
  };
}
