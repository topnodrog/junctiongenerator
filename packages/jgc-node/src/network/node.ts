/**
 * @file src/network/node.ts
 * @description P2P node logic — peer management, message routing, and chain sync.
 *
 * BITCOIN COMPARISON — net.cpp / net_processing.cpp
 * ──────────────────────────────────────────────────
 * Bitcoin's CConnman manages peer sockets, CNode tracks per-peer state, and
 * PeerManager (net_processing.cpp) handles P2P message dispatch via
 * ProcessMessage() and SendMessages().
 *
 * JGC adopts the same conceptual architecture:
 *   - PeerConnection  ≈ CNode + CNetAddr
 *   - JGCNode         ≈ CConnman + PeerManager combined
 *   - MessageType     ≈ Bitcoin's command strings ("version", "block", etc.)
 *
 * JGC adds three custom message types:
 *   COMPUTE_PROOF: miners broadcast their ZK proofs in the 10-min window
 *   EPOCH_SETTLE:  epoch settlement transactions (replaces individual coinbases)
 *   BROKER_BID:    compute bid announcements propagated across the network
 *
 * CHAIN SYNC (analogous to Bitcoin's headers-first sync, BIP 130):
 *   1. Connect to DNS seeds → request GETHEADERS
 *   2. Download and validate headers (cheap)
 *   3. Download full blocks from headers-validated peers
 *   4. Verify PoUC proofs and update UTXO set
 */

import { EventEmitter } from "events";
import { createHash } from "crypto";
import type {
  Block, BlockHeader, PeerMessage, Transaction,
  MinerComputeContribution, ComputeBid, NodeConfig,
} from "../types/index.js";
import { MessageType as MT } from "../types/index.js";
import { validateBlock } from "../consensus/validation.js";
import { hashBlockHeader, serializeTransaction, computeTransactionMerkleRoot } from "../consensus/block.js";
import { applyBlockToEpoch, initEpochState, computeEpochSettlement, computeContributionsMerkleRoot, computeEpochRoot } from "../consensus/epoch.js";
import { UTXOSet } from "../consensus/utxo.js";
import { BlockStore } from "../storage/persistence.js";
import { calculateNextDifficultyTarget, BLOCKS_PER_EPOCH, RETARGET_WINDOW_BLOCKS, encodeDifficultyBits, decodeDifficultyBits } from "../consensus/emission.js";
import { globalBroker } from "../broker/compute-broker.js";
import type { Hash256, EpochState } from "../types/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Peer Connection Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PeerInfo {
  peerId:        string;
  address:       string;   // IP:port
  version:       number;
  services:      bigint;
  userAgent:     string;
  startHeight:   number;
  bestBlock:     Hash256;
  connectedAt:   number;
  lastSeen:      number;
  bytesSent:     number;
  bytesReceived: number;
  inbound:       boolean;
}

/** Simulated peer connection — in production: replace with TCP/WebSocket. */
export interface PeerConnection {
  info: PeerInfo;
  send: (msg: PeerMessage) => Promise<void>;
  disconnect: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chain State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal chain state maintained by the node.
 *
 * BITCOIN ANALOG: CChainState in validation.h
 *   - m_chain: CChain (ordered vector of CBlockIndex*)
 *   - m_chainman: ChainstateManager
 *   - m_blockman: BlockManager (LevelDB index)
 */
export interface ChainState {
  /** Best chain tip block hash. */
  tipHash: Hash256;
  /** Best chain tip height. */
  tipHeight: number;
  /** Map of blockHash → BlockHeader for chain traversal. */
  headers: Map<Hash256, BlockHeader>;
  /** Map of blockHash → Block (in-memory cache; production: LevelDB). */
  blocks: Map<Hash256, Block>;
  /** Height → hash index for the active chain (enables forward traversal
   *  in GETHEADERS/GETBLOCKS service; Bitcoin: CChain's height-indexed vector). */
  heightIndex: Map<number, Hash256>;
  /** Current epoch state. */
  epochState: EpochState;
  /** Current difficulty target in compact bits. */
  currentDifficultyBits: number;
  /** Block timestamps for the last 2016 blocks (retargeting window). */
  recentBlockTimes: number[];
  /** Median of last 11 timestamps (BIP 113 equivalent). */
  medianPastTime: number;
  /** Total cumulative fees collected in current epoch. */
  epochFees: bigint;
  /** Unspent transaction output set (chainstate / ledger). */
  utxos: UTXOSet;
}

// ─────────────────────────────────────────────────────────────────────────────
// JGC Node
// ─────────────────────────────────────────────────────────────────────────────

/**
 * JGCNode — the main node class.
 *
 * Emits events:
 *   "block"        (block: Block)                 — new block accepted
 *   "tx"           (tx: Transaction)              — new transaction received
 *   "proof"        (contrib: MinerComputeContrib) — new compute proof received
 *   "epochSettle"  (epochIndex: number)           — epoch boundary settled
 *   "peer:connect" (peer: PeerInfo)               — new peer connected
 *   "peer:disconnect" (peerId: string)            — peer disconnected
 */
export class JGCNode extends EventEmitter {
  readonly config: NodeConfig;
  private peers = new Map<string, PeerConnection>();
  private chain: ChainState;

