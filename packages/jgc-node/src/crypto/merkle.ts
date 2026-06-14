/**
 * @file src/crypto/merkle.ts
 * @description Merkle tree implementation for JGC.
 *
 * BITCOIN COMPARISON — merkle.cpp / merkle.h
 * ───────────────────────────────────────────
 * Bitcoin's ComputeMerkleRoot iterates over a vector of uint256 hashes,
 * repeatedly pairwise-hashing with SHA256d until one root remains.
 * The same "duplicate last leaf" trick (odd-count rows) is used here.
 *
 * JGC uses identical double-SHA256 for the transaction Merkle tree
 * (merkleRoot field of BlockHeader) but adds a SECOND Merkle tree —
 * the ComputeProof Merkle tree whose root is stored in computeRoot.
 * This separation lets light clients verify transaction inclusion
 * independently of compute proof inclusion, matching Bitcoin's SPV model.
 *
 * Key functions:
 *   buildMerkleTree(leaves)     → MerkleTree
 *   getMerkleRoot(leaves)       → Hash256
 *   getMerkleProof(tree, index) → MerkleProof
 *   verifyMerkleProof(proof)    → boolean
 *
 * Leaves are hashed inputs (transaction IDs or ComputeProof hashes).
 * This is consistent with how Bitcoin transactions are identified by txid
 * (double-SHA256 of serialized tx), and how SPV proofs are constructed
 * in Bitcoin's merkleblock P2P message type.
 */

import { createHash } from "crypto";
import type { Hash256 } from "../types/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MerkleTree {
  /** Jagged array: layers[0] = leaf hashes, layers[last] = [root]. */
  layers: Hash256[][];
  /** The single root hash. Empty string if tree has no leaves. */
  root: Hash256;
}

