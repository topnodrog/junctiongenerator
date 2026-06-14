/*!
 * rust/src/zkp_verify.rs
 * Groth16 ZK-SNARK verification over BN254 for Proof-of-Useful-Compute.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MATHEMATICAL BACKGROUND — GROTH16 VERIFICATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A Groth16 proof π over BN254 is a triple (A, B, C) where:
 *   A ∈ G1 (64 bytes uncompressed)
 *   B ∈ G2 (128 bytes uncompressed)
 *   C ∈ G1 (64 bytes uncompressed)
 *
 * Total uncompressed proof: 256 bytes.  JGC transmits the proof as the
 * Arkworks CanonicalSerialize-uncompressed encoding of `Proof<Bn254>` (A‖B‖C),
 * base64-encoded for P2P (256 bytes → 344 base64 chars).
 *
 * VERIFICATION EQUATION (Groth16 §3.2):
 *   e(A, B) = e(α, β) · e(L, γ) · e(C, δ)
 * where the public-input commitment
 *   L = IC[0] + Σ_{i=1}^{ℓ} x_i · IC[i]      (a.k.a. gamma_abc_g1)
 *   e: G1 × G2 → GT is the BN254 optimal Ate pairing,
 *   α, β, γ, δ are the trusted-setup (CRS) generators in the verifying key,
 *   x_i are the public input field elements.
 *
 * Arkworks evaluates this as a single multi-Miller-loop + final
 * exponentiation (prepare_verifying_key precomputes e(α,β) and -γ, -δ), so the
 * whole check is one fixed-size pairing product — O(1) regardless of circuit
 * size, exactly the succinctness property Groth16 provides.
 *
 * BITCOIN COMPARISON — Bitcoin's CheckProofOfWork (pow.cpp):
 *   return UintToArith256(hash) <= bnTarget;     // one 256-bit compare, ~1 ns
 *   JGC:   verify_proof(pvk, π, x)               // ~a few ms, 3 pairings
 * Both return a bool; JGC's is far heavier but proves 10^12+ useful FLOPs
 * occurred rather than purposeless hashing. Acceptable at a 600 s block target.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IMPLEMENTATION
 *   The pairing check is delegated to Arkworks (ark-groth16, ark-bn254) — the
 *   leading, independently-audited Rust ZK stack. The core verification logic
 *   lives in pure-Rust functions (verify_groth16_core / verify_structural_core)
 *   so it is unit-testable on the host without the wasm-bindgen/js_sys layer;
 *   the #[wasm_bindgen] entry points are thin marshalling wrappers.
 *
 *   Two verification paths are exported:
 *     • groth16_verify            — the REAL pairing check (consensus path).
 *     • groth16_verify_structural — well-formedness only (no pairing). Used by
 *       the simnet/dev harness, which mines with placeholder proofs; gated on
 *       the TypeScript side by verifierMode and NEVER used on mainnet.
 * ═══════════════════════════════════════════════════════════════════════════
 */

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

use core::str::FromStr;

use ark_bn254::{Bn254, Fr, G1Affine, G2Affine};
use ark_groth16::{prepare_verifying_key, Groth16, Proof, ProvingKey, VerifyingKey};
use ark_snark::SNARK;
use ark_serialize::{CanonicalDeserialize, CanonicalSerialize};
use ark_ff::{BigInteger, Field, PrimeField};
use ark_ec::{AffineRepr, CurveGroup};
use ark_relations::r1cs::{ConstraintSynthesizer, ConstraintSystemRef, SynthesisError};
use ark_std::rand::SeedableRng;
use ark_std::UniformRand;
use rand_chacha::ChaCha20Rng;

// Poseidon (native + R1CS gadget) for the in-circuit I/O commitment.
use ark_crypto_primitives::sponge::CryptographicSponge;
use ark_crypto_primitives::sponge::poseidon::{find_poseidon_ark_and_mds, PoseidonConfig, PoseidonSponge};
use ark_crypto_primitives::sponge::constraints::CryptographicSpongeVar;
use ark_crypto_primitives::sponge::poseidon::constraints::PoseidonSpongeVar;
// R1CS gadget standard library (allocation, equality, field vars).
use ark_r1cs_std::alloc::AllocVar;
use ark_r1cs_std::eq::EqGadget;
use ark_r1cs_std::fields::fp::FpVar;
use ark_r1cs_std::fields::FieldVar;

// ---------------------------------------------------------------------------
// Types (mirror of TypeScript VerificationKey interface)
// ---------------------------------------------------------------------------

/// Serialized verification key — JSON-decoded from the circuit registry.
/// Curve points are hex-encoded Arkworks uncompressed encodings, optionally
/// prefixed with "0x":
///   alpha, ic[i]        → G1 uncompressed  (64 bytes → 128 hex chars)
///   beta, gamma, delta  → G2 uncompressed  (128 bytes → 256 hex chars)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SerializedVK {
    #[serde(rename = "circuitId")]
    pub circuit_id: String,
    pub alpha: String,   // G1 point, hex
    pub beta:  String,   // G2 point, hex
    pub gamma: String,   // G2 point, hex
    pub delta: String,   // G2 point, hex
    pub ic:    Vec<String>,  // G1 points, hex (a.k.a. gamma_abc_g1)
    #[serde(rename = "numPublicInputs")]
    pub num_public_inputs: usize,
}

// ---------------------------------------------------------------------------
// Pure-Rust Verification Core (host-testable, no js_sys)
// ---------------------------------------------------------------------------

/// The real Groth16 pairing verification.
///
/// Returns `Ok(true)` iff the proof satisfies the Groth16 equation for `vk`
/// and `inputs`; `Ok(false)` for a well-formed but invalid proof; `Err` for
/// malformed inputs (bad lengths, undecodable points, out-of-field scalars).
///
/// SECURITY NOTES:
///   • Points are deserialized with Validate::Yes (Arkworks default for
///     `deserialize_uncompressed`), which performs the on-curve AND prime-order
///     subgroup checks — rejecting small-subgroup / invalid-point attacks.
///   • `inputs` are decimal field elements reconstructed by the caller from
///     authoritative on-chain data (see zkp.ts buildPublicInputs); we never
///     trust submitter-supplied public inputs.
pub fn verify_groth16_core(
    proof_bytes: &[u8],
    vk:          &SerializedVK,
    inputs:      &[String],
) -> Result<bool, String> {
    // ── Cheap structural pre-checks (reject malformed before pairing) ───────
    if proof_bytes.len() < 256 {
        return Err(format!("proof too short: {} bytes, expected 256", proof_bytes.len()));
    }
    if inputs.len() != vk.num_public_inputs {
        return Err(format!(
            "input count mismatch: got {}, expected {}",
            inputs.len(), vk.num_public_inputs
        ));
    }
    // IC must have exactly numPublicInputs + 1 entries (IC[0] is the constant
    // term; IC[1..=ℓ] pair with each public input).
    if vk.ic.len() != vk.num_public_inputs + 1 {
        return Err(format!(
            "IC length {} != numPublicInputs + 1 ({})",
            vk.ic.len(), vk.num_public_inputs + 1
        ));
    }

    // ── Deserialize the proof (A‖B‖C, uncompressed, Arkworks-canonical) ─────
    let proof = Proof::<Bn254>::deserialize_uncompressed(&proof_bytes[..256])
        .map_err(|e| format!("proof deserialize failed: {e:?}"))?;

    // ── Reconstruct the verifying key from hex points ───────────────────────
    let mut gamma_abc_g1 = Vec::with_capacity(vk.ic.len());
    for (i, h) in vk.ic.iter().enumerate() {
        gamma_abc_g1.push(g1_from_hex(h).map_err(|e| format!("IC[{i}]: {e}"))?);
    }
    let vkey = VerifyingKey::<Bn254> {
        alpha_g1:     g1_from_hex(&vk.alpha).map_err(|e| format!("alpha: {e}"))?,
        beta_g2:      g2_from_hex(&vk.beta ).map_err(|e| format!("beta: {e}"))?,
        gamma_g2:     g2_from_hex(&vk.gamma).map_err(|e| format!("gamma: {e}"))?,
        delta_g2:     g2_from_hex(&vk.delta).map_err(|e| format!("delta: {e}"))?,
        gamma_abc_g1,
    };
    let pvk = prepare_verifying_key(&vkey);

    // ── Parse public inputs as BN254 scalar field elements ──────────────────
    let mut public_inputs = Vec::with_capacity(inputs.len());
    for s in inputs {
        let fr = Fr::from_str(s).map_err(|_| format!("invalid field element: {s}"))?;
        public_inputs.push(fr);
    }

    // ── The pairing equation: e(A,B) == e(α,β)·e(L,γ)·e(C,δ) ────────────────
    // SNARK::verify_with_processed_vk(pvk, public_inputs, proof) — Arkworks
    // runs this as one multi-Miller-loop + final exponentiation.
    Groth16::<Bn254>::verify_with_processed_vk(&pvk, &public_inputs, &proof)
        .map_err(|e| format!("pairing check error: {e:?}"))
}

