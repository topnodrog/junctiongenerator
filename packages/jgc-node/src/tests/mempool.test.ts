/**
 * @file src/tests/mempool.test.ts
 * @description Tests for validated mempool acceptance (submitTransaction).
 */

import type { NodeConfig, Transaction } from "../types/index.js";
import { MessageType as MT } from "../types/index.js";
import { JGCNode } from "../network/node.js";
import { txSigHash, txid } from "../consensus/utxo.js";
import { generateKeyPair, p2pkhScript, signHash, p2pkhScriptSig } from "../crypto/signatures.js";
import { BASE_UNITS_PER_JGC, getBlockReward } from "../consensus/emission.js";
import { loadVerifierWasm } from "../crypto/zkp.js";
import {
  makeGenesisBlock, makePeer, makeMessage, makeContribution, BlockProducer, DEFAULT_MINERS,
} from "../sim/harness.js";

const alice = generateKeyPair();
const bob = generateKeyPair();
const J = (n: bigint): bigint => n * BASE_UNITS_PER_JGC;
const FUNDING = "00".repeat(31) + "ee";

function cfg(): NodeConfig {
  return { listenPort: 0, rpcPort: 0, networkMagic: 0xD9B4BEF9, maxPeers: 8, enableBroker: false, junctionGeneratorMode: false };
}

function fundedNode(): JGCNode {
  const node = new JGCNode(cfg(), makeGenesisBlock());
  node.getUTXOSet().add(FUNDING, 0, { value: J(10n), scriptPubKey: p2pkhScript(alice.publicKey), height: 0, isCoinbase: false });
  return node;
}

function spend(outs: Transaction["outputs"], signer = alice): Transaction {
  const tx: Transaction = {
    version: 1, inputs: [{ prevOut: { txid: FUNDING, vout: 0 }, scriptSig: "", sequence: 0xFFFFFFFF }],
    outputs: outs, locktime: 0,
  };
  tx.inputs[0]!.scriptSig = p2pkhScriptSig(signHash(signer.privateKey, txSigHash(tx)), signer.publicKey);
  return tx;
}

describe("mempool acceptance", () => {
  test("valid signed spend is accepted", () => {
    const node = fundedNode();
    const r = node.submitTransaction(spend([{ value: J(6n), scriptPubKey: p2pkhScript(bob.publicKey) }]));
    expect(r.ok).toBe(true);
    expect(node.getMempool()).toHaveLength(1);
  });

  test("duplicate submission is rejected", () => {
    const node = fundedNode();
    const tx = spend([{ value: J(6n), scriptPubKey: p2pkhScript(bob.publicKey) }]);
    expect(node.submitTransaction(tx).ok).toBe(true);
    expect(node.submitTransaction(tx).ok).toBe(false);
    expect(node.getMempool()).toHaveLength(1);
  });

  test("mempool double-spend (same input, different tx) is rejected", () => {
    const node = fundedNode();
    expect(node.submitTransaction(spend([{ value: J(6n), scriptPubKey: p2pkhScript(bob.publicKey) }])).ok).toBe(true);
    // A different tx spending the same funded output.
    const r = node.submitTransaction(spend([{ value: J(5n), scriptPubKey: p2pkhScript(bob.publicKey) }]));
    expect(r.ok).toBe(false);
    expect(node.getMempool()).toHaveLength(1);
  });

  test("spending an unknown output is rejected", () => {
    const node = fundedNode();
    const tx: Transaction = {
      version: 1, inputs: [{ prevOut: { txid: "ff".repeat(32), vout: 0 }, scriptSig: "", sequence: 0xFFFFFFFF }],
      outputs: [{ value: J(1n), scriptPubKey: p2pkhScript(bob.publicKey) }], locktime: 0,
    };
    tx.inputs[0]!.scriptSig = p2pkhScriptSig(signHash(alice.privateKey, txSigHash(tx)), alice.publicKey);
    expect(node.submitTransaction(tx).ok).toBe(false);
  });

  test("overspend is rejected", () => {
    const node = fundedNode();
    expect(node.submitTransaction(spend([{ value: J(11n), scriptPubKey: p2pkhScript(bob.publicKey) }])).ok).toBe(false);
  });

  test("spend signed by the wrong key is rejected", () => {
    const node = fundedNode();
    expect(node.submitTransaction(spend([{ value: J(6n), scriptPubKey: p2pkhScript(bob.publicKey) }], bob)).ok).toBe(false);
  });
});

