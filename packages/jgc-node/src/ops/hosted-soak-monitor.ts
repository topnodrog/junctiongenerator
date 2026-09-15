import { createHash } from "node:crypto";
import { evaluateExplorerEvidence, type SoakEvidenceReport } from "./soak-evidence.js";
import type { ExplorerSnapshot, ExplorerBlock } from "../network/public-testnet-api.js";

export const SAMPLE_INTERVAL_MS = 5 * 60_000;
export const MAX_OBSERVATION_GAP_MS = 60 * 60_000;
export const MAX_WINDOW_MS = 5 * 24 * 60 * 60_000;
export const MIN_WINDOW_MS = 72 * 60 * 60_000;
/** A single network sample is evidence, not proof of a sustained outage. */
export const TRANSIENT_FAILURE_THRESHOLD = 3;

export interface RunnerObservation {
  windowId: string;
  capturedAt: string;
  running: boolean;
  network: string;
  /** Public participant address, when this node is a participating recorder. */
  address: string | null;
  height: number | null;
  peerCount: number | null;
  producerEnabled: boolean;
  /** The node reports this from its private loopback status endpoint. */
  role: "back-checker" | "participant" | "designated-producer" | "status-observer";
  /** Whether the node is submitting pilot participation receipts. */
  participating: boolean;
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
  /** One independently uploaded, address-bound status per required participant. */
  recorders: Record<string, RunnerObservation | null>;
}

export interface MonitorFinding {
  id: string;
  severity: "warn" | "fail";
  message: string;
}

export interface FindingSummary {
  count: number;
  firstAt: string;
  lastAt: string;
  /** The highest severity observed for this finding over the window. */
  severity: MonitorFinding["severity"];
}

interface TransientFailureSummary {
  consecutive: number;
  maxConsecutive: number;
  lastAt: string;
}

interface MissingParticipantBlock {
  missingAddresses: string[];
  firstObservedAt: string;
  lastObservedAt: string;
}

/** Availability history is resilience evidence, never a substitute for blocks. */
export interface RecorderContinuity {
  disconnections: number;
  reconnections: number;
  currentDisconnectedAt: string | null;
  lastReconnectedAt: string | null;
  longestDisconnectionMs: number;
}

export interface MonitorState {
  schemaVersion: 1 | 2 | 3 | 4;
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
  /** Last usable status from each participant's own recorder. */
  previousRecorders: Record<string, RunnerObservation>;
  /** Explicit recovery history for independently recorded participant nodes. */
  recorderContinuity: Record<string, RecorderContinuity>;
  observations: number;
  observationGaps: number;
  findingsById: Record<string, FindingSummary>;
  /** Consecutive availability faults, retained separately from final failures. */
  transientFailuresById: Record<string, TransientFailureSummary>;
  /** One durable record per observed block, rather than one finding per poll. */
  missingParticipantBlocks: Record<string, MissingParticipantBlock>;
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
      typeof r.running !== "boolean" || typeof r.producerEnabled !== "boolean" || typeof r.participating !== "boolean" ||
      typeof r.network !== "string" || !Number.isInteger(r.height) || Number(r.height) < 0 ||
      !Number.isInteger(r.peerCount) || Number(r.peerCount) < 0 ||
      (r.address !== null && (typeof r.address !== "string" || !/^1QGC[a-f0-9]{40}$/.test(r.address))) ||
      !["back-checker", "participant", "designated-producer", "status-observer"].includes(r.role) ||
      !Number.isFinite(r.uptimeSec) || r.uptimeSec < 0 ||
      ![r.nodeVersion, r.platform, r.architecture, r.runtimeVersion].every(v => typeof v === "string" && v.length <= 100)) {
    throw new Error("Runner observation failed validation");
  }
  return { windowId: r.windowId, capturedAt: r.capturedAt, running: r.running,
    network: r.network, address: r.address, height: r.height, peerCount: r.peerCount, producerEnabled: r.producerEnabled,
    role: r.role, participating: r.participating,
    uptimeSec: r.uptimeSec, nodeVersion: r.nodeVersion, platform: r.platform,
    architecture: r.architecture, runtimeVersion: r.runtimeVersion };
}

