/**
 * @file src/index.ts
 * @description JGC regtest harness — boots a node, simulates a miner network,
 * and drives blocks through the full consensus pipeline.
 *
 * BITCOIN ANALOG: `bitcoind -regtest` + `generatetoaddress`. Bitcoin's regtest
 * mode lets developers mine blocks instantly against trivial difficulty; this
 * harness does the JGC equivalent — three simulated miners submit ComputeProofs
 * each block window, a candidate block is assembled from the node's block
 * template, and the block is submitted through the exact same validateBlock()
 * pipeline mainnet uses (header checks → tx checks → Merkle roots → epoch root
 * → ZK batch verification).
 *
 * DEV MODE: this harness loads the verifier in "simnet" mode — proofs are
 * checked for well-formedness (structural path) but not the cryptographic
 * pairing, since the simulated miners submit placeholder proofs. Mainnet nodes
 * load in "strict" mode (real BN254 Groth16 pairing). If no compiled Rust/WASM
 * verifier is present, loadVerifierWasm() falls back to the JS stub (refuses to
 * run if NODE_ENV=production). Every other consensus rule is enforced for real.
 *
 * Run:  npm run build && npm start     (from packages/jgc-node)
 */

import { JGCNode } from "./network/node.js";
import type { PeerConnection } from "./network/node.js";
import { createGenesisHeader, GENESIS_TIMESTAMP, hashBlockHeader } from "./consensus/block.js";
import { initEpochState } from "./consensus/epoch.js";
import { decodeDifficultyBits, BLOCKS_PER_EPOCH } from "./consensus/emission.js";
import { loadVerifierWasm } from "./crypto/zkp.js";
import {
  createRegtestMiner, generateContribution, buildBlockCandidate, createRegtestTx,
} from "./miner/miner.js";
import type { Block, PeerMessage } from "./types/index.js";
import { ComputeTaskType, MessageType } from "./types/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Harness Configuration
// ─────────────────────────────────────────────────────────────────────────────

const BLOCKS_TO_MINE = 12;

/** Wrap a payload in a P2P envelope (regtest: unsigned). */
function envelope(type: MessageType, payload: unknown): PeerMessage {
  return {
    type,
    payload,
    timestamp:       Math.floor(Date.now() / 1000),
    senderPublicKey: "regtest-harness",
    signature:       "0".repeat(128),
  };
}