/// Well-formedness check ONLY — no pairing. The simnet/dev path.
///
/// Validates: proof length, public-input count, IC length, public inputs are
/// canonical in-field decimals, and the A/B/C regions are non-zero. Returns
/// true if all pass. This is the legacy "structural" behaviour; it accepts any
/// structurally-valid bytes and MUST NOT be used as a consensus check.
pub fn verify_structural_core(
    proof_bytes: &[u8],
    vk:          &SerializedVK,
    inputs:      &[String],
) -> bool {
    // G1 uncompressed 64 + G2 uncompressed 128 + G1 uncompressed 64 = 256.
    if proof_bytes.len() < 256 {
        return false;
    }
    if inputs.len() != vk.num_public_inputs {
        return false;
    }
    if vk.ic.len() != vk.num_public_inputs + 1 {
        return false;
    }

    // Each public input must be a canonical decimal strictly below the BN254
    // scalar field modulus p (values can exceed u128, so compare as decimals).
    const BN254_SCALAR_FIELD_ORDER: &str =
        "21888242871839275222246405745257275088548364400416034343698204186575808495617";
    for input in inputs {
        if input.is_empty() || !input.chars().all(|c| c.is_ascii_digit()) {
            return false;
        }
        if !decimal_lt(input, BN254_SCALAR_FIELD_ORDER) {
            return false;
        }
    }

    // A, B, C must not be the point at infinity (all-zero bytes).
    let a_zero = proof_bytes[0..64].iter().all(|&b| b == 0);
    let b_zero = proof_bytes[64..192].iter().all(|&b| b == 0);
    let c_zero = proof_bytes[192..256].iter().all(|&b| b == 0);
    if a_zero || b_zero || c_zero {
        return false;
    }

    true
}

// ---------------------------------------------------------------------------
// Conv1D Useful-Compute Circuit + Prover  (real scientific kernel)
// ---------------------------------------------------------------------------
//
// Proves a 1-D valid convolution (FIR filter) — a genuine signal-processing
// kernel — and binds JGC's three canonical public inputs:
//
//     y[i] = Σ_{j=0}^{K-1} h[j] · x[i+j]   for i in 0..M,   M = N − K + 1
//
//   public[0] = taskCommitment = Poseidon(x ‖ h ‖ y)   (commits the exact I/O)
//   public[1] = tflopsWeight   = the kernel's FLOP count (a miner cannot claim
//               more compute than was actually proven)
//   public[2] = epochBlockIndex
//
// x and h are the secret witness; y is recomputed in-circuit and constrained.
// The Poseidon hash is enforced INSIDE the circuit (PoseidonSpongeVar) so
// taskCommitment provably commits to the real inputs/output. tflopsWeight is
// pinned to the FLOP constant 2·K·M, scaled by 1e9 to match the nano-TFLOPS
// quantization in zkp.ts buildPublicInputs.
//
// SIMNET/DEV note: the trusted setup is a deterministic single-party run (seeded
// for reproducibility), NOT a multi-party ceremony. Dimensions are fixed and
// modest so proving stays fast; production parameterises these per circuit
// family and runs a real ceremony.
//
// Public inputs are allocated in the SAME order the verifier supplies them.

/// Input vector length.
const CONV_N: usize = 16;
/// Filter taps.
const CONV_K: usize = 4;
/// Output length (valid convolution): N − K + 1.
const CONV_M: usize = CONV_N - CONV_K + 1;
/// FLOP count of the kernel: one multiply + one add per tap per output (2·K·M).
const CONV_FLOPS: u64 = (2 * CONV_K * CONV_M) as u64;
/// nano-TFLOPS scale used by zkp.ts buildPublicInputs (tflopsWeight × 1e9).
const NANO: u64 = 1_000_000_000;

/// Standard Poseidon-128 over BN254 Fr: width t = 3 (rate 2, capacity 1),
/// S-box x^5, 8 full + 57 partial rounds. ark/MDS are generated deterministically
/// by the Grain LFSR — the SAME config is used natively and in-circuit, so the
/// two Poseidon implementations produce identical digests.
fn poseidon_config() -> PoseidonConfig<Fr> {
    let full_rounds: usize = 8;
    let partial_rounds: usize = 57;
    let alpha: u64 = 5;
    let rate: usize = 2;
    let capacity: usize = 1;
    let (ark, mds) = find_poseidon_ark_and_mds::<Fr>(
        Fr::MODULUS_BIT_SIZE as u64,
        rate,
        full_rounds as u64,
        partial_rounds as u64,
        0, // skip_matrices — take the first qualifying MDS
    );
    PoseidonConfig::new(full_rounds, partial_rounds, alpha, mds, ark, rate, capacity)
}

/// Native 1-D valid convolution: y[i] = Σ_j h[j]·x[i+j].
fn conv1d_native(x: &[Fr], h: &[Fr]) -> Vec<Fr> {
    let mut y = Vec::with_capacity(CONV_M);
    for i in 0..CONV_M {
        let mut acc = Fr::from(0u64);
        for j in 0..CONV_K {
            acc += h[j] * x[i + j];
        }
        y.push(acc);
    }
    y
}

/// Native Poseidon hash of a field-element vector (matches the in-circuit gadget).
fn poseidon_hash_native(inputs: &[Fr]) -> Fr {
    let mut sponge = PoseidonSponge::<Fr>::new(&poseidon_config());
    sponge.absorb(&inputs.to_vec());
    sponge.squeeze_field_elements::<Fr>(1)[0]
}

#[derive(Clone)]
struct Conv1dCircuit {
    task_commitment: Option<Fr>,      // public[0]
    tflops:          Option<Fr>,      // public[1]
    epoch:           Option<Fr>,      // public[2]
    x:               Option<Vec<Fr>>, // witness, length CONV_N
    h:               Option<Vec<Fr>>, // witness, length CONV_K
}

impl Conv1dCircuit {
    /// Structure-only instance for the trusted setup (no witness values).
    fn blueprint() -> Self {
        Conv1dCircuit { task_commitment: None, tflops: None, epoch: None, x: None, h: None }
    }
}