/** Public endpoint faults need several samples before they fail a window. */
function isTransientAvailabilityFinding(id: string): boolean {
  return id === "seed-a.transport" || id === "seed-b.transport";
}

function hasFailure(findings: Iterable<Pick<MonitorFinding, "severity">>): boolean {
  return Array.from(findings).some((finding) => finding.severity === "fail");
}

function initialiseState(state: MonitorState): void {
  // State V1 evidence remains stricter on migration: an old summary had no
  // severity, so it is treated as a failure rather than silently downgraded.
  state.schemaVersion = 4;
  state.transientFailuresById ??= {};
  state.missingParticipantBlocks ??= {};
  // V1/V2/V3 windows had no address-bound continuity record. Do not infer one
  // from the shared back-checker: only a status explicitly bound to the public
  // address is usable for the participant-recorder topology.
  state.previousRecorders ??= {};
  state.recorderContinuity ??= Object.fromEntries(state.participants.map((address) => [address, {
    disconnections: 0, reconnections: 0, currentDisconnectedAt: null,
    lastReconnectedAt: null, longestDisconnectionMs: 0,
  }]));
  for (const summary of Object.values(state.findingsById)) {
    if (summary.severity !== "warn" && summary.severity !== "fail") summary.severity = "fail";
  }
}

function recordFindings(state: MonitorState, findings: MonitorFinding[], capturedAt: string): void {
  for (const finding of findings) {
    const old = state.findingsById[finding.id];
    if (old) {
      old.count++;
      old.lastAt = capturedAt;
      if (finding.severity === "fail") old.severity = "fail";
    } else {
      state.findingsById[finding.id] = {
        count: 1,
        firstAt: capturedAt,
        lastAt: capturedAt,
        severity: finding.severity,
      };
    }
  }
}

function classifyFindings(state: MonitorState, findings: MonitorFinding[], capturedAt: string): MonitorFinding[] {
  const direct: MonitorFinding[] = [];
  const transient = new Map<string, MonitorFinding>();
  for (const finding of findings) {
    if (isTransientAvailabilityFinding(finding.id)) transient.set(finding.id, finding);
    else direct.push(finding);
  }

  const transientIds = new Set([...Object.keys(state.transientFailuresById), ...transient.keys()]);
  for (const id of transientIds) {
    const finding = transient.get(id);
    const prior = state.transientFailuresById[id] ?? { consecutive: 0, maxConsecutive: 0, lastAt: capturedAt };
    if (!finding) {
      state.transientFailuresById[id] = { ...prior, consecutive: 0, lastAt: capturedAt };
      continue;
    }
    const consecutive = prior.consecutive + 1;
    state.transientFailuresById[id] = {
      consecutive,
      maxConsecutive: Math.max(prior.maxConsecutive, consecutive),
      lastAt: capturedAt,
    };
    const persistent = consecutive >= TRANSIENT_FAILURE_THRESHOLD;
    direct.push({
      ...finding,
      severity: persistent ? "fail" : "warn",
      message: `${finding.message} (${consecutive}/${TRANSIENT_FAILURE_THRESHOLD} consecutive samples)`,
    });
  }
  return direct;
}

function recorderFindingId(address: string, kind: "missing" | "stale" | "identity" | "disconnected" | "height" | "upload-delayed" | "restart" | "reconnected"): string {
  return `recorder.${address}.${kind}`;
}

function recorderAvailable(
  recorder: RunnerObservation | null,
  capturedAt: string,
  explorer: ExplorerSnapshot | null,
): boolean {
  if (!recorder) return false;
  const age = Date.parse(capturedAt) - Date.parse(recorder.capturedAt);
  return Number.isFinite(age) && age >= -120_000 && age <= 15 * 60_000 && recorder.running &&
    Boolean(recorder.peerCount) && (!explorer || (recorder.height !== null && Math.abs(recorder.height - explorer.height) <= 1));
}