  /** Compute proofs received for the current block window (pending aggregation). */
  private pendingProofs: MinerComputeContribution[] = [];

  /** Mempool: txid → Transaction. */
  private mempool = new Map<Hash256, Transaction>();
  /** Durable block store (set when config.dataDir is provided). */
  private store?: BlockStore;
  /** True while replaying persisted blocks on startup (suppresses append + logs). */
  private replaying = false;

  constructor(config: NodeConfig, genesisBlock: Block) {
    super();
    this.config = config;

    // Initialize chain state from genesis.
    const genesisHash = hashBlockHeader(genesisBlock.header);
    this.chain = {
      tipHash:               genesisHash,
      tipHeight:             0,
      headers:               new Map([[genesisHash, genesisBlock.header]]),
      blocks:                new Map([[genesisHash, genesisBlock]]),
      heightIndex:           new Map([[0, genesisHash]]),
      epochState:            initEpochState(0, genesisBlock.header.timestamp),
      currentDifficultyBits: genesisBlock.header.difficultyBits,
      recentBlockTimes:      [genesisBlock.header.timestamp],
      medianPastTime:        genesisBlock.header.timestamp - 1,
      epochFees:             0n,
      utxos:                 new UTXOSet(),
    };

    // Seed the UTXO set from genesis (its tx[0], if any, is the coinbase).
    genesisBlock.transactions.forEach((tx, i) =>
      this.chain.utxos.applyTransaction(tx, 0, i === 0),
    );

    // Apply genesis (height 0) to the epoch accumulator. Epoch 0 spans
    // heights [0, 143], so genesis occupies slot 0: its subsidy joins the
    // epoch reward pool and the accumulator advances to expect slot 1.
    // Without this, applyBlockToEpoch throws an index mismatch on block 1
    // (accumulator invariant: epochBlockIndex === blocks applied so far).
    applyBlockToEpoch(
      this.chain.epochState,
      genesisBlock.computeProofs,   // empty by consensus — genesis has no proofs
      0,
      0n,
    );

    // Durable storage: replay persisted blocks to rebuild full chain state.
    if (this.config.dataDir) {
      this.store = new BlockStore(this.config.dataDir);
      this.replayFromStore();
    }
  }

