/**
 * @file src/scripts/strict-mine-demo.ts
 * @description Strict-mode end-to-end block mining with REAL Conv1D proofs.
 *
 * Where prove-verify-demo.ts exercises a single proof through verifyComputeProof,
 * this drives the FULL block pipeline in strict mode: every miner contribution
 * in every block is a genuine Conv1D Groth16 proof, and each block is accepted
 * only after the node's complete validateBlock() → batchVerifyComputeProofs()
 * runs the REAL BN254 pairing on all proofs (plus header, Merkle, epoch-root,
 * and TFLOPS-target checks).
 *
 * Difficulty: a Conv1D proof binds tflopsWeight to its FLOP count (2·K·M = 104),
 * so we boot the node from a low-difficulty genesis (target ~150 TFLOPS) — two
 * 104-FLOP proofs per block clear the per-block sum target (and each clears the
 * per-proof floor of 10% × target). This is the same model as mainnet, just
 * scaled so a handful of real proofs (which are expensive to generate) suffice.
 *
 * SIMNET/DEV ONLY: seeded single-party setup + the demo Conv1D circuit.
 *
 * Run:  npm run strict-mine-demo     (after npm run build:all)
 */

import type { ComputeProof, MinerComputeContribution, NodeConfig } from "../types/index.js";
import { ComputeTaskType } from "../types/index.js";
import { JGCNode } from "../network/node.js";
import { encodeDifficultyBits, BLOCKS_PER_EPOCH } from "../consensus/emission.js";
import {
  loadVerifierWasm, proverSetup, proverProve, buildPublicInputs, CIRCUIT_REGISTRY, getVerifierMode,
} from "../crypto/zkp.js";
import {
  makeGenesisBlock, makePeer, BlockProducer, mineBlocks, type SimMinerSpec,
} from "../sim/harness.js";
import { generateKeyPair, addressFromPublicKey, signContribution } from "../crypto/signatures.js";

const SEED          = 4242;
const CIRCUIT_ID    = "CIRCUIT_CONV1D_V1";
const CONV_N        = 16;   // MUST match rust CONV_N
const CONV_K        = 4;    // MUST match rust CONV_K
const TARGET_TFLOPS = 150;  // low genesis difficulty so 2 conv proofs clear it
const BLOCKS        = 3;    // blocks to mine (each = 2 real proofs)

function makeConfig(): NodeConfig {
  return {
    listenPort: 0, rpcPort: 0, networkMagic: 0xD9B4BEF9,
    maxPeers: 8, enableBroker: false, junctionGeneratorMode: false,
  };
}

// Real keypairs per miner: address → private key (hex). Each miner signs its
// contributions; the node verifies the signature in strict mode.
const keyByAddr = new Map<string, string>();

/** Make a miner with a fresh secp256k1 keypair and a key-derived address. */
function makeMiner(tflops: number): SimMinerSpec {
  const kp = generateKeyPair();
  const address = addressFromPublicKey(kp.publicKey);
  keyByAddr.set(address, kp.privateKey);
  return { address, pubKey: kp.publicKey, tflops };
}

/** Deterministic small seed per (miner, height) for distinct conv I/O. */
function ioSeed(address: string, height: number): number {
  let s = 0;
  for (const c of address) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return (s + height) % 997 + 1;
}

/**
 * Build a miner's contribution as a REAL Conv1D proof: pick an input vector x
 * and filter h, prove y = conv(x, h) with taskCommitment = Poseidon(x‖h‖y), and
 * package it exactly as a real miner would (canonical public inputs included).
 */
function makeRealContribution(miner: SimMinerSpec, height: number): MinerComputeContribution {
  const epochBlockIndex = height % BLOCKS_PER_EPOCH;
  const s = ioSeed(miner.address, height);
  const x = Array.from({ length: CONV_N }, (_, i) => String(s + i + 1));
  const h = Array.from({ length: CONV_K }, (_, j) => String((s % 7) + j + 1));

  const res = proverProve(SEED, x, h, epochBlockIndex);
  const proof: ComputeProof = {
    taskCommitment:   res.taskCommitment,
    proofBytes:       res.proof,
    circuitId:        CIRCUIT_ID,
    publicInputs:     [],
    tflopsWeight:     res.tflops,
    taskType:         ComputeTaskType.AI_INFERENCE,
    computeStartedAt: new Date().toISOString(),
  };
  proof.publicInputs = buildPublicInputs(proof, epochBlockIndex);
  const contribution: MinerComputeContribution = {
    minerAddress: miner.address,
    proof,
    signature:    "",   // filled below
    publicKey:    miner.pubKey,
  };
  // Sign over the canonical contribution sighash (binds payee, work, height).
  contribution.signature = signContribution(keyByAddr.get(miner.address)!, contribution, height);
  return contribution;
}

async function main(): Promise<void> {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(" JGC Node — strict-mode end-to-end mining (real Conv1D proofs)");
  console.log("══════════════════════════════════════════════════════════════");

  await loadVerifierWasm({ mode: "strict" });
  if (getVerifierMode() !== "strict") {
    console.error("[StrictMine] FAIL ✗  verifier is not in strict mode");
    process.exit(1);
  }

  // Trusted setup → register the real Conv1D verifying key.
  const vk = proverSetup(SEED);
  CIRCUIT_REGISTRY.set(CIRCUIT_ID, {
    circuitId: CIRCUIT_ID,
    alpha: vk.alpha, beta: vk.beta, gamma: vk.gamma, delta: vk.delta, ic: vk.ic,
    numPublicInputs: vk.numPublicInputs,
    minTFLOPSPerProof: 1, maxTFLOPSPerProof: 1_000_000, activeSinceHeight: 0,
  });

  // Low-difficulty genesis so a few real proofs clear the per-block target.
  const difficultyBits = encodeDifficultyBits(TARGET_TFLOPS);
  const node = new JGCNode(makeConfig(), makeGenesisBlock(difficultyBits));
  const miner = makePeer("local-miner", "inproc");
  node.connectPeer(miner.conn);
  const producer = new BlockProducer(makeGenesisBlock(difficultyBits));

  console.log(`[StrictMine] Strict mode, ${CIRCUIT_ID} VK registered; genesis target ≈${TARGET_TFLOPS} TFLOPS`);
  console.log("──────────────────────────────────────────────────────────────");

  // Two miners with real secp256k1 keypairs (addresses derived from their keys).
  const miners: SimMinerSpec[] = [makeMiner(104), makeMiner(104)];

  const onBlock = (b: { header: { height: number; hash?: string }; computeProofs: unknown[] }): void => {
    console.log(`[StrictMine] Block ${b.header.height} accepted — ${b.computeProofs.length} real conv proofs verified (strict pairing)`);
  };

  console.log(`[StrictMine] Mining ${BLOCKS} blocks, each with ${miners.length} real Conv1D proofs…`);
  await mineBlocks(node, "local-miner", producer, BLOCKS, miners, onBlock, makeRealContribution);

  const tip = node.getChainInfo().tipHeight;
  console.log("──────────────────────────────────────────────────────────────");
  const ok = tip === BLOCKS;
  console.log(`[StrictMine] Chain tip: height ${tip}/${BLOCKS} — full blocks validated under REAL pairing`);
  console.log(`[StrictMine] RESULT: ${ok ? "PASS ✓" : "FAIL ✗"}`);
  if (!ok) process.exit(1);
}

main().catch(err => {
  console.error("[StrictMine] Unhandled error:", err);
  process.exit(1);
});
