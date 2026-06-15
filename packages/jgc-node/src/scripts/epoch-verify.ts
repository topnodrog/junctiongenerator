/**
 * @file src/scripts/epoch-verify.ts
 * @description End-to-end epoch-boundary payout verification.
 *
 * Mines a FULL epoch (144 slots: genesis slot 0 + blocks 1..143) through the
 * node's real message pipeline, then independently re-derives the settlement
 * and cross-checks it against the on-chain settlement coinbase that the node
 * actually accepted at the epoch boundary (height 143).
 *
 * WHY THIS IS A REAL TEST (not a restatement of the producer):
 *   The boundary block is only accepted if validation's INDEPENDENT
 *   recomputation of the settlement (validation.ts → validateCoinbaseTx →
 *   computeEpochSettlement) matches the producer's coinbase byte-for-byte.
 *   So `mineBlocks` reaching height 143 without throwing already proves the
 *   node ⇄ producer agreement. This script adds a THIRD, out-of-band
 *   computation here in the harness and asserts all three agree:
 *
 *       producer coinbase  ==  node-accepted block  ==  this script's settlement
 *
 *   It mirrors validation.ts exactly: capture the epoch accumulator PRE-apply
 *   of the boundary block, apply the boundary block's own contributions to a
 *   clone, then settle (the boundary block's compute counts toward its own
 *   epoch — see validation.ts "apply the candidate block to a copy first").
 *
 * BITCOIN ANALOG: like running a node to height N and asserting the coinbase
 * value equals GetBlockSubsidy(N) + fees — except JGC settles a 144-block
 * pro-rata pool in one transaction at the boundary instead of per block.
 */

import type { Block, EpochState } from "../types/index.js";
import { loadVerifierWasm } from "../crypto/zkp.js";
import { JGCNode } from "../network/node.js";
import { BLOCKS_PER_EPOCH, getBlockReward } from "../consensus/emission.js";
import { applyBlockToEpoch, computeEpochSettlement } from "../consensus/epoch.js";
import {
  BlockProducer, mineBlocks, makePeer, makeGenesisBlock, cloneEpochState, sha256d,
  DEFAULT_MINERS,
} from "../sim/harness.js";
import type { NodeConfig } from "../types/index.js";

const BOUNDARY = BLOCKS_PER_EPOCH - 1; // height 143 — the settlement block

function makeConfig(): NodeConfig {
  return {
    listenPort:            0,            // no socket needed; in-proc miner only
    rpcPort:               0,
    networkMagic:          0xD9B4BEF9,
    maxPeers:              8,
    enableBroker:          false,
    junctionGeneratorMode: false,
  };
}

/** P2PKH scriptPubKey the producer assigns to a miner address (see harness). */
function expectedScriptForAddr(addr: string): string {
  return "76a914" + sha256d(Buffer.from(addr)).slice(0, 40) + "88ac";
}

const JGC = (sats: bigint): string => (Number(sats) / 1e16).toFixed(8).padStart(16);

