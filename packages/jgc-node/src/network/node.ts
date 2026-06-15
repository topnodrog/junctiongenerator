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
import type {
  Block, BlockHeader, PeerMessage, Transaction,
  MinerComputeContribution, ComputeBid, NodeConfig,
} from "../types/index.js";
import { MessageType as MT } from "../types/index.js";
import { validateBlock } from "../consensus/validation.js";
import { hashBlockHeader, computeTransactionMerkleRoot, serializeTransaction } from "../consensus/block.js";
import { applyBlockToEpoch, initEpochState, computeContributionsMerkleRoot, computeEpochRoot } from "../consensus/epoch.js";
import { UTXOSet, validateSpend, txid } from "../consensus/utxo.js";
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
  /** blockHash → cumulative work (Σ per-block TFLOPS target from genesis). The
   *  fork-choice metric: the active chain is the known block of greatest work.
   *  Populated for every known block, on the active chain or a side branch. */
  chainWork: Map<Hash256, bigint>;
  /** Blocks whose parent we haven't seen yet, keyed by the missing parent hash.
   *  Drained when that parent is connected (handles out-of-order arrival). */
  orphans: Map<Hash256, Block[]>;
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
/** Default mempool capacity (txs) before lowest-fee-rate eviction kicks in. */
export const DEFAULT_MAX_MEMPOOL_TXS = 5000;
/** Default minimum relay fee rate (base units per serialized byte). Modest: it
 *  rejects zero/dust-fee spam while leaving normal fees far above the floor. */
export const DEFAULT_MIN_RELAY_FEERATE = 1000n;

/** A mempool resident: the tx plus its cached fee and serialized size, so
 *  fee-rate (fee/size) comparisons for eviction don't re-serialize each time. */
interface MempoolEntry { tx: Transaction; fee: bigint; size: number; }

export class JGCNode extends EventEmitter {
  readonly config: NodeConfig;
  private peers = new Map<string, PeerConnection>();
  private chain: ChainState;

  /** Compute proofs received for the current block window (pending aggregation). */
  private pendingProofs: MinerComputeContribution[] = [];

  /** Mempool: txid → entry (tx + cached fee/size). */
  private mempool = new Map<Hash256, MempoolEntry>();
  /** Outpoints ("txid:vout") spent by some mempool tx — lets us reject a
   *  double-spend of a pending coin in O(inputs) without cloning the chainstate. */
  private readonly mempoolSpends = new Set<string>();
  /** Mempool DoS bounds (from config, with defaults). */
  private readonly maxMempoolTxs: number;
  private readonly minRelayFeeRate: bigint;
  /** Durable block store (set when config.dataDir is provided). */
  private store?: BlockStore;
  /** True while replaying persisted blocks on startup (suppresses append + logs). */
  private replaying = false;
  /** The genesis block — kept so a reorg can rebuild active state from height 0. */
  private readonly genesis: Block;

