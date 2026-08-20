import type { BlockHeight, Transaction } from "../types/index.js";
import { quantumScriptPubKeyFromAddress } from "../crypto/pq.js";
import type { EpochSettlement } from "./epoch.js";

/**
 * Build the canonical epoch-settlement coinbase transaction.
 *
 * The boundary height is committed in locktime so two epochs with identical
 * payouts still produce distinct transaction IDs. Validation enforces the same
 * commitment before any output can enter the UTXO set.
 */
export function createEpochSettlementTransaction(
  settlement: EpochSettlement,
  blockHeight: BlockHeight,
): Transaction {
  if (!Number.isSafeInteger(blockHeight) || blockHeight < 0 || blockHeight > 0xffffffff) {
    throw new RangeError("settlement block height must fit in uint32 locktime");
  }
  return {
    version: 1,
    inputs: [],
    outputs: settlement.payouts.map(payout => ({
      value: payout.satoshis,
      scriptPubKey: quantumScriptPubKeyFromAddress(payout.minerAddress),
    })),
    locktime: blockHeight,
  };
}
