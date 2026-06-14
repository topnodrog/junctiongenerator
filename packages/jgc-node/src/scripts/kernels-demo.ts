/**
 * @file src/scripts/kernels-demo.ts
 * @description Multiple useful-compute kernel families under one architecture.
 *
 * Shows the verifier/registry is kernel-agnostic: TWO different circuits —
 * Conv1D (FIR filter) and MatVec (matrix-vector multiply, a neural-net layer) —
 * each register their own verifying key under a distinct circuitId and each
 * produce real Groth16 proofs that verify in STRICT mode through the SAME
 * verifyComputeProof path (same 3 public inputs, same Poseidon I/O commitment,
 * same FLOP-count binding). A proof from one kernel is rejected under the other
 * kernel's VK — each family is cryptographically distinct.
 *
 * Adding further kernels (NTT, etc.) follows the identical pattern in
 * rust/src/zkp_verify.rs: a circuit + native fn + setup/prove pair.
 *
 * Run:  npm run kernels-demo     (after npm run build:all)
 */

import type { ComputeProof } from "../types/index.js";
import { ComputeTaskType } from "../types/index.js";
import {
  loadVerifierWasm, proverSetup, proverProve, matvecSetup, matvecProve,
  verifyComputeProof, buildPublicInputs, CIRCUIT_REGISTRY, getVerifierMode,
} from "../crypto/zkp.js";
import { BLOCKS_PER_EPOCH } from "../consensus/emission.js";

const CONV_SEED = 7;
const MV_SEED   = 21;
const CONV_ID   = "CIRCUIT_CONV1D_V1";
const MV_ID     = "CIRCUIT_MATVEC_V1";
const CONV_N = 16, CONV_K = 4;     // MUST match rust
const MV_ROWS = 4, MV_COLS = 8;    // MUST match rust
const DIFFICULTY = 50;
const HEIGHT = 5;

function pad(s: string, n: number): string { return s.length >= n ? s : s + " ".repeat(n - s.length); }

function register(id: string, vk: { alpha: string; beta: string; gamma: string; delta: string; ic: string[]; numPublicInputs: number }): void {
  CIRCUIT_REGISTRY.set(id, {
    circuitId: id,
    alpha: vk.alpha, beta: vk.beta, gamma: vk.gamma, delta: vk.delta, ic: vk.ic,
    numPublicInputs: vk.numPublicInputs,
    minTFLOPSPerProof: 1, maxTFLOPSPerProof: 1_000_000, activeSinceHeight: 0,
  });
}

function toComputeProof(circuitId: string, res: { proof: string; taskCommitment: string; tflops: number }): ComputeProof {
  const epoch = HEIGHT % BLOCKS_PER_EPOCH;
  const p: ComputeProof = {
    taskCommitment:   res.taskCommitment,
    proofBytes:       res.proof,
    circuitId,
    publicInputs:     [],
    tflopsWeight:     res.tflops,
    taskType:         ComputeTaskType.AI_INFERENCE,
    computeStartedAt: new Date().toISOString(),
  };
  p.publicInputs = buildPublicInputs(p, epoch);
  return p;
}

async function main(): Promise<void> {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(" JGC Node — multiple useful-compute kernel families (strict)");
  console.log("══════════════════════════════════════════════════════════════");

  await loadVerifierWasm({ mode: "strict" });
  if (getVerifierMode() !== "strict") {
    console.error("[Kernels] FAIL ✗  verifier is not in strict mode");
    process.exit(1);
  }

  // Register a verifying key for each kernel family.
  register(CONV_ID, proverSetup(CONV_SEED));
  register(MV_ID, matvecSetup(MV_SEED));
  console.log(`[Kernels] Registered ${CONV_ID} (conv N=${CONV_N} K=${CONV_K}) and ${MV_ID} (matvec ${MV_ROWS}×${MV_COLS})`);
  console.log("──────────────────────────────────────────────────────────────");

  const epoch = HEIGHT % BLOCKS_PER_EPOCH;
  let allOk = true;
  const row = (label: string, expect: boolean, valid: boolean): void => {
    const ok = valid === expect;
    allOk = allOk && ok;
    console.log(`  ${pad(label, 40)} ${valid ? "valid  " : "invalid"}  expect ${expect ? "valid  " : "invalid"}  ${ok ? "✓" : "✗"}`);
  };

  // Conv1D: real proof verifies under its own VK.
  const convX = Array.from({ length: CONV_N }, (_, i) => String(i + 1));
  const convH = Array.from({ length: CONV_K }, (_, j) => String(j + 2));
  const convProof = toComputeProof(CONV_ID, proverProve(CONV_SEED, convX, convH, epoch));
  row(`Conv1D proof (${convProof.tflopsWeight} FLOPs) → Conv1D VK`, true,
      verifyComputeProof(convProof, epoch, DIFFICULTY, HEIGHT).valid);

  // MatVec: real proof verifies under its own VK.
  const mvW = Array.from({ length: MV_ROWS * MV_COLS }, (_, i) => String(i + 1));
  const mvX = Array.from({ length: MV_COLS }, (_, c) => String(c + 2));
  const mvProof = toComputeProof(MV_ID, matvecProve(MV_SEED, mvW, mvX, epoch));
  row(`MatVec proof (${mvProof.tflopsWeight} FLOPs) → MatVec VK`, true,
      verifyComputeProof(mvProof, epoch, DIFFICULTY, HEIGHT).valid);

  // Cross-family: a MatVec proof presented as Conv1D → rejected (wrong VK).
  const mvAsConv = toComputeProof(CONV_ID, { proof: mvProof.proofBytes, taskCommitment: mvProof.taskCommitment, tflops: mvProof.tflopsWeight });
  row("MatVec proof → Conv1D VK (cross-family)", false,
      verifyComputeProof(mvAsConv, epoch, DIFFICULTY, HEIGHT).valid);

  console.log("──────────────────────────────────────────────────────────────");
  console.log("[Kernels] two real kernel families verify under one architecture;");
  console.log("[Kernels] cross-family proofs rejected — each kernel has its own VK");
  console.log(`[Kernels] RESULT: ${allOk ? "PASS ✓" : "FAIL ✗"}`);
  if (!allOk) process.exit(1);
}

main().catch(err => {
  console.error("[Kernels] Unhandled error:", err);
  process.exit(1);
});
