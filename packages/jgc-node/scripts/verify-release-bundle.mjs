import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { verifyReleaseBundle } from "./release-manifest.mjs";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
const version = packageJson.version;
const flagIndex = process.argv.indexOf("--bundle");
const suppliedBundle = flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined;
const stagedBundle = resolve(packageRoot, ".tmp", "release", `jgc-node-v${version}`);
const defaultBundle = existsSync(resolve(packageRoot, "RELEASE-MANIFEST.json")) ? packageRoot : stagedBundle;
const bundleRoot = resolve(suppliedBundle ?? defaultBundle);
const manifest = verifyReleaseBundle(bundleRoot);
console.log(`Verified ${manifest.artifact}: ${manifest.fileCount} files, tree ${manifest.treeSha256}`);
