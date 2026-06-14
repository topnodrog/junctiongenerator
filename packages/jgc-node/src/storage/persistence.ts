/**
 * @file src/storage/persistence.ts
 * @description Durable block storage so a node survives restart.
 *
 * BITCOIN ANALOG: blocks/ (block files) + chainstate (LevelDB UTXO snapshot).
 * JGC v0 keeps it simple and correct: an append-only log of accepted blocks
 * (one tagged-JSON block per line). On startup the node REPLAYS the log through
 * its normal accept path, deterministically rebuilding every derived structure
 * (headers, height index, epoch accumulator, difficulty, and the UTXO set) —
 * so there is no separate snapshot that can diverge from the chain.
 *
 * Blocks contain BigInt amounts and a Map (EpochState.minerContributions), which
 * plain JSON cannot represent; both are encoded with explicit tagged wrappers
 * (same scheme as the P2P wire codec).
 *
 * PRODUCTION NOTE: replace with a binary block store + a UTXO snapshot (to avoid
 * full replay) and fsync/atomic writes before any real deployment.
 */

import { appendFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import type { Block } from "../types/index.js";

const BIGINT_TAG = "$jgc:bigint";
const MAP_TAG = "$jgc:map";

/** Serialize a Block to one tagged-JSON line (BigInt + Map safe). */
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

/**
 * Append-only block store backed by `<dataDir>/blocks.jsonl`.
 * Stores accepted non-genesis blocks in height order.
 */
export class BlockStore {
  private readonly file: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, "blocks.jsonl");
  }

  /** Append one accepted block. */
  append(block: Block): void {
    appendFileSync(this.file, serializeBlock(block) + "\n");
  }

  /** Load all stored blocks in append (height) order. */
  loadAll(): Block[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, "utf8")
      .split("\n")
      .filter(line => line.length > 0)
      .map(deserializeBlock);
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