export function observationFindings(
  observation: MonitorObservation,
  windowId: string,
  participants: string[],
  fallbackRecorders: Record<string, RunnerObservation> = {},
  strictRecorderAvailability = false,
): MonitorFinding[] {
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
  for (const address of participants) {
    const fresh = observation.recorders[address] ?? null;
    const recorder = fresh ?? fallbackRecorders[address] ?? null;
    if (!recorder || recorder.windowId !== windowId) {
      findings.push({ id: recorderFindingId(address, "missing"), severity: strictRecorderAvailability ? "fail" : "warn", message: `Participant recorder ${address} is missing` });
      continue;
    }
    if (!fresh) findings.push({ id: recorderFindingId(address, "upload-delayed"), severity: "warn", message: `Latest participant recorder upload is unavailable for ${address}; evaluating its last saved observation` });
    const age = time - Date.parse(recorder.capturedAt);
    if (!Number.isFinite(age) || age < -120_000 || age > 15 * 60_000) findings.push({ id: recorderFindingId(address, "stale"), severity: strictRecorderAvailability ? "fail" : "warn", message: `Participant recorder ${address} is not current` });
    if (recorder.producerEnabled || recorder.role !== "participant" || !recorder.participating || recorder.address !== address || recorder.network !== "jgtc-testnet-v2") {
      findings.push({ id: recorderFindingId(address, "identity"), severity: "fail", message: `Participant recorder ${address} is not bound to its expected non-producing participant identity` });
    }
    if (!recorder.running || !recorder.peerCount) findings.push({ id: recorderFindingId(address, "disconnected"), severity: strictRecorderAvailability ? "fail" : "warn", message: `Participant recorder ${address} is temporarily disconnected` });
    if (observation.explorer && (recorder.height === null || Math.abs(recorder.height - observation.explorer.height) > 1)) findings.push({ id: recorderFindingId(address, "height"), severity: strictRecorderAvailability ? "fail" : "warn", message: `Participant recorder ${address} is catching up to the public tip` });
  }
  return findings;
}

export function startMonitor(windowId: string, participants: string[], observation: MonitorObservation): MonitorState {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(windowId) || participants.length < 2 || participants.length > 8 || new Set(participants).size !== participants.length ||
      participants.some(address => !/^1QGC[a-f0-9]{40}$/.test(address))) throw new Error("Invalid owner window configuration");
  const findings = observationFindings(observation, windowId, participants, {}, true);
  if (hasFailure(findings) || !observation.explorer) throw new Error("Owner-observation baseline must pass before its clock starts");
  const visible = new Set(observation.explorer.epoch.participants.map(p => p.address));
  if (participants.some(address => !visible.has(address))) throw new Error("Every owner participant must be visible at baseline; participants are missing");
  const now = Date.parse(observation.capturedAt);
  const first = (Math.floor(observation.explorer.height / 144) + 1) * 144;
  const state: MonitorState = {
    schemaVersion: 4, windowId, scope: "owner-observation", phase: "observing",
    startedAt: observation.capturedAt, minimumEndAt: new Date(now + MIN_WINDOW_MS).toISOString(),
    hardEndAt: new Date(now + MAX_WINDOW_MS).toISOString(), startHeight: observation.explorer.height,
    firstFullEpochHeight: first, targetSettlementHeights: [first + 143, first + 287, first + 431],
    participants: [...participants], lastCapturedAt: observation.capturedAt, lastHeight: observation.explorer.height,
    lastAdvanceAt: observation.capturedAt,
    previousRecorders: Object.fromEntries(participants.flatMap((address) => {
      const recorder = observation.recorders[address];
      return recorder ? [[address, recorder]] : [];
    })),
    recorderContinuity: Object.fromEntries(participants.map((address) => [address, {
      disconnections: 0, reconnections: 0, currentDisconnectedAt: null,
      lastReconnectedAt: null, longestDisconnectionMs: 0,
    }])),
    observations: 0, observationGaps: 0, findingsById: {}, transientFailuresById: {}, missingParticipantBlocks: {}, blocks: {}, completeContributionEpochs: 0,
    reviewAttempts: 0, lastReviewHour: null, evidenceHash: "0".repeat(64),
    formalAcceptancePassed: false, settlementPayoutBytesVerified: false,
  };
  // Warnings are evidence at baseline but do not prevent a strictly healthy
  // baseline from starting; failures above still stop its clock.
  recordFindings(state, findings, observation.capturedAt);
  return state;
}

