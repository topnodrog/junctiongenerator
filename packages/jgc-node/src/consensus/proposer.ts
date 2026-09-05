import { createHash } from "crypto";
import type { BlockHeight, Hash256 } from "../types/index.js";
import { CanonicalWriter, compareCanonicalBytes, consensusUInt } from "../protocol/canonical.js";
import type { ValidatorBond, ValidatorStakeSnapshot } from "./validator-bonds.js";

/** Domain tag for the consensus proposer draw. Changing it changes the schedule. */
export const PROPOSER_DRAW_DOMAIN = "JGC-BLOCK-PROPOSER/V1";

const HASH_HEX = /^[0-9a-f]{64}$/i;

function assertHash(value: Hash256, label: string): void {
  if (!HASH_HEX.test(value)) throw new Error(`${label} must be a 32-byte hex hash`);
}

function sortedPositiveValidators(snapshot: ValidatorStakeSnapshot): ValidatorBond[] {
  assertHash(snapshot.root, "stake snapshot root");
  consensusUInt(snapshot.height, "stake snapshot height");

  const seen = new Set<string>();
  const validators = snapshot.validators.map((bond) => {
    if (bond.validatorId.length === 0) throw new Error("validator id must not be empty");
    if (seen.has(bond.validatorId)) throw new Error(`duplicate validator id: ${bond.validatorId}`);
    seen.add(bond.validatorId);
    if (bond.bondedStake < 0n) throw new Error("validator stake must not be negative");
    return bond;
  }).filter((bond) => bond.bondedStake > 0n);

  validators.sort((a, b) => compareCanonicalBytes(a.validatorId, b.validatorId));
  return validators;
}

/**
 * Compute the unbiased deterministic draw used for a block proposer.
 *
 * The draw commits to the previous block, target height, and the exact stake
 * snapshot root/height. Every node therefore selects from the same schedule
 * after validating the same chain state.
 */
export function proposerDraw(
  snapshot: ValidatorStakeSnapshot,
  previousBlockHash: Hash256,
  height: BlockHeight,
): bigint {
  assertHash(previousBlockHash, "previous block hash");
  const writer = new CanonicalWriter()
    .domain(PROPOSER_DRAW_DOMAIN)
    .build();
  const context = new CanonicalWriter()
    .string(previousBlockHash.toLowerCase())
    .u64(height, "block height")
    .string(snapshot.root.toLowerCase())
    .u64(snapshot.height, "stake snapshot height")
    .build();
  return BigInt(`0x${createHash("sha3-256").update(writer).update(context).digest("hex")}`);
}

/** Select the validator id that owns the stake-weighted draw interval. */
export function selectBlockProposer(
  snapshot: ValidatorStakeSnapshot,
  previousBlockHash: Hash256,
  height: BlockHeight,
): string | null {
  const validators = sortedPositiveValidators(snapshot);
  if (validators.length === 0) return null;

  const totalStake = validators.reduce((sum, bond) => sum + bond.bondedStake, 0n);
  const draw = proposerDraw(snapshot, previousBlockHash, height) % totalStake;
  let cumulative = 0n;
  for (const validator of validators) {
    cumulative += validator.bondedStake;
    if (draw < cumulative) return validator.validatorId;
  }
  // The loop is exhaustive because draw is reduced modulo totalStake.
  throw new Error("proposer draw did not resolve to a validator");
}

/** Return true only when a proposed block names the scheduled validator. */
export function isExpectedBlockProposer(
  snapshot: ValidatorStakeSnapshot,
  previousBlockHash: Hash256,
  height: BlockHeight,
  validatorId: string,
): boolean {
  return selectBlockProposer(snapshot, previousBlockHash, height) === validatorId;
}
