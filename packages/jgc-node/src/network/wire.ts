/**
 * @file src/network/wire.ts
 * @description Wire encoding for P2P messages.
 *
 * BITCOIN COMPARISON — serialize.h / CDataStream
 * ───────────────────────────────────────────────
 * Bitcoin uses a hand-rolled binary wire format (little-endian integers,
 * var-length vectors) framed by a 24-byte message header (magic, command,
 * length, checksum).
 *
 * JGC v0 uses JSON framing over WebSocket for development velocity.
 * Plain JSON.stringify is NOT sufficient for JGC payloads:
 *   - JGCSatoshis amounts are BigInt  → JSON.stringify throws
 *   - EpochState.minerContributions is a Map → JSON.stringify yields {}
 *
 * Both are encoded with explicit tagged wrappers so decoding is unambiguous
 * (a tagged object can never collide with protocol data, unlike suffix or
 * pattern conventions on plain strings).
 *
 * PRODUCTION NOTE: replace with canonical binary serialization + message
 * checksums before any public network deployment. JSON framing is for
 * local/dev networks only.
 */

import type { PeerMessage } from "../types/index.js";

/** Tag key marking an encoded BigInt: { "$jgc:bigint": "123" }. */
const BIGINT_TAG = "$jgc:bigint";

/** Tag key marking an encoded Map: { "$jgc:map": [[k, v], ...] }. */
const MAP_TAG = "$jgc:map";

/** Encode a PeerMessage to its JSON wire representation. */
export function encodePeerMessage(msg: PeerMessage): string {
  return JSON.stringify(msg, (_key, value: unknown) => {
    if (typeof value === "bigint") return { [BIGINT_TAG]: value.toString() };
    if (value instanceof Map)      return { [MAP_TAG]: [...value.entries()] };
    return value;
  });
}

/**
 * Decode a wire string back into a PeerMessage.
 * Returns null for malformed input — callers must drop the message
 * (never throw on peer-supplied bytes; same posture as Bitcoin's
 * ProcessMessage which disconnects rather than crashes).
 */
export function decodePeerMessage(text: string): PeerMessage | null {
  try {
    const msg = JSON.parse(text, (_key, value: unknown) => {
      if (value !== null && typeof value === "object") {
        const tagged = value as Record<string, unknown>;
        if (typeof tagged[BIGINT_TAG] === "string") return BigInt(tagged[BIGINT_TAG]);
        if (Array.isArray(tagged[MAP_TAG]))         return new Map(tagged[MAP_TAG] as [unknown, unknown][]);
      }
      return value;
    }) as PeerMessage;

    if (msg === null || typeof msg !== "object" || typeof msg.type !== "string") return null;
    return msg;
  } catch {
    return null;
  }
}
