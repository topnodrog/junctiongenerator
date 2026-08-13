#!/usr/bin/env node
import { evaluateFlyCostGuard, parseFlyJson } from "../ops/fly-cost-guard.js";
import { runCommand } from "../ops/pilot-evidence.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
const app = valueAfter(args, "--app") ?? process.env.JGC_FLY_APP ?? "jgc-testnet-seed-b";
const flyctl = process.platform === "win32" ? "flyctl.exe" : "flyctl";

const [machinesJson, volumesJson] = await Promise.all([
  runCommand(flyctl, ["machines", "list", "--app", app, "--json"], 30_000),
  runCommand(flyctl, ["volumes", "list", "--app", app, "--json"], 30_000),
]);

const result = evaluateFlyCostGuard(
  parseFlyJson(machinesJson, "machines"),
  parseFlyJson(volumesJson, "volumes"),
);

console.log(`JGC Fly resource-cost guard: ${result.pass ? "PASS" : "FAIL"}`);
for (const item of result.checks) {
  console.log(`${item.pass ? "PASS" : "FAIL"} ${item.id}: ${item.detail}`);
}
if (!result.pass) process.exitCode = 1;
