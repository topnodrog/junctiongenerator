import { createHash } from "node:crypto";
import { evaluateExplorerEvidence, type SoakEvidenceReport } from "./soak-evidence.js";
import type { ExplorerSnapshot, ExplorerBlock } from "../network/public-testnet-api.js";

export const SAMPLE_INTERVAL_MS = 5 * 60_000;
export const MAX_OBSERVATION_GAP_MS = 60 * 60_000;
export const MAX_WINDOW_MS = 5 * 24 * 60 * 60_000;
export const MIN_WINDOW_MS = 72 * 60 * 60_000;

export interface RunnerObservation {
  windowId: string;
  capturedAt: string;
  running: boolean;
  network: string;
  height: number | null;
  peerCount: number | null;
  producerEnabled: boolean;
  uptimeSec: number;
  nodeVersion: string;
  platform: string;
  architecture: string;
  runtimeVersion: string;
}

export interface TransportObservation {
  seed: "seed-a" | "seed-b";
  reachable: boolean;
  latencyMs: number;
}

export interface MonitorObservation {
  capturedAt: string;
  explorer: ExplorerSnapshot | null;
  explorerError?: string;
  transport: TransportObservation[];
  runner: RunnerObservation | null;
}

export interface MonitorFinding {
  id: string;
  severity: "warn" | "fail";
  message: string;
}

export interface MonitorState {
  schemaVersion: 1;
  windowId: string;
  scope: "owner-observation";
  phase: "observing" | "completed" | "incomplete";
  startedAt: string;
  hardEndAt: string;
  minimumEndAt: string;
  startHeight: number;
  firstFullEpochHeight: number;
  targetSettlementHeights: number[];
  participants: string[];
  lastCapturedAt: string;
  lastHeight: number;
  lastAdvanceAt: string;
  previousRunner: RunnerObservation | null;
  observations: number;
  observationGaps: number;
  findingsById: Record<string, { count: number; firstAt: string; lastAt: string }>;
  blocks: Record<string, ExplorerBlock>;
  completeContributionEpochs: number;
  reviewAttempts: number;
  lastReviewHour: string | null;
  evidenceHash: string;
  formalAcceptancePassed: false;
  settlementPayoutBytesVerified: false;
}

export function validateRunner(value: unknown, windowId: string): RunnerObservation {
  if (!value || typeof value !== "object") throw new Error("Runner observation is missing");
  const r = value as RunnerObservation;
  if (r.windowId !== windowId || !Number.isFinite(Date.parse(r.capturedAt)) ||
      typeof r.running !== "boolean" || typeof r.producerEnabled !== "boolean" ||
      typeof r.network !== "string" || !Number.isInteger(r.height) || Number(r.height) < 0 ||
      !Number.isInteger(r.peerCount) || Number(r.peerCount) < 0 ||
      !Number.isFinite(r.uptimeSec) || r.uptimeSec < 0 ||
      ![r.nodeVersion, r.platform, r.architecture, r.runtimeVersion].every(v => typeof v === "string" && v.length <= 100)) {
    throw new Error("Runner observation failed validation");
  }
  return { windowId: r.windowId, capturedAt: r.capturedAt, running: r.running,
    network: r.network, height: r.height, peerCount: r.peerCount, producerEnabled: r.producerEnabled,
    uptimeSec: r.uptimeSec, nodeVersion: r.nodeVersion, platform: r.platform,
    architecture: r.architecture, runtimeVersion: r.runtimeVersion };
}

