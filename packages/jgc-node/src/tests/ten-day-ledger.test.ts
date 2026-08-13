import { computeTransactionMerkleRoot, hashBlockHeader } from "../consensus/block.js";
import { BASE_UNITS_PER_JGC, TARGET_BLOCK_INTERVAL_SECONDS } from "../consensus/emission.js";
import {
  DAILY_REWARD,
  DISTRIBUTION_DELAY_BLOCKS,
  PER_WALLET_DAILY_REWARD,
  TEN_DAY_EARNING_DAYS,
  TEN_DAY_WALLET_COUNT,
  buildTenDayLedger,
} from "../sim/ten-day-ledger.js";

describe("ten-day daily-distribution ledger prototype", () => {
  const result = buildTenDayLedger();

  test("builds a linked 10-minute block chain with committed transaction roots", () => {
    expect(result.blocks.length).toBeGreaterThan(TEN_DAY_EARNING_DAYS * 144);
    for (let index = 0; index < result.blocks.length; index++) {
      const block = result.blocks[index]!;
      expect(block.header.height).toBe(index);
      expect(block.hash).toBe(hashBlockHeader(block.header));
      expect(block.header.merkleRoot).toBe(computeTransactionMerkleRoot(block.transactions));
      if (index === 0) {
        expect(block.header.prevHash).toBe("0".repeat(64));
      } else {
        expect(block.header.prevHash).toBe(result.blocks[index - 1]!.hash);
        expect(block.header.timestamp - result.blocks[index - 1]!.header.timestamp)
          .toBe(TARGET_BLOCK_INTERVAL_SECONDS);
      }
    }
  });

  test("distributes each 144-block earning window after a 24-block delay", () => {
    expect(result.wallets).toHaveLength(TEN_DAY_WALLET_COUNT);
    expect(result.distributions).toHaveLength(TEN_DAY_EARNING_DAYS);
    for (const distribution of result.distributions) {
      expect(distribution.earningHeightEnd - distribution.earningHeightStart + 1).toBe(144);
      expect(distribution.settlementDelayBlocks).toBe(DISTRIBUTION_DELAY_BLOCKS);
      expect(distribution.blockHeight).toBe(
        distribution.earningHeightEnd + 1 + DISTRIBUTION_DELAY_BLOCKS,
      );
      expect(distribution.distributedAt.endsWith("T04:00:00.000Z")).toBe(true);
      expect(distribution.windowStart.endsWith("T00:00:00.000Z")).toBe(true);
      expect(distribution.windowEnd.endsWith("T23:59:59.000Z")).toBe(true);
      expect(distribution.total).toBe(DAILY_REWARD);
      expect(distribution.perWallet).toBe(PER_WALLET_DAILY_REWARD);
    }
  });

  test("has every wallet send periodically in both directions", () => {
    const periodic = result.transfers.filter(item => item.kind === "periodic");
    for (const wallet of result.wallets) {
      const sent = periodic.filter(item => item.from === wallet.label);
      expect(sent.length).toBeGreaterThan(1);
      expect(new Set(sent.map(item => item.to)).size).toBe(2);
    }
  });

  test("conserves 72,000 JGC and finishes equally in two wallets", () => {
    const expectedTotal = 72_000n * BASE_UNITS_PER_JGC;
    expect(result.totalMinted).toBe(expectedTotal);
    expect(result.finalBalances["wallet-01"]).toBe(expectedTotal / 2n);
    expect(result.finalBalances["wallet-02"]).toBe(expectedTotal / 2n);
    for (let index = 3; index <= TEN_DAY_WALLET_COUNT; index++) {
      expect(result.finalBalances[`wallet-${String(index).padStart(2, "0")}`]).toBe(0n);
    }
    expect(result.transfers.filter(item => item.kind === "consolidation")).toHaveLength(8);
  });
});
