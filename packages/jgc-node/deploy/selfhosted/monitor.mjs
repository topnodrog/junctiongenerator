#!/usr/bin/env node
/**
 * Provider-neutral seed monitor. Replaces the Google Cloud Scheduler + GCS +
 * Gemini review monitor for self-hosted deployments: it reads only the narrow
 * public endpoints, never calls a cloud API, never uses a model to make a
 * decision, and writes local JSON evidence. Run it from cron or a systemd timer
 * on an independent machine.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
const DEFAULT_NETWORK = "jgtc-testnet-v2";

function flag(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

export function seedHttpsOrigin(seedUrl) {
  const url = new URL(seedUrl);
  if (url.protocol !== "wss:") throw new Error("seed URL must use wss://");
  if (url.username || url.password || url.search || url.hash) throw new Error("seed URL must not carry credentials or a query");
  url.protocol = "https:";
  url.pathname = "/";
  return url.origin;
}

/** Pure, injectable check used by tests and the CLI. */
export async function checkSeeds(seedUrls, fetcher = fetch, network = DEFAULT_NETWORK) {
  if (!Array.isArray(seedUrls) || seedUrls.length === 0 || seedUrls.length > 32) {
    throw new Error("expected 1..32 seed URLs");
  }
  const checkedAt = new Date().toISOString();
  const results = [];
  for (const seedUrl of seedUrls) {
    let origin;
    try {
      origin = seedHttpsOrigin(seedUrl);
    } catch (error) {
      results.push({ seedUrl, ok: false, error: error.message, checkedAt });
      continue;
    }
    try {
      const health = await fetcher(`${origin}/healthz`, { signal: AbortSignal.timeout(5000) });
      if (!health.ok) throw new Error(`healthz returned ${health.status}`);
      if ((await health.json()).ok !== true) throw new Error("healthz did not report ok");
      const explorerResponse = await fetcher(`${origin}/explorer`, { signal: AbortSignal.timeout(5000) });
      if (!explorerResponse.ok) throw new Error(`explorer returned ${explorerResponse.status}`);
      const explorer = await explorerResponse.json();
      if (explorer.network !== network) throw new Error("explorer reported a different network");
      if (explorer.issuance?.supplyConserved !== true) throw new Error("supply is not conserved");
      if (!Number.isSafeInteger(explorer.height) || explorer.height < 0) throw new Error("invalid explorer height");
      results.push({
        seedUrl, ok: true, checkedAt, height: explorer.height,
        peerCount: explorer.peerCount ?? null, health: explorer.health ?? null,
      });
    } catch (error) {
      // Do not log response bodies: they can contain operator-specific data.
      results.push({ seedUrl, ok: false, error: error?.name === "TimeoutError" ? "timeout" : String(error?.message ?? error), checkedAt });
    }
  }
  return { checkedAt, network, healthy: results.filter((r) => r.ok).length, total: results.length, results };
}

export function inventorySeeds(path) {
  if (!existsSync(path)) return [];
  const inventory = JSON.parse(readFileSync(path, "utf8"));
  return (inventory.operators ?? []).map((operator) => operator.seedUrl).filter(Boolean);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const explicit = flag("--seeds", undefined);
  const inventoryPath = resolve(flag("--inventory", resolve(here, "inventory.json")));
  const seeds = explicit
    ? explicit.split(",").map((s) => s.trim()).filter(Boolean)
    : inventorySeeds(inventoryPath);
  if (!seeds.length) {
    console.error("No seeds configured. Pass --seeds wss://... or create inventory.json from inventory.example.json.");
    process.exit(2);
  }
  const report = await checkSeeds(seeds, fetch, flag("--network", DEFAULT_NETWORK));
  console.log(JSON.stringify(report, null, 2));
  if (report.healthy !== report.total) process.exitCode = 1;
}
