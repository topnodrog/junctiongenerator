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
import { validateAuditVerdicts, validateBlock } from "../consensus/validation.js";
import {
  hashBlockHeader,
  computeAuditVerdictsMerkleRoot,
  computeTransactionMerkleRoot,
  serializeTransaction,
  assembleBlock,
} from "../consensus/block.js";
import {
  applyBlockToEpoch,
  initEpochState,
  computeContributionsMerkleRoot,
  computeEpochRoot,
  computeEpochSettlement,
} from "../consensus/epoch.js";
import { createEpochSettlementTransaction } from "../consensus/settlement-transaction.js";
import { UTXOSet, validateSpend, txid } from "../consensus/utxo.js";
import { BlockStore, SnapshotStore, StorageManifest, type ChainSnapshot } from "../storage/persistence.js";
import { calculateNextDifficultyTarget, BLOCKS_PER_EPOCH, RETARGET_WINDOW_BLOCKS, encodeDifficultyBits, decodeDifficultyBits } from "../consensus/emission.js";
import { globalBroker } from "../broker/compute-broker.js";
import { compareCanonicalBytes } from "../protocol/canonical.js";
import type { Hash256, EpochState } from "../types/index.js";
import {
  AuditLifecycle,
  type AuditRequest,
  type AuditVote,
  type AuditVerdictRecord,
} from "../broker/audit-protocol.js";
import { computeAuditClaimId } from "../broker/audit-schedule.js";
import { AuditStore } from "../storage/audit-store.js";
import { PeerGuard, DEFAULT_PEER_GUARD_POLICY, type PeerViolation } from "./peer-guard.js";
import { validatorStakeSnapshot } from "../consensus/validator-bonds.js";
import {
  quantumVerifyContributionSignature,
  quantumVerifyProofForConsensus,
} from "../crypto/pq.js";

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
  /** The peer's self-advertised dialable URL from its VERSION (for discovery).
   *  Reliable even for inbound peers, whose `address` is an ephemeral socket. */
  advertisedUrl?: string;
  /** True only after a required public-network VERSION identity matched. */
  networkIdentityVerified?: boolean;
}

/** Simulated peer connection — in production: replace with TCP/WebSocket. */
export interface PeerConnection {
  info: PeerInfo;
  send: (msg: PeerMessage) => Promise<void>;
  disconnect: () => void;
}

interface NetworkIdentityPayload {
  chainId?: string;
  genesisHash?: Hash256;
  consensusVersion?: number;
  proofMode?: string;
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
/** Max peer addresses retained in the discovery address book (anti-DoS bound;
 *  oldest evicted when full). */
export const MAX_ADDR_BOOK = 1000;
/** Max addresses sent in a single ADDR message. */
export const MAX_ADDR_PER_MESSAGE = 100;

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
  /** Chainstate snapshot store (set with dataDir; lets restart skip full replay). */
  private snapshot?: SnapshotStore;
  /** Snapshot cadence in blocks (0 disables). */
  private readonly snapshotInterval: number;
  /** True while replaying persisted blocks on startup (suppresses append + logs). */
  private replaying = false;
  /** The genesis block — kept so a reorg can rebuild active state from height 0. */
  private readonly genesis: Block;
  /** Discovery address book: dialable peer URL → last time we heard of it. */
  private readonly addrBook = new Map<string, number>();
  /** Historical audit requests, signed votes, and non-punitive verdict evidence. */
  private readonly audits = new AuditLifecycle();
  private auditStore?: AuditStore;
  private readonly peerGuard: PeerGuard;