impl ConstraintSynthesizer<Fr> for Conv1dCircuit {
    fn generate_constraints(self, cs: ConstraintSystemRef<Fr>) -> Result<(), SynthesisError> {
        // ── Public inputs, canonical order (fixes IC[1..=3]) ─────────────────
        let tc_var     = FpVar::<Fr>::new_input(cs.clone(), || self.task_commitment.ok_or(SynthesisError::AssignmentMissing))?;
        let tflops_var = FpVar::<Fr>::new_input(cs.clone(), || self.tflops.ok_or(SynthesisError::AssignmentMissing))?;
        let _epoch_var = FpVar::<Fr>::new_input(cs.clone(), || self.epoch.ok_or(SynthesisError::AssignmentMissing))?;

        // ── Secret witness: x (length N), h (length K) ───────────────────────
        let x_vars: Vec<FpVar<Fr>> = (0..CONV_N)
            .map(|i| FpVar::<Fr>::new_witness(cs.clone(), || {
                Ok(self.x.as_ref().ok_or(SynthesisError::AssignmentMissing)?[i])
            }))
            .collect::<Result<_, _>>()?;
        let h_vars: Vec<FpVar<Fr>> = (0..CONV_K)
            .map(|j| FpVar::<Fr>::new_witness(cs.clone(), || {
                Ok(self.h.as_ref().ok_or(SynthesisError::AssignmentMissing)?[j])
            }))
            .collect::<Result<_, _>>()?;

        // ── The useful computation: y[i] = Σ_j h[j]·x[i+j] (enforced) ────────
        let mut y_vars: Vec<FpVar<Fr>> = Vec::with_capacity(CONV_M);
        for i in 0..CONV_M {
            let mut acc = FpVar::<Fr>::zero();
            for j in 0..CONV_K {
                acc += &h_vars[j] * &x_vars[i + j];
            }
            y_vars.push(acc);
        }

        // ── Commit the exact I/O: taskCommitment == Poseidon(x ‖ h ‖ y) ──────
        let mut absorb: Vec<FpVar<Fr>> = Vec::with_capacity(CONV_N + CONV_K + CONV_M);
        absorb.extend(x_vars.iter().cloned());
        absorb.extend(h_vars.iter().cloned());
        absorb.extend(y_vars.iter().cloned());
        let mut sponge = PoseidonSpongeVar::<Fr>::new(cs.clone(), &poseidon_config());
        sponge.absorb(&absorb)?;
        let squeezed = sponge.squeeze_field_elements(1)?;
        squeezed[0].enforce_equal(&tc_var)?;

        // ── Bind tflopsWeight to the kernel's FLOP count (2·K·M × 1e9) ───────
        let flop_scaled = Fr::from(CONV_FLOPS) * Fr::from(NANO);
        tflops_var.enforce_equal(&FpVar::<Fr>::constant(flop_scaled))?;

        Ok(())
    }
}

/// Hex-encode an Arkworks-uncompressed G1 point (0x-prefixed).
fn g1_to_hex(p: &G1Affine) -> String {
    let mut v = Vec::new();
    p.serialize_uncompressed(&mut v).expect("G1 serialize");
    format!("0x{}", hex_encode(&v))
}
/// Hex-encode an Arkworks-uncompressed G2 point (0x-prefixed).
fn g2_to_hex(p: &G2Affine) -> String {
    let mut v = Vec::new();
    p.serialize_uncompressed(&mut v).expect("G2 serialize");
    format!("0x{}", hex_encode(&v))
}

/// Convert an Arkworks VerifyingKey into JGC's SerializedVK form.
fn serialize_vk(circuit_id: &str, vk: &VerifyingKey<Bn254>) -> SerializedVK {
    SerializedVK {
        circuit_id:        circuit_id.to_string(),
        alpha:             g1_to_hex(&vk.alpha_g1),
        beta:              g2_to_hex(&vk.beta_g2),
        gamma:             g2_to_hex(&vk.gamma_g2),
        delta:             g2_to_hex(&vk.delta_g2),
        ic:                vk.gamma_abc_g1.iter().map(g1_to_hex).collect(),
        num_public_inputs: vk.gamma_abc_g1.len() - 1,
    }
}

/// Deterministic trusted setup for the Conv1D circuit. Returns the verifying key
/// as JGC SerializedVK JSON (empty string on failure). `seed` makes the VK
/// reproducible; groth16_prove(seed, ..) re-derives the matching proving key.
///
/// SIMNET/DEV ONLY — production setup is a multi-party ceremony.
#[wasm_bindgen]
pub fn groth16_setup(seed: u32) -> String {
    let mut rng = ChaCha20Rng::seed_from_u64(seed as u64);
    match Groth16::<Bn254>::circuit_specific_setup(Conv1dCircuit::blueprint(), &mut rng) {
        Ok((_pk, vk)) => serde_json::to_string(&serialize_vk("CIRCUIT_CONV1D_V1", &vk)).unwrap_or_default(),
        Err(e)        => { console_err(&format!("groth16_setup: {e:?}")); String::new() }
    }
}

/// Parse the JS x/h arrays into field-element vectors, with length checks.
fn parse_conv_inputs(x: &js_sys::Array, h: &js_sys::Array) -> Result<(Vec<Fr>, Vec<Fr>), String> {
    let xs = js_array_to_strings(x);
    let hs = js_array_to_strings(h);
    if xs.len() != CONV_N || hs.len() != CONV_K {
        return Err(format!("expected {CONV_N} x values and {CONV_K} h values"));
    }
    let pv = |v: &[String]| v.iter().map(|s| Fr::from_str(s).map_err(|_| ())).collect::<Result<Vec<Fr>, ()>>();
    match (pv(&xs), pv(&hs)) {
        (Ok(a), Ok(b)) => Ok((a, b)),
        _ => Err("field parse error".into()),
    }
}

/// Prove `circuit` with `pk` and serialize to JSON {proof, taskCommitment, tflops}.
/// Kernel-agnostic: any useful-compute circuit that commits its I/O as `tc` and
/// binds `flops` reuses this. (Shared by Conv1D, MatVec, and the ceremony path.)
fn finish_proof<C: ConstraintSynthesizer<Fr>>(
    pk: &ProvingKey<Bn254>, circuit: C, tc: Fr, flops: u64, rng: &mut ChaCha20Rng,
) -> String {
    let proof = match Groth16::<Bn254>::prove(pk, circuit, rng) {
        Ok(pf) => pf,
        Err(e) => { console_err(&format!("prove: {e:?}")); return String::new(); }
    };
    let mut bytes = Vec::new();
    if proof.serialize_uncompressed(&mut bytes).is_err() {
        console_err("proof serialize failed");
        return String::new();
    }
    // taskCommitment as 32-byte big-endian hex (so zkp.ts BigInt("0x"+hex) == tc).
    let tc_hex = hex_encode(&tc.into_bigint().to_bytes_be());
    format!(
        "{{\"proof\":\"{}\",\"taskCommitment\":\"{}\",\"tflops\":{}}}",
        base64_encode(&bytes), tc_hex, flops
    )
}

/// Core conv prover: compute y = conv(x,h), commit Poseidon(x‖h‖y), prove with
/// `pk`. Shared by the single-party (groth16_prove) and ceremony paths.
fn prove_conv_json(pk: &ProvingKey<Bn254>, xv: Vec<Fr>, hv: Vec<Fr>, epoch: u32, rng: &mut ChaCha20Rng) -> String {
    let yv = conv1d_native(&xv, &hv);
    let mut io = Vec::with_capacity(CONV_N + CONV_K + CONV_M);
    io.extend_from_slice(&xv);
    io.extend_from_slice(&hv);
    io.extend_from_slice(&yv);
    let tc = poseidon_hash_native(&io);

    let circuit = Conv1dCircuit {
        task_commitment: Some(tc),
        tflops:          Some(Fr::from(CONV_FLOPS) * Fr::from(NANO)),
        epoch:           Some(Fr::from(epoch as u64)),
        x:               Some(xv),
        h:               Some(hv),
    };
    finish_proof(pk, circuit, tc, CONV_FLOPS, rng)
}

