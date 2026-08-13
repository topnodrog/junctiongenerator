import { createHash } from "crypto";
import type { BlockHeader, Transaction } from "../types/index.js";
import {
  computeTransactionMerkleRoot,
  CONSENSUS_BLOCK_VERSION,
  GENESIS_DIFFICULTY_BITS,
  hashBlockHeader,
} from "../consensus/block.js";
import {
  BASE_UNITS_PER_JGC,
  BLOCKS_PER_EPOCH,
  getBlockReward,
  TARGET_BLOCK_INTERVAL_SECONDS,
} from "../consensus/emission.js";
import { COINBASE_MATURITY, UTXOSet, txid, validateSpend } from "../consensus/utxo.js";
import { pqScriptPubKeyFromAddress } from "../crypto/pq-signatures.js";
import { makePQMiner } from "./harness.js";
import { Wallet } from "../wallet/wallet.js";

export const TEN_DAY_WALLET_COUNT = 10;
export const TEN_DAY_EARNING_DAYS = 10;
export const DAILY_DISTRIBUTION_HOUR_UTC = 4;
export const DAILY_DISTRIBUTION_TIMEZONE = "UTC" as const;
export const TEN_DAY_START_UTC = Date.UTC(2026, 7, 1, 0, 0, 0) / 1000;
export const DAILY_REWARD = getBlockReward(1) * BigInt(BLOCKS_PER_EPOCH);
export const PER_WALLET_DAILY_REWARD = DAILY_REWARD / BigInt(TEN_DAY_WALLET_COUNT);
export const PERIODIC_TRANSFER_AMOUNT = BASE_UNITS_PER_JGC;
export const DISTRIBUTION_DELAY_BLOCKS =
  DAILY_DISTRIBUTION_HOUR_UTC * 60 * 60 / TARGET_BLOCK_INTERVAL_SECONDS;

const ZERO_HASH = "0".repeat(64);
const DAY_SECONDS = 24 * 60 * 60;
const FIRST_RING_TRANSFER_HEIGHT = 8 * 60 * 60 / TARGET_BLOCK_INTERVAL_SECONDS;
const RING_TRANSFER_HEIGHTS = new Set(
  [8, 12, 16, 20].map(hour => hour * 60 * 60 / TARGET_BLOCK_INTERVAL_SECONDS),
);

export interface ScenarioWallet {
  label: string;
  address: string;
}

export interface DailyDistributionRecord {
  earningDay: string;
  earningHeightStart: number;
  earningHeightEnd: number;
  settlementDelayBlocks: number;
  windowStart: string;
  windowEnd: string;
  distributedAt: string;
  blockHeight: number;
  transactionId: string;
  total: bigint;
  perWallet: bigint;
}

export interface ScenarioTransferRecord {
  kind: "periodic" | "consolidation";
  timestamp: string;
  blockHeight: number;
  from: string;
  to: string;
  amount: bigint;
  transactionId: string;
}

export interface DailyScenarioBlock {
  hash: string;
  header: BlockHeader;
  transactions: Transaction[];
  stateRoot: string;
  distributionDay?: string;
}

export interface TenDayLedgerResult {
  mode: "daily-distribution-prototype-v1";
  warning: string;
  timezone: typeof DAILY_DISTRIBUTION_TIMEZONE;
  blocks: DailyScenarioBlock[];
  wallets: ScenarioWallet[];
  distributions: DailyDistributionRecord[];
  transfers: ScenarioTransferRecord[];
  finalBalances: Record<string, bigint>;
  totalMinted: bigint;
  finalTimestamp: string;
}