describe("mempool DoS bounds (fee floor + capacity eviction)", () => {
  const fundTxid = (i: number): string => "00".repeat(31) + (0xa0 + i).toString(16).padStart(2, "0");

  function nodeWith(opts: Partial<NodeConfig>): JGCNode {
    const node = new JGCNode({ ...cfg(), ...opts }, makeGenesisBlock());
    return node;
  }
  function fundN(node: JGCNode, n: number, value: bigint): void {
    for (let i = 0; i < n; i++) {
      node.getUTXOSet().add(fundTxid(i), 0, { value, scriptPubKey: p2pkhScript(alice.publicKey), height: 0, isCoinbase: false });
    }
  }
  // Spend funded output `i` (worth `inValue`) leaving `fee` to miners. Same shape
  // for every tx ⇒ equal serialized size ⇒ fee-rate order == fee order.
  function spend1(i: number, inValue: bigint, fee: bigint): Transaction {
    const tx: Transaction = {
      version: 1,
      inputs: [{ prevOut: { txid: fundTxid(i), vout: 0 }, scriptSig: "", sequence: 0xFFFFFFFF }],
      outputs: [{ value: inValue - fee, scriptPubKey: p2pkhScript(bob.publicKey) }],
      locktime: 0,
    };
    tx.inputs[0]!.scriptSig = p2pkhScriptSig(signHash(alice.privateKey, txSigHash(tx)), alice.publicKey);
    return tx;
  }

  test("a tx below the min relay fee rate is rejected", () => {
    const node = nodeWith({ minRelayFeeRate: 10n ** 12n });
    fundN(node, 1, J(10n));
    const r = node.submitTransaction(spend1(0, J(10n), 1n)); // 1 base-unit fee ≪ floor·size
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/min relay/);
    expect(node.getMempool()).toHaveLength(0);
  });

  test("a tx at/above the floor is accepted", () => {
    const node = nodeWith({ minRelayFeeRate: 1n });
    fundN(node, 1, J(10n));
    expect(node.submitTransaction(spend1(0, J(10n), J(1n))).ok).toBe(true);
  });

  test("mempool is capacity-bounded and evicts the lowest fee-rate tx", () => {
    const node = nodeWith({ maxMempoolTxs: 2, minRelayFeeRate: 1n });
    fundN(node, 4, J(10n));
    const lowFee = spend1(0, J(10n), J(1n));   // fee 1
    const midFee = spend1(1, J(10n), J(2n));   // fee 2
    const hiFee  = spend1(2, J(10n), J(3n));   // fee 3
    expect(node.submitTransaction(lowFee).ok).toBe(true);
    expect(node.submitTransaction(midFee).ok).toBe(true);
    expect(node.getMempool()).toHaveLength(2);  // at capacity

    // hiFee (rate > cheapest) evicts lowFee; size stays at the cap.
    expect(node.submitTransaction(hiFee).ok).toBe(true);
    const ids = new Set(node.getMempool().map(txid));
    expect(node.getMempool()).toHaveLength(2);
    expect(ids.has(txid(lowFee))).toBe(false);  // evicted
    expect(ids.has(txid(midFee))).toBe(true);
    expect(ids.has(txid(hiFee))).toBe(true);

    // A newcomer cheaper than the cheapest resident is rejected outright.
    expect(node.submitTransaction(spend1(3, J(10n), J(1n))).ok).toBe(false);
    expect(node.getMempool()).toHaveLength(2);
  });

  test("evicting a tx frees the outpoint it reserved", () => {
    const node = nodeWith({ maxMempoolTxs: 1, minRelayFeeRate: 1n });
    fundN(node, 2, J(10n));
    const a = spend1(0, J(10n), J(1n));      // reserves output 0
    const b = spend1(1, J(10n), J(2n));      // reserves output 1, evicts a
    expect(node.submitTransaction(a).ok).toBe(true);
    expect(node.submitTransaction(b).ok).toBe(true);
    expect(node.getMempool().map(txid)).toEqual([txid(b)]);
    // c spends output 0 — only acceptable if a's eviction released that outpoint
    // (otherwise the pending-double-spend guard would reject it). c also evicts b.
    const c = spend1(0, J(10n), J(3n));
    expect(node.submitTransaction(c).ok).toBe(true);
    expect(node.getMempool().map(txid)).toEqual([txid(c)]);
  });
});