function fail(msg: string): never {
  console.error(`\n[EpochVerify] FAIL ✗  ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(" JGC Node — epoch-boundary payout verification");
  console.log("══════════════════════════════════════════════════════════════");

  // Simnet harness mines with placeholder proofs (no valid pairing) — use the
  // structural verifier path. Mainnet nodes load in the default "strict" mode.
  await loadVerifierWasm({ mode: "simnet" });

  const node = new JGCNode(makeConfig(), makeGenesisBlock());
  const miner = makePeer("local-miner", "inproc");
  node.connectPeer(miner.conn);

  const producer = new BlockProducer(makeGenesisBlock());

  // Capture, during mining, the two artifacts we need for an out-of-band check:
  //   1. preBoundaryEpoch — the accumulator AFTER block 142, i.e. PRE-apply of
  //      block 143 (cloned, because the node resets it once 143 is accepted).
  //   2. boundaryBlock    — the block the node actually accepted at height 143.
  let preBoundaryEpoch: EpochState | null = null;
  let boundaryBlock:    Block | null = null;

  const onBlock = (block: Block): void => {
    const h = block.header.height;
    if (h === BOUNDARY - 1) {
      // State after 142 applied == state the node will see before applying 143.
      preBoundaryEpoch = cloneEpochState(node.getEpochState());
    }
    if (h === BOUNDARY) {
      boundaryBlock = block;
    }
  };

  console.log(`[EpochVerify] Mining a full epoch (genesis + blocks 1..${BOUNDARY})…`);
  // Quiet the per-block node chatter so the verdict table is readable.
  const origLog = console.log;
  console.log = () => {};
  await mineBlocks(node, "local-miner", producer, BOUNDARY, DEFAULT_MINERS, onBlock);
  console.log = origLog;

  // ── Sanity: the node accepted the whole epoch through full validation ───────
  const tip = node.getChainInfo().tipHeight;
  if (tip !== BOUNDARY) fail(`node tip is ${tip}, expected ${BOUNDARY}`);
  if (!preBoundaryEpoch) fail("never captured the pre-boundary epoch state");
  if (!boundaryBlock)    fail("never captured the boundary block");

  const preEpoch: EpochState = preBoundaryEpoch;
  const block:    Block      = boundaryBlock;

  console.log(`[EpochVerify] Node accepted full epoch — tip at height ${tip} ✓`);

  // ── Out-of-band settlement recomputation (mirrors validation.ts) ───────────
  // The boundary block's own compute counts toward this epoch, so apply it to a
  // copy of the pre-boundary accumulator before settling.
  const settled = cloneEpochState(preEpoch);
  applyBlockToEpoch(settled, block.computeProofs, BOUNDARY, 0n);
  const settlement = computeEpochSettlement(settled, Math.floor(BOUNDARY / BLOCKS_PER_EPOCH));

  // ── Cross-check 1: pool equals 144 × era-0 subsidy (no fees in simnet) ──────
  const expectedPool = getBlockReward(0) * BigInt(BLOCKS_PER_EPOCH);
  if (settlement.totalRewardPool !== expectedPool) {
    fail(`pool ${settlement.totalRewardPool} != expected ${expectedPool}`);
  }

  // ── Cross-check 2: the on-chain coinbase IS the settlement ─────────────────
  const coinbase = block.transactions[0];
  if (!coinbase) fail("boundary block has no coinbase transaction");
  if (coinbase.inputs.length !== 0) fail("settlement coinbase must have no inputs");
  if (coinbase.outputs.length !== settlement.payouts.length) {
    fail(`coinbase has ${coinbase.outputs.length} outputs, settlement has ${settlement.payouts.length}`);
  }

  console.log("──────────────────────────────────────────────────────────────");
  console.log(`  Epoch 0   slots ${settlement.epochStartHeight}..${settlement.epochEndHeight}` +
              `   pool ${JGC(settlement.totalRewardPool)} JGC   total ${settlement.totalTFLOPS} TFLOPS`);
  console.log("──────────────────────────────────────────────────────────────");
  console.log("  miner                          TFLOPS    share      payout (JGC)   on-chain ✓");
  console.log("  ─────                          ──────    ─────      ────────────   ──────────");

  let sum = 0n;
  for (let i = 0; i < settlement.payouts.length; i++) {
    const p   = settlement.payouts[i]!;
    const out = coinbase.outputs[i]!;

    // Output amount must match the settlement entry exactly (same sorted order).
    if (out.value !== p.satoshis) {
      fail(`output ${i} value ${out.value} != settlement ${p.satoshis} for ${p.minerAddress}`);
    }
    // And the payout must be locked to the correct miner's script.
    if (out.scriptPubKey !== expectedScriptForAddr(p.minerAddress)) {
      fail(`output ${i} scriptPubKey does not match ${p.minerAddress}`);
    }

    sum += out.value;
    console.log(
      `  ${p.minerAddress.slice(0, 28).padEnd(28)} ${String(p.tflopsContributed).padStart(7)}` +
      `  ${p.sharePercent.toFixed(2).padStart(6)}%  ${JGC(p.satoshis)}        ✓`
    );
  }

  // ── Cross-check 3: outputs are exhaustive — sum to the whole pool ───────────
  if (sum !== settlement.totalRewardPool) {
    fail(`coinbase outputs sum to ${sum}, pool is ${settlement.totalRewardPool}`);
  }

  console.log("──────────────────────────────────────────────────────────────");
  console.log(`  Σ payouts = ${JGC(sum)} JGC = pool   (exhaustive, no dust lost) ✓`);
  console.log("──────────────────────────────────────────────────────────────");
  console.log("[EpochVerify] producer == node-accepted block == independent settlement");
  console.log("[EpochVerify] RESULT: PASS ✓");
}

main().catch(err => {
  console.error("[EpochVerify] Unhandled error:", err);
  process.exit(1);
});
