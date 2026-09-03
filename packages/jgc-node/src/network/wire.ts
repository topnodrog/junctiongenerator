/**
 * @file src/network/wire.ts
 * @description Versioned binary framing for JGC peer messages.
 *
 * Frame layout (network byte order):
 *
 *   0..3    network magic (uint32)
 *   4       wire version
 *   5       message type code
 *   6..7    reserved (must be zero)
 *   8..11   payload byte length (uint32)
 *   12..15  first four bytes of SHA3-256(payload)
 *   16..    UTF-8 protocol payload
 *
 * The fixed binary envelope gives peers an early, bounded rejection path for
 * wrong-network, unsupported-version, unknown-command, truncated, padded, and
 * corrupted frames. The inner payload remains the tagged protocol codec for
 * now so BigInt and Map values round-trip without losing precision. Individual
 * consensus objects already use canonical binary encodings where their hashes
 * or signatures depend on bytes.
 */

import { createHash } from "crypto";
import { MessageType, type PeerMessage } from "../types/index.js";

export const WIRE_VERSION = 1;
export const WIRE_HEADER_BYTES = 16;
export const MAX_WIRE_PAYLOAD_BYTES = 8 * 1024 * 1024 - WIRE_HEADER_BYTES;

// Decoding limits are deliberately stricter than the frame limit. A valid
// frame must not be able to create an arbitrarily deep or wide object graph
// before the message reaches protocol validation.
export const MAX_DECODED_PAYLOAD_DEPTH = 32;
export const MAX_DECODED_PAYLOAD_ARRAY_ITEMS = 16_384;
export const MAX_DECODED_PAYLOAD_OBJECT_KEYS = 256;
export const MAX_DECODED_PAYLOAD_STRING_BYTES = 1_048_576;

const BIGINT_TAG = "$jgc:bigint";
const MAP_TAG = "$jgc:map";

const MESSAGE_TYPES: readonly MessageType[] = [
  MessageType.VERSION,
  MessageType.VERACK,
  MessageType.INV,
  MessageType.GETDATA,
  MessageType.BLOCK,
  MessageType.TX,
  MessageType.GETBLOCKS,
  MessageType.GETHEADERS,
  MessageType.HEADERS,
  MessageType.PING,
  MessageType.PONG,
  MessageType.COMPUTE_PROOF,
  MessageType.EPOCH_SETTLE,
  MessageType.BROKER_BID,
  MessageType.GETADDR,
  MessageType.ADDR,
  MessageType.AUDIT_REQUEST,
  MessageType.AUDIT_VOTE,
  MessageType.AUDIT_VERDICT,
];

const TYPE_TO_CODE = new Map<MessageType, number>(
  MESSAGE_TYPES.map((type, index) => [type, index + 1]),
);

function checksum(payload: Buffer): Buffer {
  return createHash("sha3-256").update(payload).digest().subarray(0, 4);
}

function encodePayload(msg: PeerMessage): Buffer {
  const body = JSON.stringify({
    payload: msg.payload,
    timestamp: msg.timestamp,
    senderPublicKey: msg.senderPublicKey,
    signature: msg.signature,
  }, (_key, value: unknown) => {
    if (typeof value === "bigint") return { [BIGINT_TAG]: value.toString() };
    if (value instanceof Map) return { [MAP_TAG]: [...value.entries()] };
    return value;
  });
  return Buffer.from(body, "utf8");
}

function isSafeDecodedValue(value: unknown, depth = 0): boolean {
  if (depth > MAX_DECODED_PAYLOAD_DEPTH) return false;
  if (value === null || typeof value === "boolean" || typeof value === "bigint") return true;
  if (typeof value === "string") {
    return Buffer.byteLength(value, "utf8") <= MAX_DECODED_PAYLOAD_STRING_BYTES;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    if (value.length > MAX_DECODED_PAYLOAD_ARRAY_ITEMS) return false;
    return value.every((item) => isSafeDecodedValue(item, depth + 1));
  }
  if (value instanceof Map) {
    if (value.size > MAX_DECODED_PAYLOAD_ARRAY_ITEMS) return false;
    for (const [key, item] of value) {
      if (!isSafeDecodedValue(key, depth + 1) || !isSafeDecodedValue(item, depth + 1)) return false;
    }
    return true;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length > MAX_DECODED_PAYLOAD_OBJECT_KEYS) return false;
    return keys.every((key) => isSafeDecodedValue((value as Record<string, unknown>)[key], depth + 1));
  }
  return false;
}

