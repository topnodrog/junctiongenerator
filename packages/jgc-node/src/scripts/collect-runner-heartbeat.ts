import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validateRunner } from "../ops/hosted-soak-monitor.js";

const position = process.argv.indexOf("--config");
if (position < 0 || !process.argv[position + 1]) throw new Error("--config is required");
const config = JSON.parse(readFileSync(resolve(process.argv[position + 1]), "utf8")) as {
  windowId: string; expiresAt: string; uploadUrl: string; historyPath: string;
};
if (!Number.isFinite(Date.parse(config.expiresAt))) throw new Error("Invalid upload expiry");
if (Date.now() >= Date.parse(config.expiresAt)) process.exit(0);
const upload = new URL(config.uploadUrl);
if (upload.protocol !== "https:" || !(upload.hostname === "storage.googleapis.com" || upload.hostname.endsWith(".storage.googleapis.com"))) throw new Error("Unexpected upload destination");
const history = resolve(config.historyPath);
mkdirSync(dirname(history), { recursive: true });
const capturedAt = new Date().toISOString();
try {
  const response = await fetch("http://127.0.0.1:7777/status", { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Local status HTTP ${response.status}`);
  const raw = await response.json() as Record<string, unknown>;
  const producer = raw.producer as { enabled?: boolean } | undefined;
  const observation = validateRunner({ windowId: config.windowId, capturedAt,
    running: raw.running, network: raw.network, height: raw.height, peerCount: raw.peerCount,
    producerEnabled: producer?.enabled ?? raw.producerEnabled, uptimeSec: raw.uptimeSec,
    nodeVersion: raw.version, platform: process.platform, architecture: process.arch,
    runtimeVersion: process.version,
  }, config.windowId);
  appendFileSync(history, JSON.stringify({ kind: "runner-observation", ...observation }) + "\n");
  const result = await fetch(upload, { method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(observation), signal: AbortSignal.timeout(15000) });
  if (!result.ok) throw new Error(`Runner upload HTTP ${result.status}`);
  console.log(`Runner evidence saved and uploaded for ${config.windowId}`);
} catch (error) {
  const detail = error instanceof Error && !/https?:\/\//.test(error.message) ? error.message : "Runner collection or upload failed";
  appendFileSync(history, JSON.stringify({ kind: "runner-observation-failure", capturedAt, windowId: config.windowId, detail }) + "\n");
  console.error(detail);
  process.exitCode = 1;
}