/** In-memory peer standing in for a TCP connection (production: ws/TCP). */
function createLoopbackPeer(peerId: string): PeerConnection {
  return {
    info: {
      peerId,
      address:       "127.0.0.1:18444",
      version:       70015,
      services:      0n,
      userAgent:     "/JGCRegtest:0.1.0/",
      startHeight:   0,
      bestBlock:     "0".repeat(64),
      connectedAt:   Math.floor(Date.now() / 1000),
      lastSeen:      Math.floor(Date.now() / 1000),
      bytesSent:     0,
      bytesReceived: 0,
      inbound:       true,
    },
    send:       async () => { /* loopback — node→peer traffic discarded */ },
    disconnect: () => { /* no socket to close */ },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  JGC Node — Proof-of-Useful-Compute regtest");
  console.log("══════════════════════════════════════════════════════════════");

  // 1. Load the ZK verifier (falls back to JS stub without compiled WASM).
  // Simnet harness mines with placeholder proofs (no valid pairing) — use the
  // structural verifier path. Mainnet nodes load in the default "strict" mode.
  await loadVerifierWasm({ mode: "simnet" });

  // 2. Construct genesis and boot the node.
  const genesisHeader = createGenesisHeader();
  const genesisBlock: Block = {
    header:        genesisHeader,
    transactions:  [],
    computeProofs: [],
    epochState:    initEpochState(0, GENESIS_TIMESTAMP),
  };

  const node = new JGCNode(
    {
      listenPort:            18444,
      rpcPort:               18443,
      networkMagic:          0xDAB5BFFA,   // regtest magic (mainnet: 0xD9B4BEF9)
      maxPeers:              8,
      enableBroker:          false,
      junctionGeneratorMode: true,
    },
    genesisBlock,
  );

  console.log(`[Harness] Genesis: ${hashBlockHeader(genesisHeader).slice(0, 32)}…`);
  console.log(
    `[Harness] Difficulty target: ` +
    `${decodeDifficultyBits(node.getCurrentDifficultyBits()).toFixed(0)} TFLOPS ` +
    `(bits 0x${node.getCurrentDifficultyBits().toString(16)})`
  );

  // 3. Register the loopback miner peer.
  const peer = createLoopbackPeer("regtest-miner-relay");
  node.connectPeer(peer);

  // 4. Simulated miner fleet — one per circuit family, TFLOPS ranges chosen
  //    above each circuit's minTFLOPSPerProof and the 10%-of-target per-proof
  //    floor (= 100 TFLOPS at the 1000-TFLOPS genesis difficulty).
  const miners = [
    { id: createRegtestMiner("alpha", "CIRCUIT_AI_INFERENCE_V1", ComputeTaskType.AI_INFERENCE), base: 450 },
    { id: createRegtestMiner("bravo", "CIRCUIT_AI_TRAINING_V1",  ComputeTaskType.AI_TRAINING),  base: 650 },
    { id: createRegtestMiner("carol", "CIRCUIT_FOLD_SIM_V1",     ComputeTaskType.FOLD_SIM),     base: 350 },
  ];

  // 5. Mine. Timestamps tick 1s/block — strictly increasing (median-past rule)
  //    and well inside the +7200s future-drift bound.
  const baseTime = Math.floor(Date.now() / 1000);
  let rejected = 0;

  for (let height = 1; height <= BLOCKS_TO_MINE; height++) {
    const epochSlot = height % BLOCKS_PER_EPOCH;

    // Miners broadcast proofs for this block window (P2P COMPUTE_PROOF).
    for (const miner of miners) {
      const tflops  = miner.base + Math.round(Math.random() * 100);
      const contrib = generateContribution(miner.id, tflops, epochSlot);
      await node.processMessage(peer.info.peerId, envelope(MessageType.COMPUTE_PROOF, contrib));
    }

    // Assemble the candidate from the node's block template
    // (tip header + live epoch state + current difficulty bits).
    const candidate = buildBlockCandidate(
      node.getTipHeader(),
      [createRegtestTx(height)],
      node.getPendingProofs(),
      node.getEpochState(),
      node.getCurrentDifficultyBits(),
      baseTime + height,
    );

    // Submit through the full validation pipeline (P2P BLOCK).
    await node.processMessage(peer.info.peerId, envelope(MessageType.BLOCK, candidate));

    if (node.getChainInfo().tipHeight !== height) {
      rejected++;
      console.error(`[Harness] Block at height ${height} was REJECTED`);
    }
  }

  // 6. Summary — chain tip, epoch accumulator, pro-rata payout projection.
  const info  = node.getChainInfo();
  const epoch = node.getEpochState();

  console.log("──────────────────────────────────────────────────────────────");
  console.log(`[Harness] Chain tip:        height ${info.tipHeight}, hash ${info.tipHash.slice(0, 32)}…`);
  console.log(`[Harness] Epoch progress:   slot ${epoch.epochBlockIndex}/${BLOCKS_PER_EPOCH}`);
  console.log(`[Harness] Reward pool:      ${Number(epoch.pendingRewardPool) / 1e16} JGC pending settlement`);
  console.log(`[Harness] Total TFLOPS:     ${epoch.totalEpochTFLOPS.toFixed(0)}`);
  console.log(`[Harness] Projected pro-rata shares at epoch boundary:`);
  for (const [address, tflops] of epoch.minerContributions) {
    const share = (tflops / epoch.totalEpochTFLOPS) * 100;
    console.log(`  ${address.slice(0, 24)}…  ${tflops.toFixed(0).padStart(8)} TFLOPS  →  ${share.toFixed(2)}%`);
  }
  console.log("──────────────────────────────────────────────────────────────");

  if (rejected > 0) {
    throw new Error(`${rejected}/${BLOCKS_TO_MINE} blocks rejected — consensus pipeline failure`);
  }
  console.log(`[Harness] ✓ ${BLOCKS_TO_MINE}/${BLOCKS_TO_MINE} blocks accepted through full validation`);
}

main().catch((err: unknown) => {
  console.error("[Harness] FATAL:", err);
  process.exitCode = 1;
});
