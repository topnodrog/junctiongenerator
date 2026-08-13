import { execFile } from "child_process";
import { connect as connectTls } from "tls";
import type { PilotReadinessSnapshot, SeedTelemetry } from "./pilot-readiness.js";

export interface SeedAttestation {
  billingAlertConfigured?: boolean;
  lastRestoreTestAt?: string;
  corruptionErrors?: number;
  repeatedPeerBans?: number;
}

export interface PilotEvidenceAttestations {
  externalRunnerConnected?: boolean;
  seeds?: {
    "seed-a"?: SeedAttestation;
    "seed-b"?: SeedAttestation;
  };
}

export function validatePilotEvidenceAttestations(value: unknown): PilotEvidenceAttestations {
  if (!isRecord(value)) throw new Error("attestations must be a JSON object");
  if (value.externalRunnerConnected !== undefined && typeof value.externalRunnerConnected !== "boolean") {
    throw new Error("externalRunnerConnected must be a boolean");
  }
  const normalized: PilotEvidenceAttestations = {};
  if (typeof value.externalRunnerConnected === "boolean") {
    normalized.externalRunnerConnected = value.externalRunnerConnected;
  }
  if (value.seeds === undefined) return normalized;
  if (!isRecord(value.seeds)) throw new Error("attestations.seeds must be a JSON object");

  normalized.seeds = {};
  for (const id of ["seed-a", "seed-b"] as const) {
    const raw = value.seeds[id];
    if (raw === undefined) continue;
    if (!isRecord(raw)) throw new Error(`attestations.seeds.${id} must be a JSON object`);
    const attestation: SeedAttestation = {};
    if (raw.billingAlertConfigured !== undefined) {
      if (typeof raw.billingAlertConfigured !== "boolean") {
        throw new Error(`${id}.billingAlertConfigured must be a boolean`);
      }
      attestation.billingAlertConfigured = raw.billingAlertConfigured;
    }
    if (raw.lastRestoreTestAt !== undefined && raw.lastRestoreTestAt !== null) {
      if (typeof raw.lastRestoreTestAt !== "string" || !Number.isFinite(Date.parse(raw.lastRestoreTestAt))) {
        throw new Error(`${id}.lastRestoreTestAt must be null or an ISO timestamp`);
      }
      attestation.lastRestoreTestAt = new Date(Date.parse(raw.lastRestoreTestAt)).toISOString();
    }
    for (const field of ["corruptionErrors", "repeatedPeerBans"] as const) {
      const count = raw[field];
      if (count !== undefined) {
        if (!Number.isInteger(count) || Number(count) < 0) {
          throw new Error(`${id}.${field} must be a non-negative integer`);
        }
        attestation[field] = Number(count);
      }
    }
    normalized.seeds[id] = attestation;
  }
  return normalized;
}

export interface PilotEvidenceOptions {
  googleProject: string;
  googleZone?: string;
  googleInstance?: string;
  googleDataDisk?: string;
  flyApp?: string;
  flyVolumeId: string;
  seedAUrl?: string;
  seedBUrl?: string;
  commandTimeoutMs?: number;
  tlsTimeoutMs?: number;
}

export type CommandRunner = (
  command: string,
  args: string[],
  timeoutMs: number,
) => Promise<string>;

export type CertificateExpiryReader = (url: string, timeoutMs: number) => Promise<string>;

const DEFAULT_SEED_A_URL = "wss://seed-a.junctiongenerator.net";
const DEFAULT_SEED_B_URL = "wss://jgc-testnet-seed-b.fly.dev";
const FLY_STATUS_COMMAND = "node -e fetch(String.fromCharCode(104,116,116,112,58,47,47,49,50,55,46,48,46,48,46,49,58,55,55,55,55,47,115,116,97,116,117,115)).then(r=>r.text()).then(console.log)";

export const runCommand: CommandRunner = (command, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { encoding: "utf8", maxBuffer: 1024 * 1024, timeout: timeoutMs, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr).trim();
          reject(new Error(detail ? `${command} failed: ${detail}` : `${command} failed: ${error.message}`));
          return;
        }
        resolve(String(stdout).trim());
      },
    );
  });