/// Produce a real Groth16 proof for the Conv1D useful-compute circuit (single-
/// party setup). Uses ChaCha20Rng(seed): the same seed reproduces
/// groth16_setup(seed)'s verifying key.
#[wasm_bindgen]
pub fn groth16_prove(seed: u32, x: js_sys::Array, h: js_sys::Array, epoch: u32) -> String {
    let (xv, hv) = match parse_conv_inputs(&x, &h) {
        Ok(p) => p,
        Err(e) => { console_err(&format!("groth16_prove: {e}")); return String::new(); }
    };
    let mut rng = ChaCha20Rng::seed_from_u64(seed as u64);
    let (pk, _vk) = match Groth16::<Bn254>::circuit_specific_setup(Conv1dCircuit::blueprint(), &mut rng) {
        Ok(kp) => kp,
        Err(e) => { console_err(&format!("groth16_prove setup: {e:?}")); return String::new(); }
    };
    prove_conv_json(&pk, xv, hv, epoch, &mut rng)
}

// ---------------------------------------------------------------------------
// Multi-Party Trusted-Setup Ceremony (Groth16 Phase 2)
// ---------------------------------------------------------------------------
//
// circuit_specific_setup() generates the WHOLE structured reference string from
// one RNG — so that single party knows the toxic waste (δ and the rest). A real
// deployment runs a multi-party ceremony so the keys are secure unless EVERY
// contributor colludes. This implements the standard Groth16 Phase-2 update:
// each contributor i picks a fresh random δ_i and re-randomises the δ-dependent
// key material:
//
//     vk.delta_g2 ← δ_i · delta_g2          pk.delta_g1 ← δ_i · delta_g1
//     pk.h_query  ← δ_i⁻¹ · h_query         pk.l_query  ← δ_i⁻¹ · l_query
//
// (α, β, γ and the A/B/IC query vectors are δ-independent and untouched.) After
// N contributions the effective toxic waste is δ = δ_initial · ∏ δ_i — unknown
// to anyone unless all N collude. A contribution is verifiable: it must scale
// delta_g1 and delta_g2 by the SAME scalar, i.e.
//     e(new_delta_g1, old_delta_g2) == e(old_delta_g1, new_delta_g2).
//
// SIMNET/DEV note: here the N contributions are seeded and run in one process so
// the demo is reproducible; in production each δ_i is fresh entropy generated on
// a separate machine, with the in-progress keys passed contributor→contributor.

fn scale_g1(p: &G1Affine, s: Fr) -> G1Affine { (p.into_group() * s).into_affine() }
fn scale_g2(p: &G2Affine, s: Fr) -> G2Affine { (p.into_group() * s).into_affine() }

/// Apply one Phase-2 contribution in place: new δ = δ · `inc`.
fn ceremony_contribute(pk: &mut ProvingKey<Bn254>, inc: Fr) {
    let inc_inv = inc.inverse().expect("contribution scalar must be nonzero");
    pk.delta_g1    = scale_g1(&pk.delta_g1, inc);
    pk.vk.delta_g2 = scale_g2(&pk.vk.delta_g2, inc);
    for q in pk.h_query.iter_mut() { *q = scale_g1(q, inc_inv); }
    for q in pk.l_query.iter_mut() { *q = scale_g1(q, inc_inv); }
}

/// Run the full ceremony deterministically: base setup (setup_seed) + one
/// Phase-2 contribution per contributor seed. Returns the final (pk, vk).
fn run_ceremony(setup_seed: u32, contributor_seeds: &[u32]) -> (ProvingKey<Bn254>, VerifyingKey<Bn254>) {
    let mut rng = ChaCha20Rng::seed_from_u64(setup_seed as u64);
    let (mut pk, _vk0) =
        Groth16::<Bn254>::circuit_specific_setup(Conv1dCircuit::blueprint(), &mut rng).unwrap();
    for &cs in contributor_seeds {
        // Each contributor draws δ_i from their OWN independent entropy.
        let mut crng = ChaCha20Rng::seed_from_u64(0xC0FFEE_00u64 ^ cs as u64);
        let inc = Fr::rand(&mut crng);
        ceremony_contribute(&mut pk, inc);
    }
    let vk = pk.vk.clone();
    (pk, vk)
}

fn js_to_u32s(arr: &js_sys::Array) -> Vec<u32> {
    (0..arr.length()).map(|i| arr.get(i).as_f64().unwrap_or(0.0) as u32).collect()
}

/// Run a multi-party ceremony and return the final verifying key as SerializedVK
/// JSON. `contributor_seeds` is a JS array of per-party seeds (≥1 for security).
#[wasm_bindgen]
pub fn groth16_ceremony(setup_seed: u32, contributor_seeds: js_sys::Array) -> String {
    let seeds = js_to_u32s(&contributor_seeds);
    let (_pk, vk) = run_ceremony(setup_seed, &seeds);
    serde_json::to_string(&serialize_vk("CIRCUIT_CONV1D_V1", &vk)).unwrap_or_default()
}

/// Produce a Conv1D proof under the CEREMONY proving key (matches
/// groth16_ceremony(setup_seed, contributor_seeds)'s verifying key).
#[wasm_bindgen]
pub fn groth16_prove_ceremony(
    setup_seed:        u32,
    contributor_seeds: js_sys::Array,
    x:                 js_sys::Array,
    h:                 js_sys::Array,
    epoch:             u32,
) -> String {
    let (xv, hv) = match parse_conv_inputs(&x, &h) {
        Ok(p) => p,
        Err(e) => { console_err(&format!("groth16_prove_ceremony: {e}")); return String::new(); }
    };
    let seeds = js_to_u32s(&contributor_seeds);
    let (pk, _vk) = run_ceremony(setup_seed, &seeds);
    // Independent, deterministic prove randomness (distinct from setup/ceremony).
    let mut rng = ChaCha20Rng::seed_from_u64((setup_seed as u64) ^ 0x50524F5645u64);
    prove_conv_json(&pk, xv, hv, epoch, &mut rng)
}

// ---------------------------------------------------------------------------
// MatVec Useful-Compute Circuit  (matrix-vector multiply — a neural-net layer)
// ---------------------------------------------------------------------------
//
// A SECOND kernel family proving the architecture is kernel-agnostic: it reuses
// the SAME 3 public inputs (taskCommitment, tflopsWeight, epoch), the SAME
// in-circuit Poseidon I/O commitment, the SAME FLOP-count binding, and the SAME
// finish_proof/verify path as Conv1D — only the inner relation differs:
//
//     y[r] = Σ_c W[r·COLS + c] · x[c]      (W is ROWS × COLS, row-major)
//
// taskCommitment = Poseidon(W ‖ x ‖ y); tflopsWeight = 2·ROWS·COLS. Adding more
// kernels (NTT, etc.) follows this exact pattern: a circuit + native fn + a
// setup/prove pair, all sharing poseidon_config / finish_proof / verify.

const MV_ROWS: usize = 4;
const MV_COLS: usize = 8;
const MV_FLOPS: u64 = (2 * MV_ROWS * MV_COLS) as u64; // 64

/// Native matrix-vector product: y[r] = Σ_c W[r·COLS+c]·x[c].
fn matvec_native(w: &[Fr], x: &[Fr]) -> Vec<Fr> {
    let mut y = Vec::with_capacity(MV_ROWS);
    for r in 0..MV_ROWS {
        let mut acc = Fr::from(0u64);
        for c in 0..MV_COLS {
            acc += w[r * MV_COLS + c] * x[c];
        }
        y.push(acc);
    }
    y
}

#[derive(Clone)]
struct MatVecCircuit {
    task_commitment: Option<Fr>,
    tflops:          Option<Fr>,
    epoch:           Option<Fr>,
    w:               Option<Vec<Fr>>, // witness, ROWS×COLS row-major
    x:               Option<Vec<Fr>>, // witness, COLS
}

impl MatVecCircuit {
    fn blueprint() -> Self {
        MatVecCircuit { task_commitment: None, tflops: None, epoch: None, w: None, x: None }
    }
}