  constructor(config: NodeConfig, genesisBlock: Block) {
    super();
    this.config = config;
    this.genesis = genesisBlock;
    this.maxMempoolTxs   = config.maxMempoolTxs   ?? DEFAULT_MAX_MEMPOOL_TXS;
    this.minRelayFeeRate = config.minRelayFeeRate ?? DEFAULT_MIN_RELAY_FEERATE;

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
      chainWork:             new Map([[genesisHash, this.blockWork(genesisBlock.header)]]),
      orphans:               new Map(),
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
   * Rebuild chain/UTXO/epoch state by replaying the persisted block log. The log
   * is always the linear active chain (a reorg rewrites it via
   * rewriteStoreToActiveChain), so each block must extend the current tip. The
   * synchronous integrity checks (no ZK) catch tampering: changing a tx, proof,
   * epoch commitment, or coinbase amount changes one of the committed roots.
   */
  private replayFromStore(): void {
    const blocks = this.store!.loadAll();
    if (blocks.length === 0) return;
    this.replaying = true;
    for (const block of blocks) {
      const blockHash = hashBlockHeader(block.header);
      const fail = (why: string): never => {
        this.replaying = false;
        throw new Error(`Persistence replay integrity failure at height ${block.header.height}: ${why} (corrupt or tampered store?)`);
      };
      if (block.header.prevHash !== this.chain.tipHash) fail("does not extend current tip");
      if (!this.integrityCheck(this.chain, block)) fail("integrity check failed (root mismatch or non-boundary mint)");
      // Record knowledge + work, then apply incrementally (replay is linear).
      this.chain.headers.set(blockHash, block.header);
      this.chain.blocks.set(blockHash, block);
      this.chain.chainWork.set(blockHash, (this.chain.chainWork.get(block.header.prevHash) ?? 0n) + this.blockWork(block.header));
      this.applyBlockState(this.chain, block, blockHash);
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

    // Parent unknown → stash as an orphan; the headers-first path will fetch the
    // gap, and drainOrphans re-processes it once the parent connects.
    if (block.header.height !== 0 && !this.chain.headers.has(block.header.prevHash)) {
      const waiting = this.chain.orphans.get(block.header.prevHash) ?? [];
      if (!waiting.some(b => hashBlockHeader(b.header) === blockHash)) waiting.push(block);
      this.chain.orphans.set(block.header.prevHash, waiting);
      console.warn(`[Node] Orphan block ${blockHash.slice(0, 16)}… — parent unknown (stashed)`);
      return;
    }

    // Ingest under full (ZK) validation; on success persist, relay, and drain
    // any orphans that were waiting on this block.
    const connected = await this.ingestBlock(block, blockHash, (chain, b) => this.validateAgainst(chain, b));
    if (connected) {
      await this.relayBlock(block, peer.info.peerId);
      this.emit("block", block);
      await this.drainOrphans(blockHash);
    }
  }

  /** Re-process orphans that were waiting on `parentHash` now that it's known. */
  private async drainOrphans(parentHash: Hash256): Promise<void> {
    const waiting = this.chain.orphans.get(parentHash);
    if (!waiting) return;
    this.chain.orphans.delete(parentHash);
    for (const orphan of waiting) {
      const h = hashBlockHeader(orphan.header);
      const connected = await this.ingestBlock(orphan, h, (chain, b) => this.validateAgainst(chain, b));
      if (connected) {
        this.emit("block", orphan);
        await this.drainOrphans(h);
      }
    }
  }

  /**
   * Record a known block, score it, and apply fork choice.
   *
   *  - extends the active tip  → verify against current state, apply incrementally;
   *  - heavier side branch     → reorg (rebuild active state to follow it);
   *  - otherwise               → retain as an inactive branch (no state change).
   *
   * `verify(chain, block)` returns whether the block is valid against `chain`'s
   * state — async full validation for live blocks, a sync integrity check for
   * replay. Returns whether the block became part of the active chain.
   */
  private async ingestBlock(
    block: Block,
    blockHash: Hash256,
    verify: (chain: ChainState, block: Block) => boolean | Promise<boolean>,
  ): Promise<boolean> {
    // Record knowledge + cumulative work (parent is known by the caller's guard).
    this.chain.headers.set(blockHash, block.header);
    this.chain.blocks.set(blockHash, block);
    const parentWork = this.chain.chainWork.get(block.header.prevHash) ?? 0n;
    this.chain.chainWork.set(blockHash, parentWork + this.blockWork(block.header));
    const forget = (): void => {
      this.chain.headers.delete(blockHash); this.chain.blocks.delete(blockHash); this.chain.chainWork.delete(blockHash);
    };

    if (block.header.prevHash === this.chain.tipHash) {
      // Fast path: extends the active tip.
      if (!(await verify(this.chain, block))) { forget(); return false; }
      this.applyLiveBlock(block, blockHash);
      return true;
    }

    const work    = this.chain.chainWork.get(blockHash)!;
    const tipWork = this.chain.chainWork.get(this.chain.tipHash) ?? 0n;
    if (work > tipWork) {
      // Heavier branch that doesn't extend the tip → reorganize onto it.
      const ok = await this.reorgToBlock(blockHash, verify);
      if (!ok) { forget(); return false; }
      return true;
    }

    // Equal or lighter: keep as a known inactive branch (first-seen tip wins ties).
    return false;
  }

  /**
   * Validate a transaction against the UTXO set AND the current mempool, and add
   * it to the mempool if valid. Returns whether it was newly accepted.
   *
   * Checks: ≥1 input, no input already spent by a pending mempool tx, every input
   * exists & is unspent & authorized (P2PKH) & value-conserved (validateSpend),
   * fee rate ≥ the relay floor, and mempool capacity (evicting the cheapest tx if
   * full). BITCOIN ANALOG: AcceptToMemoryPool.
   */
  submitTransaction(tx: Transaction): { ok: boolean; error?: string } {
    if (tx.inputs.length === 0) return { ok: false, error: "transaction has no inputs" };
    const id = txid(tx);
    if (this.mempool.has(id)) return { ok: false, error: "already in mempool" };

    // Reject a double-spend of a coin some pending tx already spends — O(inputs),
    // no chainstate clone. (Inputs created by another mempool tx aren't in the
    // confirmed UTXO set, so validateSpend below rejects in-mempool chaining, as
    // before — this only guards confirmed coins.)
    for (const input of tx.inputs) {
      const op = `${input.prevOut.txid}:${input.prevOut.vout}`;
      if (this.mempoolSpends.has(op)) return { ok: false, error: `input ${op} already spent by a mempool tx` };
    }

    const res = validateSpend(tx, this.chain.utxos, this.chain.tipHeight + 1);
    if (!res.ok) return { ok: false, error: res.error };
    const fee = res.fee ?? 0n;

    // Minimum relay fee rate (anti-spam): fee/size ≥ floor ⇔ fee ≥ floor·size.
    const size = serializeTransaction(tx).length;
    if (fee < this.minRelayFeeRate * BigInt(size)) {
      return { ok: false, error: `fee ${fee} below min relay rate (${this.minRelayFeeRate}/byte × ${size}B)` };
    }
    const entry: MempoolEntry = { tx, fee, size };

    // Capacity bound: when full, evict the lowest fee-rate resident — but only if
    // the newcomer pays a strictly higher rate, else reject the newcomer. This
    // makes the mempool a bounded, fee-prioritized set (anti-DoS on memory).
    if (this.mempool.size >= this.maxMempoolTxs) {
      const worst = this.lowestFeeRateEntry();
      if (!worst || !this.feeRateGreater(entry, worst.entry)) {
        return { ok: false, error: "mempool full; fee rate not above the cheapest tx" };
      }
      this.removeFromMempool(worst.id);
    }

    this.mempool.set(id, entry);
    for (const input of tx.inputs) this.mempoolSpends.add(`${input.prevOut.txid}:${input.prevOut.vout}`);
    this.emit("tx", tx);
    return { ok: true };
  }

  /** True iff a's fee rate strictly exceeds b's, compared without division:
   *  a.fee/a.size > b.fee/b.size ⇔ a.fee·b.size > b.fee·a.size. */
  private feeRateGreater(a: MempoolEntry, b: MempoolEntry): boolean {
    return a.fee * BigInt(b.size) > b.fee * BigInt(a.size);
  }

  /** The current lowest-fee-rate mempool entry (eviction candidate), or null. */
  private lowestFeeRateEntry(): { id: Hash256; entry: MempoolEntry } | null {
    let lo: { id: Hash256; entry: MempoolEntry } | null = null;
    for (const [id, entry] of this.mempool) {
      if (!lo || this.feeRateGreater(lo.entry, entry)) lo = { id, entry };
    }
    return lo;
  }

  /** Remove a mempool tx and release the outpoints it reserved. */
  private removeFromMempool(id: Hash256): void {
    const e = this.mempool.get(id);
    if (!e) return;
    this.mempool.delete(id);
    for (const input of e.tx.inputs) this.mempoolSpends.delete(`${input.prevOut.txid}:${input.prevOut.vout}`);
  }

  /** Submit a local transaction and relay it to ALL peers (user broadcast). */
  async broadcastTransaction(tx: Transaction): Promise<{ ok: boolean; error?: string }> {
    const res = this.submitTransaction(tx);
    if (!res.ok) return res;
    for (const [, p] of this.peers) void p.send(this.buildMessage(MT.TX, tx));
    return { ok: true };
  }

  private async handleTransaction(peer: PeerConnection, tx: Transaction): Promise<void> {
    // Validate before accepting; only relay genuinely-new, valid txs (so invalid
    // or already-known txs don't propagate or cause relay loops).
    if (!this.submitTransaction(tx).ok) return;
    for (const [pid, p] of this.peers) {
      if (pid !== peer.info.peerId) {
        void p.send(this.buildMessage(MT.TX, tx));
      }
    }
  }

  /** Drop mempool txs that are no longer spendable (confirmed by, or conflicting
   *  with, a newly-accepted block). */
  private pruneMempool(): void {
    for (const [id, e] of this.mempool) {
      if (!validateSpend(e.tx, this.chain.utxos, this.chain.tipHeight + 1).ok) {
        this.removeFromMempool(id);  // keeps mempoolSpends in sync
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

  /**
   * Apply a block's state transition to `chain`: UTXO, epoch accumulator,
   * timestamps, difficulty retarget, tip, and height index. Pure with respect to
   * node I/O — no mempool/store/relay/emit — so it serves both the live fast path
   * (chain === this.chain) and the reorg rebuild (chain === a scratch state).
   *
   * Returns the settled epoch index when this block is an epoch boundary (so the
   * live caller can log/emit), else undefined.
   */
  private applyBlockState(chain: ChainState, block: Block, blockHash: Hash256): number | undefined {
    const height = block.header.height;
    chain.headers.set(blockHash, block.header);
    chain.blocks.set(blockHash, block);
    chain.heightIndex.set(height, blockHash);
    chain.tipHash   = blockHash;
    chain.tipHeight = height;

    // Fees MUST be summed BEFORE the inputs are spent. tx[0] is the coinbase
    // (adds outputs, spends nothing); every other tx spends its inputs.
    const blockFees = this.calculateBlockFees(block, chain.utxos);
    block.transactions.forEach((tx, i) => chain.utxos.applyTransaction(tx, height, i === 0));

    // Fees join the epoch reward pool (deferred, distributed pro-rata at settlement).
    applyBlockToEpoch(chain.epochState, block.computeProofs, height, blockFees);
    chain.epochFees += blockFees;

    chain.recentBlockTimes.push(block.header.timestamp);
    if (chain.recentBlockTimes.length > RETARGET_WINDOW_BLOCKS + 1) chain.recentBlockTimes.shift();
    chain.medianPastTime = this.computeMedianTime(chain.recentBlockTimes.slice(-11));

    let settledEpoch: number | undefined;
    if (height % BLOCKS_PER_EPOCH === BLOCKS_PER_EPOCH - 1) {
      settledEpoch = Math.floor(height / BLOCKS_PER_EPOCH);
      chain.epochState = initEpochState(height + 1, block.header.timestamp);
      chain.epochFees = 0n;
    }

    if (height % RETARGET_WINDOW_BLOCKS === 0 && height > 0) {
      chain.currentDifficultyBits = this.retargetDifficulty(chain, height);
    }
    return settledEpoch;
  }

  /**
   * Connect a block that extends the active tip (the common case): mutate the live
   * chain, then do the node-level side effects (mempool prune, pending-proof reset,
   * epoch-settle log/emit, accepted log).
   */
  private applyLiveBlock(block: Block, blockHash: Hash256): void {
    const settledEpoch = this.applyBlockState(this.chain, block, blockHash);

    // Persist to the durable log (which mirrors the linear active chain).
    if (this.store && !this.replaying) this.store.append(block);
    // Drop confirmed / now-conflicting transactions from the mempool.
    this.pruneMempool();
    // Clear proofs used in this block.
    this.pendingProofs = [];

    if (settledEpoch !== undefined) {
      this.emit("epochSettle", settledEpoch);
      if (!this.replaying) console.log(`[Node] EPOCH ${settledEpoch} SETTLED at height ${block.header.height}`);
    }
    if (!this.replaying) {
      console.log(
        `[Node] Block accepted: height=${block.header.height} ` +
        `hash=${blockHash.slice(0, 16)}… proofs=${block.computeProofs.length} txs=${block.transactions.length}`
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Fork choice & reorganization
  // ─────────────────────────────────────────────────────────────────────────

  /** Per-block work for fork choice: the block's TFLOPS difficulty target,
   *  rounded to an integer (the PoUC analog of Bitcoin's per-block chainwork). */
  private blockWork(header: BlockHeader): bigint {
    return BigInt(Math.max(1, Math.round(decodeDifficultyBits(header.difficultyBits))));
  }

  /** Hashes from genesis (inclusive) up to `hash`, oldest-first, via prevHash. */
  private ancestryFromGenesis(hash: Hash256): Hash256[] {
    const path: Hash256[] = [];
    let cur: Hash256 | undefined = hash;
    while (cur) {
      path.push(cur);
      const header = this.chain.headers.get(cur);
      if (!header || header.height === 0) break;
      cur = header.prevHash;
    }
    return path.reverse();
  }

  /** Full (ZK) validation of `block` against `chain`'s state — the live verifier. */
  private async validateAgainst(chain: ChainState, block: Block): Promise<boolean> {
    const result = await validateBlock(block, {
      prevHash:               chain.tipHash,
      expectedHeight:         chain.tipHeight + 1,
      nowUnix:                Math.floor(Date.now() / 1000),
      medianPastTime:         chain.medianPastTime,
      expectedDifficultyBits: chain.currentDifficultyBits,
      epochState:             chain.epochState,
      blockFees:              this.calculateBlockFees(block, chain.utxos),
      epochBlockIndex:        block.header.height % BLOCKS_PER_EPOCH,
      epochFees:              chain.epochFees,
      utxos:                  chain.utxos,
    });
    if (!result.valid) {
      console.error(`[Node] Block ${hashBlockHeader(block.header).slice(0, 16)}… REJECTED: ${result.errors.join(", ")} (${result.warnings.join("; ")})`);
    }
    return result.valid;
  }

  /**
   * Synchronous integrity check (no ZK) for replaying our own persisted blocks
   * against `chain`'s state — mirrors the prior replay guards: linkage, the three
   * committed roots, and the non-boundary no-mint rule.
   */
  private integrityCheck(chain: ChainState, block: Block): boolean {
    const h = block.header.height;
    if (block.header.prevHash !== chain.tipHash) return false;
    if (computeTransactionMerkleRoot(block.transactions) !== block.header.merkleRoot) return false;
    if (computeContributionsMerkleRoot(block.computeProofs) !== block.header.computeRoot) return false;
    if (computeEpochRoot(chain.epochState) !== block.header.epochRoot) return false;
    if (h % BLOCKS_PER_EPOCH !== BLOCKS_PER_EPOCH - 1) {
      const minted = block.transactions[0]?.outputs.reduce((s, o) => s + o.value, 0n) ?? 0n;
      if (minted > 0n) return false;
    }
    return true;
  }

  /**
   * Switch the active chain to follow `targetHash` (a known block of greater work
   * that does not extend the current tip). Rebuilds active state by replaying
   * genesis→target into a scratch ChainState — blocks already on the active chain
   * are trusted (state-only); blocks unique to the new branch are re-verified.
   * Atomic: if any new block fails verification the scratch is discarded and
   * this.chain is left untouched (no partial mutation). On success the scratch is
   * swapped in and the mempool reconciled (disconnected txs re-added, then pruned).
   */
  private async reorgToBlock(
    targetHash: Hash256,
    verify: (chain: ChainState, block: Block) => boolean | Promise<boolean>,
  ): Promise<boolean> {
    const oldChain = this.chain;
    const targetPath = this.ancestryFromGenesis(targetHash); // genesis-first

    // Scratch shares the append-only knowledge maps (headers/blocks/chainWork) so
    // we never lose awareness of other branches; active state is rebuilt fresh.
    const genesisHash = targetPath[0]!;
    const scratch: ChainState = {
      tipHash: genesisHash, tipHeight: 0,
      headers: oldChain.headers, blocks: oldChain.blocks, chainWork: oldChain.chainWork,
      heightIndex: new Map([[0, genesisHash]]),
      epochState: initEpochState(0, this.genesis.header.timestamp),
      currentDifficultyBits: this.genesis.header.difficultyBits,
      recentBlockTimes: [this.genesis.header.timestamp],
      medianPastTime: this.genesis.header.timestamp - 1,
      epochFees: 0n,
      utxos: new UTXOSet(),
      orphans: oldChain.orphans,
    };
    this.genesis.transactions.forEach((tx, i) => scratch.utxos.applyTransaction(tx, 0, i === 0));
    applyBlockToEpoch(scratch.epochState, this.genesis.computeProofs, 0, 0n);

    // Replay genesis→target. A block currently on the active chain was validated
    // when connected (state-only); a block unique to the new branch is verified.
    for (const hash of targetPath.slice(1)) {
      const block = oldChain.blocks.get(hash)!;
      const onActiveChain = oldChain.heightIndex.get(block.header.height) === hash;
      if (!onActiveChain && !(await verify(scratch, block))) {
        return false; // invalid branch — abort, this.chain untouched
      }
      this.applyBlockState(scratch, block, hash);
    }

    // Fork point = highest target block that was on the old active chain.
    let forkHeight = 0;
    for (const hash of targetPath) {
      const hgt = oldChain.headers.get(hash)!.height;
      if (oldChain.heightIndex.get(hgt) === hash) forkHeight = hgt; else break;
    }
    // Disconnected txs (old active blocks above the fork) return to the mempool.
    const disconnected: Transaction[] = [];
    for (let hgt = forkHeight + 1; hgt <= oldChain.tipHeight; hgt++) {
      const hash = oldChain.heightIndex.get(hgt);
      const blk = hash ? oldChain.blocks.get(hash) : undefined;
      if (blk) for (let i = 1; i < blk.transactions.length; i++) disconnected.push(blk.transactions[i]!);
    }

    this.chain = scratch;
    this.pendingProofs = [];
    if (!this.replaying) {
      console.log(`[Node] REORG to ${targetHash.slice(0, 16)}… (fork@${forkHeight}, new tip height ${scratch.tipHeight}); ${disconnected.length} tx(s) returned to mempool`);
    }
    for (const tx of disconnected) this.submitTransaction(tx); // re-validates vs new state
    this.pruneMempool();                                       // drop ones now confirmed

    // Keep the durable log equal to the (now-reorged) linear active chain, so
    // replay stays simple and linear.
    if (this.store && !this.replaying) this.rewriteStoreToActiveChain();
    return true;
  }

  /** Rewrite the durable block log to exactly the active chain (heights 1..tip),
   *  used after a reorg so the persisted log stays linear. */
  private rewriteStoreToActiveChain(): void {
    if (!this.store) return;
    this.store.clear();
    for (let h = 1; h <= this.chain.tipHeight; h++) {
      const hash = this.chain.heightIndex.get(h);
      const blk = hash ? this.chain.blocks.get(hash) : undefined;
      if (blk) this.store.append(blk);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Difficulty Retargeting
  // BITCOIN ANALOG: pow.cpp CalculateNextWorkRequired()
  // ─────────────────────────────────────────────────────────────────────────

  private retargetDifficulty(chain: ChainState, height: number): number {
    const times = chain.recentBlockTimes;
    if (times.length < 2) return chain.currentDifficultyBits;

    const actualTimespan = times[times.length - 1] - times[Math.max(0, times.length - RETARGET_WINDOW_BLOCKS - 1)];
    const oldTarget      = decodeDifficultyBits(chain.currentDifficultyBits);
    const newTarget      = calculateNextDifficultyTarget(oldTarget, actualTimespan);

    const newBits = encodeDifficultyBits(newTarget);
    if (!this.replaying) {
      console.log(
        `[Node] Difficulty retarget at height ${height}: ` +
        `${oldTarget.toFixed(2)} → ${newTarget.toFixed(2)} TFLOPS ` +
        `(actual=${actualTimespan}s, target=${RETARGET_WINDOW_BLOCKS * 600}s)`
      );
    }
    return newBits;
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

  /**
   * Total fees of a block's non-coinbase transactions: Σ (inputs − outputs).
   * MUST be called BEFORE the block's inputs are spent from chain.utxos. tx[0] is
   * the coinbase and is excluded.
   *
   * Inputs are resolved against a PROGRESSIVE view (a clone of chain.utxos that
   * each tx's outputs are applied to as we go), so a child tx that spends an
   * earlier tx's output in the SAME block is counted correctly — validateBlock
   * (Step 2b) permits such in-block chaining. Resolving only against the
   * pre-block set would miss in-block parents and silently burn those fees.
   *
   * This may run before validateBlock (to build its context), so a block can be
   * invalid here: on an unresolvable input we skip that one tx's fee and CONTINUE
   * (the block is rejected by validateBlock anyway) — never truncate the remaining
   * txs' fees, and never throw.
   */
  private calculateBlockFees(block: Block, utxo: UTXOSet = this.chain.utxos): bigint {
    const view = utxo.clone();
    let fees = 0n;
    for (let i = 1; i < block.transactions.length; i++) {
      const tx = block.transactions[i]!;
      let inSum = 0n;
      let resolved = true;
      for (const input of tx.inputs) {
        const entry = view.get(input.prevOut.txid, input.prevOut.vout);
        if (!entry) { resolved = false; break; }  // invalid block; skip this tx's fee
        inSum += entry.value;
      }
      view.applyTransaction(tx, block.header.height, false);  // expose outputs to later txs
      if (!resolved) continue;
      const outSum = tx.outputs.reduce((s, o) => s + o.value, 0n);
      fees += inSum - outSum;
    }
    return fees;
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
    return Array.from(this.mempool.values(), e => e.tx);
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