export const readCertificateExpiry: CertificateExpiryReader = (url, timeoutMs) => {
  const parsed = new URL(url);
  const port = parsed.port ? Number(parsed.port) : 443;
  return new Promise((resolve, reject) => {
    const socket = connectTls({
      host: parsed.hostname,
      port,
      servername: parsed.hostname,
      rejectUnauthorized: true,
    });
    socket.setTimeout(timeoutMs);
    socket.once("secureConnect", () => {
      const certificate = socket.getPeerCertificate();
      socket.end();
      const expiry = Date.parse(certificate.valid_to);
      if (!certificate.valid_to || !Number.isFinite(expiry)) {
        reject(new Error(`${parsed.hostname} did not present a valid certificate expiry`));
        return;
      }
      resolve(new Date(expiry).toISOString());
    });
    socket.once("timeout", () => socket.destroy(new Error(`TLS timeout after ${timeoutMs}ms`)));
    socket.once("error", reject);
  });
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseNodeStatus(raw: string): Pick<SeedTelemetry, "network" | "height" | "peerCount" | "producerEnabled"> {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || typeof parsed.network !== "string") {
    throw new Error("private status response is missing network identity");
  }
  if (parsed.height !== null && (!Number.isInteger(parsed.height) || Number(parsed.height) < 0)) {
    throw new Error("private status response contains an invalid height");
  }
  if (parsed.peerCount !== null && (!Number.isInteger(parsed.peerCount) || Number(parsed.peerCount) < 0)) {
    throw new Error("private status response contains an invalid peer count");
  }
  const producer = parsed.producer;
  if (!isRecord(producer) || typeof producer.enabled !== "boolean") {
    throw new Error("private status response is missing producer state");
  }
  return {
    network: parsed.network,
    ...(typeof parsed.height === "number" ? { height: parsed.height } : {}),
    ...(typeof parsed.peerCount === "number" ? { peerCount: parsed.peerCount } : {}),
    producerEnabled: producer.enabled,
  };
}

export function parseDiskUsedPercent(raw: string): number {
  const matches = [...raw.matchAll(/(\d{1,3})%/g)];
  const value = matches.length ? Number(matches.at(-1)![1]) : Number.NaN;
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error("disk command did not return a valid usage percentage");
  }
  return value;
}

export function latestSnapshotTimestamp(raw: string): string {
  const parsed: unknown = JSON.parse(raw);
  const timestamps: number[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    const status = typeof value.status === "string" ? value.status.toLowerCase() : undefined;
    const completed = status === undefined || status === "ready" || status === "created";
    for (const [key, child] of Object.entries(value)) {
      if (completed && ["creationTimestamp", "createdAt", "created_at"].includes(key) && typeof child === "string") {
        const timestamp = Date.parse(child);
        if (Number.isFinite(timestamp)) timestamps.push(timestamp);
      } else if (!["creationTimestamp", "createdAt", "created_at"].includes(key)) {
        visit(child);
      }
    }
  };
  visit(parsed);
  if (!timestamps.length) throw new Error("provider returned no completed snapshot timestamp");
  return new Date(Math.max(...timestamps)).toISOString();
}

function sanitizedError(reason: unknown): string {
  const text = reason instanceof Error ? reason.message : String(reason);
  return text.replace(/[\r\n]+/g, " ").slice(0, 300);
}

function settledValue<T>(result: PromiseSettledResult<T>): T | undefined {
  return result.status === "fulfilled" ? result.value : undefined;
}

function collectionErrors(results: Array<[string, PromiseSettledResult<unknown>]>): string | undefined {
  const errors = results
    .filter((entry): entry is [string, PromiseRejectedResult] => entry[1].status === "rejected")
    .map(([label, result]) => `${label}: ${sanitizedError(result.reason)}`);
  return errors.length ? errors.join("; ") : undefined;
}

