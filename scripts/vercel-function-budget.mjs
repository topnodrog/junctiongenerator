#!/usr/bin/env node
/**
 * Enforce the Vercel Hobby Serverless Function budget in CI.
 *
 * Vercel auto-deploys every supported source file in the ROOT `api/`
 * directory as its own Serverless Function, including helpers, tests and
 * migration scripts. Hobby allows 12 per deployment. This repository keeps all
 * Cloudflare Worker source in `worker/`, so the intended count is ZERO.
 *
 * Vercel ignores files/directories starting with `_` or `.` and `*.d.ts`
 * inside `api/`; those are skipped here too.
 *
 * Usage (from the repository root):
 *   node scripts/vercel-function-budget.mjs            # human-readable, --max 0
 *   node scripts/vercel-function-budget.mjs --max 1    # allow one function
 *   node scripts/vercel-function-budget.mjs --json     # machine-readable
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HOBBY_LIMIT = 12;
const SUPPORTED_EXTENSIONS = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".jsx", ".tsx",
  ".py", ".go", ".rb", ".php",
]);
const IGNORED_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build"]);

const root = fileURLToPath(new URL("../", import.meta.url));
const apiDir = join(root, "api");

function ignored(name) {
  return name.startsWith("_") || name.startsWith(".") || IGNORED_DIRS.has(name);
}

function extname(name) {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

function collect(dir, found) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (error) {
    if (error && error.code === "ENOENT") return found;
    throw error;
  }
  for (const name of entries) {
    if (ignored(name)) continue;
    const full = join(dir, name);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      collect(full, found);
      continue;
    }
    if (!stats.isFile()) continue;
    if (name.endsWith(".d.ts")) continue;
    if (!SUPPORTED_EXTENSIONS.has(extname(name))) continue;
    found.push(relative(root, full).split(sep).join("/"));
  }
  return found;
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] !== undefined ? args[at + 1] : fallback;
};
const maxRaw = flag("--max", "0");
const max = Number(maxRaw);
if (!Number.isInteger(max) || max < 0 || max > HOBBY_LIMIT) {
  console.error(`[vercel-budget] --max must be an integer from 0 to ${HOBBY_LIMIT}, got "${maxRaw}"`);
  process.exit(2);
}
const json = args.includes("--json");
const files = collect(apiDir, []).sort();
const ok = files.length <= max;
const result = {
  ok,
  count: files.length,
  max,
  hobbyLimit: HOBBY_LIMIT,
  headroom: HOBBY_LIMIT - files.length,
  files,
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`[vercel-budget] root api/ functions: ${files.length} (max ${max}, Hobby limit ${HOBBY_LIMIT})`);
  if (files.length) console.log(`[vercel-budget] ${files.map((f) => `  - ${f}`).join("\n")}`);
  if (ok) {
    console.log(`[vercel-budget] PASS — ${HOBBY_LIMIT - files.length} slots of headroom remain`);
  } else {
    console.error(`[vercel-budget] FAIL — Vercel would create ${files.length} functions from api/.`);
    console.error("[vercel-budget] Move Cloudflare Worker source to worker/ (see docs/VERCEL_FUNCTION_BUDGET.md).");
  }
}
process.exitCode = ok ? 0 : 1;
