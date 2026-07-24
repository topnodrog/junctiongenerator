/**
 * @file src/tests/reorg.test.ts
 * @description Fork choice + chain reorganization: the node follows the heaviest
 * known branch, switching atomically when a competing branch outweighs the tip,
 * and the post-reorg state matches having mined that branch from the start.
 */

import type { Block, MinerComputeContribution, Transaction } from "../types/index.js";
import { MessageType as MT } from "../types/index.js";
import { JGCNode } from "../network/node.js";
import { txid, txSigHash } from "../consensus/utxo.js";
import { hashBlockHeader } from "../consensus/block.js";
import { pqScriptPubKey, pqSignHash, pqScriptSig, pqGenerateKeyPair } from "../crypto/pq-signatures.js";
import { BASE_UNITS_PER_JGC } from "../consensus/emission.js";
import {
  makeGenesisBlock, makePeer, makeMessage, makeContribution, BlockProducer, DEFAULT_MINERS,
} from "../sim/harness.js";
import type { NodeConfig } from "../types/index.js";

const J = (n: bigint): bigint => n * BASE_UNITS_PER_JGC;
const alice = pqGenerateKeyPair("aa".repeat(32));
const bob = pqGenerateKeyPair("bb".repeat(32));

const cfg = (): NodeConfig => ({ listenPort: 0, rpcPort: 0, networkMagic: 0xD9B4BEF9, maxPeers: 8, enableBroker: false, junctionGeneratorMode: false });
const contribs = (height: number): MinerComputeContribution[] => DEFAULT_MINERS.map(m => makeContribution(m, height));

function node(genesis: Block): JGCNode {
  const n = new JGCNode(cfg(), genesis);
  n.connectPeer(makePeer("peer", "inproc").conn);
  return n;
}
const feed = (n: JGCNode, b: Block): Promise<void> => n.processMessage("peer", makeMessage(MT.BLOCK, b));

/** Total value across the UTXO set (for conservation checks). */
function utxoTotal(n: JGCNode): bigint {
  let sum = 0n;
  for (const { entry } of n.getUTXOSet().entries()) sum += entry.value;
  return sum;
}

/** Genesis carrying a spendable, non-coinbase output funding `pub` with 10 JGC.
 *  Lives in the genesis tx set, so it survives a rebuild-from-genesis reorg. */
function fundedGenesis(pub: string): Block {
  const g = makeGenesisBlock();
  g.transactions = [
    { version: 1, inputs: [], outputs: [{ value: 0n, scriptPubKey: "6a" }], locktime: 0 }, // coinbase placeholder
    { version: 1, inputs: [{ prevOut: { txid: "00".repeat(32), vout: 0 }, scriptSig: "00", sequence: 0xFFFFFFFF }],
      outputs: [{ value: J(10n), scriptPubKey: pqScriptPubKey(pub) }], locktime: 0 },
  ];
  return g;
}

describe("fork choice + reorg", () => {
  test("switches to a heavier competing branch and matches a from-scratch chain", async () => {
    const genesis = makeGenesisBlock();
    const n = node(genesis);
    const pA = new BlockProducer(makeGenesisBlock());
    const pB = new BlockProducer(makeGenesisBlock(), { timeOffsetSec: 7 });

    // Branch A: a single block becomes the tip.
    const a1 = pA.produceBlock(contribs(1)); pA.confirmBlock(a1);
    await feed(n, a1);
    expect(n.getChainInfo().tipHeight).toBe(1);

    // Branch B: two blocks from genesis. b1 ties A (stays a side branch)…
    const b1 = pB.produceBlock(contribs(1)); pB.confirmBlock(b1);
    const b2 = pB.produceBlock(contribs(2)); pB.confirmBlock(b2);
    await feed(n, b1);
    expect(n.getChainInfo().tipHash).toBe(hash(a1)); // tie → first-seen tip holds

    // …then b2 makes B heavier → reorg onto B.
    await feed(n, b2);
    expect(n.getChainInfo().tipHeight).toBe(2);
    expect(n.getChainInfo().tipHash).toBe(hash(b2));

    // Reference node that only ever saw branch B must have identical state.
    const ref = node(makeGenesisBlock());
    await feed(ref, b1); await feed(ref, b2);
    expect(n.getChainInfo().tipHash).toBe(ref.getChainInfo().tipHash);
    expect(n.getEpochState().pendingRewardPool).toBe(ref.getEpochState().pendingRewardPool);
    expect(utxoTotal(n)).toBe(utxoTotal(ref));
  });

  test("does not reorg to an equal-or-lighter branch", async () => {
    const n = node(makeGenesisBlock());
    const pA = new BlockProducer(makeGenesisBlock());
    const pB = new BlockProducer(makeGenesisBlock(), { timeOffsetSec: 7 });
    const a1 = pA.produceBlock(contribs(1)); pA.confirmBlock(a1);
    const a2 = pA.produceBlock(contribs(2)); pA.confirmBlock(a2);
    const b1 = pB.produceBlock(contribs(1));
    await feed(n, a1); await feed(n, a2);
    const tip = n.getChainInfo().tipHash;
    await feed(n, b1); // lighter side branch
    expect(n.getChainInfo().tipHash).toBe(tip);
    expect(n.getChainInfo().tipHeight).toBe(2);
  });

  test("reorg returns the abandoned branch's txs to the mempool and undoes its spend", async () => {
    const genesis = fundedGenesis(alice.publicKey);
    const n = node(genesis);
    const pA = new BlockProducer(genesis);
    const pB = new BlockProducer(genesis, { timeOffsetSec: 7 });

    // alice → bob spend confirmed only on branch A.
    const fundingTxid = txid(genesis.transactions[1]!);
    const spend: Transaction = {
      version: 1,
      inputs: [{ prevOut: { txid: fundingTxid, vout: 0 }, scriptSig: "", sequence: 0xFFFFFFFF }],
      outputs: [
        { value: J(6n), scriptPubKey: pqScriptPubKey(bob.publicKey) },
        { value: J(3n), scriptPubKey: pqScriptPubKey(alice.publicKey) }, // change; fee = 1 JGC
      ],
      locktime: 0,
    };
    spend.inputs[0]!.scriptSig = pqScriptSig(pqSignHash(alice.privateKey, txSigHash(spend)), alice.publicKey);

    // Put the spend in the mempool (as a miner would) so the reorg can return it.
    expect(n.submitTransaction(spend).ok).toBe(true);
    const a1 = pA.produceBlock(contribs(1), [spend]); pA.confirmBlock(a1);
    await feed(n, a1);
    expect(n.getChainInfo().tipHeight).toBe(1);
    expect(n.getUTXOSet().has(fundingTxid, 0)).toBe(false);     // alice's coin spent on A
    expect(n.getUTXOSet().has(txid(spend), 0)).toBe(true);      // bob's 6 JGC exists on A

    // Heavier branch B (no spend) → reorg.
    const b1 = pB.produceBlock(contribs(1)); pB.confirmBlock(b1);
    const b2 = pB.produceBlock(contribs(2)); pB.confirmBlock(b2);
    await feed(n, b1); await feed(n, b2);
    expect(n.getChainInfo().tipHeight).toBe(2);

    // The spend is undone: alice's funding is unspent again, bob's output is gone,
    // and the disconnected spend is back in the mempool (valid against the new tip).
    expect(n.getUTXOSet().has(fundingTxid, 0)).toBe(true);
    expect(n.getUTXOSet().has(txid(spend), 0)).toBe(false);
    expect(n.getMempool().map(txid)).toContain(txid(spend));
  });
});

const hash = (b: Block): string => hashBlockHeader(b.header);
