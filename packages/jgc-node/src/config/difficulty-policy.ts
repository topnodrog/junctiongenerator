import { MAINNET_NETWORK, TESTNET_NETWORK } from "./networks.js";
import {
  calculateNextDifficultyTargetExact, decodeDifficultyBits, decodeDifficultyBitsExact,
  encodeDifficultyBits, encodeDifficultyBitsExact, RETARGET_TARGET_SECONDS,
} from "../consensus/emission.js";

/** Unlaunched v3 candidate: greatest work, then lowest canonical header hash.
 * Published pilot and legacy development networks retain first-seen ties.
 */
export function prefersChainTip(chainId: string | undefined, work: bigint, hash: string, tipWork: bigint, tipHash: string): boolean {
  return work > tipWork || (chainId === MAINNET_NETWORK.chainId && work === tipWork && hash < tipHash);
}

/** The published v2 pilot must retain its original rounding and chainwork. */
export function nextNetworkDifficultyBits(chainId: string | undefined, currentBits: number, actualTimespan: number): number {
  if (chainId === TESTNET_NETWORK.chainId) {
    const clamped = Math.max(RETARGET_TARGET_SECONDS / 4,
      Math.min(RETARGET_TARGET_SECONDS * 4, actualTimespan));
    const target = decodeDifficultyBits(currentBits) * (RETARGET_TARGET_SECONDS / clamped);
    return encodeDifficultyBits(Math.max(1, Math.round(target * 100) / 100));
  }
  return encodeDifficultyBitsExact(calculateNextDifficultyTargetExact(
    decodeDifficultyBitsExact(currentBits), actualTimespan,
  ));
}

export function networkBlockWork(chainId: string | undefined, difficultyBits: number): bigint {
  if (chainId === TESTNET_NETWORK.chainId) {
    return BigInt(Math.max(1, Math.round(decodeDifficultyBits(difficultyBits))));
  }
  const micros = decodeDifficultyBitsExact(difficultyBits);
  return micros > 0n ? micros : 1n;
}
