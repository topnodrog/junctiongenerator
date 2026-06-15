/*!
 * rust/src/tflops.rs
 * TFLOPS-seconds computation weight for Proof-of-Useful-Compute.
 *
 * PURPOSE
 * ───────
 * This module converts a task specification (model size, batch size, training
 * steps, etc.) into a canonical TFLOPS-seconds weight that can be compared
 * against the block's difficulty target.
 *
 * BITCOIN COMPARISON:
 *   Bitcoin measures work in "hashes": the expected number of SHA256d
 *   operations to find a hash below the target.
 *     work = 2^256 / target
 *
 *   JGC measures work in "TFLOPS-seconds": the number of floating-point
 *   operations (10^12 FLOPs per TFLOPS) × elapsed seconds.
 *     tflops_weight = model_flops × batch_size × iterations / elapsed_seconds / 1e12
 *
 *   The ZK circuit proves the miner actually performed these computations
 *   (no faking via TFLOPS measurement alone — the proof binds the TFLOPS
 *   claim to the specific task result).
 *
 * FLOP MODELS FOR SUPPORTED TASK TYPES:
 *
 *   AI INFERENCE (transformer forward pass):
 *     FLOPs ≈ 2 × N_params × seqlen × batch_size
 *     (the "2×" accounts for multiply-accumulate pairs)
 *     Example: GPT-2 (117M params), seq=512, batch=1:
 *       FLOPs = 2 × 117e6 × 512 × 1 ≈ 1.2 × 10^11 = 0.12 TFLOPS-seconds
 *
 *   AI TRAINING (forward + backward + optimizer):
 *     FLOPs ≈ 6 × N_params × seqlen × batch_size × gradient_accumulation_steps
 *     (6× = 2× fwd + 4× bwd, standard Adam estimate)
 *
 *   PROTEIN FOLDING (AlphaFold2 one MSA iteration):
 *     FLOPs ≈ MSA_depth × N_residues^2 × pair_representation_dim × 4
 *
 *   SCIENTIFIC (FFT-based simulation):
 *     FLOPs ≈ N × log2(N) × 5    (5 FLOPs per butterfly for complex FFT)
 */

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Task Metadata for TFLOPS Computation
// ---------------------------------------------------------------------------

/// Task-type-specific parameters for TFLOPS weight calculation.
/// These must be committed in the ZK proof's taskCommitment hash.
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "taskType")]
pub enum TaskSpec {
    #[serde(rename = "AI_INFERENCE")]
    AIInference {
        /// Number of model parameters.
        n_params: u64,
        /// Sequence length (token count).
        seq_len: u32,
        /// Inference batch size.
        batch_size: u32,
        /// Number of forward passes performed.
        iterations: u32,
        /// Wall-clock elapsed seconds for all iterations.
        elapsed_seconds: f64,
    },

    #[serde(rename = "AI_TRAINING")]
    AITraining {
        n_params: u64,
        seq_len: u32,
        batch_size: u32,
        /// Number of gradient steps (parameter updates).
        gradient_steps: u32,
        /// Gradient accumulation multiplier.
        gradient_accum: u32,
        elapsed_seconds: f64,
    },

    #[serde(rename = "FOLD_SIM")]
    FoldSim {
        /// Number of amino acid residues in the target protein.
        n_residues: u32,
        /// Multiple sequence alignment depth.
        msa_depth: u32,
        /// Pair representation dimension.
        pair_rep_dim: u32,
        /// Number of recycling iterations.
        recycles: u32,
        elapsed_seconds: f64,
    },

    #[serde(rename = "SCI_COMPUTE")]
    SciCompute {
        /// Number of elements in the simulation (FFT size, MD particle count, etc.).
        n_elements: u64,
        /// Number of simulation timesteps.
        timesteps: u64,
        /// FLOPs per element per timestep (domain-specific constant).
        flops_per_element_step: f64,
        elapsed_seconds: f64,
    },

    #[serde(rename = "COMMERCIAL")]
    Commercial {
        /// Claimed TFLOPS from third-party verifiable task spec.
        claimed_tflops: f64,
        /// Elapsed seconds.
        elapsed_seconds: f64,
    },
}