describe("in-block chained-tx fee accounting", () => {
  // Regression for the calculateBlockFees in-block-chaining bug: a child tx that
  // spends a parent tx's output in the SAME block must have its fee counted into
  // the epoch pool. The old code resolved inputs only against the pre-block UTXO
  // set, missed the in-block parent, and `return`ed — burning the child's fee AND
  // every subsequent tx's fee.
  test("a child spending a parent in the same block has its fee counted", async () => {
    await loadVerifierWasm({ mode: "simnet" });
    const node = new JGCNode(cfg(), makeGenesisBlock());
    node.connectPeer(makePeer("local-miner", "inproc").conn);
    const producer = new BlockProducer(makeGenesisBlock());

    // Fund alice with 10 JGC.
    node.getUTXOSet().add(FUNDING, 0, { value: J(10n), scriptPubKey: p2pkhScript(alice.publicKey), height: 0, isCoinbase: false });

    // parent: funding(10) → alice(9).  fee = 1 JGC
    const parent: Transaction = {
      version: 1,
      inputs: [{ prevOut: { txid: FUNDING, vout: 0 }, scriptSig: "", sequence: 0xFFFFFFFF }],
      outputs: [{ value: J(9n), scriptPubKey: p2pkhScript(alice.publicKey) }],
      locktime: 0,
    };
    parent.inputs[0]!.scriptSig = p2pkhScriptSig(signHash(alice.privateKey, txSigHash(parent)), alice.publicKey);

    // child: parent:0 (9) → bob(8).  fee = 1 JGC  (spends an output created this block)
    const child: Transaction = {
      version: 1,
      inputs: [{ prevOut: { txid: txid(parent), vout: 0 }, scriptSig: "", sequence: 0xFFFFFFFF }],
      outputs: [{ value: J(8n), scriptPubKey: p2pkhScript(bob.publicKey) }],
      locktime: 0,
    };
    child.inputs[0]!.scriptSig = p2pkhScriptSig(signHash(alice.privateKey, txSigHash(child)), alice.publicKey);

    const height = node.getChainInfo().tipHeight + 1;
    for (const m of DEFAULT_MINERS) await node.processMessage("local-miner", makeMessage(MT.COMPUTE_PROOF, makeContribution(m, height)));
    const block = producer.produceBlock(node.getPendingProofs(), [parent, child]);
    await node.processMessage("local-miner", makeMessage(MT.BLOCK, block));

    expect(node.getChainInfo().tipHeight).toBe(height);   // block accepted (chaining is legal)
    expect(block.transactions.length).toBe(3);            // coinbase + parent + child
    // Both 1-JGC fees must reach the epoch pool, on top of the genesis + block-1 subsidies.
    expect(node.getEpochState().pendingRewardPool).toBe(2n * getBlockReward(0) + J(2n));
  });
});
