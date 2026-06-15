/**
 * @file src/scripts/prove-verify-demo.ts
 * @description Strict-mode prover → verifier demonstration (real useful compute).
 *
 * Proves the full real-cryptography path that the simnet's structural mode does
 * NOT exercise, using a genuine 1-D convolution (FIR filter) circuit:
 *
 *   1. Trusted setup (groth16_setup) for the Conv1D circuit → real verifying key.
 *   2. Register that VK in the circuit registry under CIRCUIT_CONV1D_V1.
 *   3. For each sample miner, run the prover (groth16_prove) on an input vector x
 *      and filter h: it computes y = conv(x, h), commits taskCommitment =
 *      Poseidon(x‖h‖y) IN-CIRCUIT, binds tflopsWeight to the kernel's FLOP count,
 *      and returns a real Groth16 proof.
 *   4. Verify each through verifyComputeProof() in STRICT mode — the same
 *      consensus path validateBlock() uses — exercising the real BN254 pairing.
 *   5. Show the three soundness bindings reject forgeries:
 *        • tampered proof bytes,
 *        • wrong taskCommitment (the Poseidon I/O commitment),
 *        • inflated tflopsWeight (the FLOP-count binding — can't claim more
 *          compute than was actually proven).
 *
 * SIMNET/DEV ONLY: groth16_setup is a seeded single-party setup. A production
 * deployment needs a multi-party ceremony; the circuit dims are fixed and modest.
 *
 * Run:  npm run prove-verify-demo     (after npm run build:all)
 */

import type { ComputeProof } from "../types/index.js";
import { ComputeTaskType } from "../types/index.js";
import {
  loadVerifierWasm, proverSetup, proverProve, verifyComputeProof,
  buildPublicInputs, CIRCUIT_REGISTRY, getVerifierMode,
} from "../crypto/zkp.js";
import { BLOCKS_PER_EPOCH } from "../consensus/emission.js";

const SEED       = 1337;               // setup/prove seed (deterministic VK)
const CIRCUIT_ID = "CIRCUIT_CONV1D_V1";
const DIFFICULTY = 50;                 // min TFLOPS per proof for this demo
const CONV_N     = 16;                 // MUST match CONV_N in rust/src/zkp_verify.rs
const CONV_K     = 4;                  // MUST match CONV_K

/** Build a ComputeProof carrying a REAL conv proof for input x and filter h. */
function buildProof(height: number, x: bigint[], h: bigint[]): ComputeProof {
  const epochBlockIndex = height % BLOCKS_PER_EPOCH;
  const res = proverProve(SEED, x.map(String), h.map(String), epochBlockIndex);

  const base: ComputeProof = {
    taskCommitment:   res.taskCommitment,  // Poseidon(x‖h‖y), 64-hex
    proofBytes:       res.proof,           // base64 A‖B‖C
    circuitId:        CIRCUIT_ID,
    publicInputs:     [],                  // filled below
    tflopsWeight:     res.tflops,          // FLOP count bound into the proof
    taskType:         ComputeTaskType.AI_INFERENCE, // metadata only (not verified)
    computeStartedAt: new Date().toISOString(),
  };
  base.publicInputs = buildPublicInputs(base, epochBlockIndex);
  return base;
}

/** Flip one base64 character so the proof bytes decode to a different point. */
function tamperB64(s: string): string {
  const i = Math.floor(s.length / 2);
  const ch = s[i] === "A" ? "B" : "A";
  return s.slice(0, i) + ch + s.slice(i + 1);
}

