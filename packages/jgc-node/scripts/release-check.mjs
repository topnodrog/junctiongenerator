import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const { version } = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
const stagedBundle = resolve(packageRoot, ".tmp", "release", `jgc-node-v${version}`);
const npmCliPath = process.env.npm_execpath;
const npmExecutable = npmCliPath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const npmPrefixArgs = npmCliPath ? [npmCliPath] : [];
const requiredMissingGates = [
  "proofSystem",
  "deterministicConsensus",
  "permissionlessProduction",
  "peerAuthentication",
  "validatorEconomics",
  "reproducibleArtifacts",
  "soloSoak",
  "independentSecurityReview",
];

function run(label, executable, args) {
  console.log(`[release-check] ${label}`);
  const result = spawnSync(executable, args, {
    cwd: packageRoot,
    stdio: "inherit",
    // A direct npm CLI invocation is used whenever npm exposes its path. The
    // shell fallback only supports direct execution of this script on Windows.
    shell: !npmCliPath && process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
}

function confirmMainnetPreflightBlocked() {
  console.log("[release-check] confirm mainnet preflight remains blocked");
  const result = spawnSync(process.execPath, [resolve(packageRoot, "dist", "scripts", "mainnet-preflight.js")], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status === 0) throw new Error("mainnet preflight unexpectedly reported ready");
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error("mainnet preflight did not emit valid JSON");
  }
  if (parsed.ready || parsed.status !== "blocked" || JSON.stringify(parsed.missingGates) !== JSON.stringify(requiredMissingGates)) {
    throw new Error("mainnet preflight baseline changed; review every gate before release");
  }
}

try {
  run("typecheck", npmExecutable, [...npmPrefixArgs, "run", "typecheck"]);
  run("full consensus test suite", npmExecutable, [...npmPrefixArgs, "test", "--", "--ci"]);
  run("compile", npmExecutable, [...npmPrefixArgs, "run", "build"]);
  confirmMainnetPreflightBlocked();
  run("stage release bundle", npmExecutable, [...npmPrefixArgs, "run", "release:stage"]);
  run("verify release bundle", npmExecutable, [...npmPrefixArgs, "run", "release:verify", "--", "--bundle", stagedBundle]);
  run("release manifest tests", npmExecutable, [...npmPrefixArgs, "run", "test:release-manifest"]);
  console.log("[release-check] PASS — release bundle checks pass and mainnet remains fail-closed");
} catch (error) {
  console.error(`[release-check] FAIL — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
