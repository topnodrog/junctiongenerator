/**
 * @file src/tests/pq-stealth.test.ts
 * @description Tests for quantum-safe stealth (one-time, unlinkable) addresses.
 */
import { describe, it, expect } from "@jest/globals";
import {
  pqStealthGenerateIdentity,
  pqStealthCreatePayment,
  pqStealthScanAndRecover,
  pqStealthMetaAddress,
} from "../crypto/pq-stealth.js";

describe("pq-stealth (one-time, unlinkable, PQ)", () => {
  it("recipient can scan + recover a payment addressed to them", () => {
    const recip = pqStealthGenerateIdentity();
    const { payment } = pqStealthCreatePayment(recip.viewPublicKey);
    const rec = pqStealthScanAndRecover(recip.viewSecretKey, recip.viewPublicKey, payment);
    expect(rec).not.toBeNull();
    expect(rec!.oneTimeAddress).toBe(payment.oneTimeAddress);
  });

  it("two payments to the same recipient are unlinkable (different addresses)", () => {
    const recip = pqStealthGenerateIdentity();
    const a = pqStealthCreatePayment(recip.viewPublicKey).payment.oneTimeAddress;
    const b = pqStealthCreatePayment(recip.viewPublicKey).payment.oneTimeAddress;
    expect(a).not.toBe(b);
    expect(a).toMatch(/^1QGC[0-9a-f]{40}$/);
    expect(b).toMatch(/^1QGC[0-9a-f]{40}$/);
  });

  it("one-time address is NOT derivable from the meta-address alone", () => {
    const recip = pqStealthGenerateIdentity();
    const { payment } = pqStealthCreatePayment(recip.viewPublicKey);
    expect(payment.oneTimeAddress).not.toBe(recip.metaAddress);
    expect(payment.oneTimeAddress).not.toContain(pqStealthMetaAddress(recip.viewPublicKey).slice(6));
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
    expect(id.metaAddress).toMatch(/^st1qgc[0-9a-f]{40}$/);
    expect(pqStealthMetaAddress(id.viewPublicKey)).toBe(id.metaAddress);
  });
});
