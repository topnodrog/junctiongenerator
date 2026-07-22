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
  pqIsValidPrivateKey,
  pqIsValidSignature,
  pqKeyPairMatches,
  pqContributionSigHash,
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

  it("derives a suite-2 address from the public key", () => {
    const { publicKey } = pqGenerateKeyPair(seedA);
    const addr = pqAddressFromPublicKey(publicKey);
    expect(addr.startsWith("1QG2")).toBe(true);
    expect(addr).toMatch(/^1QG2[0-9a-f]{64}$/);
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
    const c = fakeContribution({ publicKey: "zz", minerAddress: "1QG2" + "00".repeat(32), signature: "12" });
    expect(pqVerifyContributionSignature(c as any, 1)).toBe(false);
    expect(pqIsValidPublicKey("abcd")).toBe(false);
    expect(pqIsValidSignature("ff".repeat(10))).toBe(false);
  });

  it("binds the complete proof envelope and public inputs", () => {
    const { privateKey, publicKey } = pqGenerateKeyPair(seedA);
    const c = fakeContribution({
      publicKey,
      minerAddress: pqAddressFromPublicKey(publicKey),
      proof: { ...fakeContribution().proof, proofBytes: "proof-a", publicInputs: ["a", "42", "100"] },
    });
    c.signature = pqSignContribution(privateKey, c as any, 100);
    c.proof.proofBytes = "proof-b";
    expect(pqVerifyContributionSignature(c as any, 100)).toBe(false);
  });

  it("validates secret key size and proves imported key halves match", () => {
    const a = pqGenerateKeyPair(seedA);
    const b = pqGenerateKeyPair(seedB);
    expect(pqIsValidPrivateKey(a.privateKey)).toBe(true);
    expect(pqIsValidPrivateKey("aa")).toBe(false);
    expect(pqKeyPairMatches(a.privateKey, a.publicKey)).toBe(true);
    expect(pqKeyPairMatches(a.privateKey, b.publicKey)).toBe(false);
  });

  it("rejects malformed deterministic seeds", () => {
    expect(() => pqGenerateKeyPair("aa")).toThrow();
    expect(() => pqGenerateKeyPair("GG".repeat(32))).toThrow();
  });

  it("canonical contribution encoding cannot collide through delimiters", () => {
    const a = fakeContribution({ minerAddress: "a|b", proof: { ...fakeContribution().proof, taskCommitment: "c" } });
    const b = fakeContribution({ minerAddress: "a", proof: { ...fakeContribution().proof, taskCommitment: "b|c" } });
    expect(Buffer.from(pqContributionSigHash(a as any, 10)).toString("hex"))
      .not.toBe(Buffer.from(pqContributionSigHash(b as any, 10)).toString("hex"));
  });

  it("signHash/verifyHashSignature round-trips and rejects wrong key", () => {
    const { privateKey, publicKey } = pqGenerateKeyPair(seedA);
    const other = pqGenerateKeyPair(seedB);
    const h = Uint8Array.from(createHash("sha3-256").update("msg").digest());
    const sig = pqSignHash(privateKey, h);
    expect(pqVerifyHashSignature(sig, h, publicKey)).toBe(true);
    expect(pqVerifyHashSignature(sig, h, other.publicKey)).toBe(false);
    expect(pqVerifyHashSignature(sig, new Uint8Array(31), publicKey)).toBe(false);
    expect(() => pqSignHash(privateKey, new Uint8Array(31))).toThrow();
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
