import type { EpochSettlement } from "../consensus/epoch.js";
import { createEpochSettlementTransaction } from "../consensus/settlement-transaction.js";
import { txid } from "../consensus/utxo.js";

const settlement: EpochSettlement = {
  epochIndex: 0,
  epochStartHeight: 0,
  epochEndHeight: 143,
  totalRewardPool: 72_000_000_000_000_000_000n,
  totalTFLOPS: 1_000,
  payouts: [{
    minerAddress: `1QGC${"ab".repeat(20)}`,
    satoshis: 72_000_000_000_000_000_000n,
    tflopsContributed: 1_000,
    sharePercent: 100,
  }],
  settlementTxHash: "11".repeat(32),
};

describe("canonical settlement transaction", () => {
  test("commits boundary height so identical payouts have distinct txids", () => {
    const first = createEpochSettlementTransaction(settlement, 143);
    const second = createEpochSettlementTransaction({
      ...settlement,
      epochIndex: 1,
      epochStartHeight: 144,
      epochEndHeight: 287,
    }, 287);

    expect(first.outputs).toEqual(second.outputs);
    expect(first.locktime).toBe(143);
    expect(second.locktime).toBe(287);
    expect(txid(first)).not.toBe(txid(second));
  });

  test("rejects heights that cannot be encoded in locktime", () => {
    expect(() => createEpochSettlementTransaction(settlement, -1)).toThrow(/uint32/i);
    expect(() => createEpochSettlementTransaction(settlement, 1.5)).toThrow(/uint32/i);
    expect(() => createEpochSettlementTransaction(settlement, 0x1_0000_0000)).toThrow(/uint32/i);
  });
});
