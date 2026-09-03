import assert from "node:assert/strict";
import { test } from "node:test";
import {
  generateContractArtifact,
  generateSolidity,
  normalizeContractSpec,
  stableStringify,
} from "../index.js";

const erc20 = {
  kind: "erc20" as const,
  name: "VibeToken",
  symbol: "vibe",
  initialSupply: "1000000",
  taxBps: 100,
};

test("normalization is strict and canonical", () => {
  const normalized = normalizeContractSpec(erc20);
  assert.equal(normalized.kind, "erc20");
  assert.equal(normalized.symbol, "VIBE");
  assert.equal(normalized.taxBps, 100);
  assert.throws(() => normalizeContractSpec({ ...erc20, name: "Bad;exec" }), /identifier/);
  assert.throws(() => normalizeContractSpec({ ...erc20, initialSupply: "01" }), /canonical decimal/);
  assert.throws(() => normalizeContractSpec({ ...erc20, security: { ownerPrivilege: true } }), /owner privilege/);
  assert.throws(() => normalizeContractSpec({ ...erc20, kind: "dao" }), /unavailable/);
});

test("the same spec produces byte-for-byte identical source and hashes", () => {
  const first = generateContractArtifact(erc20);
  const second = generateContractArtifact({ ...erc20 });
  assert.equal(first.source, second.source);
  assert.equal(first.sourceSha256, second.sourceSha256);
  assert.equal(first.specSha256, second.specSha256);
  assert.equal(first.manifest.deployment.allowed, false);
  assert.equal(first.manifest.compiler.status, "not-run");
  assert.match(first.source, /pragma solidity \^0\.8\.24;/);
});

test("multisig owners are sorted into a deterministic source", () => {
  const first = generateSolidity({
    kind: "multisig",
    name: "Treasury",
    owners: ["0x0000000000000000000000000000000000000002", "0x0000000000000000000000000000000000000001"],
    requiredSignatures: 2,
  });
  assert.match(first.source, /OWNER_0 = 0x0000000000000000000000000000000000000001/);
  assert.match(first.source, /REQUIRED_SIGNATURES = 2/);
  const artifact = generateContractArtifact({
    kind: "multisig",
    name: "Treasury",
    owners: ["0x0000000000000000000000000000000000000002", "0x0000000000000000000000000000000000000001"],
    requiredSignatures: 2,
  });
  assert.equal(artifact.findings.filter((finding) => finding.code === "SOL-004").length, 1);
});

test("canonical JSON sorts object keys but preserves arrays", () => {
  assert.equal(stableStringify({ b: 2, a: 1, list: ["z", "a"] }), '{"a":1,"b":2,"list":["z","a"]}');
});
