/**
 * @file src/crypto/zkp.ts
 * @description ZK-SNARK proof verification layer for Proof-of-Useful-Compute.
 *
 * SYSTEM OVERVIEW
 * ───────────────
 * JGC miners generate Groth16 ZK-SNARK proofs that attest to having performed
 * a specific AI/scientific computation.  This file provides:
 *   1. A TypeScript interface to the Rust/WASM groth16 verifier.
 *   2. Circuit registry — mapping circuitId → verification key.
 *   3. Public input construction for each supported task type.
 *   4. Batch verification for block-level proof validation.
 *
 * CRYPTOGRAPHIC BACKGROUND
 * ────────────────────────
 * Groth16 (Groth, 2016) is a succinct non-interactive argument of knowledge
 * (zk-SNARK) over the BN254 elliptic curve pairing.
 *
 * Proof π = (A: G1, B: G2, C: G1) — three curve points, 256 bytes uncompressed
 * (A: 64 ‖ B: 128 ‖ C: 64).
 * Verification is a constant-time pairing check:
 *   e(A, B) = e(α, β) · ∏ e(γ·xi, δ) · e(C, δ)
 *
 * The "circuit" encodes the AI computation constraints (e.g., "prove that
 * you computed one forward pass of GPT-2 on this batch with these weights").
 * The witness is the actual computation trace; the proof leaks nothing about
 * the trace while proving its correctness.
 *
 * COMPARISON TO BITCOIN'S HASH-BASED PROOF:
 *   Bitcoin: SHA256d(header) < target    — brute-force search, O(1) verify
 *   JGC:     groth16_verify(π, inputs)   — algebraic proof,   O(1) verify
 *
 * Both achieve O(1) verification.  JGC's proof generation is ~1000× slower
 * than a single hash but proves 10^12+ floating-point ops occurred — useful
 * work vs. purposeless entropy.
 *
 * CIRCUIT FAMILIES SUPPORTED
 * ──────────────────────────
 *   CIRCUIT_AI_INFERENCE_V1:  Forward pass of a transformer model
 *   CIRCUIT_AI_TRAINING_V1:   SGD/Adam gradient step + weight update
 *   CIRCUIT_FOLD_SIM_V1:      Protein folding energy minimization step
 *   CIRCUIT_SCI_COMPUTE_V1:   Generic scientific computation (FFT, MD sim)
 *   CIRCUIT_COMMERCIAL_V1:    Verified third-party task (hash of task spec)
 *
 * Each circuit has a published Groth16 trusted setup (CRS) stored on-chain.
 */

