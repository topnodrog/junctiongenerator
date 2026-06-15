/*!
 * jgc_verifier — Rust/WASM ZK proof verification library for Junction Generator Coin.
 *
 * This crate is compiled to WebAssembly (wasm32-unknown-unknown) and exposed to
 * the TypeScript node via wasm-bindgen.  It provides:
 *
 *   1. `groth16_verify`       — single Groth16 proof verification over BN254
 *   2. `groth16_verify_batch` — randomised linear combination batch verification
 *   3. `decode_proof`         — debug helper: parse proof bytes into curve points
 *   4. `tflops_weight`        — compute TFLOPS-second weight from task metadata
 *
 * BITCOIN COMPARISON — libbitcoin's secp256k1.h / bitcoin-core's secp256k1.c:
 *   Bitcoin Core ships a hand-optimised C library (libsecp256k1) for ECDSA.
 *   JGC ships this Rust crate for Groth16 — equivalent role in the stack.
 *
 *   Bitcoin's CheckProofOfWork (pow.cpp) calls:
 *     arith_uint256::GetCompact() → SHA256d hash → numeric comparison
 *
 *   JGC's equivalent calls:
 *     groth16_verify(proofBytes, vk, publicInputs) → pairing equation check
 *
 * DEPENDENCIES:
 *   ark-groth16    — Arkworks Groth16 implementation (audited)
 *   ark-bn254      — BN254 curve arithmetic
 *   ark-ec         — Elliptic curve group operations
 *   ark-ff         — Finite field arithmetic
 *   wasm-bindgen   — Rust ↔ JavaScript FFI bridge
 *   serde/serde_json — JSON serialization for VerificationKey
 */

use wasm_bindgen::prelude::*;

pub mod zkp_verify;
pub mod tflops;

// Re-export public API for wasm-bindgen.
//   *_verify            → real BN254 pairing check (consensus path)
//   *_verify_structural → well-formedness only (simnet/dev path, gated in TS)
pub use zkp_verify::{
    groth16_verify, groth16_verify_batch,
    groth16_verify_structural, groth16_verify_batch_structural,
    groth16_setup, groth16_prove,
    groth16_ceremony, groth16_prove_ceremony,
    groth16_setup_matvec, groth16_prove_matvec,
    decode_proof,
};
pub use tflops::compute_tflops_weight;

/// Library version string — exposed to TypeScript for version gating.
#[wasm_bindgen]
pub fn jgc_verifier_version() -> String {
    "0.1.0".to_string()
}

/// One-time initializer — sets up panic hooks for better WASM error messages.
#[wasm_bindgen(start)]
pub fn wasm_init() {
    // In debug builds, route Rust panics to console.error via panic hook.
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}
