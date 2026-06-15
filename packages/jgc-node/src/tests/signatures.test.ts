/**
 * @file src/tests/signatures.test.ts
 * @description Tests for secp256k1 compute-contribution signatures.
 */

import {
  generateKeyPair, addressFromPublicKey, signContribution, verifyContributionSignature,
} from "../crypto/signatures.js";
import { ComputeTaskType } from "../types/index.js";
import type { MinerComputeContribution } from "../types/index.js";

function makeContribution(publicKey: string, minerAddress: string): MinerComputeContribution {
  return {
    minerAddress,
    proof: {
      taskCommitment:   "ab".repeat(32),
      proofBytes:       "AAAA",
      circuitId:        "CIRCUIT_CONV1D_V1",
      publicInputs:     ["1", "2", "3"],
      tflopsWeight:     104,
      taskType:         ComputeTaskType.AI_INFERENCE,
      computeStartedAt: "2026-06-14T00:00:00Z",
    },
    signature: "",
    publicKey,
  };
}

describe("secp256k1 contribution signatures", () => {
  test("keypair + deterministic key-derived address", () => {
    const kp = generateKeyPair();
    expect(kp.privateKey).toMatch(/^[0-9a-f]{64}$/);
    expect(kp.publicKey).toMatch(/^(02|03)[0-9a-f]{64}$/);   // compressed point
    const addr = addressFromPublicKey(kp.publicKey);
    expect(addr.startsWith("1JGC")).toBe(true);
    expect(addressFromPublicKey(kp.publicKey)).toBe(addr);   // deterministic
  });

  test("sign then verify succeeds", () => {
    const kp = generateKeyPair();
    const c = makeContribution(kp.publicKey, addressFromPublicKey(kp.publicKey));
    c.signature = signContribution(kp.privateKey, c, 7);
    expect(verifyContributionSignature(c, 7).ok).toBe(true);
  });

  test("wrong height fails (sighash binds the block height)", () => {
    const kp = generateKeyPair();
    const c = makeContribution(kp.publicKey, addressFromPublicKey(kp.publicKey));
    c.signature = signContribution(kp.privateKey, c, 7);
    expect(verifyContributionSignature(c, 8).ok).toBe(false);
  });

  test("tampered tflopsWeight fails (sighash binds the claim)", () => {
    const kp = generateKeyPair();
    const c = makeContribution(kp.publicKey, addressFromPublicKey(kp.publicKey));
    c.signature = signContribution(kp.privateKey, c, 7);
    c.proof.tflopsWeight = 999;
    expect(verifyContributionSignature(c, 7).ok).toBe(false);
  });

  test("address not derived from key is rejected", () => {
    const kp = generateKeyPair();
    const c = makeContribution(kp.publicKey, "1JGCnotaderivedaddress00000000000000000000");
    c.signature = signContribution(kp.privateKey, c, 7);
    const r = verifyContributionSignature(c, 7);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not derived/);
  });

  test("forged (zero) signature is rejected", () => {
    const kp = generateKeyPair();
    const c = makeContribution(kp.publicKey, addressFromPublicKey(kp.publicKey));
    c.signature = "00".repeat(64);
    expect(verifyContributionSignature(c, 7).ok).toBe(false);
  });

  test("signature by a different key is rejected (no payout theft)", () => {
    const victim = generateKeyPair();
    const attacker = generateKeyPair();
    const c = makeContribution(victim.publicKey, addressFromPublicKey(victim.publicKey));
    // Attacker signs with their own key but claims the victim's address/key.
    c.signature = signContribution(attacker.privateKey, c, 7);
    expect(verifyContributionSignature(c, 7).ok).toBe(false);
  });

  test("malleated (high-S) signature is rejected", () => {
    const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
    const kp = generateKeyPair();
    const c = makeContribution(kp.publicKey, addressFromPublicKey(kp.publicKey));
    c.signature = signContribution(kp.privateKey, c, 7);
    expect(verifyContributionSignature(c, 7).ok).toBe(true);

    // Malleate: s → n − s (same r). This is the OTHER valid ECDSA signature for
    // the same message; rejecting it removes signature/txid malleability.
    const r = c.signature.slice(0, 64);
    const s = BigInt("0x" + c.signature.slice(64));
    const malleated = r + (N - s).toString(16).padStart(64, "0");
    expect(malleated).not.toBe(c.signature);
    c.signature = malleated;
    const res = verifyContributionSignature(c, 7);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/high-S/i);
  });
});
