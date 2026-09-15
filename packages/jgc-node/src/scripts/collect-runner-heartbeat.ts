import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validateRunner } from "../ops/hosted-soak-monitor.js";

const position = process.argv.indexOf("--config");
if (position < 0 || !process.argv[position + 1]) throw new Error("--config is required");
const config = JSON.parse(readFileSync(resolve(process.argv[position + 1]), "utf8")) as {
  windowId: string; participantAddress: string; expiresAt: string; uploadUrl: string; historyPath: string;
};
if (!Number.isFinite(Date.parse(config.expiresAt))) throw new Error("Invalid upload expiry");
if (!/^1QGC[a-f0-9]{40}$/.test(config.participantAddress)) throw new Error("Invalid participant recorder address");
if (Date.now() >= Date.parse(config.expiresAt)) process.exit(0);
const upload = new URL(config.uploadUrl);
if (upload.protocol !== "https:" || !(upload.hostname === "storage.googleapis.com" || upload.hostname.endsWith(".storage.googleapis.com"))) throw new Error("Unexpected upload destination");
const history = resolve(config.historyPath);
mkdirSync(dirname(history), { recursive: true });
const capturedAt = new Date().toISOString();

const MAX_ATTEMPTS = 3;
const wait = (milliseconds: number): Promise<void> => new Promise((done) => setTimeout(done, milliseconds));

async function retry<T>(label: string, action: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await wait(attempt * 1000);
    }
  }
  const detail = lastError instanceof Error ? lastError.message.replace(/https?:\/\/\S+/g, "endpoint") : "unknown error";
  throw new Error(`${label} failed after ${MAX_ATTEMPTS} attempts: ${detail}`);
}

async function readLocalStatus(): Promise<Record<string, unknown>> {
  return retry("Local status", async () => {
    const response = await fetch("http://127.0.0.1:7777/status", { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Local status HTTP ${response.status}`);
    return response.json() as Promise<Record<string, unknown>>;
  });
}

async function uploadObservation(observation: unknown): Promise<void> {
  await retry("Runner upload", async () => {
    const result = await fetch(upload, { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(observation), signal: AbortSignal.timeout(15_000) });
    if (!result.ok) throw new Error(`Runner upload HTTP ${result.status}`);
  });
}

try {
  const raw = await readLocalStatus();
  const producer = raw.producer as { enabled?: boolean } | undefined;
  const observation = validateRunner({ windowId: config.windowId, capturedAt,
    running: raw.running, network: raw.network, address: raw.address, height: raw.height, peerCount: raw.peerCount,
    producerEnabled: producer?.enabled ?? raw.producerEnabled, uptimeSec: raw.uptimeSec,
    role: raw.role, participating: raw.participating,
    nodeVersion: raw.version, platform: process.platform, architecture: process.arch,
    runtimeVersion: process.version,
  }, config.windowId);
  if (observation.role !== "participant" || !observation.participating || observation.address !== config.participantAddress) {
    throw new Error("Local node is not the participant recorded in this observer configuration");
  }
  appendFileSync(history, JSON.stringify({ kind: "runner-observation", ...observation }) + "\n");
  await uploadObservation(observation);
  console.log(`Runner evidence saved and uploaded for ${config.windowId}`);
} catch (error) {
  const detail = error instanceof Error && !/https?:\/\//.test(error.message) ? error.message : "Runner collection or upload failed";
  appendFileSync(history, JSON.stringify({ kind: "runner-observation-failure", capturedAt, windowId: config.windowId, detail }) + "\n");
  console.error(detail);
  process.exitCode = 1;
}
