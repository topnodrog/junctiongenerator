import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import {
  collectPilotEvidence,
  validatePilotEvidenceAttestations,
} from "../ops/pilot-evidence.js";
import { evaluatePilotReadiness } from "../ops/pilot-readiness.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage(): never {
  console.error([
    "Usage: npm run collect-pilot-evidence --",
    "  --google-project <project-id>",
    "  --fly-volume <volume-id>",
    "  --attestations <attestations.json>",
    "  [--output <snapshot.json>] [--append <history.jsonl>]",
  ].join(" "));
  process.exit(2);
}

function positiveInteger(raw: string | undefined, fallback: number, flag: string): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

const args = process.argv.slice(2);
const googleProject = valueAfter(args, "--google-project") ?? process.env.JGC_GOOGLE_PROJECT;
const flyVolumeId = valueAfter(args, "--fly-volume") ?? process.env.JGC_FLY_VOLUME_ID;
const attestationFile = valueAfter(args, "--attestations");
if (!googleProject || !flyVolumeId || !attestationFile) usage();

const attestationPath = resolve(attestationFile);
const attestations = validatePilotEvidenceAttestations(
  JSON.parse(readFileSync(attestationPath, "utf8")) as unknown,
);
const snapshot = await collectPilotEvidence({
  googleProject,
  googleZone: valueAfter(args, "--google-zone") ?? "us-east1-b",
  googleInstance: valueAfter(args, "--google-instance") ?? "jgc-seed-a",
  googleDataDisk: valueAfter(args, "--google-data-disk") ?? "jgc-seed-a-data",
  flyApp: valueAfter(args, "--fly-app") ?? "jgc-testnet-seed-b",
  flyVolumeId,
  commandTimeoutMs: positiveInteger(valueAfter(args, "--command-timeout-ms"), 60_000, "--command-timeout-ms"),
  tlsTimeoutMs: positiveInteger(valueAfter(args, "--tls-timeout-ms"), 15_000, "--tls-timeout-ms"),
}, attestations);
const report = evaluatePilotReadiness(snapshot);

const outputPath = resolve(valueAfter(args, "--output") ?? ".tmp/pilot-evidence/current.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

const append = valueAfter(args, "--append");
if (append) {
  const historyPath = resolve(append);
  mkdirSync(dirname(historyPath), { recursive: true });
  appendFileSync(historyPath, `${JSON.stringify({ snapshot, report })}\n`, "utf8");
  console.log(`Appended readiness evidence to ${historyPath}`);
}

console.log(`Wrote sanitized pilot snapshot to ${outputPath}`);
console.log(`JGC pilot readiness: ${report.status.toUpperCase()} (${report.summary.passed} pass, ${report.summary.warnings} warn, ${report.summary.failures} fail)`);
for (const seed of snapshot.seeds) {
  if (seed.collectionError) console.error(`${seed.id} collection warning: ${seed.collectionError}`);
}
process.exitCode = report.status === "fail" ? 1 : 0;