  constructor(config: NodeConfig, genesisBlock: Block) {
    super();
    this.config = config;
    this.genesis = genesisBlock;
    this.maxMempoolTxs    = config.maxMempoolTxs   ?? DEFAULT_MAX_MEMPOOL_TXS;
    this.minRelayFeeRate  = config.minRelayFeeRate ?? DEFAULT_MIN_RELAY_FEERATE;
    this.snapshotInterval = config.snapshotIntervalBlocks ?? BLOCKS_PER_EPOCH;
    this.peerGuard = new PeerGuard({
      maxInboundPerHost: config.maxInboundPerHost ?? DEFAULT_PEER_GUARD_POLICY.maxInboundPerHost,
      messagesPerWindow: config.peerMessagesPerWindow ?? DEFAULT_PEER_GUARD_POLICY.messagesPerWindow,
      messageWindowMs: config.peerMessageWindowMs ?? DEFAULT_PEER_GUARD_POLICY.messageWindowMs,
      banScore: config.peerBanScore ?? DEFAULT_PEER_GUARD_POLICY.banScore,
      banDurationMs: config.peerBanDurationMs ?? DEFAULT_PEER_GUARD_POLICY.banDurationMs,
    });

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

    // Durable storage: replay persisted blocks to rebuild full chain state,
    // seeding from a chainstate snapshot when one is available (skips re-applying
    // every transaction below the snapshot height).
    if (this.config.dataDir) {
      StorageManifest.ensure(this.config.dataDir, {
        chainId: this.config.chainId ?? `network-${this.config.networkMagic.toString(16)}`,
        genesisHash,
        consensusVersion: this.config.consensusVersion ?? genesisBlock.header.version,
        networkMagic: this.config.networkMagic,
        proofMode: this.config.proofMode ?? "unspecified",
      });
      this.store = new BlockStore(this.config.dataDir);
      this.snapshot = new SnapshotStore(this.config.dataDir);
      this.replayFromStore();
      this.auditStore = new AuditStore(this.config.dataDir);
      this.restoreAuditState();
    }
  }

  private restoreAuditState(): void {
    if (!this.auditStore) return;
    try {
      const state = this.auditStore.load();
      if (state) {
        const result = this.audits.restoreState(
          state,
          this.chain.tipHeight,
          (request) => this.auditRequestMatchesActiveChain(request),
        );
        if (result.dropped > 0) {
          console.warn(`[Node] Dropped ${result.dropped} invalid or stale audit record(s) during restart`);
        }
      }
      this.indexActiveChainAuditVerdicts();
      this.persistAuditState();
    } catch (error) {
      const quarantined = this.auditStore.quarantine();
      console.warn(
        `[Node] Audit evidence store was malformed and has been quarantined` +
        `${quarantined ? ` at ${quarantined}` : ""}: ${error instanceof Error ? error.message : String(error)}`
      );
      this.indexActiveChainAuditVerdicts();
      this.persistAuditState();
    }
  }

  private persistAuditState(): void {
    this.auditStore?.write(this.audits.snapshotState());
  }

