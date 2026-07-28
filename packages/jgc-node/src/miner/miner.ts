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
 *   2. generateContribution() — wrap the claim in a simnet research receipt
 *   3. buildBlockCandidate()  — assemble header committing computeRoot/epochRoot
 *   4. Submit via P2P BLOCK message → full validateBlock() pipeline
 *
 * Step 2 is simulation plumbing only: the current hash/Merkle receipt does not
 * constrain useful computation. Strict consensus rejects it. A production
 * miner must instead generate a proof for a registered sound circuit/zkVM.
 */

import { createHash, randomBytes } from "crypto";
import type {
  Address, Block, BlockHeader, ComputeProof, EpochState,
  MinerComputeContribution, PublicKey, Transaction,
} from "../types/index.js";
import { ComputeTaskType } from "../types/index.js";
import {
  pqGenerateKeyPair, pqAddressFromPublicKey, pqSignContribution,
} from "../crypto/pq-signatures.js";
import { pqProveCompute, pqToComputeProof, pqNewNonce } from "../crypto/pq-zkp.js";
import { assembleBlock } from "../consensus/block.js";
import type { AuditVerdictRecord } from "../broker/audit-protocol.js";

// ─────────────────────────────────────────────────────────────────────────────
// Miner Identity
// ─────────────────────────────────────────────────────────────────────────────

/** A miner's identity and the circuit family it proves against. */
export interface MinerIdentity {
  /** Payout address — credited in the epoch accumulator. */
  minerAddress: Address;
  /** Public key carried in MinerComputeContribution for signature checks. */
  publicKey: PublicKey;
  /** ML-DSA secret key (hex) used to sign contributions (quantum-ready). */
  secretKey: string;
  /** Simnet receipt family (production requires a registered sound circuit). */
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
  // QUANTUM-READY: a real ML-DSA keypair derived deterministically from the label.
  const seed = createHash("sha256").update(`jgc-regtest:${label}`).digest("hex");
  const kp = pqGenerateKeyPair(seed);
  return {
    minerAddress: pqAddressFromPublicKey(kp.publicKey),
    publicKey:    kp.publicKey,
    secretKey:    kp.privateKey,
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
  blockHeight:     number = epochBlockIndex,  // sign against block HEIGHT (what validation checks)
): MinerComputeContribution {
  // Task commitment: hash of the task parameters (model weights, batch, …).
  // Regtest: random 32 bytes; mainnet: SHA3-256 of the actual task bundle.
  const taskCommitment = createHash("sha3-256").update(randomBytes(32)).digest("hex");

  // SIMNET ONLY: build a research receipt to exercise transport and accounting.
  // It is not evidence that the claimed work occurred and strict mode rejects it.
  const pqProof = pqProveCompute(identity.circuitId, taskCommitment, {
    taskCommitment,
    tflopsWeight,
    nonce: pqNewNonce(),
  });
  const proof: ComputeProof = {
    ...(pqToComputeProof(pqProof) as any),
    taskCommitment,
    taskType:         identity.taskType,
    computeStartedAt: new Date().toISOString(),
  };

  const contribution: MinerComputeContribution = {
    minerAddress: identity.minerAddress,
    proof,
    signature: "",
    publicKey: identity.publicKey,
  };
  // Sign the contribution with the miner's ML-DSA key, binding work+payee+height.
  contribution.signature = pqSignContribution(identity.secretKey, contribution, blockHeight);
  return contribution;
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
  auditVerdicts:  AuditVerdictRecord[] = [],
): Block {
  return assembleBlock(
    prevHeader,
    transactions,
    contributions,
    epochState,
    difficultyBits,
    /* nonce */ 0,   // tie-break nonce — unused in single-candidate regtest
    timestamp,
    auditVerdicts,
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
      value: 0n,  // non-boundary coinbase mints nothing (reward is at the epoch boundary)
      // OP_DUP OP_HASH160 <20-byte dev hash> OP_EQUALVERIFY OP_CHECKSIG
      scriptPubKey: "76a914" + "00".repeat(20) + "88ac",
    }],
    locktime: 0,
  };
}
