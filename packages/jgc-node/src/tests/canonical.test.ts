import {
  CanonicalWriter,
  compareCanonicalBytes,
  consensusUInt,
} from "../protocol/canonical.js";
import { createGenesisBlock, serializeBlockHeader, deserializeBlockHeader } from "../consensus/block.js";

describe("portable consensus primitives", () => {
  test("rejects ambiguous header fields instead of truncating them", () => {
    const header = createGenesisBlock().header;
    for (const changed of [{ nonce: 1.5 }, { timestamp: Number.MAX_SAFE_INTEGER + 1 }, { height: -1 }, { prevHash: "00" }, { prevHash: header.prevHash + "zz" }]) {
      expect(() => serializeBlockHeader({ ...header, ...changed })).toThrow();
    }
    const encoded = serializeBlockHeader(header);
    expect(deserializeBlockHeader(encoded)).toEqual(header);
    expect(() => deserializeBlockHeader(Buffer.concat([encoded, Buffer.from([0])]))).toThrow();
    const reserved = Buffer.from(encoded); reserved[191] = 1;
    expect(() => deserializeBlockHeader(reserved)).toThrow(/reserved/);
    const unsafe = Buffer.from(encoded); unsafe.writeBigUInt64LE(1n << 53n, 164);
    expect(() => deserializeBlockHeader(unsafe)).toThrow(/safe integer/);
  });
  test("orders UTF-8 bytes without locale or ICU behavior", () => {
    const values = ["z", "ä", "a", "aa"];
    expect(values.sort(compareCanonicalBytes)).toEqual(["a", "aa", "z", "ä"]);
  });

  test("encodes fixed-width integers and length-prefixed strings deterministically", () => {
    const bytes = new CanonicalWriter()
      .domain("JGC/V1")
      .u32(42)
      .u64(500n)
      .u128(1n << 80n)
      .string("node")
      .build();
    expect(bytes.toString("hex")).toBe(
      "000000064a47432f56310000002a00000000000001f400000000000100000000000000000000000000046e6f6465",
    );
  });

  test("rejects negative, fractional, and unsafe consensus integers", () => {
    expect(() => consensusUInt(-1, "x")).toThrow();
    expect(() => consensusUInt(1.5, "x")).toThrow();
    expect(() => consensusUInt(Number.MAX_SAFE_INTEGER + 1, "x")).toThrow();
  });
});
