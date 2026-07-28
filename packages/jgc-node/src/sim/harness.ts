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

import { createHash } from "crypto";
import type {
  Block, BlockHeader, Transaction, MinerComputeContribution, ComputeProof,
  EpochState, PeerMessage, Hash256,
} from "../types/index.js";
import { ComputeTaskType, MessageType as MT } from "../types/index.js";
import {
  createGenesisBlock, assembleBlock,
} from "../consensus/block.js";
import { initEpochState, applyBlockToEpoch, computeEpochSettlement } from "../consensus/epoch.js";
import { BLOCKS_PER_EPOCH } from "../consensus/emission.js";
import {
  pqGenerateKeyPair, pqAddressFromPublicKey, pqSignContribution,
} from "../crypto/pq-signatures.js";
import { pqProveCompute, pqToComputeProof, pqNewNonce } from "../crypto/pq-zkp.js";
import type { JGCNode, PeerConnection } from "../network/node.js";
import type { AuditVerdictRecord } from "../broker/audit-protocol.js";

// ─────────────────────────────────────────────────────────────────────────────
// Simulated Miners
// ─────────────────────────────────────────────────────────────────────────────

export interface SimMinerSpec {
  address: string;
  pubKey:  string;
  /** ML-DSA secret key (hex) — needed to sign contributions in quantum mode. */
  secretKey: string;
  /** TFLOPS-seconds attested per block — fixed per miner for predictable shares. */
  tflops:  number;
}

/** Build a deterministic PQ miner from a seed (stable across test runs). */
export function makePQMiner(seedHex: string, tflops: number): SimMinerSpec {
  const kp = pqGenerateKeyPair(seedHex);
  return { address: pqAddressFromPublicKey(kp.publicKey), pubKey: kp.publicKey, secretKey: kp.privateKey, tflops };
}

/** Two miners whose combined 1050 TFLOPS clears the 1000-TFLOPS genesis target.
 *  QUANTUM-READY: real ML-DSA identities (deterministic seeds for reproducibility). */
export const DEFAULT_MINERS: SimMinerSpec[] = [
  makePQMiner("11".repeat(32), 600),
  makePQMiner("22".repeat(32), 450),
];

export function sha256d(data: Buffer): Hash256 {
  const first = createHash("sha256").update(data).digest();
  return createHash("sha256").update(first).digest("hex");
}

/** Build a simulation contribution: a research receipt plus a real ML-DSA
 *  signature binding the claimed work to this miner and height. */
export function makeContribution(miner: SimMinerSpec, height: number): MinerComputeContribution {
  const outputCommitment = sha256d(Buffer.from(`${miner.address}:task:${height}`));
  const pqProof = pqProveCompute("PQ_CIRCUIT_AI_INFERENCE_V1", outputCommitment, {
    taskCommitment: outputCommitment,
    tflopsWeight: miner.tflops,
    nonce: pqNewNonce(),
  });
  const proof: ComputeProof = {
    ...(pqToComputeProof(pqProof) as any),
    taskCommitment: outputCommitment,
    taskType: ComputeTaskType.AI_INFERENCE,
    computeStartedAt: new Date().toISOString(),
  };

  const contribution: MinerComputeContribution = {
    minerAddress: miner.address,
    proof,
    signature: "",
    publicKey: miner.pubKey,
  };
  contribution.signature = pqSignContribution(miner.secretKey, contribution, height);
  return contribution;
}

/**
 * Non-boundary block coinbase marker (every block needs ≥1 tx). Value MUST be 0:
 * JGC mints only at the epoch-boundary settlement, and validateBlock rejects any
 * non-boundary coinbase that creates value. The height-derived input keeps the
 * txid unique per block.
 */
export function makeDummyTx(height: number): Transaction {
  return {
    version:  1,
    inputs:   [{
      prevOut:   { txid: sha256d(Buffer.from(`utxo:${height}`)), vout: 0 },
      scriptSig: "47" + "30".repeat(71),
      sequence:  0xFFFFFFFF,
    }],
    outputs:  [{ value: 0n, scriptPubKey: "76a914" + "00".repeat(20) + "88ac" }],
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
  return createGenesisBlock(difficultyBits);
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

  /**
   * @param opts.timeOffsetSec  Shifts this producer's block timestamps. A second
   *   producer with a different offset builds a *distinct* competing branch from
   *   the same genesis (different headers ⇒ different hashes) — used to drive
   *   reorg tests/demos.
   */
  constructor(genesis: Block, opts: { timeOffsetSec?: number } = {}) {
    this.tipHeader = genesis.header;
    this.mirror    = initEpochState(0, genesis.header.timestamp);
    // Genesis occupies epoch slot 0 — same bootstrapping as JGCNode's constructor.
    applyBlockToEpoch(this.mirror, genesis.computeProofs, 0, 0n);
    this.baseTime  = Math.floor(Date.now() / 1000) + (opts.timeOffsetSec ?? 0);
    this.difficultyBits = genesis.header.difficultyBits;
  }

  /**
   * Assemble the next block candidate.
   * At the epoch boundary the first tx is the settlement coinbase, computed
   * exactly as validation does: on a post-apply copy of the accumulator.
   */
  produceBlock(
    contributions: MinerComputeContribution[],
    extraTxs: Transaction[] = [],
    auditVerdicts: AuditVerdictRecord[] = [],
  ): Block {
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
          // QUANTUM-READY: settlement pays to the PQ script for the miner's 1QGC address.
          scriptPubKey: "5114" + p.minerAddress.slice(4) + "63ac",
        })),
        locktime: 0,
      }];
    } else {
      transactions = [makeDummyTx(height)];
    }

    // Append any user spend transactions (tx[1..]) — validated against the UTXO set.
    if (extraTxs.length > 0) transactions = [...transactions, ...extraTxs];

    return assembleBlock(
      this.tipHeader,
      transactions,
      contributions,
      this.mirror,                 // pre-apply accumulator → epochRoot commitment
      this.difficultyBits,
      height,
      this.baseTime + height * 30,
      auditVerdicts,
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

    const block = producer.produceBlock(
      node.getPendingProofs(),
      [],
      node.getPendingAuditVerdicts(),
    );
    await node.processMessage(viaPeerId, makeMessage(MT.BLOCK, block));

    if (node.getChainInfo().tipHeight !== height) {
      throw new Error(`Block at height ${height} was rejected by the node`);
    }
    producer.confirmBlock(block);
    onBlock?.(block);
  }
}
