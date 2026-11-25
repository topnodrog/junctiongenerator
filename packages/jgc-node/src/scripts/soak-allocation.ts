import { readFileSync } from "node:fs";
import { BLOCKS_PER_EPOCH, INITIAL_BLOCK_REWARD_SATOSHIS } from "../consensus/emission.js";
import { formatJGC } from "../wallet/wallet.js";
import { isQuantumAddress } from "../crypto/pq.js";

// Each input represents ONE coordinator-reviewed UTC day. The output is a
// proposal worksheet; this command has no wallet, chain or issuance access.
const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (typeof input.day !== "string" || !/^\d{4}-\d\d-\d\d$/.test(input.day) ||
    new Date(input.day).toISOString().slice(0, 10) !== input.day ||
    !Array.isArray(input.addresses) || !input.addresses.length ||
    input.addresses.some((a: unknown) => typeof a !== "string" || !isQuantumAddress(a)) ||
    new Set(input.addresses).size !== input.addresses.length) {
  throw new Error("Expected one UTC day and distinct eligible testnet addresses");
}
const addresses: string[] = input.addresses.sort();
const count = BigInt(addresses.length);
const pool = INITIAL_BLOCK_REWARD_SATOSHIS * BigInt(BLOCKS_PER_EPOCH);
console.log(JSON.stringify({ status: "proposal-only", day: input.day, pool: formatJGC(pool),
  allocations: addresses.map((address, i) => ({ address,
    hypotheticalJGC: formatJGC(pool / count + (BigInt(i) < pool % count ? 1n : 0n)) })) }, null, 2));