/** Flip one hex nibble of the taskCommitment. */
function tamperHex(s: string): string {
  const ch = s[0] === "a" ? "b" : "a";
  return ch + s.slice(1);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function main(): Promise<void> {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(" JGC Node — strict prover → verifier demo (Conv1D, real pairing)");
  console.log("══════════════════════════════════════════════════════════════");

  await loadVerifierWasm({ mode: "strict" });
  if (getVerifierMode() !== "strict") {
    console.error("[ProveVerify] FAIL ✗  verifier is not in strict mode");
    process.exit(1);
  }

  // ── Trusted setup → register the real verifying key ───────────────────────
  const vk = proverSetup(SEED);
  CIRCUIT_REGISTRY.set(CIRCUIT_ID, {
    circuitId:         CIRCUIT_ID,
    alpha:             vk.alpha,
    beta:              vk.beta,
    gamma:             vk.gamma,
    delta:             vk.delta,
    ic:                vk.ic,
    numPublicInputs:   vk.numPublicInputs,
    minTFLOPSPerProof: 1,
    maxTFLOPSPerProof: 1_000_000,
    activeSinceHeight: 0,
  });
  console.log(`[ProveVerify] Setup done — ${CIRCUIT_ID} VK registered ` +
              `(conv N=${CONV_N} K=${CONV_K}, ${vk.numPublicInputs} public inputs, IC ${vk.ic.length})`);
  console.log("──────────────────────────────────────────────────────────────");

  let allOk = true;
  const row = (label: string, expect: boolean, res: { valid: boolean; error?: string }): void => {
    const ok = res.valid === expect;
    allOk = allOk && ok;
    console.log(`  ${pad(label, 32)} ${res.valid ? "valid  " : "invalid"}   expect ${expect ? "valid  " : "invalid"}  ${ok ? "✓" : "✗"}`);
  };

  // sample input vectors (length N) and filters (length K)
  const x1 = Array.from({ length: CONV_N }, (_, i) => BigInt(i + 1));
  const h1 = Array.from({ length: CONV_K }, (_, j) => BigInt(j + 2));
  const x2 = Array.from({ length: CONV_N }, (_, i) => BigInt(2 * i + 3));
  const h2 = Array.from({ length: CONV_K }, (_, j) => BigInt(5 - j));

  // ── Positive cases: real conv proofs must verify under real pairing ───────
  console.log("  POSITIVE — real conv proofs (must verify):");
  const p1 = buildProof(5, x1, h1);
  row(`miner Alpha h=5 (${p1.tflopsWeight} FLOPs)`, true, verifyComputeProof(p1, 5 % BLOCKS_PER_EPOCH, DIFFICULTY, 5));
  const p2 = buildProof(6, x2, h2);
  row(`miner Bravo h=6 (${p2.tflopsWeight} FLOPs)`, true, verifyComputeProof(p2, 6 % BLOCKS_PER_EPOCH, DIFFICULTY, 6));

  // ── Negatives: each soundness binding must reject a forgery ────────────────
  console.log("  NEGATIVE — forgeries (must be rejected):");
  const good = buildProof(7, x1, h1);
  const epoch7 = 7 % BLOCKS_PER_EPOCH;

  // (a) tampered proof bytes
  const tampered: ComputeProof = { ...good, proofBytes: tamperB64(good.proofBytes) };
  row("tampered proof bytes", false, verifyComputeProof(tampered, epoch7, DIFFICULTY, 7));

  // (b) wrong taskCommitment — rebuild publicInputs so metadata passes; the
  //     Poseidon I/O binding makes the pairing fail.
  const wrongIO: ComputeProof = { ...good, taskCommitment: tamperHex(good.taskCommitment) };
  wrongIO.publicInputs = buildPublicInputs(wrongIO, epoch7);
  row("wrong I/O commitment", false, verifyComputeProof(wrongIO, epoch7, DIFFICULTY, 7));

  // (c) inflated tflopsWeight — rebuild publicInputs so metadata passes; the
  //     FLOP-count binding makes the pairing fail (can't claim more compute).
  const inflated: ComputeProof = { ...good, tflopsWeight: good.tflopsWeight + 1000 };
  inflated.publicInputs = buildPublicInputs(inflated, epoch7);
  row("inflated tflops claim", false, verifyComputeProof(inflated, epoch7, DIFFICULTY, 7));

  console.log("──────────────────────────────────────────────────────────────");
  console.log(`[ProveVerify] real Conv1D Groth16 — proofs accepted; tampered bytes,`);
  console.log(`[ProveVerify] forged I/O commitment, and inflated FLOPs all rejected`);
  console.log(`[ProveVerify] RESULT: ${allOk ? "PASS ✓" : "FAIL ✗"}`);
  if (!allOk) process.exit(1);
}

main().catch(err => {
  console.error("[ProveVerify] Unhandled error:", err);
  process.exit(1);
});
