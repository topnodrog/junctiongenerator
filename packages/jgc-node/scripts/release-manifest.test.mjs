import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildReleaseManifest,
  collectReleaseFiles,
  releaseTreeSha256,
  verifyReleaseBundle,
} from "./release-manifest.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "jgc-release-manifest-"));
  mkdirSync(join(root, "dist", "scripts"), { recursive: true });
  writeFileSync(join(root, "README.md"), "release\n");
  writeFileSync(join(root, "dist", "index.js"), "console.log('ok');\n");
  writeFileSync(join(root, "dist", "scripts", "node.js"), "export {};\n");
  return root;
}

test("builds and verifies a canonical content-addressed inventory", () => {
  const root = fixture();
  try {
    const entries = collectReleaseFiles(root);
    const manifest = buildReleaseManifest({ artifact: "fixture", version: "0.0.0" }, [...entries].reverse());
    writeFileSync(join(root, "RELEASE-MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    assert.deepEqual(verifyReleaseBundle(root), manifest);
    assert.equal(manifest.fileCount, 3);
    assert.deepEqual(manifest.files, entries);
    assert.equal(manifest.treeSha256, releaseTreeSha256(entries));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("detects tampering and forbidden paths", () => {
  const root = fixture();
  try {
    const entries = collectReleaseFiles(root);
    const manifest = buildReleaseManifest({ artifact: "fixture", version: "0.0.0" }, entries);
    writeFileSync(join(root, "RELEASE-MANIFEST.json"), JSON.stringify(manifest));
    writeFileSync(join(root, "README.md"), "tampered\n");
    assert.throws(() => verifyReleaseBundle(root), /do not match|tree digest/);
    mkdirSync(join(root, "node_modules"));
    writeFileSync(join(root, "node_modules", "bad.js"), "bad");
    assert.throws(() => collectReleaseFiles(root), /forbidden release path/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects missing and extra files", () => {
  const root = fixture();
  try {
    const entries = collectReleaseFiles(root);
    const manifest = buildReleaseManifest({ artifact: "fixture", version: "0.0.0" }, entries);
    writeFileSync(join(root, "RELEASE-MANIFEST.json"), JSON.stringify(manifest));
    rmSync(join(root, "dist", "index.js"));
    assert.throws(() => verifyReleaseBundle(root), /do not match/);
    writeFileSync(join(root, "dist", "index.js"), "console.log('ok');\n");
    writeFileSync(join(root, "extra.txt"), "unexpected\n");
    assert.throws(() => verifyReleaseBundle(root), /do not match/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