  /**
   * Rebuild chain/UTXO/epoch state by replaying the persisted block log through
   * the normal accept path. Each block must extend the current tip (guards
   * against a store/genesis mismatch).
   */
  private replayFromStore(): void {
    const blocks = this.store!.loadAll();
    if (blocks.length === 0) return;
    this.replaying = true;
    for (const block of blocks) {
      const h = block.header.height;
      const fail = (why: string): never => {
        this.replaying = false;
        throw new Error(`Persistence replay integrity failure at height ${h}: ${why} (corrupt or tampered store?)`);
      };
      // Re-validate each persisted block before re-applying it. These checks are
      // synchronous (no ZK) but catch any tampering: changing a tx, proof, epoch
      // commitment, or coinbase amount changes one of the committed roots, and a
      // re-linked block must still extend the current tip.
      if (block.header.prevHash !== this.chain.tipHash) fail("does not extend current tip");
      if (computeTransactionMerkleRoot(block.transactions) !== block.header.merkleRoot) fail("merkleRoot mismatch");
      if (computeContributionsMerkleRoot(block.computeProofs) !== block.header.computeRoot) fail("computeRoot mismatch");
      if (computeEpochRoot(this.chain.epochState) !== block.header.epochRoot) fail("epochRoot mismatch");
      // Non-boundary coinbase must not mint (the inflation guard, re-checked).
      if (h % BLOCKS_PER_EPOCH !== BLOCKS_PER_EPOCH - 1) {
        const minted = block.transactions[0]?.outputs.reduce((s, o) => s + o.value, 0n) ?? 0n;
        if (minted > 0n) fail("non-boundary coinbase mints value");
      }
      this.acceptBlock(block, hashBlockHeader(block.header), h % BLOCKS_PER_EPOCH);
    }
    this.replaying = false;
    console.log(`[Node] Replayed ${blocks.length} block(s) from ${this.config.dataDir} — tip height ${this.chain.tipHeight}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Peer Management
  // BITCOIN ANALOG: CConnman::OpenNetworkConnection() + AddNode()
  // ─────────────────────────────────────────────────────────────────────────

  connectPeer(peer: PeerConnection): void {
    if (this.peers.size >= this.config.maxPeers) {
      console.warn(`[Node] Max peers (${this.config.maxPeers}) reached — rejecting ${peer.info.address}`);
      peer.disconnect();
      return;
    }

    this.peers.set(peer.info.peerId, peer);
    this.emit("peer:connect", peer.info);

    // Send VERSION message — same handshake pattern as Bitcoin.
    void peer.send(this.buildVersionMessage());
  }

  disconnectPeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.disconnect();
    this.peers.delete(peerId);
    this.emit("peer:disconnect", peerId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Message Processing
  // BITCOIN ANALOG: net_processing.cpp ProcessMessage()
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Process an incoming P2P message from a peer.
   *
   * BITCOIN ANALOG:
   *   bool PeerManagerImpl::ProcessMessage(CNode& pfrom, const std::string& msg_type,
   *       CDataStream& vRecv, ...) {
   *     if (msg_type == NetMsgType::VERSION)   return ProcessVersionMessage(...);
   *     if (msg_type == NetMsgType::BLOCK)     return ProcessBlockMessage(...);
   *     if (msg_type == NetMsgType::TX)        return ProcessTxMessage(...);
   *     ...
   *   }
   *
   * JGC adds COMPUTE_PROOF, EPOCH_SETTLE, BROKER_BID handlers.
   */
  async processMessage(peerId: string, msg: PeerMessage): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    peer.info.lastSeen   = Math.floor(Date.now() / 1000);

    switch (msg.type as MT) {
      case MT.VERSION:
        await this.handleVersion(peer, msg.payload as Partial<PeerInfo>);
        break;

      case MT.BLOCK:
        await this.handleBlock(peer, msg.payload as Block);
        break;

      case MT.TX:
        await this.handleTransaction(peer, msg.payload as Transaction);
        break;

      case MT.COMPUTE_PROOF:
        await this.handleComputeProof(peer, msg.payload as MinerComputeContribution);
        break;

      case MT.BROKER_BID:
        await this.handleBrokerBid(peer, msg.payload as ComputeBid);
        break;

      case MT.GETBLOCKS:
        await this.handleGetBlocks(peer, msg.payload as { fromHash: Hash256 });
        break;

      case MT.PING:
        await peer.send(this.buildMessage(MT.PONG, { nonce: (msg.payload as { nonce: number }).nonce }));
        break;

      case MT.GETHEADERS:
        await this.handleGetHeaders(peer, msg.payload as { fromHashes: Hash256[] });
        break;

      case MT.HEADERS:
        await this.handleHeaders(peer, msg.payload as { headers: BlockHeader[] });
        break;

      case MT.INV:
        await this.handleInv(peer, msg.payload as { hashes: Hash256[] });
        break;

      case MT.GETDATA:
        await this.handleGetData(peer, msg.payload as { hashes: Hash256[] });
        break;

      case MT.VERACK:
      case MT.PONG:
        // Handshake ack / ping reply — lastSeen was already refreshed above.
        break;

      default:
        console.debug(`[Node] Unknown message type ${msg.type} from peer ${peerId}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Message Handlers
  // ─────────────────────────────────────────────────────────────────────────

  private async handleVersion(peer: PeerConnection, payload: Partial<PeerInfo>): Promise<void> {
    peer.info.version     = payload.version     ?? 0;
    peer.info.bestBlock   = payload.bestBlock   ?? "0".repeat(64);
    peer.info.startHeight = payload.startHeight ?? 0;
    peer.info.userAgent   = payload.userAgent   ?? "unknown";

    await peer.send(this.buildMessage(MT.VERACK, {}));

    // If peer is ahead of us, request headers (headers-first sync).
    if (peer.info.startHeight > this.chain.tipHeight) {
      await peer.send(this.buildMessage(MT.GETHEADERS, {
        fromHashes: [this.chain.tipHash],
      }));
    }
  }

  /**
   * Process a new block received from a peer.
   *
   * BITCOIN ANALOG: net_processing.cpp ProcessNewBlock() → AcceptBlock()
   * → ConnectBlock() — the full validation pipeline.
   */
  private async handleBlock(peer: PeerConnection, block: Block): Promise<void> {
    const blockHash = hashBlockHeader(block.header);

    // Skip if already known.
    if (this.chain.blocks.has(blockHash)) return;

    // Reject orphans (block extends unknown parent).
    if (!this.chain.headers.has(block.header.prevHash) && block.header.height !== 0) {
      console.warn(`[Node] Orphan block ${blockHash.slice(0, 16)}… — parent unknown`);
      // In production: request missing headers from peer.
      return;
    }

    // Calculate epoch block index.
    const epochBlockIndex = block.header.height % BLOCKS_PER_EPOCH;

    // Run full validation pipeline.
    const result = await validateBlock(block, {
      prevHash:               this.chain.tipHash,
      expectedHeight:         this.chain.tipHeight + 1,
      nowUnix:                Math.floor(Date.now() / 1000),
      medianPastTime:         this.chain.medianPastTime,
      expectedDifficultyBits: this.getExpectedDifficultyBits(block.header.height),
      epochState:             this.chain.epochState,
      blockFees:              this.calculateBlockFees(block),
      epochBlockIndex,
      epochFees:              this.chain.epochFees,
      utxos:                  this.chain.utxos,
    });

    if (!result.valid) {
      console.error(
        `[Node] Block ${blockHash.slice(0, 16)}… REJECTED: ${result.errors.join(", ")} ` +
        `(${result.warnings.join("; ")})`
      );
      return;
    }

    // Accept block: update chain state, then persist it durably.
    this.acceptBlock(block, blockHash, epochBlockIndex);
    if (this.store) this.store.append(block);

    // Relay to other peers (same as Bitcoin's block relay).
    await this.relayBlock(block, peer.info.peerId);

    this.emit("block", block);
  }

  private async handleTransaction(peer: PeerConnection, tx: Transaction): Promise<void> {
    // Simple mempool acceptance — production: full UTXO script validation.
    const txid = this.hashTx(tx);
    if (this.mempool.has(txid)) return;

    this.mempool.set(txid, tx);
    this.emit("tx", tx);

    // Relay to all other peers.
    for (const [pid, p] of this.peers) {
      if (pid !== peer.info.peerId) {
        void p.send(this.buildMessage(MT.TX, tx));
      }
    }
  }

  /**
   * Handle a new compute proof from a miner.
   *
   * This is JGC-specific: miners broadcast their ZK proofs as they complete them
   * (no equivalent in Bitcoin).  All valid proofs within the 10-minute block window
   * are collected and aggregated into the next block's computeProofs array.
   */
  private async handleComputeProof(
    peer:    PeerConnection,
    contrib: MinerComputeContribution,
  ): Promise<void> {
    // Lightweight duplicate check.
    if (this.pendingProofs.some(p =>
      p.proof.taskCommitment === contrib.proof.taskCommitment &&
      p.minerAddress === contrib.minerAddress
    )) {
      return;
    }

    this.pendingProofs.push(contrib);
    this.emit("proof", contrib);

    console.log(
      `[Node] Compute proof from ${contrib.minerAddress.slice(0, 16)}…: ` +
      `${contrib.proof.tflopsWeight} TFLOPS (${contrib.proof.circuitId})`
    );

    // Relay proof to other peers so all nodes can include it in their block candidates.
    for (const [pid, p] of this.peers) {
      if (pid !== peer.info.peerId) {
        void p.send(this.buildMessage(MT.COMPUTE_PROOF, contrib));
      }
    }
  }

  private async handleBrokerBid(peer: PeerConnection, bid: ComputeBid): Promise<void> {
    const accepted = globalBroker.submitBid(bid);
    if (!accepted) return;

    // Relay accepted bids.
    for (const [pid, p] of this.peers) {
      if (pid !== peer.info.peerId) {
        void p.send(this.buildMessage(MT.BROKER_BID, bid));
      }
    }
  }

  private async handleGetBlocks(
    peer:    PeerConnection,
    payload: { fromHash: Hash256 },
  ): Promise<void> {
    let hash = payload.fromHash;
    const inv: Hash256[] = [];

    // Walk forward from the requested hash — send up to 500 block hashes.
    for (let i = 0; i < 500; i++) {
      const header = this.chain.headers.get(hash);
      if (!header) break;
      // Find the next block hash in chain (simplified — production: use height index).
      const nextHash = this.findNextHash(hash);
      if (!nextHash) break;
      inv.push(nextHash);
      hash = nextHash;
    }

    if (inv.length > 0) {
      await peer.send(this.buildMessage(MT.INV, { hashes: inv }));
    }
  }

  private async handleGetHeaders(
    peer:    PeerConnection,
    payload: { fromHashes: Hash256[] },
  ): Promise<void> {
    const headers: BlockHeader[] = [];
    // Find the best known hash from the locator.
    for (const fromHash of payload.fromHashes) {
      if (this.chain.headers.has(fromHash)) {
        // Send up to 2000 headers from this point.
        let hash = fromHash;
        for (let i = 0; i < 2000; i++) {
          const next = this.findNextHash(hash);
          if (!next) break;
          const h = this.chain.headers.get(next);
          if (h) { headers.push(h); hash = next; }
        }
        break;
      }
    }
    await peer.send(this.buildMessage(MT.HEADERS, { headers }));
  }

  /**
   * Headers-first sync, step 2: after receiving headers we don't have,
   * request the corresponding full blocks.
   *
   * BITCOIN ANALOG: ProcessHeadersMessage() → fetching via GETDATA(MSG_BLOCK).
   * Simplified: headers are not pre-validated or stored here — full validation
   * happens when the block arrives (handleBlock), and blocks are requested in
   * header order so each one extends the tip on arrival.
   */
  private async handleHeaders(
    peer:    PeerConnection,
    payload: { headers: BlockHeader[] },
  ): Promise<void> {
    const wanted: Hash256[] = [];
    for (const header of payload.headers) {
      const hash = hashBlockHeader(header);
      if (!this.chain.blocks.has(hash)) wanted.push(hash);
    }
    if (wanted.length > 0) {
      await peer.send(this.buildMessage(MT.GETDATA, { hashes: wanted }));
    }
  }

  /** Request full blocks for any announced inventory we don't have yet. */
  private async handleInv(
    peer:    PeerConnection,
    payload: { hashes: Hash256[] },
  ): Promise<void> {
    const unknown = payload.hashes.filter(h => !this.chain.blocks.has(h));
    if (unknown.length > 0) {
      await peer.send(this.buildMessage(MT.GETDATA, { hashes: unknown }));
    }
  }

  /**
   * Serve full blocks from our store, in requested order.
   * BITCOIN ANALOG: net_processing.cpp ProcessGetData().
   */
  private async handleGetData(
    peer:    PeerConnection,
    payload: { hashes: Hash256[] },
  ): Promise<void> {
    for (const hash of payload.hashes) {
      const block = this.chain.blocks.get(hash);
      if (block) await peer.send(this.buildMessage(MT.BLOCK, block));
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Chain State Updates
  // ─────────────────────────────────────────────────────────────────────────

  private acceptBlock(block: Block, blockHash: Hash256, epochBlockIndex: number): void {
    this.chain.headers.set(blockHash, block.header);
    this.chain.blocks.set(blockHash, block);
    this.chain.heightIndex.set(block.header.height, blockHash);
    this.chain.tipHash   = blockHash;
    this.chain.tipHeight = block.header.height;

    // Update the UTXO set: tx[0] is the coinbase (adds outputs, spends nothing);
    // every other tx spends its inputs and creates its outputs.
    block.transactions.forEach((tx, i) =>
      this.chain.utxos.applyTransaction(tx, block.header.height, i === 0),
    );

    // Update epoch state.
    applyBlockToEpoch(
      this.chain.epochState,
      block.computeProofs,
      block.header.height,
      this.calculateBlockFees(block),
    );
    this.chain.epochFees += this.calculateBlockFees(block);

    // Update timestamp tracking (for BIP 113 median and difficulty retarget).
    this.chain.recentBlockTimes.push(block.header.timestamp);
    if (this.chain.recentBlockTimes.length > RETARGET_WINDOW_BLOCKS + 1) {
      this.chain.recentBlockTimes.shift();
    }
    this.chain.medianPastTime = this.computeMedianTime(
      this.chain.recentBlockTimes.slice(-11)
    );

    // Epoch boundary: settle payouts, reset accumulator.
    if (epochBlockIndex === BLOCKS_PER_EPOCH - 1) {
      const epochIndex = Math.floor(block.header.height / BLOCKS_PER_EPOCH);
      const settlement = computeEpochSettlement(this.chain.epochState, epochIndex);
      console.log(
        `[Node] EPOCH ${epochIndex} SETTLED: ` +
        `${settlement.payouts.length} miners, ` +
        `pool: ${Number(settlement.totalRewardPool) / 1e16} JGC, ` +
        `total TFLOPS: ${settlement.totalTFLOPS.toFixed(2)}`
      );
      this.emit("epochSettle", epochIndex);

      // Reset epoch state for the next epoch.
      this.chain.epochState = initEpochState(
        block.header.height + 1,
        block.header.timestamp,
      );
      this.chain.epochFees = 0n;
    }

    // Difficulty retarget every 2016 blocks.
    if (block.header.height % RETARGET_WINDOW_BLOCKS === 0 && block.header.height > 0) {
      this.chain.currentDifficultyBits = this.retargetDifficulty(block.header.height);
    }

    // Clear proofs used in this block.
    this.pendingProofs = [];

    if (!this.replaying) {
      console.log(
        `[Node] Block accepted: height=${block.header.height} ` +
        `hash=${blockHash.slice(0, 16)}… ` +
        `proofs=${block.computeProofs.length} ` +
        `txs=${block.transactions.length}`
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Difficulty Retargeting
  // BITCOIN ANALOG: pow.cpp CalculateNextWorkRequired()
  // ─────────────────────────────────────────────────────────────────────────

  private retargetDifficulty(height: number): number {
    const times = this.chain.recentBlockTimes;
    if (times.length < 2) return this.chain.currentDifficultyBits;

    const actualTimespan = times[times.length - 1] - times[Math.max(0, times.length - RETARGET_WINDOW_BLOCKS - 1)];
    const oldTarget      = decodeDifficultyBits(this.chain.currentDifficultyBits);
    const newTarget      = calculateNextDifficultyTarget(oldTarget, actualTimespan);

    const newBits = encodeDifficultyBits(newTarget);
    console.log(
      `[Node] Difficulty retarget at height ${height}: ` +
      `${oldTarget.toFixed(2)} → ${newTarget.toFixed(2)} TFLOPS ` +
      `(actual=${actualTimespan}s, target=${RETARGET_WINDOW_BLOCKS * 600}s)`
    );
    return newBits;
  }

  private getExpectedDifficultyBits(_height: number): number {
    return this.chain.currentDifficultyBits;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private buildVersionMessage(): PeerMessage {
    return this.buildMessage(MT.VERSION, {
      version:     70015,
      services:    BigInt(0x001 | 0x008 | 0x400),  // NODE_NETWORK | NODE_BLOOM | NODE_COMPACT_FILTERS
      userAgent:   "/JGCNode:0.1.0/",
      startHeight: this.chain.tipHeight,
      bestBlock:   this.chain.tipHash,
    });
  }

  private buildMessage(type: MT, payload: unknown): PeerMessage {
    return {
      type:            type as import("../types/index.js").MessageType,
      payload,
      timestamp:       Math.floor(Date.now() / 1000),
      senderPublicKey: this.config.minerAddress ?? "unknown",
      signature:       "0".repeat(128),  // production: sign with node key
    };
  }

  private calculateBlockFees(_block: Block): bigint {
    // Sum all outputs, subtract coinbase output (simplified fee calculation).
    return 0n;  // Production: iterate UTXO set to compute actual fees.
  }

  private computeMedianTime(timestamps: number[]): number {
    const sorted = [...timestamps].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  }

  private findNextHash(hash: Hash256): Hash256 | null {
    const header = this.chain.headers.get(hash);
    if (!header) return null;
    // Only traverse the active chain — a stale fork header has no successor here.
    if (this.chain.heightIndex.get(header.height) !== hash) return null;
    return this.chain.heightIndex.get(header.height + 1) ?? null;
  }

  private hashTx(tx: Transaction): Hash256 {
    const data = serializeTransaction(tx);
    return createHash("sha256").update(createHash("sha256").update(data).digest()).digest("hex");
  }

  private async relayBlock(block: Block, excludePeerId: string): Promise<void> {
    for (const [pid, peer] of this.peers) {
      if (pid !== excludePeerId) {
        void peer.send(this.buildMessage(MT.BLOCK, block));
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  getChainInfo(): {
    tipHash: Hash256;
    tipHeight: number;
    peerCount: number;
    pendingProofs: number;
    mempoolSize: number;
  } {
    return {
      tipHash:       this.chain.tipHash,
      tipHeight:     this.chain.tipHeight,
      peerCount:     this.peers.size,
      pendingProofs: this.pendingProofs.length,
      mempoolSize:   this.mempool.size,
    };
  }

  getPendingProofs(): MinerComputeContribution[] {
    return [...this.pendingProofs];
  }

  getMempool(): Transaction[] {
    return Array.from(this.mempool.values());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Block Template Support
  // BITCOIN ANALOG: the `getblocktemplate` RPC (BIP 22/23) — miners pull the
  // chain context they need to assemble a valid candidate block.
  // ─────────────────────────────────────────────────────────────────────────

  /** Current chain tip header — the miner's prevHeader for assembleBlock(). */
  getTipHeader(): BlockHeader {
    const header = this.chain.headers.get(this.chain.tipHash);
    if (!header) {
      throw new Error("Corrupt chain state: tip hash has no header entry");
    }
    return header;
  }

  /**
   * The live epoch accumulator, PRE-acceptance of the next block.
   * The miner must commit computeEpochRoot(thisState) as header.epochRoot —
   * validation compares against this exact state (see validateEpochRoot).
   * Treat as read-only; mutation corrupts consensus state.
   */
  getEpochState(): EpochState {
    return this.chain.epochState;
  }

  /** The live UTXO set (chainstate). Treat as read-only except for genesis/premine
   *  funding in tests/demos; the node maintains it as blocks are accepted. */
  getUTXOSet(): UTXOSet {
    return this.chain.utxos;
  }

  /** Compact difficulty bits the next block header must carry. */
  getCurrentDifficultyBits(): number {
    return this.chain.currentDifficultyBits;
  }
}
