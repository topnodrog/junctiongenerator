/**
 * @file src/storage/persistence.ts
 * @description Durable block storage so a node survives restart.
 *
 * BITCOIN ANALOG: blocks/ (block files) + chainstate (LevelDB UTXO snapshot).
 * The store is an append-only log of accepted blocks; on startup the node REPLAYS
 * it through its normal accept path, deterministically rebuilding every derived
 * structure (headers, height index, epoch accumulator, difficulty, UTXO set) — so
 * there is no separate snapshot that can diverge from the chain.
 *
 * ON-DISK FORMAT — binary (`blocks.dat`): a sequence of length-prefixed records,
 * each `u32 LE length ‖ encodeBlock(block)`. Compact and fast to scan (no JSON
 * parse, ~no quoting/tagging overhead), and it reuses the canonical header/tx
 * binary codecs so the bytes line up with the wire format. Blocks contain BigInt
 * amounts and a Map (EpochState.minerContributions); the codec encodes them
 * explicitly (u128 / length-prefixed entries).
 *
 * The tagged-JSON helpers (serializeBlock/deserializeBlock) are retained as a
 * human-readable/debug encoding and a structural deep-clone utility.
 *
 * PRODUCTION NOTE: add a UTXO snapshot (to avoid full replay on large chains) and
 * fsync/atomic writes before any real deployment.
 */

import { appendFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import type { Block, EpochState, MinerComputeContribution } from "../types/index.js";
import { ComputeTaskType } from "../types/index.js";
import {
  serializeBlockHeader, deserializeBlockHeader, BLOCK_HEADER_SIZE,
  serializeTransaction, deserializeTransaction,
} from "../consensus/block.js";

const BIGINT_TAG = "$jgc:bigint";
const MAP_TAG = "$jgc:map";

/** Serialize a Block to one tagged-JSON line (BigInt + Map safe). Debug/clone use. */
export function serializeBlock(block: Block): string {
  return JSON.stringify(block, (_key, value: unknown) => {
    if (typeof value === "bigint") return { [BIGINT_TAG]: value.toString() };
    if (value instanceof Map)      return { [MAP_TAG]: [...value.entries()] };
    return value;
  });
}

/** Inverse of serializeBlock. Throws on malformed input. */
export function deserializeBlock(line: string): Block {
  return JSON.parse(line, (_key, value: unknown) => {
    if (value !== null && typeof value === "object") {
      const t = value as Record<string, unknown>;
      if (typeof t[BIGINT_TAG] === "string") return BigInt(t[BIGINT_TAG] as string);
      if (Array.isArray(t[MAP_TAG]))         return new Map(t[MAP_TAG] as [unknown, unknown][]);
    }
    return value;
  }) as Block;
}

// ─────────────────────────────────────────────────────────────────────────────
// Binary block codec
// ─────────────────────────────────────────────────────────────────────────────

/** Bitcoin compact-size varint encoder (matches block.ts's wire encoding). */
function encodeVarInt(n: number): Buffer {
  if (n < 0) throw new RangeError("varint cannot be negative");
  if (n < 0xfd) return Buffer.from([n]);
  if (n <= 0xffff) { const b = Buffer.alloc(3); b[0] = 0xfd; b.writeUInt16LE(n, 1); return b; }
  if (n <= 0xffffffff) { const b = Buffer.alloc(5); b[0] = 0xfe; b.writeUInt32LE(n, 1); return b; }
  const b = Buffer.alloc(9); b[0] = 0xff; b.writeBigUInt64LE(BigInt(n), 1); return b;
}

/** Append-only buffer builder for the binary block/record encoders. */
class Writer {
  private readonly parts: Buffer[] = [];
  u32(n: number): this { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); this.parts.push(b); return this; }
  u64(n: number | bigint): this { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n), 0); this.parts.push(b); return this; }
  u128(v: bigint): this {
    if (v < 0n || v >> 128n !== 0n) throw new RangeError("value exceeds u128");
    const b = Buffer.alloc(16);
    b.writeBigUInt64LE(v & 0xFFFF_FFFF_FFFF_FFFFn, 0);
    b.writeBigUInt64LE(v >> 64n, 8);
    this.parts.push(b); return this;
  }
  f64(n: number): this { const b = Buffer.alloc(8); b.writeDoubleLE(n, 0); this.parts.push(b); return this; }
  varint(n: number): this { this.parts.push(encodeVarInt(n)); return this; }
  raw(buf: Buffer): this { this.parts.push(buf); return this; }
  lenBytes(buf: Buffer): this { this.varint(buf.length); this.parts.push(buf); return this; }
  str(s: string): this { return this.lenBytes(Buffer.from(s, "utf8")); }
  build(): Buffer { return Buffer.concat(this.parts); }
}

/** Cursor reader, the inverse of Writer. Throws RangeError on truncation. */
class Reader {
  private off = 0;
  constructor(private readonly buf: Buffer) {}
  get done(): boolean { return this.off >= this.buf.length; }
  private need(n: number): void { if (this.off + n > this.buf.length) throw new RangeError("record buffer truncated"); }
  u32(): number { this.need(4); const v = this.buf.readUInt32LE(this.off); this.off += 4; return v; }
  u64(): number { this.need(8); const v = Number(this.buf.readBigUInt64LE(this.off)); this.off += 8; return v; }
  u128(): bigint { this.need(16); const lo = this.buf.readBigUInt64LE(this.off); const hi = this.buf.readBigUInt64LE(this.off + 8); this.off += 16; return (hi << 64n) | lo; }
  f64(): number { this.need(8); const v = this.buf.readDoubleLE(this.off); this.off += 8; return v; }
  varint(): number {
    this.need(1); const f = this.buf[this.off]!; this.off += 1;
    if (f < 0xfd) return f;
    if (f === 0xfd) { this.need(2); const v = this.buf.readUInt16LE(this.off); this.off += 2; return v; }
    if (f === 0xfe) { this.need(4); const v = this.buf.readUInt32LE(this.off); this.off += 4; return v; }
    this.need(8); const v = Number(this.buf.readBigUInt64LE(this.off)); this.off += 8; return v;
  }
  raw(n: number): Buffer { this.need(n); const b = this.buf.subarray(this.off, this.off + n); this.off += n; return b; }
  lenBytes(): Buffer { return this.raw(this.varint()); }
  str(): string { return this.lenBytes().toString("utf8"); }
}

