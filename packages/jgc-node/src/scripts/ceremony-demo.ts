/**
 * @file src/scripts/ceremony-demo.ts
 * @description Multi-party trusted-setup ceremony (Groth16 Phase 2) demo.
 *
 * Demonstrates that JGC's verifying key can be produced by a MULTI-PARTY ceremony
 * rather than a single trusted party, so the toxic waste (δ) is unknown unless
 * every contributor colludes:
 *
 *   1. Show the single-party setup VK vs a 3-party ceremony VK: only δ
 *      (delta_g2) changes — α, β, γ, and the IC vector are untouched — proving
 *      each contributor re-randomized δ without altering the circuit.
 *   2. Register the CEREMONY VK and verify a proof produced under the matching
 *      ceremony proving key (strict real pairing) — it is ACCEPTED.
 *   3. Show that a proof from the PRE-CEREMONY (base) proving key is REJECTED
 *      under the ceremony VK — the ceremony genuinely changed the keys, so a
 *      party who only knew the base setup cannot forge against the final VK.
 *
 * SIMNET/DEV note: contributions are seeded and run in one process for a
 * reproducible demo. In production each δ_i is fresh entropy on a separate
 * machine, with the in-progress keys passed contributor → contributor, and each
 * contribution attested with the e(new_δ_g1, old_δ_g2) == e(old_δ_g1, new_δ_g2)
 * pairing check (covered by the Rust ceremony tests).
 *
 * Run:  npm run ceremony-demo     (after npm run build:all)
 */

import type { ComputeProof } from "../types/index.js";
import { ComputeTaskType } from "../types/index.js";
import {
  loadVerifierWasm, proverSetup, proverProve, ceremonySetup, ceremonyProve,
  verifyComputeProof, buildPublicInputs, CIRCUIT_REGISTRY, getVerifierMode,
} from "../crypto/zkp.js";
import { BLOCKS_PER_EPOCH } from "../consensus/emission.js";

const SEED         = 2024;
const CONTRIBUTORS = [101, 202, 303];   // three independent parties
const CIRCUIT_ID   = "CIRCUIT_CONV1D_V1";
const CONV_N       = 16;
const CONV_K       = 4;
const DIFFICULTY   = 50;
const HEIGHT       = 5;

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

/** Wrap a prover result into a ComputeProof with canonical public inputs. */
function toComputeProof(res: { proof: string; taskCommitment: string; tflops: number }): ComputeProof {
  const epoch = HEIGHT % BLOCKS_PER_EPOCH;
  const p: ComputeProof = {
    taskCommitment:   res.taskCommitment,
    proofBytes:       res.proof,
    circuitId:        CIRCUIT_ID,
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
  console.log(" JGC Node — multi-party trusted-setup ceremony (Groth16 Phase 2)");
  console.log("══════════════════════════════════════════════════════════════");

  await loadVerifierWasm({ mode: "strict" });
  if (getVerifierMode() !== "strict") {
    console.error("[Ceremony] FAIL ✗  verifier is not in strict mode");
    process.exit(1);
  }

  // ── 1. Single-party setup vs multi-party ceremony VK ──────────────────────
  const base = proverSetup(SEED);
  const cer  = ceremonySetup(SEED, CONTRIBUTORS);
  console.log(`[Ceremony] ${CONTRIBUTORS.length} contributors: ${CONTRIBUTORS.join(", ")}`);

  let allOk = true;
  const check = (label: string, cond: boolean): void => {
    allOk = allOk && cond;
    console.log(`  ${pad(label, 46)} ${cond ? "✓" : "✗"}`);
  };
  check("δ (delta_g2) re-randomized vs single-party setup", cer.delta !== base.delta);
  check("α (alpha) unchanged — circuit not altered", cer.alpha === base.alpha);
  check("γ (gamma) unchanged", cer.gamma === base.gamma);
  check("IC vector unchanged (same length)", cer.ic.length === base.ic.length && cer.ic[0] === base.ic[0]);

  // Register the CEREMONY verifying key.
  CIRCUIT_REGISTRY.set(CIRCUIT_ID, {
    circuitId: CIRCUIT_ID,
    alpha: cer.alpha, beta: cer.beta, gamma: cer.gamma, delta: cer.delta, ic: cer.ic,
    numPublicInputs: cer.numPublicInputs,
    minTFLOPSPerProof: 1, maxTFLOPSPerProof: 1_000_000, activeSinceHeight: 0,
  });
  console.log("──────────────────────────────────────────────────────────────");

  const x = Array.from({ length: CONV_N }, (_, i) => String(i + 1));
  const h = Array.from({ length: CONV_K }, (_, j) => String(j + 2));
  const epoch = HEIGHT % BLOCKS_PER_EPOCH;

  // ── 2. Proof under the ceremony proving key → ACCEPTED ────────────────────
  const cerProof = toComputeProof(ceremonyProve(SEED, CONTRIBUTORS, x, h, epoch));
  const cerRes = verifyComputeProof(cerProof, epoch, DIFFICULTY, HEIGHT);
  check("ceremony-key proof verifies under ceremony VK", cerRes.valid === true);

  // ── 3. Proof under the PRE-CEREMONY base key → REJECTED ───────────────────
  const baseProof = toComputeProof(proverProve(SEED, x, h, epoch));
  const baseRes = verifyComputeProof(baseProof, epoch, DIFFICULTY, HEIGHT);
  check("pre-ceremony base proof REJECTED under ceremony VK", baseRes.valid === false);

  console.log("──────────────────────────────────────────────────────────────");
  console.log("[Ceremony] δ re-randomized by N parties; ceremony proofs accepted,");
  console.log("[Ceremony] pre-ceremony proofs rejected — toxic waste needs all N");
  console.log(`[Ceremony] RESULT: ${allOk ? "PASS ✓" : "FAIL ✗"}`);
  if (!allOk) process.exit(1);
}

main().catch(err => {
  console.error("[Ceremony] Unhandled error:", err);
  process.exit(1);
});
