/** Runtime-independent primitives used by consensus encodings and ordering. */

export function compareCanonicalBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export function consensusUInt(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
  return BigInt(value);
}

export class CanonicalWriter {
  private readonly chunks: Buffer[] = [];

  domain(value: string): this { return this.string(value); }

  u32(value: number, label = "u32"): this {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
      throw new RangeError(`${label} must fit uint32`);
    }
    const out = Buffer.allocUnsafe(4);
    out.writeUInt32BE(value);
    this.chunks.push(out);
    return this;
  }

  u64(value: number | bigint, label = "u64"): this {
    const n = typeof value === "bigint" ? value : consensusUInt(value, label);
    if (n < 0n || n > 0xffff_ffff_ffff_ffffn) throw new RangeError(`${label} must fit uint64`);
    const out = Buffer.allocUnsafe(8);
    out.writeBigUInt64BE(n);
    this.chunks.push(out);
    return this;
  }

  u128(value: bigint, label = "u128"): this {
    if (value < 0n || value > ((1n << 128n) - 1n)) throw new RangeError(`${label} must fit uint128`);
    const out = Buffer.alloc(16);
    out.writeBigUInt64BE(value >> 64n, 0);
    out.writeBigUInt64BE(value & 0xffff_ffff_ffff_ffffn, 8);
    this.chunks.push(out);
    return this;
  }

  string(value: string): this {
    const bytes = Buffer.from(value, "utf8");
    this.u32(bytes.length, "string length");
    this.chunks.push(bytes);
    return this;
  }

  build(): Buffer { return Buffer.concat(this.chunks); }
}
