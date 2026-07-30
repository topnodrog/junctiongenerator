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
 * ON-DISK FORMAT — binary (`blocks.dat`): a versioned header followed by
 * checksum-protected length-prefixed records. Compact and fast to scan (no JSON
 * parse, ~no quoting/tagging overhead), and it reuses the canonical header/tx
 * binary codecs so the bytes line up with the wire format. Blocks contain BigInt
 * amounts and a Map (EpochState.minerContributions); the codec encodes them
 * explicitly (u128 / length-prefixed entries).
 *
 * The tagged-JSON helpers (serializeBlock/deserializeBlock) are retained as a
 * human-readable/debug encoding and a structural deep-clone utility.
 *
 * Appends are flushed before acceptance returns. A torn final frame is
 * quarantined and truncated to the last complete record; corruption inside a
 * complete record fails closed.
 */

import {
  closeSync,
  existsSync,
  ftruncateSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { createHash } from "crypto";
import { join } from "path";
import type { Block, EpochState, MinerComputeContribution } from "../types/index.js";
import { ComputeTaskType } from "../types/index.js";
import type { AuditVerdictRecord } from "../broker/audit-protocol.js";
import {
  serializeBlockHeader, deserializeBlockHeader, BLOCK_HEADER_SIZE,
  serializeTransaction, deserializeTransaction,
} from "../consensus/block.js";
import { atomicWriteFile, durableAppend, syncDirectory } from "./durable-file.js";

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
  w.raw(serializeBlockHeader(block.header));                 // fixed-size header
  w.varint(block.transactions.length);
  for (const tx of block.transactions) w.lenBytes(serializeTransaction(tx));
  w.varint(block.computeProofs.length);
  for (const c of block.computeProofs) encodeContribution(w, c);
  w.varint(block.auditVerdicts.length);
  for (const verdict of block.auditVerdicts) w.str(JSON.stringify(verdict));
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
  const auditVerdicts: AuditVerdictRecord[] = [];
  const auditCount = r.varint();
  for (let i = 0; i < auditCount; i++) {
    auditVerdicts.push(JSON.parse(r.str()) as AuditVerdictRecord);
  }
  const epochState = decodeEpochState(r);
  return { header, transactions, computeProofs, auditVerdicts, epochState };
}

// ─────────────────────────────────────────────────────────────────────────────
// Block store
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append-only block store backed by `<dataDir>/blocks.dat` (binary, length-
 * prefixed records). Stores accepted non-genesis blocks in height order.
 */
const BLOCK_STORE_MAGIC = Buffer.from("JGCBLK3\0", "ascii");
const BLOCK_STORE_VERSION = 1;
const BLOCK_STORE_HEADER_BYTES = BLOCK_STORE_MAGIC.length + 4;
const BLOCK_RECORD_PREFIX_BYTES = 4 + 32;
const MAX_BLOCK_RECORD_BYTES = 32 * 1024 * 1024;

export class StorageCompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageCompatibilityError";
  }
}

function blockStoreHeader(): Buffer {
  const header = Buffer.alloc(BLOCK_STORE_HEADER_BYTES);
  BLOCK_STORE_MAGIC.copy(header, 0);
  header.writeUInt32LE(BLOCK_STORE_VERSION, BLOCK_STORE_MAGIC.length);
  return header;
}

function blockRecord(block: Block): Buffer {
  const body = encodeBlock(block);
  if (body.length > MAX_BLOCK_RECORD_BYTES) throw new RangeError("block record exceeds safety limit");
  const prefix = Buffer.alloc(BLOCK_RECORD_PREFIX_BYTES);
  prefix.writeUInt32LE(body.length, 0);
  createHash("sha3-256").update(body).digest().copy(prefix, 4);
  return Buffer.concat([prefix, body]);
}

