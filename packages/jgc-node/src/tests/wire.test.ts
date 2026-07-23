import { MessageType, type PeerMessage } from "../types/index.js";
import {
  decodePeerMessage,
  encodePeerMessage,
  WIRE_HEADER_BYTES,
  WIRE_VERSION,
} from "../network/wire.js";

const MAGIC = 0x4a474354;

function message(): PeerMessage {
  return {
    type: MessageType.BLOCK,
    payload: {
      amount: 12345678901234567890n,
      contributions: new Map([["miner-a", 42.5]]),
    },
    timestamp: 1_700_000_000,
    senderPublicKey: "public-key",
    signature: "signature",
  };
}

describe("binary peer wire framing", () => {
  test("round-trips tagged protocol values in a binary frame", () => {
    const encoded = encodePeerMessage(message(), MAGIC);

    expect(Buffer.isBuffer(encoded)).toBe(true);
    expect(encoded.readUInt32BE(0)).toBe(MAGIC);
    expect(encoded.readUInt8(4)).toBe(WIRE_VERSION);
    expect(encoded.readUInt32BE(8)).toBe(encoded.length - WIRE_HEADER_BYTES);
    expect(decodePeerMessage(encoded, MAGIC)).toEqual(message());
  });

  test("rejects a frame from another network", () => {
    expect(decodePeerMessage(encodePeerMessage(message(), MAGIC), 0xd9b4bef9)).toBeNull();
  });

  test("rejects corrupted payload bytes", () => {
    const encoded = encodePeerMessage(message(), MAGIC);
    encoded[encoded.length - 1] ^= 0xff;
    expect(decodePeerMessage(encoded, MAGIC)).toBeNull();
  });

  test.each([
    ["unsupported version", (frame: Buffer) => frame.writeUInt8(WIRE_VERSION + 1, 4)],
    ["unknown command", (frame: Buffer) => frame.writeUInt8(255, 5)],
    ["non-zero reserved bits", (frame: Buffer) => frame.writeUInt16BE(1, 6)],
    ["false payload length", (frame: Buffer) => frame.writeUInt32BE(1, 8)],
  ])("rejects %s", (_label, mutate) => {
    const encoded = encodePeerMessage(message(), MAGIC);
    mutate(encoded);
    expect(decodePeerMessage(encoded, MAGIC)).toBeNull();
  });

  test("rejects truncated and padded frames", () => {
    const encoded = encodePeerMessage(message(), MAGIC);
    expect(decodePeerMessage(encoded.subarray(0, encoded.length - 1), MAGIC)).toBeNull();
    expect(decodePeerMessage(Buffer.concat([encoded, Buffer.from([0])]), MAGIC)).toBeNull();
  });

  test("rejects invalid required metadata even with a valid frame checksum", () => {
    const invalid = { ...message(), timestamp: Number.NaN };
    const encoded = encodePeerMessage(invalid, MAGIC);
    expect(decodePeerMessage(encoded, MAGIC)).toBeNull();
  });
});