export async function collectPilotEvidence(
  options: PilotEvidenceOptions,
  attestations: PilotEvidenceAttestations,
  runner: CommandRunner = runCommand,
  certificateReader: CertificateExpiryReader = readCertificateExpiry,
  now: () => Date = () => new Date(),
): Promise<PilotReadinessSnapshot> {
  const googleZone = options.googleZone ?? "us-east1-b";
  const googleInstance = options.googleInstance ?? "jgc-seed-a";
  const googleDataDisk = options.googleDataDisk ?? "jgc-seed-a-data";
  const flyApp = options.flyApp ?? "jgc-testnet-seed-b";
  const seedAUrl = options.seedAUrl ?? DEFAULT_SEED_A_URL;
  const seedBUrl = options.seedBUrl ?? DEFAULT_SEED_B_URL;
  const commandTimeoutMs = options.commandTimeoutMs ?? 60_000;
  const tlsTimeoutMs = options.tlsTimeoutMs ?? 15_000;

  const googleBase = [
    "compute", "ssh", googleInstance,
    `--project=${options.googleProject}`,
    `--zone=${googleZone}`,
    "--tunnel-through-iap",
    "--quiet",
  ];
  const [aStatus, aDisk, aSnapshot, aCertificate, bStatus, bDisk, bSnapshot, bCertificate] = await Promise.allSettled([
    runner("gcloud", [...googleBase, "--command=curl -fsS http://127.0.0.1:7777/status"], commandTimeoutMs).then(parseNodeStatus),
    runner("gcloud", [...googleBase, "--command=df -P /var/lib/jgc | tail -1"], commandTimeoutMs).then(parseDiskUsedPercent),
    runner("gcloud", [
      "compute", "snapshots", "list",
      `--project=${options.googleProject}`,
      `--filter=sourceDisk~'/disks/${googleDataDisk}$' AND status=READY`,
      "--format=json",
    ], commandTimeoutMs).then(latestSnapshotTimestamp),
    certificateReader(seedAUrl, tlsTimeoutMs),
    runner("flyctl", ["ssh", "console", "--app", flyApp, "--command", FLY_STATUS_COMMAND, "--quiet"], commandTimeoutMs).then(parseNodeStatus),
    runner("flyctl", ["ssh", "console", "--app", flyApp, "--command", "df -P /data | tail -1", "--quiet"], commandTimeoutMs).then(parseDiskUsedPercent),
    runner("flyctl", ["volumes", "snapshots", "list", options.flyVolumeId, "--app", flyApp, "--json"], commandTimeoutMs).then(latestSnapshotTimestamp),
    certificateReader(seedBUrl, tlsTimeoutMs),
  ]);

  const aAttestation = attestations.seeds?.["seed-a"] ?? {};
  const bAttestation = attestations.seeds?.["seed-b"] ?? {};
  const seedAStatus = settledValue(aStatus);
  const seedBStatus = settledValue(bStatus);
  const seedA: SeedTelemetry = {
    id: "seed-a",
    provider: "Google Cloud",
    reachable: Boolean(seedAStatus),
    ...seedAStatus,
    ...(settledValue(aDisk) === undefined ? {} : { diskUsedPercent: settledValue(aDisk) }),
    ...(settledValue(aSnapshot) ? { lastSnapshotAt: settledValue(aSnapshot) } : {}),
    ...(settledValue(aCertificate) ? { certificateExpiresAt: settledValue(aCertificate) } : {}),
    ...aAttestation,
  };
  const seedB: SeedTelemetry = {
    id: "seed-b",
    provider: "Fly.io",
    reachable: Boolean(seedBStatus),
    ...seedBStatus,
    ...(settledValue(bDisk) === undefined ? {} : { diskUsedPercent: settledValue(bDisk) }),
    ...(settledValue(bSnapshot) ? { lastSnapshotAt: settledValue(bSnapshot) } : {}),
    ...(settledValue(bCertificate) ? { certificateExpiresAt: settledValue(bCertificate) } : {}),
    ...bAttestation,
  };
  seedA.collectionError = collectionErrors([
    ["status", aStatus], ["disk", aDisk], ["snapshot", aSnapshot], ["certificate", aCertificate],
  ]);
  seedB.collectionError = collectionErrors([
    ["status", bStatus], ["disk", bDisk], ["snapshot", bSnapshot], ["certificate", bCertificate],
  ]);
  if (!seedA.collectionError) delete seedA.collectionError;
  if (!seedB.collectionError) delete seedB.collectionError;

  return {
    capturedAt: now().toISOString(),
    ...(attestations.externalRunnerConnected === undefined
      ? {}
      : { externalRunnerConnected: attestations.externalRunnerConnected }),
    seeds: [seedA, seedB],
  };
}
