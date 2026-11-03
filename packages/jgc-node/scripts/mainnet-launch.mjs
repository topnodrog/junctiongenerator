#!/usr/bin/env node
/**
 * Fail-closed mainnet launch gate.
 *
 * This is intentionally NOT an activator. It verifies a signed, release-specific
 * launch record, the signed gate evidence ledger, the reviewed proof registry,
 * the compiled chain identity and the readiness guard. It never starts a node,
 * never edits the readiness record and never marks a gate true. Value-bearing
 * activation additionally requires the reviewed operator runbook and a mainnet
 * node launcher, neither of which exists in this repository today.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const control = await import(new URL("../dist/config/mainnet-launch-control.js", import.meta.url));
const networks = await import(new URL("../dist/config/networks.js", import.meta.url));

function flag(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error.message}`);
  }
}

const defaultDir = resolve(packageRoot, "deploy", "selfhosted");
const policy = readJson(resolve(flag("--policy", resolve(defaultDir, "launch-policy.json"))));
const ledger = readJson(resolve(flag("--ledger", resolve(defaultDir, "gate-evidence.json"))));
const proofRegistry = readJson(resolve(flag("--proof-registry", resolve(defaultDir, "proof-registry.json"))));
const launchRecord = readJson(resolve(flag("--record", resolve(defaultDir, "mainnet-launch-record.json"))));

const evaluation = control.evaluateLaunchRequest({ policy, launchRecord, ledger, proofRegistry });
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  network: networks.MAINNET_NETWORK.chainId,
  ready: evaluation.ready,
  status: evaluation.status,
  launchAttempted: false,
  reasons: evaluation.reasons,
  signers: evaluation.signers,
  unsatisfiedGates: Object.values(evaluation.gates)
    .filter((gate) => !gate.evidenceSatisfied)
    .map((gate) => gate.gate),
  proofRegistry: evaluation.proofRegistry.status,
  builtInRegistry: evaluation.builtInProofRegistry.status,
  nextSteps: evaluation.ready
    ? ["All machine-checkable gates passed. A human-reviewed, signed activation runbook and a mainnet node launcher are still required; this tool does not start a network."]
    : [
      "Close each gate with the artifacts in docs/mainnet/GATE_CLOSURE_PROTOCOL.md.",
      "Recruit independent reviewers (docs/mainnet/EXTERNAL_REVIEW_ONBOARDING.md).",
      "Sign a release-specific launch record and re-run this command.",
    ],
};

console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--assert-blocked")) {
  process.exitCode = evaluation.ready ? 1 : 0;
} else if (!evaluation.ready) {
  process.exitCode = 1;
}
