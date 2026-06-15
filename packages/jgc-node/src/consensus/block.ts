/**
 * @file src/consensus/block.ts
 * @description BlockHeader construction, serialization, and hashing for JGC.
 *
 * BITCOIN COMPARISON — serialize.h, block.h, block.cpp
 * ──────────────────────────────────────────────────────
 * Bitcoin's CBlockHeader is exactly 80 bytes:
 *   nVersion(4) | hashPrevBlock(32) | hashMerkleRoot(32) | nTime(4) | nBits(4) | nNonce(4)
 *
 * The header is hashed via SHA256d to produce the block ID:
 *   blockId = SHA256(SHA256(serializedHeader))
 *
 * Bitcoin serializes integers in little-endian order (same as Satoshi's
 * original C++ implementation using CDataStream with READWRITE macros).
 *
 * JGC HEADER — 160 bytes:
 *   version(4) | prevHash(32) | merkleRoot(32) | computeRoot(32) | epochRoot(32)
 *   | timestamp(8) | difficultyBits(4) | nonce(4) | height(8) | reserved(4)
 *   Total: 4+32+32+32+32+8+4+4+8+4 = 160 bytes
 *
 * Additions over Bitcoin:
 *   computeRoot  — Merkle root of all ComputeProofs (PoUC work attestation)
 *   epochRoot    — Merkle root of epoch accumulator state (enables payout auditing)
 *   timestamp    — extended to 8 bytes (avoids Year 2038 problem)
 *   height       — embedded for fast SPV height lookups without full header scan
 *
 * The blockId is still SHA256d(serializedHeader) — same cryptographic primitive,
 * compatible with Bitcoin-style chain indexing tools.
 *
 * SERIALIZATION ORDER:
 *   All multi-byte integers are serialized in LITTLE-ENDIAN order, identical
 *   to Bitcoin's CDataStream encoding.  Hash fields are serialized as raw
 *   32-byte big-endian (reversed for display, same as Bitcoin's display convention).
 */

import { createHash } from "crypto";
import type {
  BlockHeader, Block, Transaction, TxInput, TxOutput, JGCSatoshis,
  MinerComputeContribution, Hash256,
} from "../types/index.js";
import { buildMerkleTree, hashTransaction } from "../crypto/merkle.js";
import { computeContributionsMerkleRoot, computeEpochRoot } from "./epoch.js";

// ─────────────────────────────────────────────────────────────────────────────
// Header Serialization
// ─────────────────────────────────────────────────────────────────────────────

/** Size of the serialized JGC block header in bytes. */
export const BLOCK_HEADER_SIZE = 160;

/**
 * Serialize a BlockHeader to its canonical 160-byte binary representation.
 *
 * BITCOIN ANALOG: CBlockHeader::Serialize() via SERIALIZE_METHODS macro.
 *   READWRITE(obj.nVersion);
 *   READWRITE(obj.hashPrevBlock);
 *   READWRITE(obj.hashMerkleRoot);
 *   READWRITE(obj.nTime);
 *   READWRITE(obj.nBits);
 *   READWRITE(obj.nNonce);
 *
 * JGC adds computeRoot, epochRoot (both 32 bytes), and expands
 * timestamp to 8 bytes and adds height (8 bytes) + reserved (4 bytes).
 *
 * @param header BlockHeader to serialize.
 * @returns 160-byte Buffer in canonical serialization order.
 */