  private indexActiveChainAuditVerdicts(): void {
    for (let height = 1; height <= this.chain.tipHeight; height++) {
      const block = this.activeBlockAt(this.chain, height);
      for (const verdict of block?.auditVerdicts ?? []) {
        const result = this.audits.indexCommittedVerdict(verdict);
        if (!result.accepted) {
          throw new Error(`Invalid committed audit ${verdict.auditId}: ${result.error}`);
        }
      }
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

    // Seed active state from a snapshot when it's consistent with the log (the
    // block at the snapshot height hashes to the snapshot's tip). Then only blocks
    // ABOVE the snapshot are re-applied; everything at/below is registered as
    // metadata so headers/blocks/heightIndex/chainWork stay complete for serving
    // and future fork choice.
    let snap: ChainSnapshot | null = null;
    try {
      snap = this.snapshot?.load() ?? null;
    } catch (error) {
      const quarantined = this.snapshot?.quarantine() ?? null;
      console.warn(
        `[Node] Chainstate snapshot was malformed and has been quarantined` +
        `${quarantined ? ` at ${quarantined}` : ""}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    let applyFromHeight = 1;
    if (snap) {
      const atHeight = blocks.find(b => b.header.height === snap.tipHeight);
      const consistent = atHeight !== undefined && hashBlockHeader(atHeight.header) === snap.tipHash;
      if (consistent) {
        this.loadSnapshotIntoChain(snap);
        applyFromHeight = snap.tipHeight + 1;
      } else {
        console.warn(`[Node] snapshot at height ${snap.tipHeight} inconsistent with block log — full replay`);
        this.snapshot!.clear();
      }
    }

    let applied = 0;
    for (const block of blocks) {
      const h = block.header.height;
      const blockHash = hashBlockHeader(block.header);
      const fail = (why: string): never => {
        this.replaying = false;
        throw new Error(`Persistence replay integrity failure at height ${h}: ${why} (corrupt or tampered store?)`);
      };
      // Always register block metadata (cheap) so the index covers the full chain.
      this.chain.headers.set(blockHash, block.header);
      this.chain.blocks.set(blockHash, block);
      this.chain.chainWork.set(blockHash, (this.chain.chainWork.get(block.header.prevHash) ?? 0n) + this.blockWork(block.header));
      this.chain.heightIndex.set(h, blockHash);
      if (!this.committedBodyIntegrityCheck(this.chain, block)) {
        fail("committed transaction, compute, or audit body mismatch");
      }
      if (h < applyFromHeight) continue;  // covered by the snapshot

      if (block.header.prevHash !== this.chain.tipHash) fail("does not extend current tip");
      if (!this.integrityCheck(this.chain, block)) fail("integrity check failed (root mismatch or non-boundary mint)");
      this.applyBlockState(this.chain, block, blockHash);
      applied++;
    }
    this.replaying = false;
    const from = applyFromHeight > 1 ? ` (from snapshot @${applyFromHeight - 1}, applied ${applied} tail block(s))` : "";
    console.log(`[Node] Replayed ${blocks.length} block(s) from ${this.config.dataDir} — tip height ${this.chain.tipHeight}${from}`);
  }

  /** Replace active chain state (tip, scalars, epoch accumulator, UTXO set) with a
   *  loaded snapshot. headers/blocks/heightIndex/chainWork are populated separately
   *  by the replay metadata pass. */
  private loadSnapshotIntoChain(snap: ChainSnapshot): void {
    this.chain.tipHash               = snap.tipHash;
    this.chain.tipHeight             = snap.tipHeight;
    this.chain.epochState            = snap.epochState;
    this.chain.currentDifficultyBits = snap.currentDifficultyBits;
    this.chain.recentBlockTimes      = [...snap.recentBlockTimes];
    this.chain.medianPastTime        = snap.medianPastTime;
    this.chain.epochFees             = snap.epochFees;
    const utxos = new UTXOSet();
    for (const u of snap.utxos) {
      utxos.add(u.txid, u.vout, { value: u.value, scriptPubKey: u.scriptPubKey, height: u.height, isCoinbase: u.isCoinbase });
    }
    this.chain.utxos = utxos;
  }

  /** Build a chainstate snapshot from the current active state. */
  private buildSnapshot(): ChainSnapshot {
    const utxos = [];
    for (const { txid: id, vout, entry } of this.chain.utxos.entries()) {
      utxos.push({ txid: id, vout, value: entry.value, scriptPubKey: entry.scriptPubKey, height: entry.height, isCoinbase: entry.isCoinbase });
    }
    return {
      tipHash: this.chain.tipHash, tipHeight: this.chain.tipHeight,
      currentDifficultyBits: this.chain.currentDifficultyBits,
      medianPastTime: this.chain.medianPastTime, epochFees: this.chain.epochFees,
      recentBlockTimes: [...this.chain.recentBlockTimes],
      epochState: this.chain.epochState, utxos,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Peer Management
  // BITCOIN ANALOG: CConnman::OpenNetworkConnection() + AddNode()
  // ─────────────────────────────────────────────────────────────────────────

  connectPeer(peer: PeerConnection): boolean {
    if (this.peers.size >= this.config.maxPeers) {
      console.warn(`[Node] Max peers (${this.config.maxPeers}) reached — rejecting ${peer.info.address}`);
      peer.disconnect();
      return false;
    }
    if (!this.peerGuard.admit(peer.info.address, peer.info.inbound)) {
      console.warn(`[Node] Peer guard rejected ${peer.info.address}`);
      peer.disconnect();
      return false;
    }

    this.peers.set(peer.info.peerId, peer);
    peer.info.networkIdentityVerified = !this.config.requireNetworkIdentity;
    this.emit("peer:connect", peer.info);

    // Send VERSION message — same handshake pattern as Bitcoin.
    void peer.send(this.buildVersionMessage());
    return true;
  }

  disconnectPeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    this.peers.delete(peerId);
    this.peerGuard.release(peer.info.address, peer.info.inbound);
    this.peerGuard.forgetPeer(peerId);
    peer.disconnect();
    this.emit("peer:disconnect", peerId);
  }

  /** Called by the transport when decoding fails before a PeerMessage exists. */
  reportPeerViolation(peerId: string, violation: PeerViolation): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (this.peerGuard.penalize(peer.info.address, violation)) this.disconnectPeer(peerId);
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
    if (!this.peerGuard.allowMessage(peerId, peer.info.address)) {
      this.disconnectPeer(peerId);
      return;
    }

    peer.info.lastSeen   = Math.floor(Date.now() / 1000);

    if (this.config.requireNetworkIdentity &&
        !peer.info.networkIdentityVerified && msg.type !== MT.VERSION) {
      console.warn(`[Node] Disconnecting ${peerId}: chain data received before network identity`);
      this.disconnectPeer(peerId);
      return;
    }

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

      case MT.AUDIT_REQUEST:
        await this.handleAuditRequest(peer, msg.payload as AuditRequest);
        break;

      case MT.AUDIT_VOTE:
        await this.handleAuditVote(peer, msg.payload as AuditVote);
        break;

      case MT.AUDIT_VERDICT:
        this.handleAuditVerdict(msg.payload as AuditVerdictRecord);
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

      case MT.GETADDR:
        await this.handleGetAddr(peer);
        break;

      case MT.ADDR:
        await this.handleAddr(peer, msg.payload as { addrs: string[] });
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

  private async handleVersion(
    peer: PeerConnection,
    payload: Partial<PeerInfo> & NetworkIdentityPayload & { listenUrl?: string },
  ): Promise<void> {
    const expected: Required<NetworkIdentityPayload> = {
      chainId: this.config.chainId ?? "jgc-development",
      genesisHash: hashBlockHeader(this.genesis.header),
      consensusVersion: this.config.consensusVersion ?? this.genesis.header.version,
      proofMode: this.config.proofMode ?? "unspecified",
    };
    const identityKeys = Object.keys(expected) as Array<keyof NetworkIdentityPayload>;
    const mismatches = identityKeys
      .filter(key => payload[key] !== undefined && payload[key] !== expected[key]);
    const missing = this.config.requireNetworkIdentity
      ? identityKeys.filter(key => payload[key] === undefined)
      : [];
    if (mismatches.length > 0 || missing.length > 0) {
      const reason = mismatches.length > 0
        ? `incompatible network identity (${mismatches.join(", ")})`
        : `missing network identity (${missing.join(", ")})`;
      console.warn(`[Node] Disconnecting ${peer.info.peerId}: ${reason}`);
      this.disconnectPeer(peer.info.peerId);
      this.emit("peer:incompatible", { peerId: peer.info.peerId, reason });
      return;
    }

    peer.info.version     = payload.version     ?? 0;
    peer.info.bestBlock   = payload.bestBlock   ?? "0".repeat(64);
    peer.info.startHeight = payload.startHeight ?? 0;
    peer.info.userAgent   = payload.userAgent   ?? "unknown";
    peer.info.networkIdentityVerified = true;

    // Discovery: record the peer's self-advertised dialable URL and ask it for the
    // addresses it knows, so the network can form without a central seed.
    if (payload.listenUrl) {
      peer.info.advertisedUrl = payload.listenUrl;
      this.addAddr(payload.listenUrl);
    }

    await peer.send(this.buildMessage(MT.VERACK, {}));
    await peer.send(this.buildMessage(MT.GETADDR, {}));

    // If peer is ahead of us, request headers (headers-first sync).
    if (peer.info.startHeight > this.chain.tipHeight) {
      await peer.send(this.buildMessage(MT.GETHEADERS, {
        fromHashes: [this.chain.tipHash],
      }));
    }
  }

  /** Reply to GETADDR with a sample of known peer addresses. */
  private async handleGetAddr(peer: PeerConnection): Promise<void> {
    const addrs = this.sampleAddresses(MAX_ADDR_PER_MESSAGE, peer.info.advertisedUrl);
    if (addrs.length > 0) await peer.send(this.buildMessage(MT.ADDR, { addrs }));
  }

  /** Learn advertised peer addresses and gossip genuinely-new ones onward. */
  private async handleAddr(peer: PeerConnection, payload: { addrs: string[] }): Promise<void> {
    const fresh: string[] = [];
    for (const url of (payload.addrs ?? []).slice(0, MAX_ADDR_PER_MESSAGE)) {
      if (this.addAddr(url)) fresh.push(url);
    }
    if (fresh.length === 0) return;
    this.emit("addr", fresh);
    // Relay new addresses to other peers; dedup at each hop (addAddr) stops loops.
    for (const [pid, p] of this.peers) {
      if (pid !== peer.info.peerId) void p.send(this.buildMessage(MT.ADDR, { addrs: fresh }));
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
    const checked = this.validatePendingContribution(contrib);
    if (!checked.ok) return;
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

  /** Accept an assignment only when both its compute claim and delayed beacon
   *  resolve to this node's current active chain. */
  private auditRequestMatchesActiveChain(request: AuditRequest): boolean {
    try {
      const assignment = request.assignment;
      const beaconHash = this.chain.heightIndex.get(assignment.beaconHeight);
      if (!beaconHash || beaconHash !== assignment.beaconHash.toLowerCase()) return false;

      const claimBlockHash = this.chain.heightIndex.get(assignment.claimHeight);
      if (!claimBlockHash) return false;
      const claimBlock = this.chain.blocks.get(claimBlockHash);
      if (!claimBlock) return false;

      const contributionIndex = claimBlock.computeProofs.findIndex((contribution) =>
        contribution.minerAddress === assignment.claimantId &&
        contribution.proof.taskCommitment === assignment.commitment
      );
      return contributionIndex >= 0 &&
        computeAuditClaimId(claimBlockHash, contributionIndex) === assignment.claimId;
    } catch {
      return false;
    }
  }

  private async handleAuditRequest(peer: PeerConnection, request: AuditRequest): Promise<void> {
    if (!this.auditRequestMatchesActiveChain(request)) return;
    const result = this.audits.registerRequest(request, this.chain.tipHeight);
    if (!result.accepted) return;
    this.persistAuditState();
    this.emit("auditRequest", request);
    this.relayAuditMessage(MT.AUDIT_REQUEST, request, peer.info.peerId);
  }

  private async handleAuditVote(peer: PeerConnection, vote: AuditVote): Promise<void> {
    const result = this.audits.submitVote(vote, this.chain.tipHeight);
    if (!result.accepted) return;
    this.persistAuditState();
    this.emit("auditVote", vote);
    this.relayAuditMessage(MT.AUDIT_VOTE, vote, peer.info.peerId);
  }

  /** Remote verdicts are advisory until locally reproduced from signed votes. */
  private handleAuditVerdict(remote: AuditVerdictRecord): void {
    const local = this.audits.finalize(remote.auditId, this.chain.tipHeight);
    if (!local) return;
    if (local.verdict !== remote.verdict ||
        local.topCommitment !== remote.topCommitment ||
        local.topCount !== remote.topCount ||
        local.requiredVotes !== remote.requiredVotes) return;
    this.persistAuditState();
    this.emit("auditVerdict", local);
  }

  private relayAuditMessage(type: MT, payload: unknown, excludePeerId?: string): void {
    for (const [peerId, peer] of this.peers) {
      if (peerId !== excludePeerId) void peer.send(this.buildMessage(type, payload));
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
    for (const verdict of block.auditVerdicts) {
      const indexed = this.audits.indexCommittedVerdict(verdict);
      if (!indexed.accepted) {
        throw new Error(`Accepted block contains an invalid audit verdict: ${indexed.error}`);
      }
    }

    // Persist to the durable log (which mirrors the linear active chain).
    if (this.store && !this.replaying) this.store.append(block);
    // Periodically snapshot chainstate so restart replays only the tail above it.
    if (this.snapshot && !this.replaying && this.snapshotInterval > 0 &&
        block.header.height % this.snapshotInterval === 0) {
      this.snapshot.write(this.buildSnapshot());
    }
    // Drop confirmed / now-conflicting transactions from the mempool.
    this.pruneMempool();
    // Clear proofs used in this block.
    this.pendingProofs = [];

    // Signed audit evidence becomes final after all assigned validators answer
    // or the height deadline expires. Verdicts remain non-punitive here.
    const auditVerdicts = this.audits.finalizeDue(block.header.height);
    for (const verdict of auditVerdicts) {
      this.emit("auditVerdict", verdict);
      this.relayAuditMessage(MT.AUDIT_VERDICT, verdict);
    }
    if (block.auditVerdicts.length > 0 || auditVerdicts.length > 0) this.persistAuditState();

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
      getActiveBlock:         (height) => this.activeBlockAt(chain, height),
      hasCommittedAudit:      (auditId) => this.chainHasAudit(chain, auditId),
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
    if (!this.committedBodyIntegrityCheck(chain, block)) return false;
    if (computeEpochRoot(chain.epochState) !== block.header.epochRoot) return false;
    if (h % BLOCKS_PER_EPOCH === BLOCKS_PER_EPOCH - 1) {
      const coinbase = block.transactions[0];
      if (!coinbase) return false;
      const coinbaseId = txid(coinbase);
      for (let vout = 0; vout < coinbase.outputs.length; vout++) {
        if (coinbase.outputs[vout]!.value > 0n && chain.utxos.has(coinbaseId, vout)) return false;
      }
    } else {
      const minted = block.transactions[0]?.outputs.reduce((s, o) => s + o.value, 0n) ?? 0n;
      if (minted > 0n) return false;
    }
    return true;
  }

  /**
   * Verify every body covered by a header commitment without applying mutable
   * chain state. This also runs for blocks below a loaded snapshot.
   */
  private committedBodyIntegrityCheck(chain: ChainState, block: Block): boolean {
    if (computeTransactionMerkleRoot(block.transactions) !== block.header.merkleRoot) return false;
    if (computeContributionsMerkleRoot(block.computeProofs) !== block.header.computeRoot) return false;
    if (computeAuditVerdictsMerkleRoot(block.auditVerdicts) !== block.header.auditRoot) return false;
    if (block.header.height % BLOCKS_PER_EPOCH === BLOCKS_PER_EPOCH - 1) {
      const coinbase = block.transactions[0];
      if (!coinbase || coinbase.inputs.length !== 0 || coinbase.locktime !== block.header.height) return false;
    }
    return validateAuditVerdicts(block, {
      getActiveBlock: (height) => this.activeBlockAt(chain, height),
      hasCommittedAudit: (auditId) =>
        this.chainHasAuditBefore(chain, auditId, block.header.height),
    }).valid;
  }

  private activeBlockAt(chain: ChainState, height: number): Block | undefined {
    const hash = chain.heightIndex.get(height);
    return hash ? chain.blocks.get(hash) : undefined;
  }

  private chainHasAudit(chain: ChainState, auditId: string): boolean {
    return this.chainHasAuditBefore(chain, auditId, chain.tipHeight + 1);
  }

  private chainHasAuditBefore(chain: ChainState, auditId: string, beforeHeight: number): boolean {
    for (let height = 1; height < beforeHeight; height++) {
      const block = this.activeBlockAt(chain, height);
      if (block?.auditVerdicts.some((record) => record.auditId === auditId)) return true;
    }
    return false;
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
    const auditReconciliation = this.audits.reconcile(
      scratch.tipHeight,
      (request) => this.auditRequestMatchesActiveChain(request),
    );
    this.indexActiveChainAuditVerdicts();
    for (const verdict of auditReconciliation.finalized) {
      this.emit("auditVerdict", verdict);
      this.relayAuditMessage(MT.AUDIT_VERDICT, verdict);
    }
    if (auditReconciliation.dropped > 0 ||
        auditReconciliation.finalized.length > 0 ||
        targetPath.some((hash) => (scratch.blocks.get(hash)?.auditVerdicts.length ?? 0) > 0)) {
      this.persistAuditState();
    }
    if (!this.replaying) {
      console.log(`[Node] REORG to ${targetHash.slice(0, 16)}… (fork@${forkHeight}, new tip height ${scratch.tipHeight}); ${disconnected.length} tx(s) returned to mempool`);
    }
    for (const tx of disconnected) this.submitTransaction(tx); // re-validates vs new state
    this.pruneMempool();                                       // drop ones now confirmed

    // Keep the durable log equal to the (now-reorged) linear active chain, so
    // replay stays simple and linear. The snapshot may name a now-abandoned tip,
    // so drop it; the next interval rewrites one for the new chain.
    if (this.store && !this.replaying) {
      this.rewriteStoreToActiveChain();
      this.snapshot?.clear();
    }
    return true;
  }

  /** Rewrite the durable block log to exactly the active chain (heights 1..tip),
   *  used after a reorg so the persisted log stays linear. */
  private rewriteStoreToActiveChain(): void {
    if (!this.store) return;
    const blocks: Block[] = [];
    for (let h = 1; h <= this.chain.tipHeight; h++) {
      const hash = this.chain.heightIndex.get(h);
      const blk = hash ? this.chain.blocks.get(hash) : undefined;
      if (blk) blocks.push(blk);
    }
    this.store.rewrite(blocks);
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
      listenUrl:   this.config.advertiseUrl,  // self-advertise for peer discovery
      chainId:     this.config.chainId ?? "jgc-development",
      genesisHash: hashBlockHeader(this.genesis.header),
      consensusVersion: this.config.consensusVersion ?? this.genesis.header.version,
      proofMode:   this.config.proofMode ?? "unspecified",
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Peer discovery (ADDR gossip)
  // BITCOIN ANALOG: addrman (CAddrMan) + GETADDR/ADDR
  // ─────────────────────────────────────────────────────────────────────────

  /** Record a dialable peer URL. Ignores our own advertised URL and malformed
   *  entries; evicts the oldest when the book is full. Returns true if newly added. */
  private addAddr(url: string): boolean {
    if (!url || url === this.config.advertiseUrl) return false;
    if (!/^wss?:\/\/[^\s]+$/.test(url)) return false;
    const known = this.addrBook.has(url);
    this.addrBook.set(url, Math.floor(Date.now() / 1000));
    if (!known && this.addrBook.size > MAX_ADDR_BOOK) {
      const oldest = [...this.addrBook.entries()].sort((a, b) => a[1] - b[1])[0];
      if (oldest && oldest[0] !== url) this.addrBook.delete(oldest[0]);
    }
    return !known;
  }

  /** Up to `n` known addresses (most-recent first), excluding `exclude`. */
  private sampleAddresses(n: number, exclude?: string): string[] {
    return [...this.addrBook.entries()]
      .filter(([url]) => url !== exclude)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([url]) => url);
  }

  /** All known peer addresses (for the connection manager / inspection). */
  getKnownAddresses(): string[] {
    return [...this.addrBook.keys()];
  }

  /** Known addresses we aren't already connected to (dial candidates), excluding
   *  this node's own advertised URL. */
  getDialCandidates(): string[] {
    const connected = new Set<string>();
    for (const p of this.peers.values()) {
      connected.add(p.info.address);
      if (p.info.advertisedUrl) connected.add(p.info.advertisedUrl);
    }
    return this.getKnownAddresses().filter(u => u !== this.config.advertiseUrl && !connected.has(u));
  }

  /** Current connected peer count and configured ceiling (for the dialer). */
  peerCount(): number { return this.peers.size; }
  get maxPeerLimit(): number { return this.config.maxPeers; }

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
    return this.calculateTransactionFees(block.transactions.slice(1), block.header.height, utxo);
  }

  /** Sum ordinary transaction fees in block order against a scratch UTXO view. */
  private calculateTransactionFees(
    transactions: Transaction[],
    height: number,
    utxo: UTXOSet = this.chain.utxos,
  ): bigint {
    const view = utxo.clone();
    let fees = 0n;
    for (const tx of transactions) {
      let inSum = 0n;
      let resolved = true;
      for (const input of tx.inputs) {
        const entry = view.get(input.prevOut.txid, input.prevOut.vout);
        if (!entry) { resolved = false; break; }  // invalid block; skip this tx's fee
        inSum += entry.value;
      }
      view.applyTransaction(tx, height, false);  // expose outputs to later txs
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

  /**
   * Accept and relay a locally-created testnet contribution for the next block.
   * The full aggregate is still verified when the producer assembles a block;
   * this fast path only rejects an invalid identity/proof or a duplicate miner.
   */
  async broadcastComputeProof(
    contribution: MinerComputeContribution,
  ): Promise<{ ok: boolean; error?: string }> {
    const checked = this.validatePendingContribution(contribution);
    if (!checked.ok) return checked;
    const pending = this.pendingProofs.find(
      (existing) => existing.minerAddress === contribution.minerAddress,
    );
    if (pending) {
      if (pending.proof.taskCommitment !== contribution.proof.taskCommitment) {
        return { ok: false, error: "contribution already pending for this miner" };
      }
      for (const [, peer] of this.peers) {
        void peer.send(this.buildMessage(MT.COMPUTE_PROOF, pending));
      }
      return { ok: true };
    }

    this.pendingProofs.push(contribution);
    this.emit("proof", contribution);
    for (const [, peer] of this.peers) {
      void peer.send(this.buildMessage(MT.COMPUTE_PROOF, contribution));
    }
    return { ok: true };
  }

  private validatePendingContribution(
    contribution: MinerComputeContribution,
  ): { ok: boolean; error?: string } {
    const nextHeight = this.chain.tipHeight + 1;
    if (!quantumVerifyContributionSignature(contribution, nextHeight)) {
      return { ok: false, error: "invalid contribution signature" };
    }
    const minimumWork = decodeDifficultyBits(this.chain.currentDifficultyBits) * 0.1;
    const proof = quantumVerifyProofForConsensus(
      contribution.proof,
      nextHeight,
      minimumWork,
    );
    return proof.valid
      ? { ok: true }
      : { ok: false, error: proof.error ?? "invalid contribution proof" };
  }

  getMempool(): Transaction[] {
    return Array.from(this.mempool.values(), e => e.tx);
  }

  /** Active-chain block lookup for explorer and diagnostics. */
  getBlockAtHeight(height: number): Block | null {
    const hash = this.chain.heightIndex.get(height);
    return hash ? this.chain.blocks.get(hash) ?? null : null;
  }

  /** Register and gossip a locally constructed, active-chain-bound assignment. */
  broadcastAuditRequest(request: AuditRequest): { ok: boolean; error?: string } {
    if (!this.auditRequestMatchesActiveChain(request)) {
      return { ok: false, error: "audit request is not bound to the active chain" };
    }
    const result = this.audits.registerRequest(request, this.chain.tipHeight);
    if (!result.accepted) return { ok: false, error: result.error };
    this.persistAuditState();
    this.emit("auditRequest", request);
    this.relayAuditMessage(MT.AUDIT_REQUEST, request);
    return { ok: true };
  }

  /** Validate and gossip a locally produced ML-DSA-signed committee vote. */
  broadcastAuditVote(vote: AuditVote): { ok: boolean; error?: string } {
    const result = this.audits.submitVote(vote, this.chain.tipHeight);
    if (!result.accepted) return { ok: false, error: result.error };
    this.persistAuditState();
    this.emit("auditVote", vote);
    this.relayAuditMessage(MT.AUDIT_VOTE, vote);
    return { ok: true };
  }

  getOpenAuditRequests(): AuditRequest[] {
    return this.audits.getOpenRequests();
  }

  getAuditVotes(auditId: string): AuditVote[] {
    return this.audits.getVotes(auditId);
  }

  getAuditVerdicts(): AuditVerdictRecord[] {
    return this.audits.getVerdicts();
  }

  /** Finalized evidence not yet committed by an active-chain block. */
  getPendingAuditVerdicts(): AuditVerdictRecord[] {
    return this.audits.getVerdicts()
      .filter((record) =>
        record.finalizedAtHeight < this.chain.tipHeight + 1 &&
        !this.chainHasAudit(this.chain, record.auditId)
      )
      .sort((a, b) => compareCanonicalBytes(a.auditId, b.auditId))
      .slice(0, 64);
  }

  /**
   * Build a candidate directly from live chainstate. Unlike the simulation
   * producer, this remains correct after restart, sync, reorg, and retarget.
   */
  buildBlockCandidate(timestamp: number = Math.floor(Date.now() / 1000)): Block {
    const tip = this.getTipHeader();
    const height = tip.height + 1;
    const contributions = this.getPendingProofs();
    const ordinaryTransactions = this.getMempool();
    const blockFees = this.calculateTransactionFees(ordinaryTransactions, height);
    const epochState: EpochState = {
      ...this.chain.epochState,
      minerContributions: new Map(this.chain.epochState.minerContributions),
    };

    let coinbase: Transaction;
    if (height % BLOCKS_PER_EPOCH === BLOCKS_PER_EPOCH - 1) {
      const settled: EpochState = {
        ...epochState,
        minerContributions: new Map(epochState.minerContributions),
      };
      applyBlockToEpoch(settled, contributions, height, blockFees);
      const settlement = computeEpochSettlement(settled, Math.floor(height / BLOCKS_PER_EPOCH));
      coinbase = createEpochSettlementTransaction(settlement, height);
    } else {
      coinbase = {
        version: 1,
        inputs: [{
          prevOut: { txid: height.toString(16).padStart(64, "0"), vout: 0 },
          scriptSig: Buffer.from(`JGC block ${height}`, "utf8").toString("hex"),
          sequence: 0xffffffff,
        }],
        outputs: [{ value: 0n, scriptPubKey: "6a" }],
        locktime: 0,
      };
    }

    return assembleBlock(
      tip,
      [coinbase, ...ordinaryTransactions],
      contributions,
      epochState,
      this.chain.currentDifficultyBits,
      0,
      Math.max(timestamp, this.chain.medianPastTime + 1),
      this.getPendingAuditVerdicts(),
    );
  }

  /** Fully validate, persist, announce, and relay a locally produced block. */
  async submitBlock(block: Block): Promise<{ ok: boolean; error?: string }> {
    const blockHash = hashBlockHeader(block.header);
    if (this.chain.blocks.has(blockHash)) return { ok: false, error: "block already known" };
    if (block.header.prevHash !== this.chain.tipHash) {
      return { ok: false, error: "block does not extend the active tip" };
    }
    const connected = await this.ingestBlock(
      block,
      blockHash,
      (chain, candidate) => this.validateAgainst(chain, candidate),
    );
    if (!connected) return { ok: false, error: "block failed consensus validation" };
    await this.relayBlock(block, "");
    this.emit("block", block);
    await this.drainOrphans(blockHash);
    return { ok: true };
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

  /** Consensus-owned validator roster at the current active-chain tip. */
  getValidatorStakeSnapshot() {
    return validatorStakeSnapshot(this.chain.utxos, this.chain.tipHeight);
  }

  /** Compact difficulty bits the next block header must carry. */
  getCurrentDifficultyBits(): number {
    return this.chain.currentDifficultyBits;
  }
}