impl ConstraintSynthesizer<Fr> for MatVecCircuit {
    fn generate_constraints(self, cs: ConstraintSystemRef<Fr>) -> Result<(), SynthesisError> {
        let tc_var     = FpVar::<Fr>::new_input(cs.clone(), || self.task_commitment.ok_or(SynthesisError::AssignmentMissing))?;
        let tflops_var = FpVar::<Fr>::new_input(cs.clone(), || self.tflops.ok_or(SynthesisError::AssignmentMissing))?;
        let _epoch_var = FpVar::<Fr>::new_input(cs.clone(), || self.epoch.ok_or(SynthesisError::AssignmentMissing))?;

        let w_vars: Vec<FpVar<Fr>> = (0..MV_ROWS * MV_COLS)
            .map(|i| FpVar::<Fr>::new_witness(cs.clone(), || Ok(self.w.as_ref().ok_or(SynthesisError::AssignmentMissing)?[i])))
            .collect::<Result<_, _>>()?;
        let x_vars: Vec<FpVar<Fr>> = (0..MV_COLS)
            .map(|c| FpVar::<Fr>::new_witness(cs.clone(), || Ok(self.x.as_ref().ok_or(SynthesisError::AssignmentMissing)?[c])))
            .collect::<Result<_, _>>()?;

        let mut y_vars: Vec<FpVar<Fr>> = Vec::with_capacity(MV_ROWS);
        for r in 0..MV_ROWS {
            let mut acc = FpVar::<Fr>::zero();
            for c in 0..MV_COLS {
                acc += &w_vars[r * MV_COLS + c] * &x_vars[c];
            }
            y_vars.push(acc);
        }

        let mut absorb: Vec<FpVar<Fr>> = Vec::with_capacity(MV_ROWS * MV_COLS + MV_COLS + MV_ROWS);
        absorb.extend(w_vars.iter().cloned());
        absorb.extend(x_vars.iter().cloned());
        absorb.extend(y_vars.iter().cloned());
        let mut sponge = PoseidonSpongeVar::<Fr>::new(cs.clone(), &poseidon_config());
        sponge.absorb(&absorb)?;
        let squeezed = sponge.squeeze_field_elements(1)?;
        squeezed[0].enforce_equal(&tc_var)?;

        tflops_var.enforce_equal(&FpVar::<Fr>::constant(Fr::from(MV_FLOPS) * Fr::from(NANO)))?;
        Ok(())
    }
}

fn parse_matvec_inputs(w: &js_sys::Array, x: &js_sys::Array) -> Result<(Vec<Fr>, Vec<Fr>), String> {
    let ws = js_array_to_strings(w);
    let xs = js_array_to_strings(x);
    if ws.len() != MV_ROWS * MV_COLS || xs.len() != MV_COLS {
        return Err(format!("expected {} W values and {MV_COLS} x values", MV_ROWS * MV_COLS));
    }
    let pv = |v: &[String]| v.iter().map(|s| Fr::from_str(s).map_err(|_| ())).collect::<Result<Vec<Fr>, ()>>();
    match (pv(&ws), pv(&xs)) { (Ok(a), Ok(b)) => Ok((a, b)), _ => Err("field parse error".into()) }
}

/// Trusted setup for the MatVec circuit → SerializedVK JSON (CIRCUIT_MATVEC_V1).
#[wasm_bindgen]
pub fn groth16_setup_matvec(seed: u32) -> String {
    let mut rng = ChaCha20Rng::seed_from_u64(seed as u64);
    match Groth16::<Bn254>::circuit_specific_setup(MatVecCircuit::blueprint(), &mut rng) {
        Ok((_pk, vk)) => serde_json::to_string(&serialize_vk("CIRCUIT_MATVEC_V1", &vk)).unwrap_or_default(),
        Err(e)        => { console_err(&format!("groth16_setup_matvec: {e:?}")); String::new() }
    }
}

/// Produce a real Groth16 proof for the MatVec circuit. `w` = ROWS×COLS values
/// (row-major), `x` = COLS values. Returns JSON {proof, taskCommitment, tflops}.
#[wasm_bindgen]
pub fn groth16_prove_matvec(seed: u32, w: js_sys::Array, x: js_sys::Array, epoch: u32) -> String {
    let (wv, xv) = match parse_matvec_inputs(&w, &x) {
        Ok(p) => p,
        Err(e) => { console_err(&format!("groth16_prove_matvec: {e}")); return String::new(); }
    };
    let yv = matvec_native(&wv, &xv);
    let mut io = Vec::with_capacity(MV_ROWS * MV_COLS + MV_COLS + MV_ROWS);
    io.extend_from_slice(&wv);
    io.extend_from_slice(&xv);
    io.extend_from_slice(&yv);
    let tc = poseidon_hash_native(&io);

    let mut rng = ChaCha20Rng::seed_from_u64(seed as u64);
    let (pk, _vk) = match Groth16::<Bn254>::circuit_specific_setup(MatVecCircuit::blueprint(), &mut rng) {
        Ok(kp) => kp,
        Err(e) => { console_err(&format!("groth16_prove_matvec setup: {e:?}")); return String::new(); }
    };
    let circuit = MatVecCircuit {
        task_commitment: Some(tc),
        tflops:          Some(Fr::from(MV_FLOPS) * Fr::from(NANO)),
        epoch:           Some(Fr::from(epoch as u64)),
        w:               Some(wv),
        x:               Some(xv),
    };
    finish_proof(&pk, circuit, tc, MV_FLOPS, &mut rng)
}

// ---------------------------------------------------------------------------
// WASM Entry Points (thin marshalling wrappers over the cores)
// ---------------------------------------------------------------------------

/// Verify a single Groth16 proof (REAL pairing — consensus path).
///
/// # Arguments
/// * `proof_b64`     — Base64-encoded 256-byte proof (A‖B‖C, uncompressed)
/// * `vk_json`       — JSON-serialised SerializedVK
/// * `public_inputs` — JS array of decimal strings (field elements)
#[wasm_bindgen]
pub fn groth16_verify(
    proof_b64:     &str,
    vk_json:       &str,
    public_inputs: js_sys::Array,
) -> bool {
    let vk: SerializedVK = match serde_json::from_str(vk_json) {
        Ok(v)  => v,
        Err(e) => { console_err(&format!("VK parse error: {e}")); return false; }
    };
    let proof_bytes = match base64_decode(proof_b64) {
        Ok(b)  => b,
        Err(e) => { console_err(&format!("proof decode error: {e}")); return false; }
    };
    let inputs = js_array_to_strings(&public_inputs);

    match verify_groth16_core(&proof_bytes, &vk, &inputs) {
        Ok(valid) => valid,
        Err(e)    => { console_err(&format!("groth16_verify: {e}")); false }
    }
}

/// Structural-only verification (simnet/dev path — NO pairing).
#[wasm_bindgen]
pub fn groth16_verify_structural(
    proof_b64:     &str,
    vk_json:       &str,
    public_inputs: js_sys::Array,
) -> bool {
    let vk: SerializedVK = match serde_json::from_str(vk_json) {
        Ok(v)  => v,
        Err(_) => return false,
    };
    let proof_bytes = match base64_decode(proof_b64) {
        Ok(b)  => b,
        Err(_) => return false,
    };
    let inputs = js_array_to_strings(&public_inputs);
    verify_structural_core(&proof_bytes, &vk, &inputs)
}

/// Batch verify multiple proofs (REAL pairing).
///
/// Returns a JS array of booleans, one per input proof. Each proof is verified
/// independently; a parse/decode failure for one entry yields `false` for that
/// entry without aborting the batch.
///
/// NOTE: this performs sequential single-proof verification. A future
/// optimisation can aggregate into one randomised multi-Miller-loop (the
/// Schnorr-batch analog, BIP 340) for ~Nx fewer final exponentiations.
#[wasm_bindgen]
pub fn groth16_verify_batch(
    proof_b64_array:   js_sys::Array,
    vk_json_array:     js_sys::Array,
    public_inputs_arr: js_sys::Array,
) -> js_sys::Array {
    batch_dispatch(proof_b64_array, vk_json_array, public_inputs_arr, false)
}