function encodeContribution(w: Writer, c: MinerComputeContribution): void {
  w.str(c.minerAddress);
  w.str(c.proof.taskCommitment);
  w.str(c.proof.proofBytes);
  w.str(c.proof.circuitId);
  w.varint(c.proof.publicInputs.length);
  for (const pi of c.proof.publicInputs) w.str(pi);
  w.f64(c.proof.tflopsWeight);
  w.str(c.proof.taskType);
  w.str(c.proof.computeStartedAt);
  w.str(c.signature);
  w.str(c.publicKey);
}

function decodeContribution(r: Reader): MinerComputeContribution {
  const minerAddress = r.str();
  const taskCommitment = r.str();
  const proofBytes = r.str();
  const circuitId = r.str();
  const publicInputs: string[] = [];
  const piCount = r.varint();
  for (let i = 0; i < piCount; i++) publicInputs.push(r.str());
  const tflopsWeight = r.f64();
  const taskType = r.str() as ComputeTaskType;
  const computeStartedAt = r.str();
  const signature = r.str();
  const publicKey = r.str();
  return { minerAddress, proof: { taskCommitment, proofBytes, circuitId, publicInputs, tflopsWeight, taskType, computeStartedAt }, signature, publicKey };
}

function encodeEpochState(w: Writer, es: EpochState): void {
  w.u64(es.epochStartHeight);
  w.varint(es.epochBlockIndex);
  w.f64(es.totalEpochTFLOPS);
  w.varint(es.minerContributions.size);
  for (const [addr, t] of es.minerContributions) { w.str(addr); w.f64(t); }
  w.u128(es.pendingRewardPool);
  w.u64(es.epochStartTime);
}

function decodeEpochState(r: Reader): EpochState {
  const epochStartHeight = r.u64();
  const epochBlockIndex = r.varint();
  const totalEpochTFLOPS = r.f64();
  const minerContributions = new Map<string, number>();
  const n = r.varint();
  for (let i = 0; i < n; i++) { const addr = r.str(); minerContributions.set(addr, r.f64()); }
  const pendingRewardPool = r.u128();
  const epochStartTime = r.u64();
  return { epochStartHeight, epochBlockIndex, totalEpochTFLOPS, minerContributions, pendingRewardPool, epochStartTime };
}

/** Encode a full Block to its compact binary representation. */
export function encodeBlock(block: Block): Buffer {
  const w = new Writer();
  w.raw(serializeBlockHeader(block.header));                 // 160 bytes, fixed
  w.varint(block.transactions.length);
  for (const tx of block.transactions) w.lenBytes(serializeTransaction(tx));
  w.varint(block.computeProofs.length);
  for (const c of block.computeProofs) encodeContribution(w, c);
  encodeEpochState(w, block.epochState);
  return w.build();
}

/** Inverse of encodeBlock. Throws RangeError on truncated/garbled input. */
export function decodeBlock(buf: Buffer): Block {
  const r = new Reader(buf);
  const header = deserializeBlockHeader(r.raw(BLOCK_HEADER_SIZE));
  const transactions = [];
  const txCount = r.varint();
  for (let i = 0; i < txCount; i++) transactions.push(deserializeTransaction(r.lenBytes()));
  const computeProofs: MinerComputeContribution[] = [];
  const proofCount = r.varint();
  for (let i = 0; i < proofCount; i++) computeProofs.push(decodeContribution(r));
  const epochState = decodeEpochState(r);
  return { header, transactions, computeProofs, epochState };
}

// ─────────────────────────────────────────────────────────────────────────────
// Block store
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append-only block store backed by `<dataDir>/blocks.dat` (binary, length-
 * prefixed records). Stores accepted non-genesis blocks in height order.
 */
export class BlockStore {
  private readonly file: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, "blocks.dat");
  }

  /** Append one accepted block as `u32 LE length ‖ encodeBlock(block)`. */
  append(block: Block): void {
    const body = encodeBlock(block);
    const len = Buffer.alloc(4); len.writeUInt32LE(body.length, 0);
    appendFileSync(this.file, Buffer.concat([len, body]));
  }

  /** Load all stored blocks in append (height) order. */
  loadAll(): Block[] {
    if (!existsSync(this.file)) return [];
    const data = readFileSync(this.file);
    const blocks: Block[] = [];
    let off = 0;
    while (off < data.length) {
      if (off + 4 > data.length) throw new RangeError(`block store ${this.file} truncated at byte ${off}`);
      const len = data.readUInt32LE(off); off += 4;
      if (off + len > data.length) throw new RangeError(`block store ${this.file} truncated: record needs ${len} bytes`);
      blocks.push(decodeBlock(data.subarray(off, off + len))); off += len;
    }
    return blocks;
  }

  /** Number of stored blocks. */
  count(): number {
    return this.loadAll().length;
  }

  /** Delete the store (fresh start). */
  clear(): void {
    if (existsSync(this.file)) rmSync(this.file);
  }
}
