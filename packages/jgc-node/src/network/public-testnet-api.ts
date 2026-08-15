import { hashBlockHeader } from "../consensus/block.js";
import { COINBASE_MATURITY } from "../consensus/utxo.js";
import { BLOCKS_PER_EPOCH, decodeDifficultyBits } from "../consensus/emission.js";
import { TESTNET_NETWORK } from "../config/networks.js";
import { quantumScriptPubKeyFromAddress } from "../crypto/pq.js";
import { formatJGC } from "../wallet/wallet.js";
import type { DesignatedBlockProducer } from "./designated-producer.js";
import type { JGCNode } from "./node.js";

const MAX_RECENT_BLOCKS = 12;

export interface ExplorerBlock {
  height: number;
  hash: string;
  previousHash: string;
  timestamp: number;
  transactionCount: number;
  contributionCount: number;
  totalParticipationWeight: number;
  participants: string[];
  computeRoot: string;
  epochRoot: string;
}

export interface ExplorerParticipant {
  address: string;
  participationWeight: number;
  sharePercent: number;
  projectedJGTC: string;
}

export interface ExplorerSnapshot {
  capturedAt: string;
  network: string;
  proofMode: string;
  currencySymbol: "JGTC";
  targetBlockIntervalSec: number;
  genesisHash: string;
  height: number;
  tipHash: string;
  peerCount: number;
  mempoolSize: number;
  pendingContributions: number;
  targetParticipationWeight: number;
  health: "healthy" | "waiting" | "degraded";
  producer: ReturnType<DesignatedBlockProducer["getStatus"]>;
  epoch: {
    index: number;
    blockIndex: number;
    totalParticipationWeight: number;
    pendingRewardPoolJGTC: string;
    blocksRemaining: number;
    nextSettlementHeight: number;
    participants: ExplorerParticipant[];
  };
  issuance: {
    preminedJGTC: "0";
    genesisSpendableSupplyJGTC: "0";
    settlementIntervalBlocks: number;
  };
  recentBlocks: ExplorerBlock[];
}

export interface AddressBalance {
  address: string;
  currencySymbol: "JGTC";
  balanceJGTC: string;
  pendingJGTC: string;
  totalJGTC: string;
  utxoCount: number;
  asOfHeight: number;
}

function moneyForAddress(node: JGCNode, address: string): AddressBalance {
  const script = quantumScriptPubKeyFromAddress(address);
  const height = node.getChainInfo().tipHeight;
  let spendable = 0n;
  let pending = 0n;
  let utxoCount = 0;
  for (const { entry } of node.getUTXOSet().entries()) {
    if (entry.scriptPubKey !== script) continue;
    utxoCount++;
    if (entry.isCoinbase && height - entry.height < COINBASE_MATURITY) pending += entry.value;
    else spendable += entry.value;
  }
  return {
    address,
    currencySymbol: "JGTC",
    balanceJGTC: formatJGC(spendable),
    pendingJGTC: formatJGC(pending),
    totalJGTC: formatJGC(spendable + pending),
    utxoCount,
    asOfHeight: height,
  };
}

export function addressBalance(node: JGCNode, address: string): AddressBalance {
  if (!/^1QGC[0-9a-f]{40}$/.test(address)) throw new Error("invalid JGTC testnet address");
  return moneyForAddress(node, address);
}

export function explorerSnapshot(
  node: JGCNode,
  producer: DesignatedBlockProducer,
): ExplorerSnapshot {
  const chain = node.getChainInfo();
  const producerStatus = producer.getStatus();
  const epoch = node.getEpochState();
  const total = epoch.totalEpochTFLOPS;
  const pool = epoch.pendingRewardPool;
  const participants = [...epoch.minerContributions.entries()]
    .map(([address, weight]) => ({
      address,
      participationWeight: weight,
      sharePercent: total === 0 ? 0 : (weight / total) * 100,
      projectedJGTC: total === 0 ? "0" : formatJGC((pool * BigInt(weight)) / BigInt(total)),
    }))
    .sort((a, b) => b.participationWeight - a.participationWeight || a.address.localeCompare(b.address));

  const recentBlocks: ExplorerBlock[] = [];
  const firstHeight = Math.max(0, chain.tipHeight - MAX_RECENT_BLOCKS + 1);
  for (let height = chain.tipHeight; height >= firstHeight; height--) {
    const block = node.getBlockAtHeight(height);
    if (!block) continue;
    recentBlocks.push({
      height,
      hash: hashBlockHeader(block.header),
      previousHash: block.header.prevHash,
      timestamp: block.header.timestamp,
      transactionCount: block.transactions.length,
      contributionCount: block.computeProofs.length,
      totalParticipationWeight: block.computeProofs.reduce(
        (sum, contribution) => sum + contribution.proof.tflopsWeight,
        0,
      ),
      participants: block.computeProofs.map((contribution) => contribution.minerAddress),
      computeRoot: block.header.computeRoot,
      epochRoot: block.header.epochRoot,
    });
  }

  const health = producerStatus.lastError
    ? "degraded"
    : chain.tipHeight === 0 || !producerStatus.running
      ? "waiting"
      : "healthy";

  return {
    capturedAt: new Date().toISOString(),
    network: TESTNET_NETWORK.chainId,
    proofMode: TESTNET_NETWORK.proofMode,
    currencySymbol: "JGTC",
    targetBlockIntervalSec: TESTNET_NETWORK.targetBlockIntervalSec,
    genesisHash: hashBlockHeader(node.getBlockAtHeight(0)!.header),
    height: chain.tipHeight,
    tipHash: chain.tipHash,
    peerCount: chain.peerCount,
    mempoolSize: chain.mempoolSize,
    pendingContributions: chain.pendingProofs,
    targetParticipationWeight: Math.ceil(decodeDifficultyBits(node.getCurrentDifficultyBits())),
    health,
    producer: producerStatus,
    epoch: {
      index: Math.floor(epoch.epochStartHeight / BLOCKS_PER_EPOCH),
      blockIndex: epoch.epochBlockIndex,
      totalParticipationWeight: total,
      pendingRewardPoolJGTC: formatJGC(pool),
      blocksRemaining: BLOCKS_PER_EPOCH - epoch.epochBlockIndex,
      nextSettlementHeight: chain.tipHeight + (BLOCKS_PER_EPOCH - epoch.epochBlockIndex),
      participants,
    },
    issuance: {
      preminedJGTC: "0",
      genesisSpendableSupplyJGTC: "0",
      settlementIntervalBlocks: BLOCKS_PER_EPOCH,
    },
    recentBlocks,
  };
}
