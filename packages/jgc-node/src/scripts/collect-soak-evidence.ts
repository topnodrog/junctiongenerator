import { appendFileSync, mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { evaluateExplorerEvidence, parseExplorerEvidence } from "../ops/soak-evidence.js";

const DEFAULT_EXPLORER_URL = "https://seed-a.junctiongenerator.net/explorer";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function positiveInteger(raw: string | undefined, fallback: number, flag: string): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

const args = process.argv.slice(2);
const url = valueAfter(args, "--url") ?? DEFAULT_EXPLORER_URL;
const timeoutMs = positiveInteger(valueAfter(args, "--timeout-ms"), 15_000, "--timeout-ms");
const response = await fetch(url, {
  signal: AbortSignal.timeout(timeoutMs),
});
if (!response.ok) throw new Error(`explorer returned HTTP ${response.status}`);

const snapshot = parseExplorerEvidence(await response.json() as unknown);
const report = evaluateExplorerEvidence(snapshot);
const evidence = { collectedAt: new Date().toISOString(), source: url, snapshot, report };

const outputPath = resolve(valueAfter(args, "--output") ?? ".tmp/pilot-evidence/soak-current.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

const append = valueAfter(args, "--append");
if (append) {
  const historyPath = resolve(append);
  mkdirSync(dirname(historyPath), { recursive: true });
  appendFileSync(historyPath, `${JSON.stringify(evidence)}\n`, "utf8");
  console.log(`Appended public soak evidence to ${historyPath}`);
}

console.log(`Wrote public soak evidence to ${outputPath}`);
console.log(`JGTC soak evidence: ${report.status.toUpperCase()} (${report.summary.passed} pass, ${report.summary.warnings} warn, ${report.summary.failures} fail)`);
console.log(`${report.observed.height} blocks; ${report.observed.settlementsCompleted} settlements; ${report.observed.participantCount} current-epoch participants`);
for (const check of report.checks.filter(item => item.severity !== "pass")) {
  console.error(`${check.severity.toUpperCase()} ${check.id}: ${check.message}`);
}
process.exitCode = report.status === "fail" ? 1 : 0;