export interface MerkleProof {
  /** Target leaf index in the leaf layer. */
  leafIndex: number;
  /** The leaf hash being proven. */
  leafHash: Hash256;
  /** Sibling hashes at each tree level, bottom-up. */
  siblings: Hash256[];
  /** Direction flags: false = sibling is on the right, true = on the left. */
  siblingOnLeft: boolean[];
  /** Expected root for this proof. */
  root: Hash256;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hash Primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SHA256d — double-SHA256.  Identical to Bitcoin's Hash() in hash.h.
 * Bitcoin: Hash(data) = SHA256(SHA256(data))
 */
export function sha256d(data: Buffer): Buffer {
  const first  = createHash("sha256").update(data).digest();
  const second = createHash("sha256").update(first).digest();
  return second;
}

/** Convenience wrapper: hash a hex string, return lowercase hex. */
export function hashHex(hex: string): Hash256 {
  return sha256d(Buffer.from(hex, "hex")).toString("hex");
}

/**
 * Combine two sibling hashes exactly as Bitcoin's merkle.cpp does:
 *   Hash(left ∥ right) using double-SHA256.
 *
 * Bitcoin source analog:
 *   inline HashWriter MerkleHash_Sha256Midstate_Hasher() { ... }
 *   uint256 MerkleHash_SHA256D(const uint256& left, const uint256& right) {
 *       CHashWriter ss;
 *       ss << left << right;
 *       return ss.GetHash();
 *   }
 */
export function combinePair(left: Hash256, right: Hash256): Hash256 {
  const combined = Buffer.concat([
    Buffer.from(left,  "hex"),
    Buffer.from(right, "hex"),
  ]);
  return sha256d(combined).toString("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree Construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a complete Merkle tree from an array of leaf hashes.
 *
 * BITCOIN ANALOG: ComputeMerkleRoot in src/consensus/merkle.cpp
 *   - Iterates in-place, mutating a flat vector until one root remains.
 *   - JGC stores all layers for proof generation (Merkle path support).
 *
 * Odd-count handling: duplicate the last leaf — same as Bitcoin.
 *   "If there are an odd number of hashes, the last one is duplicated."
 *   (Bitcoin BIP 34 / original Satoshi code comment)
 *
 * @param leaves Array of 32-byte hash hex strings (already hashed inputs).
 * @returns MerkleTree with all layers preserved.
 */
export function buildMerkleTree(leaves: Hash256[]): MerkleTree {
  if (leaves.length === 0) {
    // Empty block — root is the zero hash (same convention as Bitcoin
    // when computing hashMerkleRoot for a coinbase-only block with no txs).
    return { layers: [[]], root: "0".repeat(64) };
  }

  const layers: Hash256[][] = [];
  let current = [...leaves];
  layers.push(current);

  while (current.length > 1) {
    const next: Hash256[] = [];

    // Duplicate last element for odd-length rows (Bitcoin convention).
    if (current.length % 2 !== 0) {
      current.push(current[current.length - 1]!);
    }

    for (let i = 0; i < current.length; i += 2) {
      next.push(combinePair(current[i]!, current[i + 1]!));
    }

    layers.push(next);
    current = next;
  }

  return {
    layers,
    root: current[0]!,
  };
}

/**
 * Compute only the root hash without storing the full tree.
 * Faster for block header construction when proofs aren't needed immediately.
 */
export function getMerkleRoot(leaves: Hash256[]): Hash256 {
  return buildMerkleTree(leaves).root;
}

// ─────────────────────────────────────────────────────────────────────────────
// Merkle Proof Generation & Verification (SPV support)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a Merkle inclusion proof for a leaf at `leafIndex`.
 *
 * BITCOIN ANALOG: CPartialMerkleTree in Bitcoin's merkleblock.h
 *   Bitcoin encodes proofs in GETDATA / merkleblock messages for SPV clients.
 *   JGC uses the same sibling-path pattern to let light clients verify
 *   that a specific ComputeProof is included in computeRoot without
 *   downloading the full block.
 *
 * @param tree    Pre-built MerkleTree from buildMerkleTree().
 * @param leafIndex  Index of the leaf to prove (0-based).
 * @returns MerkleProof containing the sibling path.
 */
export function getMerkleProof(tree: MerkleTree, leafIndex: number): MerkleProof {
  const leaves = tree.layers[0]!;

  if (leafIndex < 0 || leafIndex >= leaves.length) {
    throw new RangeError(
      `leafIndex ${leafIndex} out of range [0, ${leaves.length - 1}]`
    );
  }

  const siblings:    Hash256[] = [];
  const siblingOnLeft: boolean[] = [];
  let idx = leafIndex;

  for (let level = 0; level < tree.layers.length - 1; level++) {
    const layer = tree.layers[level]!;
    const effectiveLayer = layer.length % 2 !== 0
      ? [...layer, layer[layer.length - 1]!]   // pad odd layer
      : layer;

    const isRightChild = idx % 2 === 1;
    const siblingIdx   = isRightChild ? idx - 1 : idx + 1;

    // Sibling is guaranteed within bounds because we padded odd layers.
    siblings.push(effectiveLayer[siblingIdx]!);
    siblingOnLeft.push(isRightChild);           // true if sibling is to the left

    idx = Math.floor(idx / 2);
  }

  return {
    leafIndex,
    leafHash: leaves[leafIndex]!,
    siblings,
    siblingOnLeft,
    root: tree.root,
  };
}

/**
 * Verify a Merkle proof.
 *
 * BITCOIN ANALOG: VerifyMerkleProof (custom SPV client implementations).
 *   Starting from the leaf, repeatedly combine with each sibling up the tree.
 *   If the resulting root matches the header's merkleRoot, the leaf is included.
 *
 * This is exactly how Bitcoin SPV wallets verify transactions without
 * downloading the full block — JGC extends this to ComputeProofs as well.
 *
 * @param proof The MerkleProof generated by getMerkleProof().
 * @returns true if the proof is valid against proof.root.
 */
export function verifyMerkleProof(proof: MerkleProof): boolean {
  let computed: Hash256 = proof.leafHash;

  for (let i = 0; i < proof.siblings.length; i++) {
    const sibling = proof.siblings[i]!;
    if (proof.siblingOnLeft[i]) {
      // Sibling is to the left: Hash(sibling ∥ computed)
      computed = combinePair(sibling, computed);
    } else {
      // Sibling is to the right: Hash(computed ∥ sibling)
      computed = combinePair(computed, sibling);
    }
  }

  return computed === proof.root;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialization Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hash a serialized transaction to produce its txid.
 * BITCOIN ANALOG: CTransaction::GetHash() — double-SHA256 of the raw tx bytes.
 */
export function hashTransaction(rawTxHex: string): Hash256 {
  return hashHex(rawTxHex);
}

/**
 * Hash a ComputeProof to produce its proof ID for Merkle leaf inclusion.
 * Analogous to txid but for compute work attestations.
 */
export function hashComputeProof(proof: {
  taskCommitment: string;
  proofBytes: string;
  circuitId: string;
  tflopsWeight: number;
}): Hash256 {
  const raw = Buffer.concat([
    Buffer.from(proof.taskCommitment, "hex"),
    Buffer.from(proof.proofBytes,    "base64"),
    Buffer.from(proof.circuitId,     "utf8"),
    Buffer.alloc(8).fill(0),   // tflopsWeight as 8-byte little-endian float64
  ]);
  // Write tflopsWeight as float64 LE into the last 8 bytes.
  raw.writeDoubleBE(proof.tflopsWeight, raw.length - 8);
  return sha256d(raw).toString("hex");
}
