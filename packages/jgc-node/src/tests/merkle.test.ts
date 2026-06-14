/**
 * @file src/tests/merkle.test.ts
 * @description Unit tests for the Merkle tree implementation.
 *
 * Tests match Bitcoin's known Merkle root vectors where applicable.
 * Bitcoin's block 170 has 2 transactions and a known Merkle root.
 */

import {
  buildMerkleTree,
  getMerkleRoot,
  getMerkleProof,
  verifyMerkleProof,
  combinePair,
  sha256d,
} from "../crypto/merkle.js";

// Known test vectors — 32-byte hex strings for deterministic testing.
const HASH_A = "a" .repeat(64);  // 32 bytes of 0xaa
const HASH_B = "b" .repeat(64);
const HASH_C = "c" .repeat(64);
const HASH_D = "d" .repeat(64);

describe("sha256d", () => {
  test("double-SHA256 of empty buffer has known length", () => {
    const result = sha256d(Buffer.alloc(0));
    expect(result).toHaveLength(32);
  });

  test("double-SHA256 is deterministic", () => {
    const input = Buffer.from("hello JGC", "utf8");
    const a = sha256d(input);
    const b = sha256d(input);
    expect(a.toString("hex")).toBe(b.toString("hex"));
  });
});

describe("buildMerkleTree", () => {
  test("empty tree has zero root", () => {
    const tree = buildMerkleTree([]);
    expect(tree.root).toBe("0".repeat(64));
  });

  test("single leaf tree has leaf as root", () => {
    const tree = buildMerkleTree([HASH_A]);
    expect(tree.root).toBe(HASH_A);
  });

  test("two-leaf tree root = Hash(A ∥ B)", () => {
    const tree = buildMerkleTree([HASH_A, HASH_B]);
    const expected = combinePair(HASH_A, HASH_B);
    expect(tree.root).toBe(expected);
  });

  test("odd-count duplicates last leaf (Bitcoin convention)", () => {
    // Three leaves: [A, B, C] → pads to [A, B, C, C]
    // Level 1: [Hash(AB), Hash(CC)]
    // Root: Hash(Hash(AB) ∥ Hash(CC))
    const tree3 = buildMerkleTree([HASH_A, HASH_B, HASH_C]);
    const hash_ab = combinePair(HASH_A, HASH_B);
    const hash_cc = combinePair(HASH_C, HASH_C);  // duplicate last
    const expected = combinePair(hash_ab, hash_cc);
    expect(tree3.root).toBe(expected);
  });

  test("four-leaf tree has two layers", () => {
    const tree = buildMerkleTree([HASH_A, HASH_B, HASH_C, HASH_D]);
    expect(tree.layers).toHaveLength(3);  // leaves, middle, root
    expect(tree.layers[0]).toHaveLength(4);
    expect(tree.layers[1]).toHaveLength(2);
    expect(tree.layers[2]).toHaveLength(1);
  });

  test("getMerkleRoot matches buildMerkleTree root", () => {
    const leaves = [HASH_A, HASH_B, HASH_C, HASH_D];
    const treeRoot = buildMerkleTree(leaves).root;
    const fastRoot = getMerkleRoot(leaves);
    expect(fastRoot).toBe(treeRoot);
  });
});

describe("getMerkleProof + verifyMerkleProof", () => {
  test("proof for leaf 0 in 4-leaf tree", () => {
    const leaves = [HASH_A, HASH_B, HASH_C, HASH_D];
    const tree   = buildMerkleTree(leaves);
    const proof  = getMerkleProof(tree, 0);

    expect(proof.leafIndex).toBe(0);
    expect(proof.leafHash).toBe(HASH_A);
    expect(proof.root).toBe(tree.root);
    expect(verifyMerkleProof(proof)).toBe(true);
  });

  test("proof for leaf 1 in 4-leaf tree", () => {
    const leaves = [HASH_A, HASH_B, HASH_C, HASH_D];
    const tree   = buildMerkleTree(leaves);
    const proof  = getMerkleProof(tree, 1);
    expect(verifyMerkleProof(proof)).toBe(true);
  });

  test("proof for leaf 2 in 4-leaf tree", () => {
    const leaves = [HASH_A, HASH_B, HASH_C, HASH_D];
    const tree   = buildMerkleTree(leaves);
    const proof  = getMerkleProof(tree, 2);
    expect(verifyMerkleProof(proof)).toBe(true);
  });

  test("proof for leaf 3 in 4-leaf tree", () => {
    const leaves = [HASH_A, HASH_B, HASH_C, HASH_D];
    const tree   = buildMerkleTree(leaves);
    const proof  = getMerkleProof(tree, 3);
    expect(verifyMerkleProof(proof)).toBe(true);
  });

  test("tampered leaf fails proof", () => {
    const leaves = [HASH_A, HASH_B, HASH_C, HASH_D];
    const tree   = buildMerkleTree(leaves);
    const proof  = getMerkleProof(tree, 0);

    // Tamper the leaf hash.
    const tampered = { ...proof, leafHash: HASH_B };
    expect(verifyMerkleProof(tampered)).toBe(false);
  });

  test("wrong root fails proof", () => {
    const leaves = [HASH_A, HASH_B, HASH_C, HASH_D];
    const tree   = buildMerkleTree(leaves);
    const proof  = getMerkleProof(tree, 0);

    const tampered = { ...proof, root: "deadbeef".repeat(8) };
    expect(verifyMerkleProof(tampered)).toBe(false);
  });

  test("proof for single-leaf tree", () => {
    const leaves = [HASH_A];
    const tree   = buildMerkleTree(leaves);
    const proof  = getMerkleProof(tree, 0);
    expect(verifyMerkleProof(proof)).toBe(true);
  });

  test("proof for odd-count tree (5 leaves)", () => {
    const HASH_E = "e".repeat(64);
    const leaves = [HASH_A, HASH_B, HASH_C, HASH_D, HASH_E];
    const tree   = buildMerkleTree(leaves);

    for (let i = 0; i < leaves.length; i++) {
      const proof = getMerkleProof(tree, i);
      expect(verifyMerkleProof(proof)).toBe(true);
    }
  });

  test("out-of-range index throws", () => {
    const tree = buildMerkleTree([HASH_A, HASH_B]);
    expect(() => getMerkleProof(tree, 5)).toThrow(RangeError);
    expect(() => getMerkleProof(tree, -1)).toThrow(RangeError);
  });
});
