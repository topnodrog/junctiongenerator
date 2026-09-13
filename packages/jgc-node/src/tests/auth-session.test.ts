import { AuthSession } from "../network/auth-session.js";
import { MessageType as MT, type PeerMessage } from "../types/index.js";
import { pqGenerateKeyPair, pqSignHash } from "../crypto/pq-signatures.js";
import { encodePeerMessage, decodePeerMessage, peerMessageSignatureHash } from "../network/wire.js";

const a = pqGenerateKeyPair("51".repeat(32));
const b = pqGenerateKeyPair("52".repeat(32));
const magic = 0x12345678;
const message = (type: MT, payload: unknown = {}): PeerMessage => ({ type, payload, timestamp: 0, senderPublicKey: "", signature: "" });
const wire = (msg: PeerMessage): PeerMessage => decodePeerMessage(encodePeerMessage(msg, magic), magic)!;
function pair() {
  const left = new AuthSession(a.publicKey, a.privateKey, magic);
  const right = new AuthSession(b.publicKey, b.privateKey, magic);
  left.open(wire(right.seal(message(MT.VERSION))!));
  right.open(wire(left.seal(message(MT.VERSION))!));
  const ackL = left.seal(message(MT.VERACK))!;
  const ackR = right.seal(message(MT.VERACK))!;
  left.open(wire(ackR)); right.open(wire(ackL));
  return { left, right, ackL };
}
function resign(msg: PeerMessage): PeerMessage {
  return { ...msg, signature: pqSignHash(a.privateKey, peerMessageSignatureHash(msg, magic)) };
}

describe("connection-bound peer authentication", () => {
  test("round trips application data through the actual wire codec after mutual proof", () => {
    const { left, right } = pair();
    expect(left.authenticatedPublicKey).toBe(b.publicKey);
    expect(right.authenticatedPublicKey).toBe(a.publicKey);
    const payload = { amount: 99n, items: new Map([["a", 2]]) };
    expect(right.open(wire(left.seal(message(MT.TX, payload))!)).payload).toEqual(payload);
  });

  test("rejects duplicates, skipped sequences, and repeated VERACK", () => {
    const { left, right, ackL } = pair();
    const first = left.seal(message(MT.PING))!;
    const second = left.seal(message(MT.PING))!;
    expect(() => right.open(second)).toThrow("sequence");
    right.open(first);
    expect(() => right.open(first)).toThrow("sequence");
    right.open(second);
    expect(() => right.open(ackL)).toThrow("sequence");
  });

  test("does not forget early messages as traffic accumulates", () => {
    const { left, right } = pair();
    const first = left.seal(message(MT.PING))!;
    right.open(first);
    for (let i = 0; i < 128; i++) right.open(left.seal(message(MT.PING))!);
    expect(() => right.open(first)).toThrow("sequence");
  });

  test("rejects cross-connection messages, reflection and signed stale timestamps", () => {
    const { left, right } = pair();
    const first = left.seal(message(MT.PING))!;
    expect(() => pair().right.open(first)).toThrow("session");
    expect(() => left.open(first)).toThrow("session");
    expect(() => right.open(resign({ ...first, timestamp: Math.floor(Date.now() / 1000) - 901 }))).toThrow("signature");
    expect(() => right.open(resign({ ...first, timestamp: Math.floor(Date.now() / 1000) + 121 }))).toThrow("signature");
    right.open(first);
  });

  test("rejects altered envelopes, malformed signatures and cross-network signatures", () => {
    const { left, right } = pair();
    const first = left.seal(message(MT.PING))!;
    expect(() => right.open({ ...first, type: MT.TX })).toThrow("signature");
    expect(() => right.open({ ...first, signature: "ab".repeat(10000) })).toThrow("signature");
    expect(() => right.open({ ...first, signature: pqSignHash(a.privateKey, peerMessageSignatureHash(first, magic + 1)) })).toThrow("signature");
    right.open(first);
  });

  test("requires both challenges before data and rejects self-connections", () => {
    const left = new AuthSession(a.publicKey, a.privateKey, magic);
    expect(left.seal(message(MT.TX))).toBeUndefined();
    const same = new AuthSession(a.publicKey, a.privateKey, magic);
    expect(() => left.open(same.seal(message(MT.VERSION))!)).toThrow("challenge");
    const right = new AuthSession(b.publicKey, b.privateKey, magic);
    left.open(right.seal(message(MT.VERSION))!);
    expect(left.ready).toBe(false);
    expect(left.authenticatedPublicKey).toBeUndefined();
    expect(left.seal(message(MT.TX))).toBeUndefined();
    expect(() => left.open(right.seal(message(MT.VERSION))!)).toThrow("challenge");
  });
});
