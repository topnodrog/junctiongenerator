import { describe, it, expect } from "@jest/globals";
import {
  pqStealthGenerateIdentity,
  pqStealthCreatePayment,
  pqStealthScanAndRecover,
  pqStealthMetaAddress,
  pqStealthParseMetaAddress,
} from "../crypto/pq-stealth.js";
import { pqKeyPairMatches } from "../crypto/pq-signatures.js";

describe("PQ private payment scanning", () => {
  it("requires the recipient view secret to recognise a payment", () => {
    const recipient = pqStealthGenerateIdentity("11".repeat(32));
    const { payment } = pqStealthCreatePayment(recipient);
    const recovered = pqStealthScanAndRecover(recipient, payment);
    expect(recovered).not.toBeNull();
    expect(recovered!.oneTimeAddress).toBe(payment.oneTimeAddress);
    expect(pqKeyPairMatches(recovered!.spendSecretKey, recovered!.spendPublicKey)).toBe(true);
  });

  it("rejects an observer using the recipient's public data with the wrong view secret", () => {
    const recipient = pqStealthGenerateIdentity("22".repeat(32));
    const observer = pqStealthGenerateIdentity("33".repeat(32));
    const { payment } = pqStealthCreatePayment(recipient);
    const forgedIdentity = { ...recipient, viewSecretKey: observer.viewSecretKey };
    expect(pqStealthScanAndRecover(forgedIdentity, payment)).toBeNull();
  });

  it("does not give the sender a spendable seed or secret key", () => {
    const recipient = pqStealthGenerateIdentity("44".repeat(32));
    const created = pqStealthCreatePayment(recipient) as any;
    expect(created.oneTimeSeed).toBeUndefined();
    expect(created.spendSecretKey).toBeUndefined();
    expect(JSON.stringify(created.payment)).not.toContain(recipient.spendSecretKey);
  });

  it("uses a different 256-bit destination for every payment", () => {
    const recipient = pqStealthGenerateIdentity("55".repeat(32));
    const a = pqStealthCreatePayment(recipient).payment.oneTimeAddress;
    const b = pqStealthCreatePayment(recipient).payment.oneTimeAddress;
    expect(a).not.toBe(b);
    expect(a).toMatch(/^1QST[0-9a-f]{64}$/);
    expect(b).toMatch(/^1QST[0-9a-f]{64}$/);
  });

  it("rejects a wrong spend secret even with the correct view secret", () => {
    const recipient = pqStealthGenerateIdentity("66".repeat(32));
    const other = pqStealthGenerateIdentity("77".repeat(32));
    const { payment } = pqStealthCreatePayment(recipient);
    expect(pqStealthScanAndRecover({ ...recipient, spendSecretKey: other.spendSecretKey }, payment)).toBeNull();
  });

  it("rejects malformed or tampered ciphertext without throwing", () => {
    const recipient = pqStealthGenerateIdentity("88".repeat(32));
    const { payment } = pqStealthCreatePayment(recipient);
    expect(pqStealthScanAndRecover(recipient, { ...payment, kemCiphertext: "00" })).toBeNull();
    const flipped = (payment.kemCiphertext.startsWith("00") ? "01" : "00") + payment.kemCiphertext.slice(2);
    expect(pqStealthScanAndRecover(recipient, { ...payment, kemCiphertext: flipped })).toBeNull();
  });

  it("round-trips the versioned public meta-address", () => {
    const recipient = pqStealthGenerateIdentity("99".repeat(32));
    expect(pqStealthMetaAddress(recipient.viewPublicKey, recipient.spendPublicKey)).toBe(recipient.metaAddress);
    expect(pqStealthParseMetaAddress(recipient.metaAddress)).toEqual({
      scheme: recipient.scheme,
      viewPublicKey: recipient.viewPublicKey,
      spendPublicKey: recipient.spendPublicKey,
      metaAddress: recipient.metaAddress,
    });
    expect(pqStealthParseMetaAddress("st1qg2:bad:bad")).toBeNull();
  });
});
