/**
 * @file src/tests/pq-signatures.test.ts
 * @description Tests for the post-quantum (ML-DSA-65) signature layer.
 */
import { describe, it, expect } from "@jest/globals";
import {
  pqGenerateKeyPair,
  pqAddressFromPublicKey,
  pqSignContribution,
  pqVerifyContributionSignature,
  pqSignHash,
  pqVerifyHashSignature,
  pqIsValidPublicKey,
  pqIsValidSignature,
  pqScriptPubKey,
  pqHashFromScriptPubKey,
  PQ_SIZES,
} from "../crypto/pq-signatures.js";
import { createHash } from "crypto";

const seedA = "aa".repeat(32);
const seedB = "bb".repeat(32);

function fakeContribution(overrides: any = {}) {
  return {
    minerAddress: "",
    publicKey: "",
    signature: "",
    proof: {
      taskCommitment: "cc".repeat(32),
      circuitId: "CIRCUIT_AI_INFERENCE_V1",
      tflopsWeight: 42,
    },
    ...overrides,
  };
}

describe("pq-signatures (ML-DSA-65)", () => {
  it("generates deterministic keypairs from a seed", () => {
    const a1 = pqGenerateKeyPair(seedA);
    const a2 = pqGenerateKeyPair(seedA);
    expect(a1.publicKey).toBe(a2.publicKey);
    expect(a1.privateKey).toBe(a2.privateKey);
    expect(Buffer.from(a1.publicKey, "hex").length).toBe(PQ_SIZES.publicKey);
    expect(Buffer.from(a1.privateKey, "hex").length).toBe(PQ_SIZES.secretKey);
  });

  it("different seeds → different keys", () => {
    expect(pqGenerateKeyPair(seedA).publicKey).not.toBe(pqGenerateKeyPair(seedB).publicKey);
  });

  it("derives a 1QGC address from the public key", () => {
    const { publicKey } = pqGenerateKeyPair(seedA);
    const addr = pqAddressFromPublicKey(publicKey);
    expect(addr.startsWith("1QGC")).toBe(true);
    expect(addr).toMatch(/^1QGC[0-9a-f]{40}$/);
  });

  it("signs + verifies a contribution; payee bound to key", () => {
    const { privateKey, publicKey } = pqGenerateKeyPair(seedA);
    const c = fakeContribution({ publicKey, minerAddress: pqAddressFromPublicKey(publicKey) });
    c.signature = pqSignContribution(privateKey, c as any, 100);
    expect(pqVerifyContributionSignature(c as any, 100)).toBe(true);
  });

  it("rejects a contribution signed for a different height (replay)", () => {
    const { privateKey, publicKey } = pqGenerateKeyPair(seedA);
    const c = fakeContribution({ publicKey, minerAddress: pqAddressFromPublicKey(publicKey) });
    c.signature = pqSignContribution(privateKey, c as any, 100);
    expect(pqVerifyContributionSignature(c as any, 101)).toBe(false);
  });

  it("rejects when payee address does not match the signing key", () => {
    const { privateKey, publicKey } = pqGenerateKeyPair(seedA);
    const other = pqGenerateKeyPair(seedB);
    // signed by A but payee is B's address
    const c = fakeContribution({ publicKey, minerAddress: pqAddressFromPublicKey(other.publicKey) });
    c.signature = pqSignContribution(privateKey, c as any, 100);
    expect(pqVerifyContributionSignature(c as any, 100)).toBe(false);
  });

  it("rejects tampered work commitment", () => {
    const { privateKey, publicKey } = pqGenerateKeyPair(seedA);
    const c = fakeContribution({ publicKey, minerAddress: pqAddressFromPublicKey(publicKey) });
    c.signature = pqSignContribution(privateKey, c as any, 100);
    c.proof.tflopsWeight = 99999; // inflate claimed work after signing
    expect(pqVerifyContributionSignature(c as any, 100)).toBe(false);
  });

  it("rejects malformed keys and signatures without throwing", () => {
    const c = fakeContribution({ publicKey: "zz", minerAddress: "1QGC" + "00".repeat(20), signature: "12" });
    expect(pqVerifyContributionSignature(c as any, 1)).toBe(false);
    expect(pqIsValidPublicKey("abcd")).toBe(false);
    expect(pqIsValidSignature("ff".repeat(10))).toBe(false);
  });

  it("signHash/verifyHashSignature round-trips and rejects wrong key", () => {
    const { privateKey, publicKey } = pqGenerateKeyPair(seedA);
    const other = pqGenerateKeyPair(seedB);
    const h = Uint8Array.from(createHash("sha3-256").update("msg").digest());
    const sig = pqSignHash(privateKey, h);
    expect(pqVerifyHashSignature(sig, h, publicKey)).toBe(true);
    expect(pqVerifyHashSignature(sig, h, other.publicKey)).toBe(false);
  });

  it("PQ scriptPubKey round-trips the key hash", () => {
    const { publicKey } = pqGenerateKeyPair(seedA);
    const spk = pqScriptPubKey(publicKey);
    const extracted = pqHashFromScriptPubKey(spk);
    expect(extracted).not.toBeNull();
    expect(spk).toContain(extracted!);
    expect(pqHashFromScriptPubKey("deadbeef")).toBeNull();
  });
});