import type { ComputeProof } from "../types/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Circuit Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verification key structure for Groth16 over BN254.
 * Produced by the trusted setup ceremony (analogous to Zcash's Powers of Tau).
 *
 * In production these are loaded from a JSON file signed by the JGC foundation
 * multisig and cached in memory at node startup.
 */
export interface VerificationKey {
  /** Circuit identifier — referenced from ComputeProof.circuitId. */
  circuitId: string;
  /** Groth16 α point (G1) as hex-encoded compressed point. */
  alpha: string;
  /** Groth16 β point (G2) as hex-encoded compressed point. */
  beta: string;
  /** Groth16 γ point (G2) as hex-encoded compressed point. */
  gamma: string;
  /** Groth16 δ point (G2) as hex-encoded compressed point. */
  delta: string;
  /** IC[i] — Groth16 input commitment points (a.k.a. gamma_abc_g1).
   *  Length MUST equal numPublicInputs + 1: IC[0] is the constant term and
   *  IC[1..=ℓ] pair with each public input. The Rust verifier rejects any VK
   *  whose ic.length ≠ numPublicInputs + 1. */
  ic: string[];
  /** Number of public inputs expected. */
  numPublicInputs: number;
  /** Minimum TFLOPS-seconds this circuit can credibly attest to. */
  minTFLOPSPerProof: number;
  /** Maximum TFLOPS-seconds (caps fraudulent inflation). */
  maxTFLOPSPerProof: number;
  /** Block height at which this VK became active (governance upgrade path). */
  activeSinceHeight: number;
}

/**
 * Hard-coded circuit registry for JGC mainnet genesis circuits.
 *
 * PRODUCTION NOTE: In a live deployment these are loaded from the genesis
 * block's circuit registration transactions, then updated via on-chain
 * governance votes.  The values below use placeholder keys — replace with
 * actual ceremony outputs before mainnet launch.
 */
export const CIRCUIT_REGISTRY: Map<string, VerificationKey> = new Map([
  [
    "CIRCUIT_AI_INFERENCE_V1",
    {
      circuitId:         "CIRCUIT_AI_INFERENCE_V1",
      alpha:             "0x" + "a1".repeat(32),   // placeholder — replace with ceremony output
      beta:              "0x" + "b2".repeat(64),
      gamma:             "0x" + "c3".repeat(64),
      delta:             "0x" + "d4".repeat(64),
      ic:                ["0x" + "e5".repeat(32), "0x" + "f6".repeat(32), "0x" + "a7".repeat(32), "0x" + "b8".repeat(32)],
      numPublicInputs:   3,   // [taskCommitment, tflopsWeight, epochBlockIndex]
      minTFLOPSPerProof: 100,         // minimum 100 TFLOPS-seconds per proof
      maxTFLOPSPerProof: 1_000_000,   // maximum 1 PFLOPS-second per proof
      activeSinceHeight: 0,
    },
  ],
  [
    "CIRCUIT_AI_TRAINING_V1",
    {
      circuitId:         "CIRCUIT_AI_TRAINING_V1",
      alpha:             "0x" + "11".repeat(32),
      beta:              "0x" + "22".repeat(64),
      gamma:             "0x" + "33".repeat(64),
      delta:             "0x" + "44".repeat(64),
      ic:                ["0x" + "55".repeat(32), "0x" + "66".repeat(32), "0x" + "77".repeat(32), "0x" + "88".repeat(32)],
      numPublicInputs:   3,
      minTFLOPSPerProof: 500,          // training is more intensive
      maxTFLOPSPerProof: 10_000_000,
      activeSinceHeight: 0,
    },
  ],
  [
    "CIRCUIT_FOLD_SIM_V1",
    {
      circuitId:         "CIRCUIT_FOLD_SIM_V1",
      alpha:             "0x" + "aa".repeat(32),
      beta:              "0x" + "bb".repeat(64),
      gamma:             "0x" + "cc".repeat(64),
      delta:             "0x" + "dd".repeat(64),
      ic:                ["0x" + "ee".repeat(32), "0x" + "ff".repeat(32), "0x" + "ab".repeat(32), "0x" + "cd".repeat(32)],
      numPublicInputs:   3,
      minTFLOPSPerProof: 50,
      maxTFLOPSPerProof: 500_000,
      activeSinceHeight: 0,
    },
  ],
  [
    "CIRCUIT_SCI_COMPUTE_V1",
    {
      circuitId:         "CIRCUIT_SCI_COMPUTE_V1",
      alpha:             "0x" + "1a".repeat(32),
      beta:              "0x" + "2b".repeat(64),
      gamma:             "0x" + "3c".repeat(64),
      delta:             "0x" + "4d".repeat(64),
      ic:                ["0x" + "5e".repeat(32), "0x" + "6f".repeat(32), "0x" + "7a".repeat(32), "0x" + "8b".repeat(32)],
      numPublicInputs:   3,
      minTFLOPSPerProof: 10,
      maxTFLOPSPerProof: 100_000,
      activeSinceHeight: 0,
    },
  ],
  [
    "CIRCUIT_COMMERCIAL_V1",
    {
      circuitId:         "CIRCUIT_COMMERCIAL_V1",
      alpha:             "0x" + "ca".repeat(32),
      beta:              "0x" + "cb".repeat(64),
      gamma:             "0x" + "cc".repeat(64),
      delta:             "0x" + "cd".repeat(64),
      ic:                ["0x" + "ce".repeat(32), "0x" + "cf".repeat(32), "0x" + "c0".repeat(32), "0x" + "c1".repeat(32)],
      numPublicInputs:   3,
      minTFLOPSPerProof: 1,
      maxTFLOPSPerProof: 50_000_000,
      activeSinceHeight: 0,
    },
  ],
]);

// ─────────────────────────────────────────────────────────────────────────────
// Rust/WASM FFI Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface expected from the compiled Rust WASM module.
 * The Rust implementation (rust/src/zkp_verify.rs) exports these via wasm-bindgen.
 *
 * PRODUCTION: Load via:
 *   import init, { groth16_verify_batch } from "../rust/pkg/jgc_verifier.js";
 *   await init();
 */
export interface JGCVerifierWasm {
  /**
   * Verify a single Groth16 proof.
   * @param proofBytes   Base64-encoded 256-byte uncompressed proof (A‖B‖C).
   * @param vkJson       JSON-serialized VerificationKey.
   * @param publicInputs Decimal string array of field elements.
   * @returns true if e(A,B) == e(α,β)·∏e(IC·xi,δ)·e(C,δ) holds.
   */
  groth16_verify(
    proofBytes:    string,
    vkJson:        string,
    publicInputs:  string[],
  ): boolean;

  /**
   * Batch-verify multiple proofs using a randomized linear combination.
   * Amortises the pairing cost — 2-4× faster than sequential single verify.
   * Safe because the linear combination is randomised per-batch (no forgery).
   */
  groth16_verify_batch(
    proofBytesArray:   string[],
    vkJsonArray:       string[],
    publicInputsArray: string[][],
  ): boolean[];

  /**
   * Structural-only single verify (NO pairing) — simnet/dev path.
   * Checks well-formedness (lengths, in-field inputs, non-zero points) and
   * returns true without performing the cryptographic pairing check. Gated by
   * verifierMode; MUST NOT be used as a consensus check on mainnet.
   */
  groth16_verify_structural(
    proofBytes:    string,
    vkJson:        string,
    publicInputs:  string[],
  ): boolean;

  /** Structural-only batch verify (NO pairing) — simnet/dev path. */
  groth16_verify_batch_structural(
    proofBytesArray:   string[],
    vkJsonArray:       string[],
    publicInputsArray: string[][],
  ): boolean[];

  /**
   * Deterministic trusted setup for the PoUC demo circuit (SIMNET/DEV ONLY).
   * @param seed  Makes the verifying key reproducible; groth16_prove(seed, ..)
   *              re-derives the matching proving key.
   * @returns JSON-serialized SerializedVK ("" on failure).
   */
  groth16_setup(seed: number): string;

  /**
   * Produce a real Groth16 proof for the Conv1D useful-compute circuit
   * (SIMNET/DEV ONLY). Computes y = conv(x, h) and taskCommitment =
   * Poseidon(x‖h‖y) internally.
   * @param seed   Same seed as groth16_setup → matching proving key.
   * @param x      Input vector (CONV_N decimal strings).
   * @param h      Filter taps (CONV_K decimal strings).
   * @param epoch  Epoch block index.
   * @returns JSON {"proof":"<base64>","taskCommitment":"<64-hex>","tflops":<n>} ("" on failure).
   */
  groth16_prove(seed: number, x: string[], h: string[], epoch: number): string;

  /**
   * Run a multi-party Groth16 Phase-2 ceremony (SIMNET/DEV ONLY) and return the
   * final verifying key as SerializedVK JSON. δ is re-randomized per contributor
   * seed; toxic waste is unknown unless all contributors collude.
   */
  groth16_ceremony(setupSeed: number, contributorSeeds: number[]): string;

  /**
   * Produce a Conv1D proof under the CEREMONY proving key (matches the VK from
   * groth16_ceremony with the same seeds). Returns the same JSON as groth16_prove.
   */
  groth16_prove_ceremony(
    setupSeed: number, contributorSeeds: number[], x: string[], h: string[], epoch: number,
  ): string;

  /** Trusted setup for the MatVec kernel (SIMNET/DEV) → SerializedVK JSON. */
  groth16_setup_matvec(seed: number): string;

  /**
   * Produce a MatVec proof: w = ROWS×COLS row-major, x = COLS. Returns the same
   * JSON shape as groth16_prove.
   */
  groth16_prove_matvec(seed: number, w: string[], x: string[], epoch: number): string;

  /**
   * Parse proof bytes and return decoded curve points for debugging.
   */
  decode_proof(proofBytes: string): {
    A: string; B: string; C: string;
  };
}

/**
 * Verifier operating mode.
 *   "strict" — real BN254 Groth16 pairing check (consensus / production).
 *   "simnet" — structural well-formedness only (no pairing). For the
 *              simulation harness, which mines with placeholder proofs that
 *              carry no valid pairing. NEVER use on mainnet.
 */
export type VerifierMode = "strict" | "simnet";

// Active verification mode — set by loadVerifierWasm(); defaults to strict so
// production is safe-by-default and a forgotten flag fails closed.
let _verifierMode: VerifierMode = "strict";

/** The verification mode currently in effect. */
export function getVerifierMode(): VerifierMode {
  return _verifierMode;
}

// Lazily loaded WASM module — will be populated on first use.
let _wasmModule: JGCVerifierWasm | null = null;

/**
 * Load the Rust WASM verifier module.
 * Call once at node startup before any proof verification.
 */
export async function loadVerifierWasm(
  opts: { mode?: VerifierMode; wasmPath?: string } = {},
): Promise<void> {
  const { mode = "strict", wasmPath } = opts;

  // SAFETY: "simnet" skips the real pairing AND contribution-signature checks —
  // it must never run on a production node (fails closed).
  if (mode === "simnet" && process.env["NODE_ENV"] === "production") {
    throw new Error(
      "verifierMode 'simnet' is forbidden when NODE_ENV=production " +
      "(it skips real Groth16 pairing and contribution signature verification)"
    );
  }

  // Record the mode even if the module is already loaded (mode is independent
  // of which WASM binary is resident — the same binary serves both paths).
  _verifierMode = mode;

  // In production, dynamically import the compiled WASM package.
  // During development/testing, a mock verifier is injected via setMockVerifier().
  if (_wasmModule !== null) return;

  try {
    // Path is relative to the compiled module (dist/crypto/zkp.js) — the
    // wasm-pack output lives at <jgc-node>/rust/pkg.
    // `wasm-pack --target nodejs` emits a CJS module that reads and
    // instantiates the .wasm synchronously on require — there is no init()
    // to call (unlike the web/bundler targets' default-export init).
    const imported = await import(wasmPath ?? "../../rust/pkg/jgc_verifier.js") as Record<string, unknown>;
    const candidate = (
      typeof imported["groth16_verify"] === "function" ? imported : imported["default"]
    ) as (JGCVerifierWasm & { jgc_verifier_version?: () => string }) | undefined;

    if (typeof candidate?.groth16_verify !== "function") {
      throw new Error("module loaded but groth16_verify export is missing");
    }

    _wasmModule = candidate;
    console.log(
      `[JGC zkp.ts] Rust WASM verifier loaded (v${candidate.jgc_verifier_version?.() ?? "unknown"})`
    );
  } catch (err) {
    // Fallback: pure-JS reference implementation for development only.
    // NEVER use in production — it accepts all proofs.
    console.warn(
      `[JGC zkp.ts] WASM verifier not loaded — using JS stub (UNSAFE for production): ${String(err)}`
    );
    _wasmModule = createJSStubVerifier();
  }
}

/** Inject a mock verifier (for unit tests). */
export function setMockVerifier(mock: JGCVerifierWasm): void {
  _wasmModule = mock;
}

function getVerifier(): JGCVerifierWasm {
  if (_wasmModule === null) {
    throw new Error(
      "JGC verifier WASM not loaded. Call loadVerifierWasm() at node startup."
    );
  }
  return _wasmModule;
}

// ─────────────────────────────────────────────────────────────────────────────
// PoUC Demo Prover (SIMNET/DEV ONLY)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crypto fields of a Groth16 verifying key, as returned by the WASM trusted
 * setup (matches the Rust SerializedVK JSON shape). Merge these into a
 * CIRCUIT_REGISTRY entry to verify proofs from the matching circuit in "strict".
 */
export interface SetupVK {
  circuitId: string;
  alpha: string;
  beta: string;
  gamma: string;
  delta: string;
  ic: string[];
  numPublicInputs: number;
}

/**
 * Run the PoUC demo circuit's deterministic trusted setup (SIMNET/DEV ONLY).
 * Requires the real WASM verifier to be loaded (the JS stub cannot do this).
 */
export function proverSetup(seed: number): SetupVK {
  const json = getVerifier().groth16_setup(seed);
  if (!json) throw new Error("proverSetup failed — is the real WASM verifier loaded?");
  return JSON.parse(json) as SetupVK;
}

/** Result of the Conv1D prover (matches the wasm groth16_prove JSON). */
export interface ProveResult {
  /** base64(A‖B‖C) uncompressed Groth16 proof. */
  proof: string;
  /** 64-hex big-endian taskCommitment = Poseidon(x‖h‖y). */
  taskCommitment: string;
  /** FLOP count (2·K·M) bound into the proof as tflopsWeight. */
  tflops: number;
}

/**
 * Produce a real Groth16 proof for the Conv1D circuit (SIMNET/DEV ONLY).
 * The prover computes y = conv(x, h) and taskCommitment = Poseidon(x‖h‖y).
 * @param seed   Same seed used for proverSetup (matching proving key).
 * @param x      Input vector decimal strings (CONV_N entries).
 * @param h      Filter tap decimal strings (CONV_K entries).
 * @param epoch  Epoch block index.
 */
export function proverProve(seed: number, x: string[], h: string[], epoch: number): ProveResult {
  const json = getVerifier().groth16_prove(seed, x, h, epoch);
  if (!json) throw new Error("proverProve failed — is the real WASM verifier loaded?");
  return JSON.parse(json) as ProveResult;
}

/**
 * Run a multi-party Groth16 Phase-2 trusted-setup ceremony (SIMNET/DEV ONLY) and
 * return the final verifying key. δ is re-randomized per contributor seed so the
 * toxic waste is unknown unless ALL contributors collude.
 */
export function ceremonySetup(setupSeed: number, contributorSeeds: number[]): SetupVK {
  const json = getVerifier().groth16_ceremony(setupSeed, contributorSeeds);
  if (!json) throw new Error("ceremonySetup failed — is the real WASM verifier loaded?");
  return JSON.parse(json) as SetupVK;
}

/** Produce a Conv1D proof under the ceremony proving key (matches ceremonySetup). */
export function ceremonyProve(
  setupSeed: number, contributorSeeds: number[], x: string[], h: string[], epoch: number,
): ProveResult {
  const json = getVerifier().groth16_prove_ceremony(setupSeed, contributorSeeds, x, h, epoch);
  if (!json) throw new Error("ceremonyProve failed — is the real WASM verifier loaded?");
  return JSON.parse(json) as ProveResult;
}

/** Trusted setup for the MatVec kernel family (SIMNET/DEV ONLY). */
export function matvecSetup(seed: number): SetupVK {
  const json = getVerifier().groth16_setup_matvec(seed);
  if (!json) throw new Error("matvecSetup failed — is the real WASM verifier loaded?");
  return JSON.parse(json) as SetupVK;
}

/** Produce a MatVec proof: w = ROWS×COLS (row-major), x = COLS. */
export function matvecProve(seed: number, w: string[], x: string[], epoch: number): ProveResult {
  const json = getVerifier().groth16_prove_matvec(seed, w, x, epoch);
  if (!json) throw new Error("matvecProve failed — is the real WASM verifier loaded?");
  return JSON.parse(json) as ProveResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public Input Construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reconstruct the canonical public inputs array for a given proof.
 *
 * CRITICAL: public inputs must be reconstructed from authoritative on-chain
 * data, NOT trusted from the proof submitter.  This prevents a miner from
 * inflating their tflopsWeight claim in the public inputs while keeping the
 * proof itself valid.
 *
 * Public input layout (matches all V1 circuits):
 *   [0]: taskCommitment as BN254 field element (32-byte hash mod p)
 *   [1]: tflopsWeight   as BN254 field element (uint64 cast)
 *   [2]: epochBlockIndex as BN254 field element (uint32 cast)
 *
 * BN254 field prime p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
 */
const BN254_PRIME = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);

export function buildPublicInputs(
  proof: ComputeProof,
  epochBlockIndex: number,
): string[] {
  // Convert taskCommitment (32-byte hash) to field element: interpret as big-endian uint256, mod p.
  const taskCommitmentInt = BigInt("0x" + proof.taskCommitment) % BN254_PRIME;

  // tflopsWeight is a floating-point number — quantise to integer nano-TFLOPS (×10^9).
  // This avoids precision loss when encoding into the integer field.
  const tflopsInt = BigInt(Math.round(proof.tflopsWeight * 1e9));

  const epochInt = BigInt(epochBlockIndex);

  return [
    taskCommitmentInt.toString(),
    tflopsInt.toString(),
    epochInt.toString(),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Proof Verification
// ─────────────────────────────────────────────────────────────────────────────

export interface VerificationResult {
  valid: boolean;
  /** Reason for rejection if valid = false. */
  error?: string;
  /** Decoded TFLOPS claim after verification (0 if invalid). */
  verifiedTFLOPS: number;
}

/**
 * Verify a single ComputeProof.
 *
 * BITCOIN COMPARISON — pow.cpp CheckProofOfWork():
 * ──────────────────────────────────────────────────
 * Bitcoin:
 *   bool CheckProofOfWork(uint256 hash, unsigned int nBits, const Consensus::Params&) {
 *     bool fNegative, fOverflow;
 *     arith_uint256 bnTarget;
 *     bnTarget.SetCompact(nBits, &fNegative, &fOverflow);
 *     if (fNegative || bnTarget == 0 || fOverflow || bnTarget > UintToArith256(params.powLimit))
 *         return false;
 *     if (UintToArith256(hash) > bnTarget)   // ← THE ENTIRE PROOF CHECK
 *         return false;
 *     return true;
 *   }
 *
 * JGC analog (this function):
 *   1. Lookup VK from circuit registry  (≈ reading nBits from header)
 *   2. Reconstruct canonical publicInputs  (≈ computing hash from header fields)
 *   3. groth16_verify(proof, vk, inputs)   (≈ hash < target comparison)
 *   4. Check tflopsWeight ≥ difficultyTarget (≈ hash < target numerical check)
 *   5. Check claimed TFLOPS within circuit's [min, max] bounds
 *
 * Both are O(1) verification. JGC's step 3 costs ~5ms (3 pairing ops) vs
 * Bitcoin's ~0.001ms (a 256-bit comparison) but this is acceptable given
 * the 600-second block interval.
 *
 * @param proof           The ComputeProof from MinerComputeContribution.
 * @param epochBlockIndex Current block's index within the epoch [0,143].
 * @param difficultyTarget Minimum TFLOPS required for a valid block.
 * @param currentHeight   For circuit registry activation checks.
 */
export function verifyComputeProof(
  proof:            ComputeProof,
  epochBlockIndex:  number,
  difficultyTarget: number,
  currentHeight:    number,
): VerificationResult {
  // ── Step 1: Lookup verification key ──────────────────────────────────────
  const vk = CIRCUIT_REGISTRY.get(proof.circuitId);
  if (vk === undefined) {
    return { valid: false, error: `Unknown circuitId: ${proof.circuitId}`, verifiedTFLOPS: 0 };
  }

  if (currentHeight < vk.activeSinceHeight) {
    return {
      valid: false,
      error: `Circuit ${proof.circuitId} not yet active at height ${currentHeight}`,
      verifiedTFLOPS: 0,
    };
  }

  // ── Step 2: Bounds check on claimed TFLOPS ────────────────────────────────
  // Must be a non-negative integer: epoch settlement converts the accumulated
  // TFLOPS to BigInt (pool × tflops / total), which throws on a fractional sum —
  // a single fractional weight would otherwise halt settlement at the boundary.
  if (!Number.isInteger(proof.tflopsWeight) || proof.tflopsWeight < 0) {
    return {
      valid: false,
      error: `tflopsWeight ${proof.tflopsWeight} must be a non-negative integer`,
      verifiedTFLOPS: 0,
    };
  }
  if (proof.tflopsWeight < vk.minTFLOPSPerProof) {
    return {
      valid: false,
      error: `tflopsWeight ${proof.tflopsWeight} below circuit minimum ${vk.minTFLOPSPerProof}`,
      verifiedTFLOPS: 0,
    };
  }
  if (proof.tflopsWeight > vk.maxTFLOPSPerProof) {
    return {
      valid: false,
      error: `tflopsWeight ${proof.tflopsWeight} exceeds circuit maximum ${vk.maxTFLOPSPerProof} — likely fraud attempt`,
      verifiedTFLOPS: 0,
    };
  }

  // ── Step 3: Difficulty check ──────────────────────────────────────────────
  // This is the TFLOPS analog of Bitcoin's "hash < target" check.
  // A miner whose proof attests less than difficultyTarget TFLOPS is rejected.
  if (proof.tflopsWeight < difficultyTarget) {
    return {
      valid: false,
      error: `tflopsWeight ${proof.tflopsWeight} < difficulty target ${difficultyTarget}`,
      verifiedTFLOPS: 0,
    };
  }

  // ── Step 4: Verify public inputs match proof claims ───────────────────────
  // Caller-supplied publicInputs in the proof are advisory — we RECOMPUTE them
  // from authoritative data (taskCommitment on-chain, epochBlockIndex from chain).
  const canonicalInputs = buildPublicInputs(proof, epochBlockIndex);

  if (
    proof.publicInputs.length !== vk.numPublicInputs ||
    !canonicalInputs.every((v, i) => v === proof.publicInputs[i])
  ) {
    return {
      valid: false,
      error: `Public inputs mismatch: claimed=${JSON.stringify(proof.publicInputs)} canonical=${JSON.stringify(canonicalInputs)}`,
      verifiedTFLOPS: 0,
    };
  }

  // ── Step 5: Groth16 pairing check (via Rust WASM) ─────────────────────────
  const verifier   = getVerifier();
  const vkJson     = JSON.stringify(vk);
  let proofIsValid: boolean;

  try {
    // Dispatch by mode: real pairing (strict) vs structural-only (simnet).
    proofIsValid = _verifierMode === "simnet"
      ? verifier.groth16_verify_structural(proof.proofBytes, vkJson, canonicalInputs)
      : verifier.groth16_verify(proof.proofBytes, vkJson, canonicalInputs);
  } catch (err) {
    return {
      valid: false,
      error: `Groth16 verifier threw: ${String(err)}`,
      verifiedTFLOPS: 0,
    };
  }

  if (!proofIsValid) {
    return {
      valid: false,
      error: "Groth16 pairing check failed — proof is cryptographically invalid",
      verifiedTFLOPS: 0,
    };
  }

  return { valid: true, verifiedTFLOPS: proof.tflopsWeight };
}

/**
 * Batch-verify all proofs in a block.
 * Uses the Rust batch-verification API for ~3× throughput vs. sequential.
 *
 * @param proofs           Array of proofs from block.computeProofs.
 * @param epochBlockIndex  Block's index within its epoch.
 * @param difficultyTarget Minimum per-proof TFLOPS.
 * @param currentHeight    Current block height.
 * @returns Array of VerificationResult, one per proof.
 */
export function batchVerifyComputeProofs(
  proofs:           Array<{ proof: ComputeProof }>,
  epochBlockIndex:  number,
  difficultyTarget: number,
  currentHeight:    number,
): VerificationResult[] {
  if (proofs.length === 0) return [];

  const verifier = getVerifier();

  // Pre-validate metadata (bounds, circuit existence) before expensive pairing ops.
  const preChecks = proofs.map(({ proof }) =>
    verifyComputeProof(proof, epochBlockIndex, difficultyTarget, currentHeight)
  );

  // Collect only the proofs that passed metadata checks.
  const validIndices: number[] = [];
  const batchProofBytes:    string[]   = [];
  const batchVkJsons:       string[]   = [];
  const batchPublicInputs:  string[][] = [];

  for (let i = 0; i < proofs.length; i++) {
    if (!preChecks[i]!.valid) continue;
    const item = proofs[i]!;
    const { proof } = item;
    const vk = CIRCUIT_REGISTRY.get(proof.circuitId)!;
    validIndices.push(i);
    batchProofBytes.push(proof.proofBytes);
    batchVkJsons.push(JSON.stringify(vk));
    batchPublicInputs.push(buildPublicInputs(proof, epochBlockIndex));
  }

  if (validIndices.length === 0) return preChecks;

  // Run Rust batch verifier — real pairing (strict) or structural (simnet).
  const batchResults = _verifierMode === "simnet"
    ? verifier.groth16_verify_batch_structural(batchProofBytes, batchVkJsons, batchPublicInputs)
    : verifier.groth16_verify_batch(batchProofBytes, batchVkJsons, batchPublicInputs);

  // Merge batch results back into the full results array.
  const results = [...preChecks];
  for (let j = 0; j < validIndices.length; j++) {
    const i = validIndices[j]!;
    if (!batchResults[j]) {
      results[i] = {
        valid: false,
        error: "Batch Groth16 pairing check failed",
        verifiedTFLOPS: 0,
      };
    }
    // If batchResults[j] is true, results[i] is already valid from preChecks.
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Development Stub Verifier
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure-JS stub that accepts all proofs.
 * UNSAFE — for local development and unit testing ONLY.
 * Gated behind NODE_ENV !== "production" at runtime.
 */
function createJSStubVerifier(): JGCVerifierWasm {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("JS stub verifier must not run in production");
  }
  return {
    groth16_verify: (_pb, _vk, _pi) => true,
    groth16_verify_batch: (pba, _vka, _pia) => pba.map(() => true),
    groth16_verify_structural: (_pb, _vk, _pi) => true,
    groth16_verify_batch_structural: (pba, _vka, _pia) => pba.map(() => true),
    groth16_setup: (_seed) => {
      console.warn("[JGC zkp.ts] JS stub cannot run trusted setup — load the real WASM verifier");
      return "";
    },
    groth16_prove: (_seed, _x, _h, _epoch) => {
      console.warn("[JGC zkp.ts] JS stub cannot prove — load the real WASM verifier");
      return "";
    },
    groth16_ceremony: (_seed, _cs) => {
      console.warn("[JGC zkp.ts] JS stub cannot run a ceremony — load the real WASM verifier");
      return "";
    },
    groth16_prove_ceremony: (_seed, _cs, _x, _h, _epoch) => {
      console.warn("[JGC zkp.ts] JS stub cannot prove — load the real WASM verifier");
      return "";
    },
    groth16_setup_matvec: (_seed) => {
      console.warn("[JGC zkp.ts] JS stub cannot run setup — load the real WASM verifier");
      return "";
    },
    groth16_prove_matvec: (_seed, _w, _x, _epoch) => {
      console.warn("[JGC zkp.ts] JS stub cannot prove — load the real WASM verifier");
      return "";
    },
    decode_proof: (pb) => ({ A: pb.slice(0, 64), B: pb.slice(64, 192), C: pb.slice(192, 256) }),
  };
}
