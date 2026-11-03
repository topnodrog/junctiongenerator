#!/usr/bin/env node
/** Verify the release-specific proof registry (or report why it is blocked). */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const proof = await import(new URL("../dist/crypto/proof-registry.js", import.meta.url));

function flag(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const path = resolve(flag("--file", resolve(packageRoot, "deploy", "selfhosted", "proof-registry.json")));
const manifest = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
const builtIn = proof.evaluateBuiltInProofRegistry(manifest);
const reviewed = proof.evaluateProofRegistryManifest(manifest);

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: reviewed.status,
  manifestPath: path,
  builtInRegistry: { status: builtIn.status, circuitCount: builtIn.circuitCount, reasons: builtIn.reasons.slice(0, 8) },
  reasons: reviewed.reasons,
  registrySha256: reviewed.registrySha256,
  note: "Placeholder keys can never authorize a value-bearing mainnet; a ceremony and external review are required.",
};
console.log(JSON.stringify(report, null, 2));

if (process.argv.includes("--assert-blocked")) {
  process.exitCode = reviewed.status === "blocked" ? 0 : 1;
} else if (process.argv.includes("--check") && reviewed.status !== "reviewed") {
  process.exitCode = 1;
}