export class BlockStore {
  private readonly file: string;
  private readonly tmp: string;
  private readonly dataDir: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.dataDir = dataDir;
    this.file = join(dataDir, "blocks.dat");
    this.tmp = join(dataDir, "blocks.dat.tmp");
  }

  static hasCurrentHeader(dataDir: string): boolean {
    const file = join(dataDir, "blocks.dat");
    if (!existsSync(file) || statSync(file).size < BLOCK_STORE_HEADER_BYTES) return false;
    const header = readFileSync(file).subarray(0, BLOCK_STORE_HEADER_BYTES);
    return header.subarray(0, BLOCK_STORE_MAGIC.length).equals(BLOCK_STORE_MAGIC) &&
      header.readUInt32LE(BLOCK_STORE_MAGIC.length) === BLOCK_STORE_VERSION;
  }

  private ensureHeader(): void {
    if (!existsSync(this.file)) {
      atomicWriteFile(this.file, this.tmp, blockStoreHeader());
      return;
    }
    const data = readFileSync(this.file);
    if (data.length < BLOCK_STORE_HEADER_BYTES ||
        !data.subarray(0, BLOCK_STORE_MAGIC.length).equals(BLOCK_STORE_MAGIC)) {
      throw new StorageCompatibilityError(
        `Unsupported legacy block store at ${this.file}; archive or reset this data directory before using Consensus V3`,
      );
    }
    const version = data.readUInt32LE(BLOCK_STORE_MAGIC.length);
    if (version !== BLOCK_STORE_VERSION) {
      throw new StorageCompatibilityError(
        `Unsupported block-store version ${version} at ${this.file}; expected ${BLOCK_STORE_VERSION}`,
      );
    }
  }

  /** Append one accepted block as `u32 LE length ‖ encodeBlock(block)`. */
  append(block: Block): void {
    this.ensureHeader();
    durableAppend(this.file, blockRecord(block));
  }

  /** Atomically replace the complete active-chain log after a reorg. */
  rewrite(blocks: readonly Block[]): void {
    atomicWriteFile(this.file, this.tmp, Buffer.concat([blockStoreHeader(), ...blocks.map(blockRecord)]));
  }

  /** Load all stored blocks in append (height) order. */
  loadAll(): Block[] {
    if (!existsSync(this.file)) return [];
    this.ensureHeader();
    const data = readFileSync(this.file);
    const blocks: Block[] = [];
    let off = BLOCK_STORE_HEADER_BYTES;
    let lastGood = off;
    while (off < data.length) {
      const remaining = data.length - off;
      if (remaining < BLOCK_RECORD_PREFIX_BYTES) {
        this.recoverTornTail(data, lastGood, `incomplete ${remaining}-byte record prefix`);
        break;
      }
      const len = data.readUInt32LE(off);
      if (len === 0 || len > MAX_BLOCK_RECORD_BYTES) {
        throw new RangeError(`block store ${this.file} has invalid record length ${len} at byte ${off}`);
      }
      const recordEnd = off + BLOCK_RECORD_PREFIX_BYTES + len;
      if (recordEnd > data.length) {
        this.recoverTornTail(data, lastGood, `record needs ${len} bytes but tail is incomplete`);
        break;
      }
      const expected = data.subarray(off + 4, off + BLOCK_RECORD_PREFIX_BYTES);
      const body = data.subarray(off + BLOCK_RECORD_PREFIX_BYTES, recordEnd);
      const actual = createHash("sha3-256").update(body).digest();
      if (!actual.equals(expected)) {
        throw new Error(`block store ${this.file} checksum mismatch at byte ${off}`);
      }
      blocks.push(decodeBlock(body));
      off = recordEnd;
      lastGood = off;
    }
    return blocks;
  }

  private recoverTornTail(data: Buffer, lastGood: number, reason: string): void {
    const tail = data.subarray(lastGood);
    if (tail.length === 0) return;
    const quarantine = join(this.dataDir, `blocks.torn.${Date.now()}.tail`);
    writeFileSync(quarantine, tail);
    const tailFd = openSync(quarantine, "r+");
    try { fsyncSync(tailFd); } finally { closeSync(tailFd); }
    const fd = openSync(this.file, "r+");
    try {
      ftruncateSync(fd, lastGood);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    syncDirectory(this.dataDir);
    console.warn(`[Storage] Recovered torn block-store tail (${reason}); preserved ${tail.length} byte(s) at ${quarantine}`);
  }

  /** Number of stored blocks. */
  count(): number {
    return this.loadAll().length;
  }

  /** Delete the store (fresh start). */
  clear(): void {
    if (existsSync(this.file)) rmSync(this.file);
    if (existsSync(this.tmp)) rmSync(this.tmp);
    syncDirectory(this.dataDir);
  }
}

export interface StorageIdentity {
  chainId: string;
  genesisHash: string;
  consensusVersion: number;
  networkMagic: number;
  proofMode: string;
}

interface StorageManifestFile extends StorageIdentity {
  storageFormatVersion: number;
}

const STORAGE_FORMAT_VERSION = 1;

