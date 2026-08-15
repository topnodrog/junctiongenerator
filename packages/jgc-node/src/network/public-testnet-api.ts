import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import { hashBlockHeader } from "../consensus/block.js";
import { COINBASE_MATURITY } from "../consensus/utxo.js";
import { decodeDifficultyBits } from "../consensus/emission.js";
import {
  TESTNET_FAUCET_ADDRESS,
  TESTNET_NETWORK,
  testnetFaucetKeyPair,
} from "../config/networks.js";
import { quantumScriptPubKeyFromAddress } from "../crypto/pq.js";
import { formatJGC, parseJGC, Wallet } from "../wallet/wallet.js";
import type { DesignatedBlockProducer } from "./designated-producer.js";
import type { JGCNode } from "./node.js";

export const PUBLIC_FAUCET_AMOUNT_JGC = "100";
export const PUBLIC_FAUCET_COOLDOWN_MS = 24 * 60 * 60 * 1_000;
const PUBLIC_FAUCET_FEE_JGC = "0.01";
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
  projectedJGC: string;
}

export interface ExplorerSnapshot {
  capturedAt: string;
  network: string;
  proofMode: string;
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
    pendingRewardPoolJGC: string;
    participants: ExplorerParticipant[];
  };
  faucet: {
    address: string;
    amountJGC: string;
    cooldownHours: number;
  };
  recentBlocks: ExplorerBlock[];
}

export interface AddressBalance {
  address: string;
  balanceJGC: string;
  pendingJGC: string;
  totalJGC: string;
  utxoCount: number;
  asOfHeight: number;
}

export interface FaucetClaim {
  address: string;
  amountJGC: string;
  txid: string;
  status: "pending";
  message: string;
}

interface FaucetLedgerEntry {
  address: string;
  txid: string;
  claimedAt: number;
}

interface FaucetLedger {
  version: 1;
  claims: FaucetLedgerEntry[];
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
    balanceJGC: formatJGC(spendable),
    pendingJGC: formatJGC(pending),
    totalJGC: formatJGC(spendable + pending),
    utxoCount,
    asOfHeight: height,
  };
}

export function addressBalance(node: JGCNode, address: string): AddressBalance {
  if (!/^1QGC[0-9a-f]{40}$/.test(address)) throw new Error("invalid JGC testnet address");
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
      projectedJGC: total === 0 ? "0" : formatJGC((pool * BigInt(weight)) / BigInt(total)),
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
      index: Math.floor(epoch.epochStartHeight / 144),
      blockIndex: epoch.epochBlockIndex,
      totalParticipationWeight: total,
      pendingRewardPoolJGC: formatJGC(pool),
      participants,
    },
    faucet: {
      address: TESTNET_FAUCET_ADDRESS,
      amountJGC: PUBLIC_FAUCET_AMOUNT_JGC,
      cooldownHours: PUBLIC_FAUCET_COOLDOWN_MS / 3_600_000,
    },
    recentBlocks,
  };
}

export class TestnetFaucet {
  private readonly wallet = Wallet.create();
  private readonly claims = new Map<string, FaucetLedgerEntry>();
  private claiming = false;

  constructor(
    private readonly node: JGCNode,
    private readonly ledgerPath: string,
  ) {
    const key = testnetFaucetKeyPair();
    this.wallet.importKey("testnet-faucet", key.privateKey, key.publicKey);
    this.load();
  }

  private load(): void {
    if (!existsSync(this.ledgerPath)) return;
    const ledger = JSON.parse(readFileSync(this.ledgerPath, "utf8")) as FaucetLedger;
    if (ledger.version !== 1 || !Array.isArray(ledger.claims)) {
      throw new Error("unsupported faucet ledger format");
    }
    for (const claim of ledger.claims) this.claims.set(claim.address, claim);
  }

  private persist(): void {
    mkdirSync(dirname(this.ledgerPath), { recursive: true });
    const temp = `${this.ledgerPath}.tmp`;
    const ledger: FaucetLedger = { version: 1, claims: [...this.claims.values()] };
    writeFileSync(temp, `${JSON.stringify(ledger, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temp, this.ledgerPath);
  }

  async claim(address: string): Promise<FaucetClaim> {
    if (!/^1QGC[0-9a-f]{40}$/.test(address)) throw new Error("invalid JGC testnet address");
    if (this.claiming) throw new Error("faucet is processing another request; retry shortly");
    const previous = this.claims.get(address);
    if (previous && Date.now() - previous.claimedAt < PUBLIC_FAUCET_COOLDOWN_MS) {
      throw new Error("this address has already used the faucet in the last 24 hours");
    }

    const faucetScript = quantumScriptPubKeyFromAddress(TESTNET_FAUCET_ADDRESS);
    const hasPendingFaucetSpend = this.node.getMempool().some((transaction) =>
      transaction.inputs.some((input) =>
        this.node.getUTXOSet().get(input.prevOut.txid, input.prevOut.vout)?.scriptPubKey === faucetScript));
    if (hasPendingFaucetSpend) {
      throw new Error("a faucet transfer is waiting for the next block; retry after it confirms");
    }

    this.claiming = true;
    try {
      const built = this.wallet.buildSpend({
        fromLabel: "testnet-faucet",
        toAddress: address,
        amount: parseJGC(PUBLIC_FAUCET_AMOUNT_JGC),
        fee: parseJGC(PUBLIC_FAUCET_FEE_JGC),
        utxo: this.node.getUTXOSet(),
        currentHeight: this.node.getChainInfo().tipHeight,
      });
      const accepted = await this.node.broadcastTransaction(built.tx);
      if (!accepted.ok) throw new Error(accepted.error ?? "faucet transaction rejected");
      this.claims.set(address, { address, txid: built.txid, claimedAt: Date.now() });
      this.persist();
      return {
        address,
        amountJGC: PUBLIC_FAUCET_AMOUNT_JGC,
        txid: built.txid,
        status: "pending",
        message: "Valueless test JGC queued. It becomes visible after the next block.",
      };
    } finally {
      this.claiming = false;
    }
  }
}