export function advanceMonitor(previous: MonitorState, observation: MonitorObservation): { state: MonitorState; findings: MonitorFinding[]; report: SoakEvidenceReport | null } {
  if (previous.phase !== "observing") throw new Error("A closed window cannot be extended");
  const state = structuredClone(previous);
  initialiseState(state);
  const time = Date.parse(observation.capturedAt);
  const elapsed = time - Date.parse(previous.lastCapturedAt);
  if (!Number.isFinite(time) || elapsed < 0) throw new Error("Observation time moved backwards");
  const rawFindings = observationFindings(observation, state.windowId, state.participants, state.previousRecorders);
  if (elapsed > MAX_OBSERVATION_GAP_MS) {
    state.observationGaps++;
    rawFindings.push({ id: "coverage.gap", severity: "fail", message: "More than one hour elapsed between saved observations" });
  }
  const snapshot = observation.explorer;
  if (snapshot) {
    if (snapshot.height < state.lastHeight) rawFindings.push({ id: "chain.regressed", severity: "fail", message: "Public chain height regressed" });
    if (snapshot.height > state.lastHeight) state.lastAdvanceAt = observation.capturedAt;
    else if (time - Date.parse(state.lastAdvanceAt) > 30 * 60_000) rawFindings.push({ id: "chain.stalled", severity: "fail", message: "No observed block advance for over 30 minutes" });
    for (const block of snapshot.recentBlocks) {
      if (block.height < state.firstFullEpochHeight || block.height > state.targetSettlementHeights[2]) continue;
      const old = state.blocks[String(block.height)];
      if (old && old.hash !== block.hash) rawFindings.push({ id: "chain.changed", severity: "fail", message: `Previously observed block ${block.height} changed` });
      state.blocks[String(block.height)] = structuredClone(block);
      const missingAddresses = state.participants.filter((address) => !block.participants.includes(address));
      // Each block is canonical evidence. Record a missing contributor once per
      // observed block version instead of once for every later poll.
      if (missingAddresses.length && (!old || old.hash !== block.hash)) {
        state.missingParticipantBlocks[String(block.height)] = {
          missingAddresses,
          firstObservedAt: observation.capturedAt,
          lastObservedAt: observation.capturedAt,
        };
        rawFindings.push({ id: "participant.missing", severity: "fail", message: `Owner participant ${missingAddresses.join(", ")} is absent from block ${block.height}` });
      } else if (missingAddresses.length && state.missingParticipantBlocks[String(block.height)]) {
        state.missingParticipantBlocks[String(block.height)]!.lastObservedAt = observation.capturedAt;
      }
    }
    state.lastHeight = snapshot.height;
  }
  for (const address of state.participants) {
    const recorder = observation.recorders[address];
    const prior = state.previousRecorders[address];
    if (recorder && prior && Date.parse(recorder.capturedAt) > Date.parse(prior.capturedAt) && recorder.uptimeSec < prior.uptimeSec) {
      rawFindings.push({ id: recorderFindingId(address, "restart"), severity: "warn", message: `Participant recorder ${address} uptime decreased; verify and document the restart` });
    }
    if (recorder) state.previousRecorders[address] = recorder;
    const continuity = state.recorderContinuity[address] ?? {
      disconnections: 0, reconnections: 0, currentDisconnectedAt: null,
      lastReconnectedAt: null, longestDisconnectionMs: 0,
    };
    // A fresh, connected participant status after an interruption is positive
    // resilience evidence. It does not erase any independent public-block
    // contribution finding.
    if (!recorderAvailable(recorder, observation.capturedAt, snapshot)) {
      if (!continuity.currentDisconnectedAt) {
        continuity.disconnections++;
        continuity.currentDisconnectedAt = observation.capturedAt;
      }
    } else if (continuity.currentDisconnectedAt) {
      const duration = Math.max(0, time - Date.parse(continuity.currentDisconnectedAt));
      continuity.reconnections++;
      continuity.lastReconnectedAt = observation.capturedAt;
      continuity.longestDisconnectionMs = Math.max(continuity.longestDisconnectionMs, duration);
      rawFindings.push({ id: recorderFindingId(address, "reconnected"), severity: "warn", message: `Participant recorder ${address} reconnected after ${Math.floor(duration / 1000)} seconds` });
      continuity.currentDisconnectedAt = null;
    }
    state.recorderContinuity[address] = continuity;
  }
  state.completeContributionEpochs = state.targetSettlementHeights.filter(boundary => {
    for (let h = boundary - 143; h <= boundary; h++) {
      const block = state.blocks[String(h)];
      if (!block || state.participants.some(address => !block.participants.includes(address))) return false;
      if (h > state.firstFullEpochHeight && block.previousHash !== state.blocks[String(h - 1)]?.hash) return false;
    }
    return true;
  }).length;
  const findings = classifyFindings(state, rawFindings, observation.capturedAt);
  recordFindings(state, findings, observation.capturedAt);
  state.observations++;
  state.lastCapturedAt = observation.capturedAt;
  state.evidenceHash = createHash("sha256").update(previous.evidenceHash).update(JSON.stringify(observation)).digest("hex");
  const hasReachedTargets = state.lastHeight >= state.targetSettlementHeights[2];
  if (time >= Date.parse(state.hardEndAt) || (time >= Date.parse(state.minimumEndAt) && hasReachedTargets)) {
    state.phase = state.completeContributionEpochs === 3 && state.observationGaps === 0 && !hasFailure(Object.values(state.findingsById)) ? "completed" : "incomplete";
  }
  return { state, findings, report: snapshot ? evaluateExplorerEvidence(snapshot) : null };
}

