import { appendFileSync, mkdirSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import {
  evaluatePilotReadiness,
  type PilotReadinessSnapshot,
  type SeedId,
} from "../ops/pilot-readiness.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage(): never {
  console.error("Usage: npm run pilot-readiness -- --input <snapshot.json> [--append <history.jsonl>] [--expected-outage seed-a|seed-b]");
  process.exit(2);
}

const args = process.argv.slice(2);
const input = valueAfter(args, "--input");
if (!input) usage();

const inputPath = resolve(input);
const snapshot = JSON.parse(readFileSync(inputPath, "utf8")) as PilotReadinessSnapshot;
const outage = valueAfter(args, "--expected-outage");
if (outage) {
  if (outage !== "seed-a" && outage !== "seed-b") usage();
  snapshot.expectedOutage = outage as SeedId;
}

const report = evaluatePilotReadiness(snapshot);
console.log(`JGC pilot readiness: ${report.status.toUpperCase()}`);
for (const item of report.checks) {
  console.log(`[${item.severity.toUpperCase()}] ${item.message}`);
}
console.log(`${report.summary.passed} passed, ${report.summary.warnings} warning(s), ${report.summary.failures} failure(s)`);

const append = valueAfter(args, "--append");
if (append) {
  const outputPath = resolve(append);
  mkdirSync(dirname(outputPath), { recursive: true });
  appendFileSync(outputPath, `${JSON.stringify({ snapshot, report })}\n`, "utf8");
  console.log(`Appended evidence to ${outputPath}`);
}

process.exitCode = report.status === "fail" ? 1 : 0;
