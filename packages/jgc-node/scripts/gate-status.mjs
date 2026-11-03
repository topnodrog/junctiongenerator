#!/usr/bin/env node
/** Print the machine-readable mainnet gate and evidence status. Never mutates state. */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const control = await import(new URL("../dist/config/mainnet-launch-control.js", import.meta.url));
const readiness = await import(new URL("../dist/config/mainnet-readiness.js", import.meta.url));
const proof = await import(new URL("../dist/crypto/proof-registry.js", import.meta.url));
const networks = await import(new URL("../dist/config/networks.js", import.meta.url));

function flag(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function readJson(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error.message}`);
  }
}

const defaultDir = resolve(packageRoot, "deploy", "selfhosted");
const policyPath = resolve(flag("--policy", resolve(defaultDir, "launch-policy.json")));
const ledgerPath = resolve(flag("--ledger", resolve(defaultDir, "gate-evidence.json")));
const registryPath = resolve(flag("--proof-registry", resolve(defaultDir, "proof-registry.json")));

const policy = readJson(policyPath);
const ledger = readJson(ledgerPath);
const proofRegistry = readJson(registryPath);
const policyEval = control.evaluateLaunchPolicy(policy);
const ledgerEval = control.evaluateGateLedger(ledger, policyEval);
const registryEval = proof.evaluateProofRegistryManifest(proofRegistry);
const builtIn = proof.evaluateBuiltInProofRegistry(proofRegistry);
const gates = Object.keys(control.GATE_EVIDENCE_REQUIREMENTS);

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  network: networks.MAINNET_NETWORK.chainId,
  ready: false,
  policy: { valid: policyEval.valid, reasons: policyEval.reasons, trustedKeys: policyEval.keyById.size },
  proofRegistry: { status: registryEval.status, reasons: registryEval.reasons, registrySha256: registryEval.registrySha256 },
  builtInRegistry: { status: builtIn.status, circuitCount: builtIn.circuitCount },
  ledgerSha256: ledgerEval.ledgerSha256,
  baselineMissingGates: readiness.evaluateMainnetReadiness(readiness.MAINNET_READINESS).missingGates,
  gates: gates.map((gate) => ({
    gate,
    baselineGate: ledgerEval.gates[gate].baselineGate,
    evidenceSatisfied: ledgerEval.gates[gate].evidenceSatisfied,
    reasons: ledgerEval.gates[gate].reasons,
    owner: ledgerEval.gates[gate].requirement.owner,
    deliverable: ledgerEval.gates[gate].requirement.deliverable,
    requiredArtifacts: ledgerEval.gates[gate].requirement.requiredArtifacts,
    verificationCommands: ledgerEval.gates[gate].requirement.verificationCommands,
    requiresIndependentReview: ledgerEval.gates[gate].requirement.requiresIndependentReview,
  })),
  launchIsValueBearing: true,
  note: "This is an evidence report. It cannot mark a gate true or activate mainnet.",
};

console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--strict") && !ledgerEval.satisfied) process.exitCode = 1;