function iso(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

function dayLabel(timestamp: number): string {
  return iso(timestamp).slice(0, 10);
}

function markerTransaction(height: number): Transaction {
  return {
    version: 1,
    inputs: [{
      prevOut: { txid: height.toString(16).padStart(64, "0"), vout: 0 },
      scriptSig: Buffer.from(`JGC daily prototype block ${height}`, "utf8").toString("hex"),
      sequence: 0xffffffff,
    }],
    outputs: [{ value: 0n, scriptPubKey: "6a" }],
    locktime: 0,
    brokerTaskRef: `daily-prototype:block:${height}`,
  };
}

function distributionTransaction(wallets: ScenarioWallet[], earningDay: string): Transaction {
  if (DAILY_REWARD % BigInt(wallets.length) !== 0n) {
    throw new Error("daily reward cannot be divided equally across the scenario wallets");
  }
  return {
    version: 1,
    inputs: [],
    outputs: wallets.map(wallet => ({
      value: PER_WALLET_DAILY_REWARD,
      scriptPubKey: pqScriptPubKeyFromAddress(wallet.address),
    })),
    locktime: 0,
    // Makes each otherwise-identical daily issuance transaction uniquely hashed.
    brokerTaskRef: `jgc-daily-distribution:${earningDay}`,
  };
}

function stateRoot(utxos: UTXOSet, settledDays: string[]): string {
  const entries = [...utxos.entries()]
    .map(({ txid: id, vout, entry }) =>
      `${id}:${vout}:${entry.value}:${entry.scriptPubKey}:${entry.height}:${entry.isCoinbase ? 1 : 0}`)
    .sort();
  const canonical = ["JGC/DAILY-DISTRIBUTION-STATE/V1", ...settledDays, ...entries].join("\n");
  const first = createHash("sha256").update(canonical).digest();
  return createHash("sha256").update(first).digest("hex");
}

function makeHeader(
  height: number,
  timestamp: number,
  prevHash: string,
  transactions: Transaction[],
  root: string,
): BlockHeader {
  return {
    version: CONSENSUS_BLOCK_VERSION,
    prevHash,
    merkleRoot: computeTransactionMerkleRoot(transactions),
    computeRoot: ZERO_HASH,
    epochRoot: root,
    auditRoot: ZERO_HASH,
    timestamp,
    difficultyBits: GENESIS_DIFFICULTY_BITS,
    nonce: 0,
    height,
  };
}

function deterministicWallets(): { wallet: Wallet; records: ScenarioWallet[] } {
  const wallet = Wallet.create();
  const records: ScenarioWallet[] = [];
  for (let index = 0; index < TEN_DAY_WALLET_COUNT; index++) {
    const label = `wallet-${String(index + 1).padStart(2, "0")}`;
    const seedByte = (index + 1).toString(16).padStart(2, "0");
    const miner = makePQMiner(seedByte.repeat(32), 100);
    const address = wallet.importKey(label, miner.secretKey, miner.pubKey);
    records.push({ label, address });
  }
  return { wallet, records };
}

function validateAndApply(
  transactions: Transaction[],
  utxos: UTXOSet,
  height: number,
): UTXOSet {
  const next = utxos.clone();
  transactions.forEach((transaction, index) => {
    if (index > 0) {
      const result = validateSpend(transaction, next, height);
      if (!result.ok) {
        throw new Error(`block ${height} transaction ${index} failed UTXO validation: ${result.error}`);
      }
    }
    next.applyTransaction(transaction, height, index === 0);
  });
  return next;
}

function totalValue(utxos: UTXOSet): bigint {
  let total = 0n;
  for (const { entry } of utxos.entries()) total += entry.value;
  return total;
}

/**
 * Build an executable prototype of the requested distribution policy.
 *
 * This deliberately does not mutate the live `jgc-testnet-v3` rules. The
 * current public testnet settles height-based epochs immediately at slot 143;
 * this prototype tests a height-derived policy: each 144-block earning window
 * is paid after a fixed 24-block delay. UTC timestamps are display/audit labels
 * only and never control whether distribution occurs.
 */
export function buildTenDayLedger(startTimestamp = TEN_DAY_START_UTC): TenDayLedgerResult {
  if (startTimestamp % DAY_SECONDS !== 0) {
    throw new Error("scenario display anchor must be 00:00:00 UTC");
  }

  const { wallet, records: wallets } = deterministicWallets();
  const distributions: DailyDistributionRecord[] = [];
  const transfers: ScenarioTransferRecord[] = [];
  const blocks: DailyScenarioBlock[] = [];
  const settledDays: string[] = [];
  let utxos = new UTXOSet();
  let prevHash = ZERO_HASH;
  let periodicCycle = 0;

  const finalDistributionHeight =
    TEN_DAY_EARNING_DAYS * BLOCKS_PER_EPOCH + DISTRIBUTION_DELAY_BLOCKS;
  const finalHeight = finalDistributionHeight + COINBASE_MATURITY;
  const finalTimestamp = startTimestamp + finalHeight * TARGET_BLOCK_INTERVAL_SECONDS;

  for (let height = 0; height <= finalHeight; height++) {
    const timestamp = startTimestamp + height * TARGET_BLOCK_INTERVAL_SECONDS;
    const transactions: Transaction[] = [];
    let distributionDay: string | undefined;

    const isDistributionSlot = height >= BLOCKS_PER_EPOCH + DISTRIBUTION_DELAY_BLOCKS &&
      (height - DISTRIBUTION_DELAY_BLOCKS) % BLOCKS_PER_EPOCH === 0;
    const distributionIndex = isDistributionSlot
      ? Math.floor((height - DISTRIBUTION_DELAY_BLOCKS) / BLOCKS_PER_EPOCH) - 1
      : -1;

    if (distributionIndex >= 0 && distributionIndex < TEN_DAY_EARNING_DAYS) {
      const earningHeightStart = distributionIndex * BLOCKS_PER_EPOCH;
      const earningHeightEnd = earningHeightStart + BLOCKS_PER_EPOCH - 1;
      const windowStart = startTimestamp + earningHeightStart * TARGET_BLOCK_INTERVAL_SECONDS;
      distributionDay = dayLabel(windowStart);
      const distribution = distributionTransaction(wallets, distributionDay);
      transactions.push(distribution);
      settledDays.push(distributionDay);
      distributions.push({
        earningDay: distributionDay,
        earningHeightStart,
        earningHeightEnd,
        settlementDelayBlocks: DISTRIBUTION_DELAY_BLOCKS,
        windowStart: iso(windowStart),
        windowEnd: iso(windowStart + DAY_SECONDS - 1),
        distributedAt: iso(timestamp),
        blockHeight: height,
        transactionId: txid(distribution),
        total: DAILY_REWARD,
        perWallet: PER_WALLET_DAILY_REWARD,
      });
    } else {
      transactions.push(markerTransaction(height));
    }

    const heightWithinWindow = height % BLOCKS_PER_EPOCH;
    const isPeriodicSlot = RING_TRANSFER_HEIGHTS.has(heightWithinWindow) &&
      height >= 2 * BLOCKS_PER_EPOCH + FIRST_RING_TRANSFER_HEIGHT &&
      height < finalHeight;

    if (isPeriodicSlot) {
      const direction = periodicCycle % 2 === 0 ? 1 : -1;
      for (let index = 0; index < wallets.length; index++) {
        const from = wallets[index]!;
        const to = wallets[(index + direction + wallets.length) % wallets.length]!;
        const spend = wallet.buildSpend({
          fromLabel: from.label,
          toAddress: to.address,
          amount: PERIODIC_TRANSFER_AMOUNT,
          fee: 0n,
          utxo: utxos,
          currentHeight: height,
        });
        transactions.push(spend.tx);
        transfers.push({
          kind: "periodic",
          timestamp: iso(timestamp),
          blockHeight: height,
          from: from.label,
          to: to.label,
          amount: PERIODIC_TRANSFER_AMOUNT,
          transactionId: spend.txid,
        });
      }
      periodicCycle++;
    }

    if (height === finalHeight) {
      for (let index = 2; index < wallets.length; index++) {
        const from = wallets[index]!;
        const to = wallets[index < 6 ? 0 : 1]!;
        const amount = wallet.balance(from.label, utxos, height);
        const spend = wallet.buildSpend({
          fromLabel: from.label,
          toAddress: to.address,
          amount,
          fee: 0n,
          utxo: utxos,
          currentHeight: height,
        });
        transactions.push(spend.tx);
        transfers.push({
          kind: "consolidation",
          timestamp: iso(timestamp),
          blockHeight: height,
          from: from.label,
          to: to.label,
          amount,
          transactionId: spend.txid,
        });
      }
    }

    utxos = validateAndApply(transactions, utxos, height);
    const root = stateRoot(utxos, settledDays);
    const header = makeHeader(height, timestamp, prevHash, transactions, root);
    const hash = hashBlockHeader(header);
    blocks.push({ hash, header, transactions, stateRoot: root, distributionDay });
    prevHash = hash;
  }

  const balanceScanHeight = blocks.at(-1)!.header.height + 1;
  const finalBalances = Object.fromEntries(
    wallets.map(record => [record.label, wallet.balance(record.label, utxos, balanceScanHeight)]),
  );
  const totalMinted = totalValue(utxos);

  if (distributions.length !== TEN_DAY_EARNING_DAYS) {
    throw new Error(`expected ${TEN_DAY_EARNING_DAYS} distributions, got ${distributions.length}`);
  }
  if (totalMinted !== DAILY_REWARD * BigInt(TEN_DAY_EARNING_DAYS)) {
    throw new Error("scenario supply is not conserved");
  }
  const expectedFinal = totalMinted / 2n;
  if (finalBalances[wallets[0]!.label] !== expectedFinal || finalBalances[wallets[1]!.label] !== expectedFinal) {
    throw new Error("final two-wallet split is not equal");
  }
  if (wallets.slice(2).some(record => finalBalances[record.label] !== 0n)) {
    throw new Error("a non-final wallet retains JGC");
  }

  return {
    mode: "daily-distribution-prototype-v1",
    warning: "Valueless repeatable protocol prototype; not deployed to jgc-testnet-v3 and not valid under its current immediate epoch-boundary settlement rule.",
    timezone: DAILY_DISTRIBUTION_TIMEZONE,
    blocks,
    wallets,
    distributions,
    transfers,
    finalBalances,
    totalMinted,
    finalTimestamp: iso(finalTimestamp),
  };
}