/** Binds a data directory to one chain, consensus version, and proof mode. */
export class StorageManifest {
  static ensure(dataDir: string, identity: StorageIdentity): void {
    mkdirSync(dataDir, { recursive: true });
    const file = join(dataDir, "storage-manifest.json");
    const tmp = join(dataDir, "storage-manifest.json.tmp");
    if (!existsSync(file)) {
      const stateFiles = ["blocks.dat", "chainstate.snapshot", "audits.json"]
        .filter((name) => existsSync(join(dataDir, name)));
      if (stateFiles.length > 0 && !BlockStore.hasCurrentHeader(dataDir)) {
        throw new StorageCompatibilityError(
          `Data directory ${dataDir} has unversioned state (${stateFiles.join(", ")}); archive or reset it before using Consensus V3`,
        );
      }
      const manifest: StorageManifestFile = { storageFormatVersion: STORAGE_FORMAT_VERSION, ...identity };
      atomicWriteFile(file, tmp, JSON.stringify(manifest, null, 2) + "\n");
      return;
    }

    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<StorageManifestFile>;
    if (parsed.storageFormatVersion !== STORAGE_FORMAT_VERSION) {
      throw new StorageCompatibilityError(
        `Unsupported storage manifest version ${String(parsed.storageFormatVersion)}; expected ${STORAGE_FORMAT_VERSION}`,
      );
    }
    for (const key of ["chainId", "genesisHash", "consensusVersion", "networkMagic", "proofMode"] as const) {
      if (parsed[key] !== identity[key]) {
        throw new StorageCompatibilityError(
          `Data directory ${dataDir} is for ${key}=${String(parsed[key])}, not ${String(identity[key])}`,
        );
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chainstate snapshot (UTXO + epoch accumulator at a height)
// ─────────────────────────────────────────────────────────────────────────────

/** A single unspent output as carried in a snapshot (mirrors UTXOEntry + outpoint). */
export interface SnapshotUTXO {
  txid: string; vout: number; value: bigint; scriptPubKey: string; height: number; isCoinbase: boolean;
}

/**
 * A point-in-time snapshot of everything restart needs that ISN'T recomputable
 * from a single block: the UTXO set and the derived chain scalars/accumulator at
 * `tipHeight`. With it, restart replays only the blocks ABOVE the snapshot
 * instead of the whole chain.
 */
export interface ChainSnapshot {
  tipHash: string;
  tipHeight: number;
  currentDifficultyBits: number;
  medianPastTime: number;
  epochFees: bigint;
  recentBlockTimes: number[];
  epochState: EpochState;
  utxos: SnapshotUTXO[];
}

const SNAPSHOT_VERSION = 1;

/**
 * Single-file chainstate snapshot at `<dataDir>/chainstate.snapshot` (binary,
 * versioned). Written atomically (tmp + rename) so a crash mid-write can't leave
 * a torn snapshot. The node writes one periodically and DELETES it on a reorg
 * (the snapshot's tip may then be on an abandoned branch); restart loads it only
 * when it's consistent with the block log, else falls back to full replay.
 */
export class SnapshotStore {
  private readonly file: string;
  private readonly tmp: string;
  private readonly dataDir: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.dataDir = dataDir;
    this.file = join(dataDir, "chainstate.snapshot");
    this.tmp  = join(dataDir, "chainstate.snapshot.tmp");
  }

  exists(): boolean { return existsSync(this.file); }

  write(snap: ChainSnapshot): void {
    const w = new Writer();
    w.u32(SNAPSHOT_VERSION);
    w.raw(Buffer.from(snap.tipHash, "hex"));   // 32 bytes
    w.u64(snap.tipHeight);
    w.u32(snap.currentDifficultyBits);
    w.u64(snap.medianPastTime);
    w.u128(snap.epochFees);
    w.varint(snap.recentBlockTimes.length);
    for (const t of snap.recentBlockTimes) w.u64(t);
    encodeEpochState(w, snap.epochState);
    w.varint(snap.utxos.length);
    for (const u of snap.utxos) {
      w.raw(Buffer.from(u.txid, "hex"));        // 32 bytes
      w.u32(u.vout);
      w.u128(u.value);
      w.str(u.scriptPubKey);
      w.u64(u.height);
      w.raw(Buffer.from([u.isCoinbase ? 1 : 0]));
    }
    atomicWriteFile(this.file, this.tmp, w.build());
  }

  load(): ChainSnapshot | null {
    if (!existsSync(this.file)) return null;
    const r = new Reader(readFileSync(this.file));
    const version = r.u32();
    if (version !== SNAPSHOT_VERSION) {
      throw new StorageCompatibilityError(
        `Unsupported chainstate snapshot version ${version}; expected ${SNAPSHOT_VERSION}`,
      );
    }
    const tipHash = r.raw(32).toString("hex");
    const tipHeight = r.u64();
    const currentDifficultyBits = r.u32();
    const medianPastTime = r.u64();
    const epochFees = r.u128();
    const recentBlockTimes: number[] = [];
    const tCount = r.varint();
    for (let i = 0; i < tCount; i++) recentBlockTimes.push(r.u64());
    const epochState = decodeEpochState(r);
    const utxos: SnapshotUTXO[] = [];
    const uCount = r.varint();
    for (let i = 0; i < uCount; i++) {
      const txid = r.raw(32).toString("hex");
      const vout = r.u32();
      const value = r.u128();
      const scriptPubKey = r.str();
      const height = r.u64();
      const isCoinbase = r.raw(1)[0] === 1;
      utxos.push({ txid, vout, value, scriptPubKey, height, isCoinbase });
    }
    if (!r.done) throw new Error("chainstate snapshot has trailing bytes");
    return { tipHash, tipHeight, currentDifficultyBits, medianPastTime, epochFees, recentBlockTimes, epochState, utxos };
  }

  quarantine(): string | null {
    if (!existsSync(this.file)) return null;
    const target = join(this.dataDir, `chainstate.corrupt.${Date.now()}.snapshot`);
    renameSync(this.file, target);
    if (existsSync(this.tmp)) rmSync(this.tmp);
    syncDirectory(this.dataDir);
    return target;
  }

  clear(): void {
    if (existsSync(this.file)) rmSync(this.file);
    if (existsSync(this.tmp)) rmSync(this.tmp);
    syncDirectory(this.dataDir);
  }
}
