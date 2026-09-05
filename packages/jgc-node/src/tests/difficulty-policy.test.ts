import { nextNetworkDifficultyBits, networkBlockWork } from "../config/difficulty-policy.js";
import { MAINNET_NETWORK, TESTNET_NETWORK } from "../config/networks.js";
import { decodeDifficultyBits, encodeDifficultyBits } from "../consensus/emission.js";

describe("published JGTC v2 difficulty compatibility", () => {
  test("retains the published release vector across the first adjustment", () => {
    // v0.1.0: a 1000-TFLOPS target over 2015 ten-minute intervals rounds to 1000.50.
    expect(nextNetworkDifficultyBits(TESTNET_NETWORK.chainId, 71015114, 1_209_000)).toBe(71017067);
    expect(nextNetworkDifficultyBits(MAINNET_NETWORK.chainId, 71015114, 1_209_000)).toBe(71017052);
  });

  test("matches the v0.1.0 policy over successive slow and fast adjustments", () => {
    let oldBits = encodeDifficultyBits(1000);
    let newBits = oldBits;
    for (const span of [1_209_000, 1_000_003, 300_000, 6_000_000, 1_209_600, 900_001]) {
      const clamped = Math.max(302_400, Math.min(4_838_400, span));
      oldBits = encodeDifficultyBits(Math.max(1, Math.round(decodeDifficultyBits(oldBits) * (1_209_600 / clamped) * 100) / 100));
      newBits = nextNetworkDifficultyBits(TESTNET_NETWORK.chainId, newBits, span);
      expect(newBits).toBe(oldBits);
    }
  });

  test("retains pilot chainwork units while candidate networks use exact units", () => {
    expect(networkBlockWork(TESTNET_NETWORK.chainId, 71015114)).toBe(1000n);
    expect(networkBlockWork(TESTNET_NETWORK.chainId, 71017067)).toBe(1000n);
    expect(networkBlockWork(MAINNET_NETWORK.chainId, 71015114)).toBe(1000000000n);
  });
});