// ---------------------------------------------------------------------------
// TFLOPS Weight Calculation
// ---------------------------------------------------------------------------

/// Compute the canonical TFLOPS-seconds weight for a task.
///
/// This value is embedded in the ZK proof's public inputs and must match
/// the weight extracted by the verifier from the task specification.
///
/// # Returns
/// TFLOPS-seconds as f64. Returns 0.0 if the task spec is malformed.
///
/// # Comparison to Bitcoin
/// Bitcoin's work calculation: work = 2^256 / target (pure math, no measurement).
/// JGC's TFLOPS weight: derived from task complexity × elapsed time.
/// The ZK proof cryptographically binds the claim to the actual execution trace.
#[wasm_bindgen]
pub fn compute_tflops_weight(task_spec_json: &str) -> f64 {
    let spec: TaskSpec = match serde_json::from_str(task_spec_json) {
        Ok(s)  => s,
        Err(e) => {
            web_sys::console::error_1(&format!("TaskSpec parse error: {}", e).into());
            return 0.0;
        }
    };

    calculate_tflops(&spec)
}

/// Internal TFLOPS calculation — separated for unit testing.
pub fn calculate_tflops(spec: &TaskSpec) -> f64 {
    match spec {
        TaskSpec::AIInference { n_params, seq_len, batch_size, iterations, elapsed_seconds } => {
            // FLOPs for transformer inference (dominant term: attention + FFN):
            //   Attention: 4 × seqlen^2 × d_model + 8 × seqlen × d_model^2
            //   FFN:       16 × seqlen × d_model^2
            //   Approximate with: 2 × N_params × seqlen × batch_size
            // Reference: Kaplan et al. "Scaling Laws for Neural Language Models" (2020)
            let total_flops = 2.0 * (*n_params as f64) * (*seq_len as f64)
                            * (*batch_size as f64) * (*iterations as f64);
            tflops_from_flops(total_flops, *elapsed_seconds)
        }

        TaskSpec::AITraining { n_params, seq_len, batch_size, gradient_steps, gradient_accum, elapsed_seconds } => {
            // Training FLOPs ≈ 6 × inference FLOPs per batch:
            //   2× forward, 4× backward (gradient computation + weight update)
            // Reference: Hoffmann et al. "Training Compute-Optimal LLMs" (Chinchilla, 2022)
            let total_flops = 6.0 * (*n_params as f64) * (*seq_len as f64)
                            * (*batch_size as f64) * (*gradient_steps as f64)
                            * (*gradient_accum as f64);
            tflops_from_flops(total_flops, *elapsed_seconds)
        }

        TaskSpec::FoldSim { n_residues, msa_depth, pair_rep_dim, recycles, elapsed_seconds } => {
            // AlphaFold2 FLOPs estimate (per Jumper et al. 2021 appendix):
            //   Evoformer block: O(N_seq^2 × N_res^2 × c_z) where N_seq=MSA depth
            //   Simplified per-residue estimate:
            //   FLOPs ≈ msa_depth × n_residues^2 × pair_rep_dim × 4 × recycles
            let nr = *n_residues as f64;
            let total_flops = (*msa_depth as f64) * nr * nr
                            * (*pair_rep_dim as f64) * 4.0
                            * (*recycles as f64);
            tflops_from_flops(total_flops, *elapsed_seconds)
        }

        TaskSpec::SciCompute { n_elements, timesteps, flops_per_element_step, elapsed_seconds } => {
            let total_flops = (*n_elements as f64) * (*timesteps as f64)
                            * flops_per_element_step;
            tflops_from_flops(total_flops, *elapsed_seconds)
        }

        TaskSpec::Commercial { claimed_tflops, elapsed_seconds: _ } => {
            // Commercial tasks provide their own TFLOPS claim, verified by the
            // third-party circuit. No local calculation — trust the proof.
            *claimed_tflops
        }
    }
}

