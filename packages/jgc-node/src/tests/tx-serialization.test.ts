/**
 * @file src/tests/tx-serialization.test.ts
 * @description Tests for the canonical binary transaction wire format.
 *
 * Verifies round-trip identity (serialize → deserialize) and, critically, that
 * the 16-byte u128 money field holds the full 16-decimal supply cap — a value
 * that would overflow Bitcoin's 8-byte int64 amount field.
 */

import {
  serializeTransaction, deserializeTransaction, computeTransactionMerkleRoot,
} from "../consensus/block.js";
import { HARD_CAP_SATOSHIS, BASE_UNITS_PER_JGC } from "../consensus/emission.js";
import type { Transaction } from "../types/index.js";

const P2PKH = "76a914" + "11".repeat(20) + "88ac";

function sampleTx(): Transaction {
  return {
    version: 1,
    inputs: [{
      prevOut: { txid: "ab".repeat(32), vout: 2 },
      scriptSig: "47" + "30".repeat(40),
      sequence: 0xFFFFFFFF,
    }],
    outputs: [
      { value: 123n * BASE_UNITS_PER_JGC, scriptPubKey: P2PKH },
      { value: 7n,                        scriptPubKey: "76a914" + "22".repeat(20) + "88ac" },
    ],
    locktime: 0,
  };
}

describe("canonical transaction serialization", () => {
  test("round-trips a standard transaction", () => {
    const tx = sampleTx();
    expect(deserializeTransaction(serializeTransaction(tx))).toEqual(tx);
  });

  test("u128 money field holds the full supply cap (int64 would overflow)", () => {
    const tx: Transaction = {
      version: 1, inputs: [],
      outputs: [{ value: HARD_CAP_SATOSHIS, scriptPubKey: "00" }],
      locktime: 0,
    };
    const back = deserializeTransaction(serializeTransaction(tx));
    expect(back.outputs[0]!.value).toBe(HARD_CAP_SATOSHIS);
    // The supply cap genuinely exceeds a signed 64-bit integer's max.
    expect(HARD_CAP_SATOSHIS > 2n ** 63n - 1n).toBe(true);
  });

  test("coinbase tx (no inputs, many outputs) round-trips", () => {
    const outputs = Array.from({ length: 5 }, (_, i) => ({
      value: BigInt(i + 1) * BASE_UNITS_PER_JGC, scriptPubKey: P2PKH,
    }));
    const tx: Transaction = { version: 1, inputs: [], outputs, locktime: 0 };
    expect(deserializeTransaction(serializeTransaction(tx))).toEqual(tx);
  });

  test("brokerTaskRef present round-trips; absent stays absent", () => {
    const withRef: Transaction = { ...sampleTx(), brokerTaskRef: "task:deadbeef" };
    expect(deserializeTransaction(serializeTransaction(withRef))).toEqual(withRef);

    const back = deserializeTransaction(serializeTransaction(sampleTx()));
    expect("brokerTaskRef" in back).toBe(false);
  });

  test("serialization is deterministic", () => {
    const tx = sampleTx();
    expect(serializeTransaction(tx).toString("hex")).toBe(serializeTransaction(tx).toString("hex"));
  });

  test("negative output value is rejected", () => {
    const tx: Transaction = {
      version: 1, inputs: [], outputs: [{ value: -1n, scriptPubKey: "00" }], locktime: 0,
    };
    expect(() => serializeTransaction(tx)).toThrow();
  });

  test("truncated buffer throws on deserialize", () => {
    const full = serializeTransaction(sampleTx());
    expect(() => deserializeTransaction(full.subarray(0, full.length - 3))).toThrow();
  });

  test("merkle root over txs is deterministic and well-formed", () => {
    const txs = [sampleTx(), { ...sampleTx(), locktime: 7 }];
    const r1 = computeTransactionMerkleRoot(txs);
    expect(r1).toBe(computeTransactionMerkleRoot(txs));
    expect(r1).toMatch(/^[0-9a-f]{64}$/);
  });
});
