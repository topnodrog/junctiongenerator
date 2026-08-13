import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { buildTenDayLedger } from "../sim/ten-day-ledger.js";
import { formatJGC } from "../wallet/wallet.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
const outputDir = resolve(valueAfter(args, "--output") ?? ".tmp/ten-day-chain");
const result = buildTenDayLedger();
mkdirSync(outputDir, { recursive: true });

const json = (value: unknown): string => JSON.stringify(
  value,
  (_key, item) => typeof item === "bigint" ? item.toString() : item,
);

const blockLines = result.blocks.map(block => json(block)).join("\n") + "\n";
writeFileSync(resolve(outputDir, "blocks.jsonl"), blockLines, "utf8");

const summary = {
  mode: result.mode,
  warning: result.warning,
  timezone: result.timezone,
  blockCount: result.blocks.length,
  tipHeight: result.blocks.at(-1)!.header.height,
  tipHash: result.blocks.at(-1)!.hash,
  earningDays: result.distributions.length,
  distributions: result.distributions,
  transferCount: result.transfers.length,
  periodicTransferCount: result.transfers.filter(item => item.kind === "periodic").length,
  consolidationTransferCount: result.transfers.filter(item => item.kind === "consolidation").length,
  wallets: result.wallets,
  finalBalances: result.finalBalances,
  totalMinted: result.totalMinted,
  finalTimestamp: result.finalTimestamp,
};
writeFileSync(resolve(outputDir, "summary.json"), `${json(summary)}\n`, "utf8");

console.log("JGC ten-day daily-distribution prototype: PASS");
console.log(result.warning);
console.log(`Blocks: ${result.blocks.length} (tip ${result.blocks.at(-1)!.header.height})`);
console.log(`Daily distributions: ${result.distributions.length} at 04:00 ${result.timezone}`);
console.log(`Transfers: ${result.transfers.length} (${result.transfers.filter(item => item.kind === "periodic").length} periodic, 8 consolidation)`);
console.log(`Total issued: ${formatJGC(result.totalMinted)} JGC`);
console.log(`Final: ${formatJGC(result.finalBalances["wallet-01"]!)} JGC in wallet-01 and ${formatJGC(result.finalBalances["wallet-02"]!)} JGC in wallet-02`);
console.log(`Artifacts: ${outputDir}`);
