/**
 * @file src/tests/pq-stealth.test.ts
 * @description Regression tests for experimental KEM-derived destinations.
 */
import { describe, it, expect } from "@jest/globals";
import { pqGenerateKeyPair, pqSignHash, pqVerifyHashSignature } from "../crypto/pq-signatures.js";
import {
  pqStealthGenerateIdentity,
  pqStealthCreatePayment,
  pqStealthScanAndRecover,
  pqStealthMetaAddress,
} from "../crypto/pq-stealth.js";

describe("pq-stealth experimental V2 destinations", () => {
  it("recipient can scan + recover a payment addressed to them", () => {
    const recip = pqStealthGenerateIdentity();
    const { payment } = pqStealthCreatePayment(recip.viewPublicKey);
    const rec = pqStealthScanAndRecover(recip.viewSecretKey, recip.viewPublicKey, payment);
    expect(rec).not.toBeNull();
    expect(rec!.oneTimeAddress).toBe(payment.oneTimeAddress);
  });

  it("two payments to the same recipient use different addresses", () => {
    const recip = pqStealthGenerateIdentity();
    const a = pqStealthCreatePayment(recip.viewPublicKey).payment.oneTimeAddress;
    const b = pqStealthCreatePayment(recip.viewPublicKey).payment.oneTimeAddress;
    expect(a).not.toBe(b);
    expect(a).toMatch(/^1QGC[0-9a-f]{40}$/);
    expect(b).toMatch(/^1QGC[0-9a-f]{40}$/);
  });

  it("uses distinct meta-address and payment address formats", () => {
    const recip = pqStealthGenerateIdentity();
    const { payment } = pqStealthCreatePayment(recip.viewPublicKey);
    expect(payment.oneTimeAddress).not.toBe(recip.metaAddress);
    expect(payment.oneTimeAddress).toMatch(/^1QGC[0-9a-f]{40}$/);
    expect(recip.metaAddress).toMatch(/^st2qgc[0-9a-f]{64}$/);
  });

  it("a third party cannot recover someone else's payment", () => {
    const recip = pqStealthGenerateIdentity();
    const eavesdropper = pqStealthGenerateIdentity();
    const { payment } = pqStealthCreatePayment(recip.viewPublicKey);
    const rec = pqStealthScanAndRecover(eavesdropper.viewSecretKey, eavesdropper.viewPublicKey, payment);
    expect(rec).toBeNull();
  });

  it("recovered one-time key controls the one-time address", () => {
    const recip = pqStealthGenerateIdentity();
    const { payment } = pqStealthCreatePayment(recip.viewPublicKey);
    const rec = pqStealthScanAndRecover(recip.viewSecretKey, recip.viewPublicKey, payment)!;
    // the recovered public key must derive the very address funds were sent to
    expect(rec.oneTimeAddress).toBe(payment.oneTimeAddress);
    expect(rec.oneTimeSecretKey.length).toBeGreaterThan(0);
  });

  it("meta-address format is stable + well-formed", () => {
    const id = pqStealthGenerateIdentity();
    expect(id.metaAddress).toMatch(/^st2qgc[0-9a-f]{64}$/);
    expect(pqStealthMetaAddress(id.viewPublicKey)).toBe(id.metaAddress);
  });

  it("rejects an observer using the real recipient public key with no or wrong secret", () => {
    const recipient = pqStealthGenerateIdentity();
    const attacker = pqStealthGenerateIdentity();
    const { payment } = pqStealthCreatePayment(recipient.viewPublicKey);
    for (const secret of ["", "00".repeat(2400), attacker.viewSecretKey]) {
      expect(pqStealthScanAndRecover(secret, recipient.viewPublicKey, payment)).toBeNull();
    }
  });

  it("rejects legacy, malformed, and modified public payment records", () => {
    const recipient = pqStealthGenerateIdentity();
    const { payment } = pqStealthCreatePayment(recipient.viewPublicKey);
    const modified = (payment.kemCiphertext.startsWith("00") ? "01" : "00") + payment.kemCiphertext.slice(2);
    const records = [null, {}, { ...payment, version: 1 },
      { ...payment, kemCiphertext: "zz".repeat(1088) },
      { ...payment, kemCiphertext: payment.kemCiphertext.slice(2) },
      { ...payment, kemCiphertext: modified },
      { ...payment, oneTimeAddress: "1QGC" + "00".repeat(20) }];
    for (const record of records) {
      expect(pqStealthScanAndRecover(recipient.viewSecretKey, recipient.viewPublicKey, record as any)).toBeNull();
    }
  });

  it("restores from a backup seed and recovers a working ML-DSA spending key", () => {
    const recipient = pqStealthGenerateIdentity("ab".repeat(32));
    expect(pqStealthGenerateIdentity("ab".repeat(32))).toEqual(recipient);
    const { payment, oneTimeSeed } = pqStealthCreatePayment(recipient.viewPublicKey);
    const recovered = pqStealthScanAndRecover(recipient.viewSecretKey, recipient.viewPublicKey, payment)!;
    expect(recovered.oneTimeSecretKey).toBe(pqGenerateKeyPair(oneTimeSeed).privateKey);
    const digest = new Uint8Array(32).fill(42);
    expect(pqVerifyHashSignature(pqSignHash(recovered.oneTimeSecretKey, digest), digest, recovered.oneTimePublicKey)).toBe(true);
  });

  it("rejects invalid identity seeds and old ML-DSA view keys", () => {
    for (const seed of ["", "gg".repeat(32), "ab".repeat(31)]) {
      expect(() => pqStealthGenerateIdentity(seed)).toThrow();
    }
    expect(() => pqStealthCreatePayment(pqGenerateKeyPair().publicKey)).toThrow();
    expect(() => pqStealthMetaAddress("ab")).toThrow();
  });
});