export function geminiReviewInput(state: MonitorState, findings: MonitorFinding[]): object {
  const missingParticipantBlocks = Object.entries(state.missingParticipantBlocks)
    .sort(([a], [b]) => Number(a) - Number(b))
    .slice(-24)
    .map(([height, record]) => ({ height: Number(height), missingAddresses: record.missingAddresses, firstObservedAt: record.firstObservedAt }));
  return { scope: state.scope, phase: state.phase, startedAt: state.startedAt,
    capturedAt: state.lastCapturedAt, height: state.lastHeight, observations: state.observations,
    observationGaps: state.observationGaps, completeContributionEpochs: state.completeContributionEpochs,
    requiredContributionEpochs: 3, targetSettlementHeights: state.targetSettlementHeights,
    findings: findings.map(f => ({ id: f.id, severity: f.severity, message: f.message.slice(0, 240) })),
    historicalFindings: Object.entries(state.findingsById).map(([id, summary]) => ({ id, severity: summary.severity })),
    historicalFindingIds: Object.keys(state.findingsById),
    missingParticipantBlocks,
    recorderContinuity: state.recorderContinuity,
    limitations: ["Owner-operated rehearsal, not independent closed-beta acceptance", "WebSocket upgrades do not establish node admission", "Serialized payout verification and recovery drills require separate evidence", "Simulation receipts do not establish useful AI compute"] };
}
