import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { buildReleaseManifest, collectReleaseFiles } from "./release-manifest.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const version = packageJson.version;
if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error("package.json must contain a valid release version");
}

const distRoot = join(packageRoot, "dist");
if (!existsSync(join(distRoot, "scripts", "testnet-node.js"))) {
  throw new Error("dist/scripts/testnet-node.js is missing; run npm run build first");
}

const releaseRoot = join(packageRoot, ".tmp", "release");
const bundleName = `jgc-node-v${version}`;
const bundleRoot = join(releaseRoot, bundleName);
rmSync(releaseRoot, { recursive: true, force: true });
mkdirSync(bundleRoot, { recursive: true });

const paths = [
  ".dockerignore",
  "Dockerfile",
  "README.md",
  "RELEASE_NOTES.md",
  "compose.runner.yml",
  "docs",
  "package-lock.json",
  "package.json",
  "rust/Cargo.lock",
  "rust/Cargo.toml",
  "rust/rust-toolchain.toml",
  "rust/src",
  "scripts/compose-smoke.mjs",
  "scripts/release-manifest.mjs",
  "scripts/stage-runner-release.mjs",
  "scripts/verify-release-bundle.mjs",
  "scripts/windows",
  "src",
  "tsconfig.json",
];

for (const relativePath of paths) {
  const source = join(packageRoot, relativePath);
  if (!existsSync(source)) throw new Error(`release input is missing: ${relativePath}`);
  const destination = join(bundleRoot, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
}
cpSync(distRoot, join(bundleRoot, "dist"), { recursive: true });

const networks = await import(pathToFileURL(join(distRoot, "config", "networks.js")).href);
const commit = process.env.JGC_RELEASE_COMMIT ?? "working-tree";
if (commit !== "working-tree" && !/^[0-9a-f]{40}$/.test(commit)) {
  throw new Error("JGC_RELEASE_COMMIT must be a full lowercase Git commit hash");
}
if (commit !== "working-tree") {
  let head;
  try {
    head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: packageRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    throw new Error("JGC_RELEASE_COMMIT requires a Git checkout");
  }
  if (head !== commit) {
    throw new Error(`JGC_RELEASE_COMMIT ${commit} does not match checked-out HEAD ${head}`);
  }
}

const baseManifest = {
  artifact: bundleName,
  version,
  commit,
  network: networks.TESTNET_NETWORK.chainId,
  genesisHash: networks.TESTNET_GENESIS_HASH,
  proofMode: networks.TESTNET_NETWORK.proofMode,
  seeds: [
    "wss://seed-a.junctiongenerator.net",
    "wss://jgc-testnet-seed-b.fly.dev",
  ],
};
const manifest = buildReleaseManifest(baseManifest, collectReleaseFiles(bundleRoot));
writeFileSync(
  join(bundleRoot, "RELEASE-MANIFEST.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

console.log(bundleRoot);