export function observationFindings(observation: MonitorObservation, windowId: string): MonitorFinding[] {
  const findings: MonitorFinding[] = [];
  const time = Date.parse(observation.capturedAt);
  if (!Number.isFinite(time)) throw new Error("Invalid observation timestamp");
  if (!observation.explorer) findings.push({ id: "explorer.unavailable", severity: "fail", message: "Public chain evidence could not be collected" });
  else {
    const age = time - Date.parse(observation.explorer.capturedAt);
    if (!Number.isFinite(age) || age < -120_000 || age > 120_000) findings.push({ id: "explorer.stale", severity: "fail", message: "Explorer timestamp is stale or in the future" });
    const report = evaluateExplorerEvidence(observation.explorer);
    findings.push(...report.checks.filter(c => c.severity !== "pass") as MonitorFinding[]);
  }
  for (const seed of ["seed-a", "seed-b"] as const) {
    const rows = observation.transport.filter(r => r.seed === seed);
    if (rows.length !== 1 || !rows[0].reachable) findings.push({ id: `${seed}.transport`, severity: "fail", message: `${seed} WebSocket upgrade did not pass` });
  }
  const runner = observation.runner;
  if (!runner || runner.windowId !== windowId) findings.push({ id: "runner.missing", severity: "fail", message: "Back-checker observation is missing" });
  else {
    const age = time - Date.parse(runner.capturedAt);
    if (!Number.isFinite(age) || age < -120_000 || age > 15 * 60_000) findings.push({ id: "runner.stale", severity: "fail", message: "Back-checker observation is not current" });
    if (!runner.running || runner.producerEnabled || runner.network !== "jgtc-testnet-v2" || !runner.peerCount) findings.push({ id: "runner.role", severity: "fail", message: "Back-checker is not running in its expected connected non-producing role" });
    if (observation.explorer && (runner.height === null || Math.abs(runner.height - observation.explorer.height) > 1)) findings.push({ id: "runner.height", severity: "fail", message: "Back-checker and public tip differ by more than one block" });
  }
  return findings;
}

export function startMonitor(windowId: string, participants: string[], observation: MonitorObservation): MonitorState {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(windowId) || participants.length !== 2 || new Set(participants).size !== 2 ||
      participants.some(address => !/^1QGC[a-f0-9]{40}$/.test(address))) throw new Error("Invalid owner window configuration");
  const findings = observationFindings(observation, windowId);
  if (findings.length || !observation.explorer) throw new Error("Owner-observation baseline must pass before its clock starts");
  const visible = new Set(observation.explorer.epoch.participants.map(p => p.address));
  if (participants.some(address => !visible.has(address))) throw new Error("Both owner participants must be visible at baseline");
  const now = Date.parse(observation.capturedAt);
  const first = (Math.floor(observation.explorer.height / 144) + 1) * 144;
  return {
    schemaVersion: 1, windowId, scope: "owner-observation", phase: "observing",
    startedAt: observation.capturedAt, minimumEndAt: new Date(now + MIN_WINDOW_MS).toISOString(),
    hardEndAt: new Date(now + MAX_WINDOW_MS).toISOString(), startHeight: observation.explorer.height,
    firstFullEpochHeight: first, targetSettlementHeights: [first + 143, first + 287, first + 431],
    participants: [...participants], lastCapturedAt: observation.capturedAt, lastHeight: observation.explorer.height,
    lastAdvanceAt: observation.capturedAt, previousRunner: observation.runner,
    observations: 0, observationGaps: 0, findingsById: {}, blocks: {}, completeContributionEpochs: 0,
    reviewAttempts: 0, lastReviewHour: null, evidenceHash: "0".repeat(64),
    formalAcceptancePassed: false, settlementPayoutBytesVerified: false,
  };
}