/** Encode a peer message into a checksummed, network-bound binary frame. */
export function encodePeerMessage(msg: PeerMessage, networkMagic: number): Buffer {
  const typeCode = TYPE_TO_CODE.get(msg.type);
  if (typeCode === undefined) throw new Error(`unsupported peer message type: ${String(msg.type)}`);

  const payload = encodePayload(msg);
  if (payload.length > MAX_WIRE_PAYLOAD_BYTES) {
    throw new Error(`peer message payload exceeds ${MAX_WIRE_PAYLOAD_BYTES} bytes`);
  }

  const frame = Buffer.allocUnsafe(WIRE_HEADER_BYTES + payload.length);
  frame.writeUInt32BE(networkMagic >>> 0, 0);
  frame.writeUInt8(WIRE_VERSION, 4);
  frame.writeUInt8(typeCode, 5);
  frame.writeUInt16BE(0, 6);
  frame.writeUInt32BE(payload.length, 8);
  checksum(payload).copy(frame, 12);
  payload.copy(frame, WIRE_HEADER_BYTES);
  return frame;
}

/**
 * Decode an untrusted wire frame. Returns null for every malformed or
 * incompatible input; peer-supplied bytes never escape as an exception.
 */
export function decodePeerMessage(data: Buffer | Uint8Array, networkMagic: number): PeerMessage | null {
  try {
    const frame = Buffer.isBuffer(data)
      ? data
      : Buffer.from(data.buffer, data.byteOffset, data.byteLength);

    if (frame.length < WIRE_HEADER_BYTES) return null;
    if (frame.readUInt32BE(0) !== (networkMagic >>> 0)) return null;
    if (frame.readUInt8(4) !== WIRE_VERSION) return null;
    if (frame.readUInt16BE(6) !== 0) return null;

    const type = MESSAGE_TYPES[frame.readUInt8(5) - 1];
    if (type === undefined) return null;

    const payloadLength = frame.readUInt32BE(8);
    if (payloadLength > MAX_WIRE_PAYLOAD_BYTES) return null;
    if (frame.length !== WIRE_HEADER_BYTES + payloadLength) return null;

    const payload = frame.subarray(WIRE_HEADER_BYTES);
    if (!checksum(payload).equals(frame.subarray(12, 16))) return null;

    const decoded = JSON.parse(payload.toString("utf8"), (_key, value: unknown) => {
      if (value !== null && typeof value === "object") {
        const tagged = value as Record<string, unknown>;
        if (typeof tagged[BIGINT_TAG] === "string") return BigInt(tagged[BIGINT_TAG]);
        if (Array.isArray(tagged[MAP_TAG])) return new Map(tagged[MAP_TAG] as [unknown, unknown][]);
      }
      return value;
    }) as Partial<Omit<PeerMessage, "type">>;

    if (decoded === null || typeof decoded !== "object") return null;
    if (!Number.isSafeInteger(decoded.timestamp) || (decoded.timestamp as number) < 0) return null;
    if (typeof decoded.senderPublicKey !== "string" || typeof decoded.signature !== "string") return null;
    if (!Object.prototype.hasOwnProperty.call(decoded, "payload")) return null;
    if (!isSafeDecodedValue(decoded.payload)) return null;

    return {
      type,
      payload: decoded.payload,
      timestamp: decoded.timestamp as number,
      senderPublicKey: decoded.senderPublicKey,
      signature: decoded.signature,
    };
  } catch {
    return null;
  }
}