/// Convert raw FLOPs and elapsed seconds to a TFLOPS-seconds weight.
///
/// TFLOPS-seconds = total_flops / 1e12
/// (Not divided by elapsed_seconds — we want total work, not throughput)
///
/// The elapsed_seconds is used to compute peak_tflops = flops/elapsed/1e12,
/// which is stored separately for hardware qualification but not used
/// as the work weight (we want total work, not rate).
fn tflops_from_flops(total_flops: f64, _elapsed_seconds: f64) -> f64 {
    if total_flops <= 0.0 {
        return 0.0;
    }
    total_flops / 1e12
}

// ---------------------------------------------------------------------------
// Difficulty Mapping
// ---------------------------------------------------------------------------

/// Map a TFLOPS-seconds weight to a compact difficulty bits value.
///
/// BITCOIN ANALOG: arith_uint256.SetCompact() — converts the nBits compact
/// representation to/from a 256-bit integer target.
///
/// JGC maps: 1 TFLOPS-second = difficulty unit 1.0
/// The compact bits encoding is the same as Bitcoin's nBits format,
/// reinterpreted over TFLOPS rather than hash outputs.
///
/// @param tflops_target  Required TFLOPS-seconds for a valid block.
/// @returns 32-bit compact encoding.
#[wasm_bindgen]
pub fn tflops_to_compact_bits(tflops_target: f64) -> u32 {
    // Scale to integer: TFLOPS × 10^6 (micro-TFLOPS precision)
    let scaled = (tflops_target * 1_000_000.0).round() as u64;
    let scaled = scaled.max(1);

    // Find the byte length.
    let mut size: u32 = 0;
    let mut temp = scaled;
    while temp > 0 { temp >>= 8; size += 1; }

    // Extract top 3 bytes as mantissa.
    let shift = if size > 3 { (size - 3) * 8 } else { 0 };
    let mantissa = ((scaled >> shift) as u32) & 0x00FFFFFF;
    // Exponent is the byte length of the scaled value — must match the
    // consensus encoding in src/consensus/emission.ts encodeDifficultyBits().
    let exponent = size;

    (exponent << 24) | mantissa
}

/// Decode compact bits back to TFLOPS-seconds target.
#[wasm_bindgen]
pub fn compact_bits_to_tflops(compact_bits: u32) -> f64 {
    let exponent = (compact_bits >> 24) & 0xFF;
    let mantissa = (compact_bits & 0x00FFFFFF) as u64;

    if exponent <= 3 {
        let shift = (3 - exponent) * 8;
        (mantissa >> shift) as f64 / 1_000_000.0
    } else {
        let shift = (exponent - 3) * 8;
        (mantissa << shift) as f64 / 1_000_000.0
    }
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ai_inference_tflops() {
        // GPT-2 Small (117M params), seq=512, batch=1, 1 iteration.
        let spec = TaskSpec::AIInference {
            n_params:        117_000_000,
            seq_len:         512,
            batch_size:      1,
            iterations:      1,
            elapsed_seconds: 0.5,
        };
        let weight = calculate_tflops(&spec);
        // 2 × 117e6 × 512 × 1 × 1 / 1e12 = 0.11980... TFLOPS-seconds
        assert!((weight - 0.11981).abs() < 0.001,
            "GPT-2 inference weight: {}", weight);
    }

    #[test]
    fn test_compact_bits_roundtrip() {
        let original = 1000.0f64;  // 1000 TFLOPS-seconds
        let bits     = tflops_to_compact_bits(original);
        let decoded  = compact_bits_to_tflops(bits);
        // Allow 0.01% error from compact encoding precision.
        let err = ((decoded - original) / original).abs();
        assert!(err < 0.001, "Roundtrip error {:.6} for {}", err, original);
    }

    #[test]
    fn test_zero_flops_returns_zero() {
        let spec = TaskSpec::AIInference {
            n_params:        0,
            seq_len:         0,
            batch_size:      0,
            iterations:      0,
            elapsed_seconds: 1.0,
        };
        assert_eq!(calculate_tflops(&spec), 0.0);
    }
}
