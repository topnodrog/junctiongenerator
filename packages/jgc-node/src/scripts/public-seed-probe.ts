import { appendFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import WebSocket from "ws";

const DEFAULT_SEEDS = [
  "wss://seed-a.junctiongenerator.net",
  "wss://jgc-testnet-seed-b.fly.dev",
];

interface ProbeResult {
  url: string;
  reachable: boolean;
  latencyMs: number;
  error?: string;
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function probe(url: string, timeoutMs: number): Promise<ProbeResult> {
  const started = Date.now();
  return new Promise(resolveProbe => {
    const ws = new WebSocket(url);
    let done = false;
    const finish = (reachable: boolean, error?: string): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ws.terminate();
      resolveProbe({ url, reachable, latencyMs: Date.now() - started, ...(error ? { error } : {}) });
    };
    const timer = setTimeout(() => finish(false, `timeout after ${timeoutMs}ms`), timeoutMs);
    ws.once("open", () => finish(true));
    ws.once("error", error => finish(false, error.message));
  });
}

const args = process.argv.slice(2);
const urls = args
  .map((arg, index) => arg === "--seed" ? args[index + 1] : undefined)
  .filter((url): url is string => Boolean(url));
const timeoutMs = Number(valueAfter(args, "--timeout-ms") ?? "15000");
if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) {
  throw new Error("--timeout-ms must be an integer from 1000 to 60000");
}

const capturedAt = new Date().toISOString();
const results = await Promise.all((urls.length ? urls : DEFAULT_SEEDS).map(url => probe(url, timeoutMs)));
const evidence = { capturedAt, kind: "public-wss-transport", results };

for (const result of results) {
  console.log(`${result.reachable ? "PASS" : "FAIL"} ${result.url} (${result.latencyMs} ms)${result.error ? `: ${result.error}` : ""}`);
}

const append = valueAfter(args, "--append");
if (append) {
  const outputPath = resolve(append);
  mkdirSync(dirname(outputPath), { recursive: true });
  appendFileSync(outputPath, `${JSON.stringify(evidence)}\n`, "utf8");
  console.log(`Appended evidence to ${outputPath}`);
}

process.exitCode = results.every(result => result.reachable) ? 0 : 1;