export function advanceMonitor(previous: MonitorState, observation: MonitorObservation): { state: MonitorState; findings: MonitorFinding[]; report: SoakEvidenceReport | null } {
  if (previous.phase !== "observing") throw new Error("A closed window cannot be extended");
  const state = structuredClone(previous);
  const time = Date.parse(observation.capturedAt);
  const elapsed = time - Date.parse(previous.lastCapturedAt);
  if (!Number.isFinite(time) || elapsed < 0) throw new Error("Observation time moved backwards");
  const findings = observationFindings(observation, state.windowId);
  if (elapsed > MAX_OBSERVATION_GAP_MS) {
    state.observationGaps++;
    findings.push({ id: "coverage.gap", severity: "fail", message: "More than one hour elapsed between saved observations" });
  }
  const snapshot = observation.explorer;
  if (snapshot) {
    if (snapshot.height < state.lastHeight) findings.push({ id: "chain.regressed", severity: "fail", message: "Public chain height regressed" });
    if (snapshot.height > state.lastHeight) state.lastAdvanceAt = observation.capturedAt;
    else if (time - Date.parse(state.lastAdvanceAt) > 30 * 60_000) findings.push({ id: "chain.stalled", severity: "fail", message: "No observed block advance for over 30 minutes" });
    for (const block of snapshot.recentBlocks) {
      if (block.height < state.firstFullEpochHeight || block.height > state.targetSettlementHeights[2]) continue;
      const old = state.blocks[String(block.height)];
      if (old && old.hash !== block.hash) findings.push({ id: "chain.changed", severity: "fail", message: `Previously observed block ${block.height} changed` });
      state.blocks[String(block.height)] = structuredClone(block);
      if (state.participants.some(address => !block.participants.includes(address))) findings.push({ id: "participant.missing", severity: "fail", message: `An owner participant is absent from block ${block.height}` });
    }
    state.lastHeight = snapshot.height;
  }
  const runner = observation.runner;
  if (runner && previous.previousRunner && Date.parse(runner.capturedAt) > Date.parse(previous.previousRunner.capturedAt) && runner.uptimeSec < previous.previousRunner.uptimeSec) {
    findings.push({ id: "runner.restart", severity: "warn", message: "Back-checker uptime decreased; verify and document the restart" });
  }
  if (runner) state.previousRunner = runner;
  state.completeContributionEpochs = state.targetSettlementHeights.filter(boundary => {
    for (let h = boundary - 143; h <= boundary; h++) {
      const block = state.blocks[String(h)];
      if (!block || state.participants.some(address => !block.participants.includes(address))) return false;
      if (h > state.firstFullEpochHeight && block.previousHash !== state.blocks[String(h - 1)]?.hash) return false;
    }
    return true;
  }).length;
  for (const finding of findings) {
    const old = state.findingsById[finding.id];
    state.findingsById[finding.id] = { count: (old?.count ?? 0) + 1, firstAt: old?.firstAt ?? observation.capturedAt, lastAt: observation.capturedAt };
  }
  state.observations++;
  state.lastCapturedAt = observation.capturedAt;
  state.evidenceHash = createHash("sha256").update(previous.evidenceHash).update(JSON.stringify(observation)).digest("hex");
  const hasReachedTargets = state.lastHeight >= state.targetSettlementHeights[2];
  if (time >= Date.parse(state.hardEndAt) || (time >= Date.parse(state.minimumEndAt) && hasReachedTargets)) {
    state.phase = state.completeContributionEpochs === 3 && state.observationGaps === 0 && Object.keys(state.findingsById).length === 0 ? "completed" : "incomplete";
  }
  return { state, findings, report: snapshot ? evaluateExplorerEvidence(snapshot) : null };
}

export function geminiReviewInput(state: MonitorState, findings: MonitorFinding[]): object {
  return { scope: state.scope, phase: state.phase, startedAt: state.startedAt,
    capturedAt: state.lastCapturedAt, height: state.lastHeight, observations: state.observations,
    observationGaps: state.observationGaps, completeContributionEpochs: state.completeContributionEpochs,
    requiredContributionEpochs: 3, targetSettlementHeights: state.targetSettlementHeights,
    findings: findings.map(f => ({ id: f.id, severity: f.severity, message: f.message.slice(0, 240) })),
    historicalFindingIds: Object.keys(state.findingsById),
    limitations: ["Owner-operated rehearsal, not independent closed-beta acceptance", "WebSocket upgrades do not establish node admission", "Serialized payout verification and recovery drills require separate evidence", "Simulation receipts do not establish useful AI compute"] };
}
