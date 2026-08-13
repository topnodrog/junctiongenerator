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
export const DAILY_DISTRIBUTION_HOUR_LOCAL = 4;
export const DAILY_DISTRIBUTION_TIMEZONE = "America/Toronto" as const;
// 2026-08-01 00:00:00 in Toronto is 04:00:00 UTC (EDT, UTC-04:00).
export const TEN_DAY_START_UTC = Date.UTC(2026, 7, 1, 4, 0, 0) / 1000;
export const DAILY_REWARD = getBlockReward(1) * BigInt(BLOCKS_PER_EPOCH);
export const PER_WALLET_DAILY_REWARD = DAILY_REWARD / BigInt(TEN_DAY_WALLET_COUNT);
export const PERIODIC_TRANSFER_AMOUNT = BASE_UNITS_PER_JGC;

const ZERO_HASH = "0".repeat(64);
const DAY_SECONDS = 24 * 60 * 60;
const DISTRIBUTION_DELAY_SECONDS = DAILY_DISTRIBUTION_HOUR_LOCAL * 60 * 60;
const TORONTO_UTC_OFFSET_SECONDS = -4 * 60 * 60;
const RING_TRANSFER_HOURS_LOCAL = new Set([8, 12, 16, 20]);

export interface ScenarioWallet {
  label: string;
  address: string;
}

export interface DailyDistributionRecord {
  earningDay: string;
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

function torontoIso(timestamp: number): string {
  return `${new Date((timestamp + TORONTO_UTC_OFFSET_SECONDS) * 1000).toISOString().slice(0, -1)}-04:00`;
}

function dayLabel(timestamp: number): string {
  return torontoIso(timestamp).slice(0, 10);
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
 * this prototype tests a proposed UTC-calendar policy that pays at 04:00 for
 * the preceding 00:00:00-23:59:59 earning day.
 */
export function buildTenDayLedger(startTimestamp = TEN_DAY_START_UTC): TenDayLedgerResult {
  if ((startTimestamp + TORONTO_UTC_OFFSET_SECONDS) % DAY_SECONDS !== 0) {
    throw new Error("scenario start must be 00:00:00 America/Toronto");
  }

  const { wallet, records: wallets } = deterministicWallets();
  const distributions: DailyDistributionRecord[] = [];
  const transfers: ScenarioTransferRecord[] = [];
  const blocks: DailyScenarioBlock[] = [];
  const settledDays: string[] = [];
  let utxos = new UTXOSet();
  let prevHash = ZERO_HASH;
  let periodicCycle = 0;

  const finalDistributionAt = startTimestamp + TEN_DAY_EARNING_DAYS * DAY_SECONDS + DISTRIBUTION_DELAY_SECONDS;
  const finalTimestamp = finalDistributionAt + COINBASE_MATURITY * TARGET_BLOCK_INTERVAL_SECONDS;

  for (
    let timestamp = startTimestamp, height = 0;
    timestamp <= finalTimestamp;
    timestamp += TARGET_BLOCK_INTERVAL_SECONDS, height++
  ) {
    const transactions: Transaction[] = [];
    let distributionDay: string | undefined;

    const elapsed = timestamp - startTimestamp;
    const isDistributionSlot = elapsed >= DAY_SECONDS + DISTRIBUTION_DELAY_SECONDS &&
      (elapsed - DISTRIBUTION_DELAY_SECONDS) % DAY_SECONDS === 0;
    const distributionIndex = isDistributionSlot
      ? Math.floor((elapsed - DISTRIBUTION_DELAY_SECONDS) / DAY_SECONDS) - 1
      : -1;

    if (distributionIndex >= 0 && distributionIndex < TEN_DAY_EARNING_DAYS) {
      const windowStart = startTimestamp + distributionIndex * DAY_SECONDS;
      distributionDay = dayLabel(windowStart);
      const distribution = distributionTransaction(wallets, distributionDay);
      transactions.push(distribution);
      settledDays.push(distributionDay);
      distributions.push({
        earningDay: distributionDay,
        windowStart: torontoIso(windowStart),
        windowEnd: torontoIso(windowStart + DAY_SECONDS - 1),
        distributedAt: torontoIso(timestamp),
        blockHeight: height,
        transactionId: txid(distribution),
        total: DAILY_REWARD,
        perWallet: PER_WALLET_DAILY_REWARD,
      });
    } else {
      transactions.push(markerTransaction(height));
    }

    const localDate = new Date((timestamp + TORONTO_UTC_OFFSET_SECONDS) * 1000);
    const isPeriodicSlot = localDate.getUTCMinutes() === 0 &&
      RING_TRANSFER_HOURS_LOCAL.has(localDate.getUTCHours()) &&
      timestamp >= startTimestamp + 2 * DAY_SECONDS + 8 * 60 * 60 &&
      timestamp < finalTimestamp;

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

    if (timestamp === finalTimestamp) {
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

  const finalHeight = blocks.at(-1)!.header.height + 1;
  const finalBalances = Object.fromEntries(
    wallets.map(record => [record.label, wallet.balance(record.label, utxos, finalHeight)]),
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
    warning: "Valueless repeatable protocol prototype; not deployed to jgc-testnet-v3 and not valid under its current height-based settlement rule.",
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
