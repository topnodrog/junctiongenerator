import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const RELEASE_MANIFEST_VERSION = 1;
const MANIFEST_NAME = "RELEASE-MANIFEST.json";
const FORBIDDEN_PATH = /(?:^|\/)(?:data|testnet-data|node_modules|\.git)(?:\/|$)|(?:^|\/)(?:\.env(?:\.|$)|.*\.keystore\.json$)/i;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function portablePath(value) {
  return value.split(sep).join("/");
}

function comparePath(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertSafeRelativePath(path) {
  if (!path || path.startsWith("/") || path.includes("\\") || path.split("/").includes("..")) {
    throw new Error(`unsafe release path: ${path}`);
  }
}

function walk(root, directory = root, output = []) {
  const children = readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => comparePath(a.name, b.name));
  for (const child of children) {
    const absolute = join(directory, child.name);
    const relativeName = portablePath(relative(root, absolute));
    if (child.isDirectory()) {
      walk(root, absolute, output);
    } else if (child.isFile()) {
      assertSafeRelativePath(relativeName);
      if (relativeName !== MANIFEST_NAME) output.push({ path: relativeName, sha256: sha256(readFileSync(absolute)) });
    } else {
      throw new Error(`release bundle contains unsupported filesystem entry: ${relativeName}`);
    }
  }
  return output;
}

/** Return sorted content hashes for every regular file except the manifest itself. */
export function collectReleaseFiles(bundleRoot) {
  if (!existsSync(bundleRoot) || !statSync(bundleRoot).isDirectory()) {
    throw new Error(`release bundle directory does not exist: ${bundleRoot}`);
  }
  const entries = walk(bundleRoot).sort((a, b) => comparePath(a.path, b.path));
  for (const entry of entries) {
    if (FORBIDDEN_PATH.test(entry.path)) throw new Error(`forbidden release path: ${entry.path}`);
  }
  return entries;
}

/** Hash the sorted path/hash inventory, independent of host filesystem order. */
export function releaseTreeSha256(entries) {
  const inventory = entries.map(entry => `${entry.sha256}  ${entry.path}\n`).join("");
  return sha256(Buffer.from(inventory, "utf8"));
}

export function buildReleaseManifest(base, entries) {
  if (!base || typeof base !== "object") throw new Error("release manifest base must be an object");
  if (!Array.isArray(entries)) throw new Error("release manifest entries must be an array");
  const files = entries.map(entry => {
    if (!entry || typeof entry.path !== "string" || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
      throw new Error("release manifest contains a malformed file entry");
    }
    assertSafeRelativePath(entry.path);
    if (FORBIDDEN_PATH.test(entry.path)) throw new Error(`forbidden release path: ${entry.path}`);
    return { path: entry.path, sha256: entry.sha256 };
  }).sort((a, b) => comparePath(a.path, b.path));
  return {
    ...base,
    manifestVersion: RELEASE_MANIFEST_VERSION,
    fileCount: files.length,
    treeSha256: releaseTreeSha256(files),
    files,
  };
}

/** Verify the manifest inventory and every file digest against the bundle on disk. */
export function verifyReleaseBundle(bundleRoot) {
  const manifestPath = join(bundleRoot, MANIFEST_NAME);
  if (!existsSync(manifestPath)) throw new Error(`${MANIFEST_NAME} is missing`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.manifestVersion !== RELEASE_MANIFEST_VERSION) throw new Error("unsupported release manifest version");
  if (!Array.isArray(manifest.files) || !Number.isInteger(manifest.fileCount)) throw new Error("release manifest file inventory is malformed");
  if (manifest.fileCount !== manifest.files.length) throw new Error("release manifest file count mismatch");
  const listed = manifest.files.map(entry => {
    if (!entry || typeof entry.path !== "string" || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error("release manifest contains a malformed file entry");
    assertSafeRelativePath(entry.path);
    if (FORBIDDEN_PATH.test(entry.path)) throw new Error(`release manifest contains forbidden path: ${entry.path}`);
    return { path: entry.path, sha256: entry.sha256 };
  });
  const sortedListed = [...listed].sort((a, b) => comparePath(a.path, b.path));
  if (JSON.stringify(listed) !== JSON.stringify(sortedListed)) throw new Error("release manifest files are not canonically sorted");
  const actual = collectReleaseFiles(bundleRoot);
  if (JSON.stringify(actual) !== JSON.stringify(listed)) throw new Error("release bundle files do not match the manifest inventory");
  if (manifest.treeSha256 !== releaseTreeSha256(actual)) throw new Error("release bundle tree digest mismatch");
  return manifest;
}
