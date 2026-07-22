/**
 * Versioned post-quantum algorithm policy and shared input limits.
 *
 * Consensus code imports this policy instead of scattering algorithm names
 * and magic sizes through the node. A future audited implementation can be
 * introduced as a new suite without silently reinterpreting old addresses,
 * signatures, or proofs.
 */

export const PQ_CRYPTO_SUITE = Object.freeze({
  id: "JGC-PQ-SUITE-2",
  signature: "ML-DSA-65-FIPS204",
  kem: "ML-KEM-768-FIPS203",
  hash: "SHA3-256",
  addressPrefix: "1QG2",
  addressPayloadBytes: 32,
  scriptVersionHex: "52",
  independentlyAudited: false,
  sideChannelResistant: false,
  productionApproved: false,
} as const);

export const PQ_LIMITS = Object.freeze({
  maxProofBytes: 64 * 1024,
  maxContributionsPerBlock: 1024,
  maxCircuitIdBytes: 96,
  maxPublicInputs: 8,
  maxPublicInputBytes: 256,
  maxScriptSigBytes: 24 * 1024,
  maxKeystoreCiphertextBytes: 16 * 1024 * 1024,
  maxWalletKeys: 10_000,
  maxWalletLabelBytes: 128,
} as const);

export function isCanonicalHex(value: unknown, bytes?: number): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length % 2 !== 0) return false;
  if (!/^[0-9a-f]+$/.test(value)) return false;
  return bytes === undefined || value.length === bytes * 2;
}

export function decodeCanonicalHex(value: string, bytes?: number, label = "hex value"): Uint8Array {
  if (!isCanonicalHex(value, bytes)) {
    const size = bytes === undefined ? "an even number of" : String(bytes * 2);
    throw new Error(`${label} must contain exactly ${size} lowercase hex characters`);
  }
  return Uint8Array.from(Buffer.from(value, "hex"));
}

/** Encode tagged fields without delimiter ambiguity. */
export function encodeTaggedFields(
  domain: string,
  fields: ReadonlyArray<readonly [tag: string, value: string | Uint8Array]>
): Buffer {
  const chunks: Buffer[] = [];
  const push = (value: string | Uint8Array): void => {
    const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
    if (bytes.length > 0xffff_ffff) throw new Error("canonical field is too large");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    chunks.push(length, bytes);
  };
  push(domain);
  for (const [tag, value] of fields) {
    push(tag);
    push(value);
  }
  return Buffer.concat(chunks);
}

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

/** Cheap pre-parse guard against adversarially deep JSON containers. */
export function jsonDepthWithinLimit(json: string, maxDepth = 32): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const char of json) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") {
      depth++;
      if (depth > maxDepth) return false;
    } else if (char === "}" || char === "]") {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0 && !inString;
}

/** Fail closed until an independently audited, side-channel-hardened provider is selected. */
export function assertPQProductionReady(): void {
  if (!PQ_CRYPTO_SUITE.productionApproved || !PQ_CRYPTO_SUITE.independentlyAudited ||
      !PQ_CRYPTO_SUITE.sideChannelResistant) {
    throw new Error(
      `${PQ_CRYPTO_SUITE.id} is prototype-only: the active JavaScript PQ provider ` +
      "is not independently audited or side-channel hardened"
    );
  }
}
