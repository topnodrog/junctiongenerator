import { readFileSync } from "node:fs";
import { diagnose, PILOT_TERMS, verifyCard } from "../ops/system-card.js";

const args = process.argv.slice(2);
if (!args.length) {
  console.log("Local system card preview. No enrollment or workload has started.");
  console.log(JSON.stringify(diagnose(), null, 2));
  console.log(PILOT_TERMS);
} else if (args.length === 2 && args[0] === "--verify") {
  if (!verifyCard(JSON.parse(readFileSync(args[1], "utf8")))) throw new Error("Invalid system card signature or address");
  console.log("Verified the system card signature and testnet address.");
} else {
  throw new Error("Usage: soak:card [--verify <signed-card.json>]");
}