/// Batch structural-only verification (simnet/dev path).
#[wasm_bindgen]
pub fn groth16_verify_batch_structural(
    proof_b64_array:   js_sys::Array,
    vk_json_array:     js_sys::Array,
    public_inputs_arr: js_sys::Array,
) -> js_sys::Array {
    batch_dispatch(proof_b64_array, vk_json_array, public_inputs_arr, true)
}

/// Shared batch driver. `structural_only` selects the verification core.
fn batch_dispatch(
    proof_b64_array:   js_sys::Array,
    vk_json_array:     js_sys::Array,
    public_inputs_arr: js_sys::Array,
    structural_only:   bool,
) -> js_sys::Array {
    let results = js_sys::Array::new();
    let n = proof_b64_array.length();

    for i in 0..n {
        let pb   = proof_b64_array.get(i).as_string().unwrap_or_default();
        let vk_s = vk_json_array.get(i).as_string().unwrap_or_default();
        let inp  = public_inputs_arr.get(i)
            .dyn_into::<js_sys::Array>().unwrap_or_else(|_| js_sys::Array::new());

        let vk: SerializedVK = match serde_json::from_str(&vk_s) {
            Ok(v)  => v,
            Err(_) => { results.push(&JsValue::FALSE); continue; }
        };
        let proof_bytes = match base64_decode(&pb) {
            Ok(b)  => b,
            Err(_) => { results.push(&JsValue::FALSE); continue; }
        };
        let inputs = js_array_to_strings(&inp);

        let valid = if structural_only {
            verify_structural_core(&proof_bytes, &vk, &inputs)
        } else {
            verify_groth16_core(&proof_bytes, &vk, &inputs).unwrap_or(false)
        };
        results.push(&JsValue::from(valid));
    }

    results
}

/// Debug helper: decode proof bytes and return the three curve point regions.
/// Used by block explorers and debugging tools.
#[wasm_bindgen]
pub fn decode_proof(proof_b64: &str) -> JsValue {
    let bytes = match base64_decode(proof_b64) {
        Ok(b) => b,
        Err(e) => return JsValue::from_str(&format!("error: {e}")),
    };
    if bytes.len() < 256 {
        return JsValue::from_str("error: proof too short");
    }

    // Proof layout: A(64 G1) ‖ B(128 G2) ‖ C(64 G1).
    let a_hex = hex_encode(&bytes[0..64]);
    let b_hex = hex_encode(&bytes[64..192]);
    let c_hex = hex_encode(&bytes[192..256]);

    let obj = js_sys::Object::new();
    js_sys::Reflect::set(&obj, &JsValue::from_str("A"), &JsValue::from_str(&a_hex)).ok();
    js_sys::Reflect::set(&obj, &JsValue::from_str("B"), &JsValue::from_str(&b_hex)).ok();
    js_sys::Reflect::set(&obj, &JsValue::from_str("C"), &JsValue::from_str(&c_hex)).ok();
    obj.into()
}

// ---------------------------------------------------------------------------
// Curve Point Decoding
// ---------------------------------------------------------------------------

/// Decode a hex (optionally "0x"-prefixed) Arkworks-uncompressed G1 point.
/// Validates on-curve + correct subgroup (Validate::Yes).
fn g1_from_hex(h: &str) -> Result<G1Affine, String> {
    let bytes = hex_decode(h)?;
    G1Affine::deserialize_uncompressed(&bytes[..])
        .map_err(|e| format!("G1 deserialize: {e:?}"))
}

/// Decode a hex (optionally "0x"-prefixed) Arkworks-uncompressed G2 point.
fn g2_from_hex(h: &str) -> Result<G2Affine, String> {
    let bytes = hex_decode(h)?;
    G2Affine::deserialize_uncompressed(&bytes[..])
        .map_err(|e| format!("G2 deserialize: {e:?}"))
}

// ---------------------------------------------------------------------------
// JS Interop Helpers
// ---------------------------------------------------------------------------

/// Collect a JS array of strings into a Rust Vec<String>.
fn js_array_to_strings(arr: &js_sys::Array) -> Vec<String> {
    (0..arr.length())
        .map(|i| arr.get(i).as_string().unwrap_or_default())
        .collect()
}

/// Route an error string to console.error (no-op outside the browser/Node).
fn console_err(msg: &str) {
    web_sys::console::error_1(&JsValue::from_str(msg));
}

// ---------------------------------------------------------------------------
// Encoding Helpers
// ---------------------------------------------------------------------------

/// Decode a base64 string to bytes (standard alphabet, padding optional).
fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    const TABLE: &[u8; 128] = b"\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\
                                  \x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\
                                  \x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x3e\x40\x40\x40\x3f\
                                  \x34\x35\x36\x37\x38\x39\x3a\x3b\x3c\x3d\x40\x40\x40\x40\x40\x40\
                                  \x40\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\
                                  \x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x40\x40\x40\x40\x40\
                                  \x40\x1a\x1b\x1c\x1d\x1e\x1f\x20\x21\x22\x23\x24\x25\x26\x27\x28\
                                  \x29\x2a\x2b\x2c\x2d\x2e\x2f\x30\x31\x32\x33\x40\x40\x40\x40\x40";

    let s = s.trim_end_matches('=');
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let bytes = s.as_bytes();
    let mut i = 0;

    while i + 3 < bytes.len() {
        let [a, b, c, d] = [bytes[i], bytes[i+1], bytes[i+2], bytes[i+3]];
        if a > 127 || b > 127 || c > 127 || d > 127 { return Err("invalid base64 char".into()); }
        let va = TABLE[a as usize];
        let vb = TABLE[b as usize];
        let vc = TABLE[c as usize];
        let vd = TABLE[d as usize];
        if va == 0x40 || vb == 0x40 || vc == 0x40 || vd == 0x40 {
            return Err("invalid base64 char".into());
        }
        out.push((va << 2) | (vb >> 4));
        out.push((vb << 4) | (vc >> 2));
        out.push((vc << 6) | vd);
        i += 4;
    }

    let rem = bytes.len() - i;
    if rem >= 2 {
        let va = TABLE[bytes[i] as usize];
        let vb = TABLE[bytes[i+1] as usize];
        out.push((va << 2) | (vb >> 4));
    }
    if rem == 3 {
        let vb = TABLE[bytes[i+1] as usize];
        let vc = TABLE[bytes[i+2] as usize];
        out.push((vb << 4) | (vc >> 2));
    }

    Ok(out)
}

/// Encode bytes to lowercase hex.
fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Decode a hex string (optional "0x"/"0X" prefix) to bytes.
fn hex_decode(s: &str) -> Result<Vec<u8>, String> {
    let s = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")).unwrap_or(s);
    if s.len() % 2 != 0 {
        return Err("odd-length hex".into());
    }
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len() / 2);
    let mut i = 0;
    while i < b.len() {
        out.push((hex_val(b[i])? << 4) | hex_val(b[i + 1])?);
        i += 2;
    }
    Ok(out)
}

fn hex_val(c: u8) -> Result<u8, String> {
    match c {
        b'0'..=b'9' => Ok(c - b'0'),
        b'a'..=b'f' => Ok(c - b'a' + 10),
        b'A'..=b'F' => Ok(c - b'A' + 10),
        _ => Err("invalid hex char".into()),
    }
}

/// Compare two non-negative decimal integer strings: returns `a < b`.
/// Both must be non-empty ASCII-digit strings (validated by the caller).
fn decimal_lt(a: &str, b: &str) -> bool {
    let a = a.trim_start_matches('0');
    let b = b.trim_start_matches('0');
    if a.len() != b.len() {
        return a.len() < b.len();
    }
    a < b
}

