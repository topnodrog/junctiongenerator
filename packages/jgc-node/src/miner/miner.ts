/**
 * @file src/miner/miner.ts
 * @description PoUC miner — generates ComputeProofs and assembles block candidates.
 *
 * BITCOIN COMPARISON — miner.cpp
 * ───────────────────────────────
 * Bitcoin's miner flow (miner.cpp + getblocktemplate, BIP 22/23):
 *   1. CreateNewBlock()  — select mempool txs, compute hashMerkleRoot
 *   2. ScanHash()        — brute-force nNonce until SHA256d(header) < target
 *   3. ProcessNewBlock() — submit to validation
 *
 * JGC's miner flow (this module):
 *   1. Perform useful compute (AI inference/training, folding, …)
 *   2. generateContribution() — wrap the work in a Groth16 ComputeProof
 *   3. buildBlockCandidate()  — assemble header committing computeRoot/epochRoot
 *   4. Submit via P2P BLOCK message → full validateBlock() pipeline
 *
 * Step 2's "useful compute → proof" is the part Bitcoin replaces with nNonce
 * grinding. In DEV/REGTEST MODE (no compiled WASM verifier), proofBytes are
 * 256 random bytes — the canonical uncompressed Groth16 size (A:64 ‖ B:128 ‖
 * C:64) — accepted by the JS stub verifier. The surrounding consensus logic
 * (public input construction, Merkle commitments, difficulty, epoch
 * accounting) is exercised exactly as it would be on mainnet.
 */

import { createHash, randomBytes } from "crypto";
import type {
  Address, Block, BlockHeader, ComputeProof, EpochState,
  MinerComputeContribution, PublicKey, Transaction,
} from "../types/index.js";
import { ComputeTaskType } from "../types/index.js";
import { buildPublicInputs } from "../crypto/zkp.js";
import { assembleBlock } from "../consensus/block.js";
import { BASE_UNITS_PER_JGC } from "../consensus/emission.js";

// ─────────────────────────────────────────────────────────────────────────────
// Miner Identity
// ─────────────────────────────────────────────────────────────────────────────

/** A miner's identity and the circuit family it proves against. */
export interface MinerIdentity {
  /** Payout address — credited in the epoch accumulator. */
  minerAddress: Address;
  /** Public key carried in MinerComputeContribution for signature checks. */
  publicKey: PublicKey;
  /** Circuit the miner generates proofs for (must exist in CIRCUIT_REGISTRY). */
  circuitId: string;
  /** Task category — must match the circuit family. */
  taskType: ComputeTaskType;
}

/** Convenience factory for dev/regtest miner identities. */
export function createRegtestMiner(
  label:     string,
  circuitId: string,
  taskType:  ComputeTaskType,
): MinerIdentity {
  // Deterministic-looking dev credentials derived from the label.
  // Production: secp256k1 keypair + Base58Check P2PKH address.
  const seed = createHash("sha256").update(`jgc-regtest:${label}`).digest("hex");
  return {
    minerAddress: `1JGC${seed.slice(0, 30)}`,
    publicKey:    `02${seed}`,
    circuitId,
    taskType,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Proof Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate one ComputeProof contribution for the current block window.
 *
 * The publicInputs are built with the SAME canonical constructor the
 * validator uses (buildPublicInputs in crypto/zkp.ts) — validation recomputes
 * them from authoritative data and rejects on any mismatch, so the miner must
 * commit to [taskCommitment, tflopsWeight, epochBlockIndex] identically.
 *
 * @param identity        Miner identity (address, circuit, task type).
 * @param tflopsWeight    TFLOPS-seconds this proof attests. Must satisfy
 *                        circuit [min,max] bounds AND the per-proof floor
 *                        (10% of block difficulty target — see
 *                        validateComputeProofs in consensus/validation.ts).
 * @param epochBlockIndex Index of the block being mined within its epoch
 *                        [0..143] — binds the proof to one epoch slot,
 *                        preventing cross-epoch replay.
 */
export function generateContribution(
  identity:        MinerIdentity,
  tflopsWeight:    number,
  epochBlockIndex: number,
): MinerComputeContribution {
  // Task commitment: hash of the task parameters (model weights, batch, …).
  // Regtest: random 32 bytes; mainnet: SHA256 of the actual task bundle.
  const taskCommitment = createHash("sha256").update(randomBytes(32)).digest("hex");

  const proof: ComputeProof = {
    taskCommitment,
    // 256 bytes = canonical uncompressed Groth16 proof size (A‖B‖C).
    proofBytes:       randomBytes(256).toString("base64"),
    circuitId:        identity.circuitId,
    publicInputs:     [],            // filled canonically below
    tflopsWeight,
    taskType:         identity.taskType,
    computeStartedAt: new Date().toISOString(),
  };
  proof.publicInputs = buildPublicInputs(proof, epochBlockIndex);

  return {
    minerAddress: identity.minerAddress,
    proof,
    // Regtest placeholder — production: Schnorr sig over
    // SHA256(taskCommitment ∥ minerAddress ∥ blockHeight).
    signature: randomBytes(64).toString("hex"),
    publicKey: identity.publicKey,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Candidate Assembly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assemble a full block candidate from collected proofs and chain context.
 *
 * The chain context (prevHeader, epochState, difficultyBits) comes from the
 * node's block-template getters — the JGC analog of getblocktemplate. The
 * epochState MUST be the node's live pre-acceptance accumulator: validation
 * checks header.epochRoot against computeEpochRoot(node.chain.epochState).
 *
 * BITCOIN ANALOG: CreateNewBlock() in miner.cpp, minus the nNonce scan loop.
 */
export function buildBlockCandidate(
  prevHeader:     BlockHeader,
  transactions:   Transaction[],
  contributions:  MinerComputeContribution[],
  epochState:     EpochState,
  difficultyBits: number,
  timestamp:      number,
): Block {
  return assembleBlock(
    prevHeader,
    transactions,
    contributions,
    epochState,
    difficultyBits,
    /* nonce */ 0,   // tie-break nonce — unused in single-candidate regtest
    timestamp,
  );
}

/**
 * Create a minimal regtest transaction so every block has a non-empty body.
 *
 * validateBlock requires ≥1 transaction per block (Bitcoin's "must have at
 * least a coinbase" rule); off epoch boundaries every tx is validated as a
 * standard spend, so this carries one input and one output. Stateless
 * validation only — UTXO existence is not checked in the current pipeline.
 */
export function createRegtestTx(blockHeight: number): Transaction {
  return {
    version: 1,
    inputs: [{
      prevOut: {
        // Synthetic outpoint, unique per height to avoid duplicate txids.
        txid: createHash("sha256").update(`regtest-funding:${blockHeight}`).digest("hex"),
        vout: 0,
      },
      scriptSig: "",
      sequence:  0xFFFFFFFF,
    }],
    outputs: [{
      value: BASE_UNITS_PER_JGC,  // 1 JGC
      // OP_DUP OP_HASH160 <20-byte dev hash> OP_EQUALVERIFY OP_CHECKSIG
      scriptPubKey: "76a914" + "00".repeat(20) + "88ac",
    }],
    locktime: 0,
  };
}