export function serializeBlockHeader(header: BlockHeader): Buffer {
  const buf = Buffer.alloc(BLOCK_HEADER_SIZE);
  let offset = 0;

  // version: 4 bytes little-endian (same as Bitcoin)
  buf.writeUInt32LE(header.version, offset);                    offset += 4;

  // prevHash: 32 bytes big-endian (raw hash bytes)
  Buffer.from(header.prevHash, "hex").copy(buf, offset);        offset += 32;

  // merkleRoot: 32 bytes big-endian
  Buffer.from(header.merkleRoot, "hex").copy(buf, offset);      offset += 32;

  // computeRoot: 32 bytes big-endian (JGC addition)
  Buffer.from(header.computeRoot, "hex").copy(buf, offset);     offset += 32;

  // epochRoot: 32 bytes big-endian (JGC addition)
  Buffer.from(header.epochRoot, "hex").copy(buf, offset);       offset += 32;

  // timestamp: 8 bytes little-endian (extended from Bitcoin's 4-byte nTime)
  buf.writeBigUInt64LE(BigInt(header.timestamp), offset);        offset += 8;

  // difficultyBits: 4 bytes little-endian (same format as Bitcoin's nBits)
  buf.writeUInt32LE(header.difficultyBits, offset);             offset += 4;

  // nonce: 4 bytes little-endian (same as Bitcoin's nNonce)
  buf.writeUInt32LE(header.nonce, offset);                      offset += 4;

  // height: 8 bytes little-endian (JGC addition — not in Bitcoin headers)
  buf.writeBigUInt64LE(BigInt(header.height), offset);           offset += 8;

  // reserved: 4 bytes (future protocol extensions)
  buf.writeUInt32LE(0, offset);                                 offset += 4;

  if (offset !== BLOCK_HEADER_SIZE) {
    throw new Error(`Serialization error: wrote ${offset} bytes, expected ${BLOCK_HEADER_SIZE}`);
  }

  return buf;
}

/**
 * Deserialize a 160-byte Buffer back into a BlockHeader.
 *
 * BITCOIN ANALOG: CBlockHeader::Unserialize()
 */
