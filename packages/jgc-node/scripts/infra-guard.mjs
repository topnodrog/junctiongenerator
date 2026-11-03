#!/usr/bin/env node
/**
 * Provider-neutral infrastructure guard.
 *
 * Verifies that the ACTIVE self-hosted deployment kit contains no Fly.io or
 * Google Cloud dependency, that its inventory describes genuinely separate
 * operators/failure domains, and that no secret material is checked in.
 * Legacy directories (deploy/google, deploy/fly, deploy/monitor) are archived
 * research material and are deliberately out of scope; no workflow or launcher
 * may reference them for a new deployment.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const deployDir = resolve(packageRoot, "deploy", "selfhosted");
const findings = [];
const forbidden = [
  ["fly.dev", "Fly.io hostname"],
  ["fly.io", "Fly.io hostname"],
  ["flyctl", "Fly.io CLI"],
  ["FLY_API_TOKEN", "Fly.io credential"],
  ["googleapis.com", "Google Cloud API"],
  ["metadata.google.internal", "GCE metadata service"],
  ["gcloud ", "Google Cloud CLI"],
  ["GOOGLE_CLOUD_PROJECT", "Google Cloud runtime binding"],
  ["cloudbuild.yaml", "Google Cloud Build"],
  ["BEGIN PRIVATE KEY", "private key material"],
  ["BEGIN OPENSSH PRIVATE KEY", "private key material"],
  ["TURSO_AUTH_TOKEN=", "database credential assignment"],
  ["API_SECRET=", "API credential assignment"],
];

function activeFiles(dir) {
  if (!existsSync(dir)) return [];
  const result = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      result.push(...activeFiles(path));
    } else if (!/\.(md|png|jpg|zip)$/i.test(entry)) {
      result.push(path);
    }
  }
  return result;
}

const files = activeFiles(deployDir).sort();
for (const file of files) {
  const contents = readFileSync(file, "utf8");
  for (const [token, label] of forbidden) {
    if (contents.toLowerCase().includes(token.toLowerCase())) {
      findings.push(`${relative(packageRoot, file)} contains ${label} (${token})`);
    }
  }
}

let inventory = null;
const inventoryPath = resolve(deployDir, "inventory.example.json");
if (!existsSync(inventoryPath)) {
  findings.push("inventory.example.json is missing");
} else {
  try {
    inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
  } catch (error) {
    findings.push(`inventory.example.json is not valid JSON: ${error.message}`);
  }
}
if (inventory) {
  const operators = inventory.operators;
  if (!Array.isArray(operators) || operators.length < 3) {
    findings.push("inventory must describe at least three independent seed operators");
  } else {
    const ids = new Set();
    const domains = new Set();
    const hosts = new Set();
    for (const [index, op] of operators.entries()) {
      if (!op.operator || ids.has(op.operator)) findings.push(`operator ${index} is missing or duplicated`);
      ids.add(op.operator);
      if (!op.failureDomain || domains.has(op.failureDomain)) findings.push(`operator ${index} has no distinct failure domain`);
      domains.add(op.failureDomain);
      const provider = String(op.provider ?? "").toLowerCase();
      if (!provider || provider.includes("google") || provider.includes("fly")) {
        findings.push(`operator ${index} has a forbidden or missing provider`);
      }
      try {
        const seed = new URL(String(op.seedUrl ?? ""));
        if (seed.protocol !== "wss:" || !seed.hostname || seed.username || seed.password) throw new Error();
        if (hosts.has(seed.hostname)) findings.push(`operator ${index} reuses a seed hostname`);
        hosts.add(seed.hostname);
      } catch {
        findings.push(`operator ${index} has an invalid wss:// seedUrl`);
      }
    }
  }
}

const policyPath = resolve(deployDir, "launch-policy.json");
if (existsSync(policyPath)) {
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  if (policy.schemaVersion !== 1 || !Array.isArray(policy.trustedKeys) || policy.threshold < 2) {
    findings.push("launch-policy.json is not a fail-closed M-of-N policy");
  }
} else {
  findings.push("launch-policy.json is missing");
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  ok: findings.length === 0,
  filesChecked: files.map((file) => relative(packageRoot, file)),
  findings,
  policy: "No Fly.io or Google Cloud service, CLI, credential, or metadata endpoint may appear in the active deployment kit.",
};
console.log(JSON.stringify(report, null, 2));
if (findings.length) process.exitCode = 1;
