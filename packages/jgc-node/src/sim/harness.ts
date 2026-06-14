/**
 * @file src/sim/harness.ts
 * @description Shared simulation harness — simulated miners, block production,
 * and in-process peers for driving a JGCNode through its real message pipeline.
 *
 * Used by:
 *   src/index.ts             — single-node simnet smoke run
 *   src/scripts/sync-demo.ts — two-node WebSocket sync demo
 *
 * The harness produces blocks the same way a real miner would:
 *   1. Gossip COMPUTE_PROOF messages into the node's pending pool.
 *   2. Assemble a block from the node's collected proofs against a local
 *      mirror of the epoch accumulator (BlockProducer).
 *   3. Submit the block through processMessage(BLOCK) — never by mutating
 *      node state directly — so the full validateBlock() pipeline runs.
 */

import { createHash, randomBytes } from "crypto";
import type {
  Block, BlockHeader, Transaction, MinerComputeContribution, ComputeProof,
  EpochState, PeerMessage, Hash256,
} from "../types/index.js";
import { ComputeTaskType, MessageType as MT } from "../types/index.js";
import {
  createGenesisHeader, GENESIS_TIMESTAMP, assembleBlock,
} from "../consensus/block.js";
import { initEpochState, applyBlockToEpoch, computeEpochSettlement } from "../consensus/epoch.js";
import { BLOCKS_PER_EPOCH, BASE_UNITS_PER_JGC } from "../consensus/emission.js";
import { buildPublicInputs } from "../crypto/zkp.js";
import type { JGCNode, PeerConnection } from "../network/node.js";

// ─────────────────────────────────────────────────────────────────────────────
// Simulated Miners
// ─────────────────────────────────────────────────────────────────────────────

export interface SimMinerSpec {
  address: string;
  pubKey:  string;
  /** TFLOPS-seconds attested per block — fixed per miner for predictable shares. */
  tflops:  number;
}

/** Two miners whose combined 1050 TFLOPS clears the 1000-TFLOPS genesis target. */
export const DEFAULT_MINERS: SimMinerSpec[] = [
  { address: "1JGCMinerAlphaXXXXXXXXXXXXXXXXXXXX", pubKey: "02" + "a1".repeat(32), tflops: 600 },
  { address: "1JGCMinerBravoXXXXXXXXXXXXXXXXXXXX", pubKey: "03" + "b2".repeat(32), tflops: 450 },
];

export function sha256d(data: Buffer): Hash256 {
  const first = createHash("sha256").update(data).digest();
  return createHash("sha256").update(first).digest("hex");
}

/** Build a compute contribution whose public inputs match the canonical layout. */
export function makeContribution(miner: SimMinerSpec, height: number): MinerComputeContribution {
  const proof: ComputeProof = {
    taskCommitment:   sha256d(Buffer.from(`${miner.address}:task:${height}`)),
    // 256-byte uncompressed A‖B‖C layout expected by the Rust verifier's
    // structural checks (random bytes — not a cryptographically valid proof).
    proofBytes:       randomBytes(256).toString("base64"),
    circuitId:        "CIRCUIT_AI_INFERENCE_V1",
    publicInputs:     [],  // filled below — must equal canonical reconstruction
    tflopsWeight:     miner.tflops,
    taskType:         ComputeTaskType.AI_INFERENCE,
    computeStartedAt: new Date().toISOString(),
  };
  proof.publicInputs = buildPublicInputs(proof, height % BLOCKS_PER_EPOCH);

  return {
    minerAddress: miner.address,
    proof,
    signature: "0".repeat(128),
    publicKey: miner.pubKey,
  };
}

/** Plain spend transaction (non-coinbase blocks need at least one tx). */
export function makeDummyTx(height: number): Transaction {
  return {
    version:  1,
    inputs:   [{
      prevOut:   { txid: sha256d(Buffer.from(`utxo:${height}`)), vout: 0 },
      scriptSig: "47" + "30".repeat(71),
      sequence:  0xFFFFFFFF,
    }],
    outputs:  [{ value: BASE_UNITS_PER_JGC, scriptPubKey: "76a914" + "00".repeat(20) + "88ac" }],
    locktime: 0,
  };
}

export function cloneEpochState(state: EpochState): EpochState {
  return { ...state, minerContributions: new Map(state.minerContributions) };
}

// ─────────────────────────────────────────────────────────────────────────────
// In-Process Peer & Messages
// ─────────────────────────────────────────────────────────────────────────────

/** In-process peer with a send-capturing sink (no socket). */
export function makePeer(peerId: string, address: string): { conn: PeerConnection; sent: PeerMessage[] } {
  const sent: PeerMessage[] = [];
  const conn: PeerConnection = {
    info: {
      peerId,
      address,
      version:       0,
      services:      0n,
      userAgent:     "",
      startHeight:   0,
      bestBlock:     "0".repeat(64),
      connectedAt:   Math.floor(Date.now() / 1000),
      lastSeen:      Math.floor(Date.now() / 1000),
      bytesSent:     0,
      bytesReceived: 0,
      inbound:       true,
    },
    send: async (msg) => { sent.push(msg); },
    disconnect: () => {},
  };
  return { conn, sent };
}