export function deserializeBlockHeader(buf: Buffer): BlockHeader {
  if (buf.length < BLOCK_HEADER_SIZE) {
    throw new RangeError(
      `Buffer too short: ${buf.length} bytes, expected ${BLOCK_HEADER_SIZE}`
    );
  }

  let offset = 0;

  const version        = buf.readUInt32LE(offset);              offset += 4;
  const prevHash       = buf.subarray(offset, offset + 32).toString("hex");  offset += 32;
  const merkleRoot     = buf.subarray(offset, offset + 32).toString("hex");  offset += 32;
  const computeRoot    = buf.subarray(offset, offset + 32).toString("hex");  offset += 32;
  const epochRoot      = buf.subarray(offset, offset + 32).toString("hex");  offset += 32;
  const timestamp      = Number(buf.readBigUInt64LE(offset));   offset += 8;
  const difficultyBits = buf.readUInt32LE(offset);              offset += 4;
  const nonce          = buf.readUInt32LE(offset);              offset += 4;
  const height         = Number(buf.readBigUInt64LE(offset));   offset += 8;
  // reserved (4 bytes) — skip                                  offset += 4;

  return { version, prevHash, merkleRoot, computeRoot, epochRoot, timestamp, difficultyBits, nonce, height };
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Hashing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the block ID (header hash) using double-SHA256.
 *
 * BITCOIN ANALOG: CBlockHeader::GetHash()
 *   Returns SHA256d of the serialized 80-byte header.
 *
 * JGC: identical primitive, applied to the 160-byte serialized header.
 * The resulting hash is used as:
 *   - The block's unique identifier.
 *   - The prevHash for the next block.
 *   - The key in chain indexing databases (LevelDB, same as Bitcoin Core).
 *
 * NOTE: Unlike Bitcoin where the hash MUST be below target (the hash IS
 * the proof-of-work), in JGC the header hash serves only as an identifier.
 * The actual work proof is computeRoot / the ZK proofs in block.computeProofs.
 *
 * @param header BlockHeader to hash.
 * @returns 32-byte hash as lowercase hex string.
 */
export function hashBlockHeader(header: BlockHeader): Hash256 {
  const serialized = serializeBlockHeader(header);
  const first  = createHash("sha256").update(serialized).digest();
  const second = createHash("sha256").update(first).digest();
  return second.toString("hex");
}

/**
 * Compute the block ID from raw serialized header bytes.
 * Avoids deserialization when the bytes are already available.
 */
export function hashRawHeader(rawHeader: Buffer): Hash256 {
  const first  = createHash("sha256").update(rawHeader).digest();
  const second = createHash("sha256").update(first).digest();
  return second.toString("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// Merkle Root Computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the transaction Merkle root for a block.
 *
 * BITCOIN ANALOG: BlockMerkleRoot() in merkle.cpp
 *   Calls ComputeMerkleRoot on the vector of transaction hashes.
 *
 * JGC: identical logic. Coinbase transaction (epoch settlement) must be first,
 * same as Bitcoin's requirement that vtx[0] is the coinbase.
 *
 * @param txs Ordered list of transactions (coinbase first).
 * @returns Transaction Merkle root hash.
 */
// ─────────────────────────────────────────────────────────────────────────────
// Canonical Transaction Serialization (binary wire format)
// ─────────────────────────────────────────────────────────────────────────────
//
// BITCOIN ANALOG: CTransaction::Serialize() — a fixed canonical byte layout that
// the txid double-SHA256s. JGC differs in ONE consensus-critical way: the output
// value is a 16-byte little-endian u128, NOT Bitcoin's 8-byte int64, because the
// 16-decimal supply (21,000,000 × 10^16 = 2.1e23 base units) overflows int64
// (see emission.ts and the divisibility decision). Counts and script lengths use
// Bitcoin's compact-size varint.
//
// Layout:
//   version       u32 LE
//   inputCount    varint
//   per input:    prevTxid(32) ‖ vout u32 LE ‖ scriptSig(varint len ‖ bytes) ‖ sequence u32 LE
//   outputCount   varint
//   per output:   value u128 LE (16) ‖ scriptPubKey(varint len ‖ bytes)
//   locktime      u32 LE
//   brokerTaskRef presence u8 (0/1) ‖ if present: varint len ‖ utf8 bytes

/** Bitcoin compact-size varint encoder. */
function encodeVarInt(n: number): Buffer {
  if (n < 0) throw new RangeError("varint cannot be negative");
  if (n < 0xfd) return Buffer.from([n]);
  if (n <= 0xffff) { const b = Buffer.alloc(3); b[0] = 0xfd; b.writeUInt16LE(n, 1); return b; }
  if (n <= 0xffffffff) { const b = Buffer.alloc(5); b[0] = 0xfe; b.writeUInt32LE(n, 1); return b; }
  const b = Buffer.alloc(9); b[0] = 0xff; b.writeBigUInt64LE(BigInt(n), 1); return b;
}

/** 4-byte little-endian unsigned integer. */
function u32le(n: number): Buffer {
  const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b;
}

/** 16-byte little-endian u128 — the JGC money field (holds 21M × 10^16 < 2^128). */
function u128le(v: JGCSatoshis): Buffer {
  if (v < 0n) throw new RangeError("amount cannot be negative");
  if (v >> 128n !== 0n) throw new RangeError("amount exceeds u128");
  const b = Buffer.alloc(16);
  b.writeBigUInt64LE(v & 0xFFFF_FFFF_FFFF_FFFFn, 0);
  b.writeBigUInt64LE(v >> 64n, 8);
  return b;
}

/** Length-prefixed raw bytes from a hex string (varint length ‖ bytes). */
function lenHex(hex: string): Buffer {
  const bytes = Buffer.from(hex, "hex");
  return Buffer.concat([encodeVarInt(bytes.length), bytes]);
}

/**
 * Canonical binary serialization of a transaction — the exact bytes a txid
 * double-SHA256s. Replaces the earlier JSON placeholder. See the layout above.
 */
export function serializeTransaction(tx: Transaction): Buffer {
  const parts: Buffer[] = [u32le(tx.version), encodeVarInt(tx.inputs.length)];
  for (const inp of tx.inputs) {
    parts.push(Buffer.from(inp.prevOut.txid, "hex"));   // 32 bytes
    parts.push(u32le(inp.prevOut.vout));
    parts.push(lenHex(inp.scriptSig));
    parts.push(u32le(inp.sequence));
  }
  parts.push(encodeVarInt(tx.outputs.length));
  for (const out of tx.outputs) {
    parts.push(u128le(out.value));
    parts.push(lenHex(out.scriptPubKey));
  }
  parts.push(u32le(tx.locktime));
  if (tx.brokerTaskRef !== undefined) {
    const ref = Buffer.from(tx.brokerTaskRef, "utf8");
    parts.push(Buffer.from([1]), encodeVarInt(ref.length), ref);
  } else {
    parts.push(Buffer.from([0]));
  }
  return Buffer.concat(parts);
}

/**
 * Inverse of serializeTransaction — parse canonical bytes into a Transaction.
 * Throws RangeError on truncated input.
 */
export function deserializeTransaction(buf: Buffer): Transaction {
  let off = 0;
  const need = (n: number): void => { if (off + n > buf.length) throw new RangeError("tx buffer truncated"); };
  const u32 = (): number => { need(4); const v = buf.readUInt32LE(off); off += 4; return v; };
  const vint = (): number => {
    need(1); const first = buf[off]!; off += 1;
    if (first < 0xfd) return first;
    if (first === 0xfd) { need(2); const v = buf.readUInt16LE(off); off += 2; return v; }
    if (first === 0xfe) { need(4); const v = buf.readUInt32LE(off); off += 4; return v; }
    need(8); const v = Number(buf.readBigUInt64LE(off)); off += 8; return v;
  };
  const u128 = (): JGCSatoshis => {
    need(16); const lo = buf.readBigUInt64LE(off); const hi = buf.readBigUInt64LE(off + 8); off += 16;
    return (hi << 64n) | lo;
  };
  const hexN = (n: number): string => { need(n); const s = buf.subarray(off, off + n).toString("hex"); off += n; return s; };

  const version = u32();
  const inputs: TxInput[] = [];
  const inCount = vint();
  for (let i = 0; i < inCount; i++) {
    const txid = hexN(32);
    const vout = u32();
    const scriptSig = hexN(vint());
    const sequence = u32();
    inputs.push({ prevOut: { txid, vout }, scriptSig, sequence });
  }
  const outputs: TxOutput[] = [];
  const outCount = vint();
  for (let j = 0; j < outCount; j++) {
    const value = u128();
    const scriptPubKey = hexN(vint());
    outputs.push({ value, scriptPubKey });
  }
  const locktime = u32();
  const tx: Transaction = { version, inputs, outputs, locktime };
  need(1); const hasBroker = buf[off]!; off += 1;
  if (hasBroker === 1) {
    const len = vint(); need(len);
    tx.brokerTaskRef = buf.subarray(off, off + len).toString("utf8"); off += len;
  }
  return tx;
}

export function computeTransactionMerkleRoot(txs: Transaction[]): Hash256 {
  if (txs.length === 0) return "0".repeat(64);

  const txids = txs.map(tx =>
    hashTransaction(serializeTransaction(tx).toString("hex"))
  );

  return buildMerkleTree(txids).root;
}

// ─────────────────────────────────────────────────────────────────────────────
// Genesis Block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The JGC genesis block.
 *
 * BITCOIN ANALOG: chainparams.cpp — CMainParams constructor defines genesis
 *   genesis.nTime    = 1231006505  (Satoshi's Jan 3 2009 timestamp)
 *   genesis.nBits    = 0x1d00ffff  (initial difficulty)
 *   genesis.nNonce   = 2083236893  (the found nonce)
 *   genesis.nVersion = 1
 *
 * JGC genesis block:
 *   - Timestamp: 2026-06-11 00:00:00 UTC (project launch date)
 *   - Initial TFLOPS target: 1000 (~1 TFLOPS-second minimum per block)
 *   - Encoded as compact bits: 0x043B9ACA (see derivation below)
 *   - No previous block: prevHash = 000...000
 *   - Genesis message embedded in coinbase: "JGC 2026: Compute for Civilization"
 *
 * COMPACT BITS DERIVATION for the 1000-TFLOPS genesis target:
 *   encodeDifficultyBits scales TFLOPS by 10^6 (micro-TFLOPS):
 *     value    = 1000 × 10^6 = 1,000,000,000 = 0x3B9ACA00  (4 bytes)
 *     exponent = byte length = 4
 *     mantissa = top 3 bytes = 0x3B9ACA
 *     compact  = (4 << 24) | 0x3B9ACA = 0x043B9ACA
 *   Sanity: decode → 0x3B9ACA × 256^(4-3) / 10^6 = 1,000,000,000 / 10^6 = 1000 ✓
 *
 *   (The previous placeholder 0x1e0003E8 put the byte-length exponent at 30,
 *   which decoded to 1000 × 256^27 / 10^6 ≈ 1.05×10^62 TFLOPS — an unmineable
 *   target. Same class of bug as misusing Bitcoin's nBits exponent field.)
 */
export const GENESIS_TIMESTAMP = 1749600000; // 2026-06-11 00:00:00 UTC
export const GENESIS_DIFFICULTY_BITS = 0x043B9ACA;
export const GENESIS_PREV_HASH = "0".repeat(64);
export const GENESIS_BLOCK_VERSION = 0x01000000;

/**
 * Construct the JGC genesis block header.
 * NOTE: In production, genesis is hardcoded after trusted setup ceremony.
 */
export function createGenesisHeader(difficultyBits: number = GENESIS_DIFFICULTY_BITS): BlockHeader {
  const genesisComputeRoot = "0".repeat(64);  // No proofs in genesis block
  const genesisEpochRoot   = "0".repeat(64);  // Empty epoch state at genesis

  // Genesis coinbase tx: "JGC 2026: Compute for Civilization"
  const genesisCoinbase = Buffer.from(
    "4a47432032303236 3a20436f6d707574 6520666f7220436976696c697a6174696f6e",
    "hex"
  );
  const genesisTxid = createHash("sha256")
    .update(createHash("sha256").update(genesisCoinbase).digest())
    .digest("hex");

  const genesisMerkleRoot = buildMerkleTree([genesisTxid]).root;

  return {
    version:        GENESIS_BLOCK_VERSION,
    prevHash:       GENESIS_PREV_HASH,
    merkleRoot:     genesisMerkleRoot,
    computeRoot:    genesisComputeRoot,
    epochRoot:      genesisEpochRoot,
    timestamp:      GENESIS_TIMESTAMP,
    difficultyBits,
    nonce:          0,
    height:         0,
  };
}

/** The canonical genesis block hash (computed once, hardcoded for verification). */
export const GENESIS_BLOCK_HASH: Hash256 = hashBlockHeader(createGenesisHeader());

// ─────────────────────────────────────────────────────────────────────────────
// Block Assembly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assemble a full Block from its components and compute all Merkle roots.
 *
 * BITCOIN ANALOG: CreateNewBlock() in miner.cpp
 *   Bitcoin's miner assembles transactions, computes hashMerkleRoot, then
 *   enters the nNonce search loop.  JGC replaces the nNonce loop with a
 *   wait-for-ZK-proofs collection window.
 *
 * @param prevHeader      The previous block's header (for prevHash + height).
 * @param transactions    Ordered transactions (coinbase settlement first at epoch boundary).
 * @param contributions   Verified miner compute contributions for this block.
 * @param epochState      Current epoch accumulator state.
 * @param difficultyBits  Compact difficulty target (nBits).
 * @param nonce           Minor nonce (for tie-breaking).
 * @param timestamp       Block timestamp (current UNIX time).
 * @returns Assembled Block with all Merkle roots computed.
 */
export function assembleBlock(
  prevHeader:      BlockHeader,
  transactions:    Transaction[],
  contributions:   MinerComputeContribution[],
  epochState:      import("../types/index.js").EpochState,
  difficultyBits:  number,
  nonce:           number,
  timestamp:       number,
): Block {
  const height = prevHeader.height + 1;

  const merkleRoot  = computeTransactionMerkleRoot(transactions);
  const computeRoot = computeContributionsMerkleRoot(contributions);
  const epochRoot   = computeEpochRoot(epochState);
  const prevHash    = hashBlockHeader(prevHeader);

  const header: BlockHeader = {
    version:        GENESIS_BLOCK_VERSION,
    prevHash,
    merkleRoot,
    computeRoot,
    epochRoot,
    timestamp,
    difficultyBits,
    nonce,
    height,
  };

  return {
    header,
    transactions,
    computeProofs: contributions,
    epochState,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Display (analogous to Bitcoin's block explorer representation)
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockSummary {
  blockHash: Hash256;
  height: number;
  timestamp: number;
  txCount: number;
  computeProofCount: number;
  totalTFLOPS: number;
  prevHash: Hash256;
  merkleRoot: Hash256;
  computeRoot: Hash256;
}

export function summarizeBlock(block: Block): BlockSummary {
  const totalTFLOPS = block.computeProofs.reduce(
    (sum, c) => sum + c.proof.tflopsWeight, 0
  );
  return {
    blockHash:         hashBlockHeader(block.header),
    height:            block.header.height,
    timestamp:         block.header.timestamp,
    txCount:           block.transactions.length,
    computeProofCount: block.computeProofs.length,
    totalTFLOPS,
    prevHash:          block.header.prevHash,
    merkleRoot:        block.header.merkleRoot,
    computeRoot:       block.header.computeRoot,
  };
}