/// Standard-alphabet base64 encode with padding. Used by groth16_prove to emit
/// the proof, and by the round-trip tests.
fn base64_encode(data: &[u8]) -> String {
    const A: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(A[((n >> 18) & 63) as usize] as char);
        out.push(A[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 { A[((n >> 6) & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { A[(n & 63) as usize] as char } else { '=' });
    }
    out
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod decimal_tests {
    use super::decimal_lt;

    const P: &str =
        "21888242871839275222246405745257275088548364400416034343698204186575808495617";

    #[test]
    fn decimal_lt_handles_magnitudes() {
        assert!(decimal_lt("0", "5"));
        assert!(decimal_lt("9", "10"));
        assert!(!decimal_lt("10", "9"));
        assert!(!decimal_lt("7", "7"));
        assert!(decimal_lt("000123", "124"));
    }

    #[test]
    fn decimal_lt_at_field_boundary() {
        let p_minus_1 =
            "21888242871839275222246405745257275088548364400416034343698204186575808495616";
        assert!(decimal_lt(p_minus_1, P));
        assert!(!decimal_lt(P, P));
        let p_plus_1 =
            "21888242871839275222246405745257275088548364400416034343698204186575808495618";
        assert!(!decimal_lt(p_plus_1, P));
    }
}

/// Real Groth16 round-trip: trusted setup → prove → verify, exercising the
/// SAME code path the node uses (verify_groth16_core over JGC's hex VK + base64
/// proof formats). Proves the pairing actually accepts valid proofs and rejects
/// tampered public inputs / tampered proofs / random bytes.
#[cfg(test)]
mod groth16_roundtrip_tests {
    use super::*;
    use ark_bn254::{Bn254, Fr, G1Affine, G2Affine};
    use ark_groth16::{Groth16, VerifyingKey};
    use ark_snark::SNARK;
    use ark_relations::lc;
    use ark_relations::r1cs::{ConstraintSynthesizer, ConstraintSystemRef, SynthesisError};
    use ark_serialize::CanonicalSerialize;
    use rand_chacha::ChaCha20Rng;
    use ark_std::rand::SeedableRng;

    /// Minimal R1CS: prove knowledge of factors a, b with a·b = c, where c is
    /// the single public input. Enough to exercise the full Groth16 pipeline.
    #[derive(Clone)]
    struct MulCircuit {
        a: Option<Fr>,
        b: Option<Fr>,
        c: Option<Fr>,
    }

    impl ConstraintSynthesizer<Fr> for MulCircuit {
        fn generate_constraints(self, cs: ConstraintSystemRef<Fr>) -> Result<(), SynthesisError> {
            let a = cs.new_witness_variable(|| self.a.ok_or(SynthesisError::AssignmentMissing))?;
            let b = cs.new_witness_variable(|| self.b.ok_or(SynthesisError::AssignmentMissing))?;
            let c = cs.new_input_variable(|| self.c.ok_or(SynthesisError::AssignmentMissing))?;
            // Enforce a · b = c.
            cs.enforce_constraint(lc!() + a, lc!() + b, lc!() + c)?;
            Ok(())
        }
    }

    fn g1_hex(p: &G1Affine) -> String {
        let mut v = Vec::new();
        p.serialize_uncompressed(&mut v).unwrap();
        format!("0x{}", hex_encode(&v))
    }
    fn g2_hex(p: &G2Affine) -> String {
        let mut v = Vec::new();
        p.serialize_uncompressed(&mut v).unwrap();
        format!("0x{}", hex_encode(&v))
    }

    /// Serialize an Arkworks VerifyingKey into JGC's SerializedVK JSON form.
    fn make_vk(vk: &VerifyingKey<Bn254>) -> SerializedVK {
        SerializedVK {
            circuit_id: "TEST_MUL_V1".into(),
            alpha: g1_hex(&vk.alpha_g1),
            beta:  g2_hex(&vk.beta_g2),
            gamma: g2_hex(&vk.gamma_g2),
            delta: g2_hex(&vk.delta_g2),
            ic:    vk.gamma_abc_g1.iter().map(g1_hex).collect(),
            num_public_inputs: vk.gamma_abc_g1.len() - 1,
        }
    }

    #[test]
    fn real_groth16_accepts_valid_and_rejects_forgeries() {
        let mut rng = ChaCha20Rng::seed_from_u64(0x5EED_1234);

        // Trusted setup (structure only — no witness needed).
        let (pk, vk) = Groth16::<Bn254>::circuit_specific_setup(
            MulCircuit { a: None, b: None, c: None },
            &mut rng,
        ).unwrap();
        let svk = make_vk(&vk);

        // Prove a real statement: 3 · 11 = 33.
        let a = Fr::from(3u64);
        let b = Fr::from(11u64);
        let c = a * b; // 33
        let proof = Groth16::<Bn254>::prove(
            &pk,
            MulCircuit { a: Some(a), b: Some(b), c: Some(c) },
            &mut rng,
        ).unwrap();

        let mut pb = Vec::new();
        proof.serialize_uncompressed(&mut pb).unwrap();
        assert_eq!(pb.len(), 256, "proof must serialize to 256 uncompressed bytes");
        let proof_b64 = base64_encode(&pb);

        // Round-trip through the node's exact decode + verify path.
        let bytes = base64_decode(&proof_b64).unwrap();

        // (1) Correct public input → ACCEPT.
        assert_eq!(
            verify_groth16_core(&bytes, &svk, &["33".to_string()]),
            Ok(true),
            "valid proof with correct public input must verify"
        );

        // (2) Wrong public input → REJECT (proof is bound to c = 33).
        assert_eq!(
            verify_groth16_core(&bytes, &svk, &["34".to_string()]),
            Ok(false),
            "valid proof with WRONG public input must fail the pairing"
        );

        // (3) Tampered proof byte → REJECT (false or decode error, never Ok(true)).
        let mut tampered = bytes.clone();
        tampered[0] ^= 0x01;
        assert_ne!(
            verify_groth16_core(&tampered, &svk, &["33".to_string()]),
            Ok(true),
            "tampered proof must not verify"
        );

        // (4) Random bytes → REJECT (not a valid curve encoding).
        let random = vec![0xABu8; 256];
        assert_ne!(
            verify_groth16_core(&random, &svk, &["33".to_string()]),
            Ok(true),
            "random bytes must not verify"
        );

        // (5) The structural core ACCEPTS the well-formed real proof too
        //     (simnet path is a strict subset of real well-formedness).
        assert!(
            verify_structural_core(&bytes, &svk, &["33".to_string()]),
            "structural check should pass for a well-formed proof"
        );
    }

    /// Exercises the exact flow the wasm Conv1D prover uses: setup(seed) yields a
    /// VK that verifies a proof from prove(seed) (same seed ⇒ same proving key).
    /// Then checks both bindings: a wrong taskCommitment (I/O) and a wrong tflops
    /// (FLOP count) are each rejected by the pairing.
    #[test]
    fn prover_setup_prove_verify_roundtrip() {
        let seed = 7u64;

        // VK exactly as groth16_setup(seed) would produce it.
        let mut r_vk = ChaCha20Rng::seed_from_u64(seed);
        let (_pk_vk, vk) =
            Groth16::<Bn254>::circuit_specific_setup(Conv1dCircuit::blueprint(), &mut r_vk).unwrap();
        let svk = serialize_vk("CIRCUIT_CONV1D_V1", &vk);

        // Proof exactly as groth16_prove(seed, ..) would produce it.
        let mut r_pf = ChaCha20Rng::seed_from_u64(seed);
        let (pk, _vk2) =
            Groth16::<Bn254>::circuit_specific_setup(Conv1dCircuit::blueprint(), &mut r_pf).unwrap();

        let x: Vec<Fr> = (0..CONV_N).map(|i| Fr::from((i as u64) + 1)).collect();
        let h: Vec<Fr> = (0..CONV_K).map(|j| Fr::from((j as u64) + 2)).collect();
        let y = conv1d_native(&x, &h);
        let mut io = Vec::new();
        io.extend_from_slice(&x);
        io.extend_from_slice(&h);
        io.extend_from_slice(&y);
        let tc = poseidon_hash_native(&io);

        let tflops_field = Fr::from(CONV_FLOPS) * Fr::from(NANO);
        let proof = Groth16::<Bn254>::prove(
            &pk,
            Conv1dCircuit {
                task_commitment: Some(tc),
                tflops:          Some(tflops_field),
                epoch:           Some(Fr::from(5u64)),
                x:               Some(x),
                h:               Some(h),
            },
            &mut r_pf,
        ).unwrap();
        let mut pb = Vec::new();
        proof.serialize_uncompressed(&mut pb).unwrap();

        // Public inputs as the verifier reconstructs them: [tc, FLOPS·1e9, epoch].
        let tflops_dec = (CONV_FLOPS * NANO).to_string();
        let inputs = vec![tc.to_string(), tflops_dec.clone(), "5".to_string()];
        assert_eq!(
            verify_groth16_core(&pb, &svk, &inputs),
            Ok(true),
            "real conv proof must verify against setup(seed) VK"
        );

        // Wrong taskCommitment (I/O binding) → reject.
        let bad_tc = vec![(tc + Fr::from(1u64)).to_string(), tflops_dec.clone(), "5".to_string()];
        assert_eq!(
            verify_groth16_core(&pb, &svk, &bad_tc),
            Ok(false),
            "wrong taskCommitment must fail the pairing"
        );

        // Wrong tflops (FLOP-count binding) → reject.
        let bad_flops = vec![tc.to_string(), "999".to_string(), "5".to_string()];
        assert_eq!(
            verify_groth16_core(&pb, &svk, &bad_flops),
            Ok(false),
            "wrong tflops must fail the pairing"
        );
    }

    /// A multi-party ceremony re-randomizes delta, the final keys remain a valid
    /// keypair, and a ceremony proof does NOT verify under the pre-ceremony VK.
    #[test]
    fn ceremony_rerandomizes_and_keys_stay_valid() {
        // Base (single-party) setup.
        let mut r0 = ChaCha20Rng::seed_from_u64(11);
        let (_pk0, vk0) =
            Groth16::<Bn254>::circuit_specific_setup(Conv1dCircuit::blueprint(), &mut r0).unwrap();

        // Full 3-party ceremony.
        let (pk_f, vk_f) = run_ceremony(11, &[101, 202, 303]);
        assert_ne!(vk_f.delta_g2, vk0.delta_g2, "ceremony must re-randomize delta");

        // Prove under the ceremony pk.
        let x: Vec<Fr> = (0..CONV_N).map(|i| Fr::from((i as u64) + 1)).collect();
        let h: Vec<Fr> = (0..CONV_K).map(|j| Fr::from((j as u64) + 2)).collect();
        let y = conv1d_native(&x, &h);
        let mut io = Vec::new();
        io.extend_from_slice(&x);
        io.extend_from_slice(&h);
        io.extend_from_slice(&y);
        let tc = poseidon_hash_native(&io);
        let mut rp = ChaCha20Rng::seed_from_u64(999);
        let proof = Groth16::<Bn254>::prove(
            &pk_f,
            Conv1dCircuit {
                task_commitment: Some(tc),
                tflops: Some(Fr::from(CONV_FLOPS) * Fr::from(NANO)),
                epoch: Some(Fr::from(5u64)),
                x: Some(x), h: Some(h),
            },
            &mut rp,
        ).unwrap();
        let mut pb = Vec::new();
        proof.serialize_uncompressed(&mut pb).unwrap();
        let inputs = vec![tc.to_string(), (CONV_FLOPS * NANO).to_string(), "5".to_string()];

        // Verifies under the CEREMONY vk…
        assert_eq!(
            verify_groth16_core(&pb, &serialize_vk("CIRCUIT_CONV1D_V1", &vk_f), &inputs),
            Ok(true),
            "proof under ceremony pk must verify with the ceremony vk"
        );
        // …but NOT under the pre-ceremony base vk (delta differs).
        assert_eq!(
            verify_groth16_core(&pb, &serialize_vk("CIRCUIT_CONV1D_V1", &vk0), &inputs),
            Ok(false),
            "ceremony proof must fail under the base vk"
        );
    }

    /// An honest Phase-2 contribution (same scalar on G1 and G2) passes the
    /// pairing consistency check; an inconsistent one (different scalars) fails.
    #[test]
    fn ceremony_contribution_consistency_and_tamper() {
        use ark_ec::pairing::Pairing;
        let mut r0 = ChaCha20Rng::seed_from_u64(7);
        let (pk0, _vk0) =
            Groth16::<Bn254>::circuit_specific_setup(Conv1dCircuit::blueprint(), &mut r0).unwrap();
        let old_g1 = pk0.delta_g1;
        let old_g2 = pk0.vk.delta_g2;

        let inc = Fr::from(123_456_789u64);
        let new_g1 = scale_g1(&old_g1, inc);
        let new_g2 = scale_g2(&old_g2, inc);
        assert_eq!(
            Bn254::pairing(new_g1, old_g2), Bn254::pairing(old_g1, new_g2),
            "honest contribution (same scalar on G1/G2) must be consistent"
        );

        let bad_g2 = scale_g2(&old_g2, inc + Fr::from(1u64));
        assert_ne!(
            Bn254::pairing(new_g1, old_g2), Bn254::pairing(old_g1, bad_g2),
            "inconsistent contribution (different scalars) must be detected"
        );
    }

    /// The MatVec kernel family works end-to-end through the SAME verify path:
    /// setup(seed) VK verifies a prove(seed) MatVec proof; a wrong taskCommitment
    /// (I/O binding) is rejected.
    #[test]
    fn matvec_setup_prove_verify_roundtrip() {
        let seed = 21u64;
        let mut r_vk = ChaCha20Rng::seed_from_u64(seed);
        let (_pk_vk, vk) =
            Groth16::<Bn254>::circuit_specific_setup(MatVecCircuit::blueprint(), &mut r_vk).unwrap();
        let svk = serialize_vk("CIRCUIT_MATVEC_V1", &vk);

        let mut r_pf = ChaCha20Rng::seed_from_u64(seed);
        let (pk, _vk2) =
            Groth16::<Bn254>::circuit_specific_setup(MatVecCircuit::blueprint(), &mut r_pf).unwrap();
        let w: Vec<Fr> = (0..MV_ROWS * MV_COLS).map(|i| Fr::from((i as u64) + 1)).collect();
        let x: Vec<Fr> = (0..MV_COLS).map(|c| Fr::from((c as u64) + 2)).collect();
        let y = matvec_native(&w, &x);
        let mut io = Vec::new();
        io.extend_from_slice(&w);
        io.extend_from_slice(&x);
        io.extend_from_slice(&y);
        let tc = poseidon_hash_native(&io);
        let proof = Groth16::<Bn254>::prove(
            &pk,
            MatVecCircuit {
                task_commitment: Some(tc),
                tflops: Some(Fr::from(MV_FLOPS) * Fr::from(NANO)),
                epoch: Some(Fr::from(9u64)),
                w: Some(w), x: Some(x),
            },
            &mut r_pf,
        ).unwrap();
        let mut pb = Vec::new();
        proof.serialize_uncompressed(&mut pb).unwrap();

        let inputs = vec![tc.to_string(), (MV_FLOPS * NANO).to_string(), "9".to_string()];
        assert_eq!(verify_groth16_core(&pb, &svk, &inputs), Ok(true), "matvec proof must verify");
        let bad = vec![(tc + Fr::from(1u64)).to_string(), (MV_FLOPS * NANO).to_string(), "9".to_string()];
        assert_eq!(verify_groth16_core(&pb, &svk, &bad), Ok(false), "wrong commitment must fail");
    }
}