export function makeMessage(type: MT, payload: unknown): PeerMessage {
  return {
    type,
    payload,
    timestamp:       Math.floor(Date.now() / 1000),
    senderPublicKey: "02" + "00".repeat(32),
    signature:       "0".repeat(128),
  };
}

/**
 * Genesis block as booted by every node (header + empty body).
 * @param difficultyBits  Optional custom genesis difficulty (defaults to the
 *   1000-TFLOPS mainnet genesis). The strict-mining demo lowers it so a handful
 *   of real Conv1D proofs (104 FLOPs each) can clear the per-block target.
 */
export function makeGenesisBlock(difficultyBits?: number): Block {
  return {
    header:        createGenesisHeader(difficultyBits),
    transactions:  [],
    computeProofs: [],
    epochState:    initEpochState(0, GENESIS_TIMESTAMP),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Production
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BlockProducer — assembles valid block candidates against a local mirror of
 * the node's epoch accumulator (the miner-side view a real miner would keep).
 *
 * The mirror must advance in lock-step with the node's chain state: call
 * confirmBlock() only after the node accepted the block.
 */
export class BlockProducer {
  private mirror:    EpochState;
  private tipHeader: BlockHeader;
  private height = 0;
  private readonly baseTime: number;
  // Difficulty is taken from the genesis the node booted from, so producer and
  // node always agree (the strict demo boots both from a low-difficulty genesis).
  private readonly difficultyBits: number;

  constructor(genesis: Block) {
    this.tipHeader = genesis.header;
    this.mirror    = initEpochState(0, genesis.header.timestamp);
    // Genesis occupies epoch slot 0 — same bootstrapping as JGCNode's constructor.
    applyBlockToEpoch(this.mirror, genesis.computeProofs, 0, 0n);
    this.baseTime  = Math.floor(Date.now() / 1000);
    this.difficultyBits = genesis.header.difficultyBits;
  }

  /**
   * Assemble the next block candidate.
   * At the epoch boundary the first tx is the settlement coinbase, computed
   * exactly as validation does: on a post-apply copy of the accumulator.
   */
  produceBlock(contributions: MinerComputeContribution[]): Block {
    const height          = this.height + 1;
    const isEpochBoundary = height % BLOCKS_PER_EPOCH === BLOCKS_PER_EPOCH - 1;

    let transactions: Transaction[];
    if (isEpochBoundary) {
      const settled = cloneEpochState(this.mirror);
      applyBlockToEpoch(settled, contributions, height, 0n);
      const settlement = computeEpochSettlement(settled, Math.floor(height / BLOCKS_PER_EPOCH));
      transactions = [{
        version:  1,
        inputs:   [],   // coinbase convention: no inputs
        outputs:  settlement.payouts.map(p => ({
          value:        p.satoshis,
          scriptPubKey: "76a914" + sha256d(Buffer.from(p.minerAddress)).slice(0, 40) + "88ac",
        })),
        locktime: 0,
      }];
    } else {
      transactions = [makeDummyTx(height)];
    }

    return assembleBlock(
      this.tipHeader,
      transactions,
      contributions,
      this.mirror,                 // pre-apply accumulator → epochRoot commitment
      this.difficultyBits,
      height,
      this.baseTime + height * 30,
    );
  }

  /** Advance the mirror after the node accepted the block (mirrors acceptBlock). */
  confirmBlock(block: Block): void {
    const height = block.header.height;
    applyBlockToEpoch(this.mirror, block.computeProofs, height, 0n);
    if (height % BLOCKS_PER_EPOCH === BLOCKS_PER_EPOCH - 1) {
      this.mirror = initEpochState(height + 1, block.header.timestamp);
    }
    this.tipHeader = block.header;
    this.height    = height;
  }
}

/**
 * Mine `count` blocks through the node's real message pipeline:
 * gossip proofs → assemble from the node's pending pool → submit BLOCK.
 * Throws if the node rejects any block.
 *
 * @param contribFactory  Builds each miner's contribution for a height. Defaults
 *   to the structural-simnet random-proof maker; the strict-mining demo passes a
 *   factory that returns REAL Conv1D Groth16 proofs so the full block validates
 *   under real pairing.
 */
export async function mineBlocks(
  node:      JGCNode,
  viaPeerId: string,
  producer:  BlockProducer,
  count:     number,
  miners:    SimMinerSpec[] = DEFAULT_MINERS,
  onBlock?:  (block: Block) => void,
  contribFactory: (miner: SimMinerSpec, height: number) => MinerComputeContribution = makeContribution,
): Promise<void> {
  const start = node.getChainInfo().tipHeight;

  for (let i = 1; i <= count; i++) {
    const height = start + i;

    const contributions = miners.map(m => contribFactory(m, height));
    for (const contrib of contributions) {
      await node.processMessage(viaPeerId, makeMessage(MT.COMPUTE_PROOF, contrib));
    }

    const block = producer.produceBlock(node.getPendingProofs());
    await node.processMessage(viaPeerId, makeMessage(MT.BLOCK, block));

    if (node.getChainInfo().tipHeight !== height) {
      throw new Error(`Block at height ${height} was rejected by the node`);
    }
    producer.confirmBlock(block);
    onBlock?.(block);
  }
}
