/**
 * @file src/scripts/testnet-verify.ts
 * @description Fast end-to-end proof that mined epoch rewards land as SPENDABLE
 * UTXOs at a given JGC address.
 *
 * Boots a node, mines (instantly, no delay) through the first epoch boundary —
 * where the settlement coinbase pays out — plus full coinbase maturity, all to a
 * single miner whose payout address is the one supplied. It then scans the live
 * UTXO set for a mature output paying that address's canonical P2PKH (the exact
 * script Wallet.listUnspent matches). This validates the whole emission → wallet
 * path WITHOUT needing the keystore or passphrase.
 *
 * Difficulty is set low so one simnet miner clears the per-block target; the
 * reward schedule (and thus the payout) is identical to mainnet — only the work
 * threshold is scaled down. 244 blocks < the 2016-block retarget window, so the
 * producer's fixed genesis difficulty matches throughout.
 *
 * Run:  npm run testnet-verify -- 1JGC<40-hex-address>     (after npm run build)
 */

import { JGCNode } from "../network/node.js";
import { loadVerifierWasm } from "../crypto/zkp.js";
import {
  encodeDifficultyBits, BLOCKS_PER_EPOCH, getBlockReward,
} from "../consensus/emission.js";
import { COINBASE_MATURITY } from "../consensus/utxo.js";
import {
  makeGenesisBlock, makePeer, BlockProducer, mineBlocks, type SimMinerSpec,
} from "../sim/harness.js";
import { scriptPubKeyFromAddress } from "../crypto/signatures.js";
import { formatJGC } from "../wallet/wallet.js";

const TARGET_TFLOPS = 150;  // low genesis difficulty: one simnet miner clears it
const JGC_ADDRESS_RE = /^1JGC[0-9a-fA-F]{40}$/;

async function main(): Promise<void> {
  const address = process.argv[2];
  if (!address || !JGC_ADDRESS_RE.test(address)) {
    console.error("usage: npm run testnet-verify -- 1JGC<40-hex-address>");
    process.exit(1);
  }

  // Mine one block past (epoch boundary + maturity) so the settlement coinbase
  // minted at height 143 is mature at the final tip.
  const blocksToMine = BLOCKS_PER_EPOCH + COINBASE_MATURITY;  // 144 + 100 = 244

  console.log("══════════════════════════════════════════════════════════════");
  console.log("  JGC testnet — emission-to-wallet proof");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`[Verify] Payout address: ${address}`);
  console.log(`[Verify] Mining ${blocksToMine} blocks (epoch ${BLOCKS_PER_EPOCH} + maturity ${COINBASE_MATURITY})…`);

  await loadVerifierWasm({ mode: "simnet" });

  const difficultyBits = encodeDifficultyBits(TARGET_TFLOPS);
  const node = new JGCNode(
    {
      listenPort: 0, rpcPort: 0, networkMagic: 0xD9B4BEF9,
      maxPeers: 8, enableBroker: false, junctionGeneratorMode: false,
    },
    makeGenesisBlock(difficultyBits),
  );
  // We mine all blocks instantly, but the producer stamps them 30 simulated
  // seconds apart. Start its clock far enough in the past that even the final
  // block lands before "now" — otherwise the simulated timeline outruns the
  // node's wall clock and trips the +7200s future-drift rule (~height 241).
  const producer = new BlockProducer(
    makeGenesisBlock(difficultyBits),
    { timeOffsetSec: -(blocksToMine * 30) - 60 },
  );
  const peer = makePeer("local-miner", "inproc");
  node.connectPeer(peer.conn);

  // Single miner — its address IS the supplied payout address, so the entire
  // epoch reward pool settles to it. pubKey is a placeholder (simnet skips the
  // contribution-signature check); the payout binds to minerAddress.
  const miners: SimMinerSpec[] = [
    { address, pubKey: "02" + "11".repeat(32), tflops: 200 },
  ];

  await mineBlocks(node, "local-miner", producer, blocksToMine, miners, (b) => {
    if (b.header.height % 36 === 0) console.log(`[Verify]   …height ${b.header.height}`);
  });

  // ── Scan the live UTXO set for outputs paying our canonical P2PKH ───────────
  const expectedScript = scriptPubKeyFromAddress(address);
  const tipHeight = node.getChainInfo().tipHeight;
  const currentHeight = tipHeight + 1;  // matches Wallet's spendability horizon

  let mature = 0n, immature = 0n, count = 0;
  for (const { entry } of node.getUTXOSet().entries()) {
    if (entry.scriptPubKey !== expectedScript) continue;
    count++;
    const isMature = !entry.isCoinbase || currentHeight - entry.height >= COINBASE_MATURITY;
    if (isMature) mature += entry.value; else immature += entry.value;
  }

  const expectedPool = getBlockReward(0) * BigInt(BLOCKS_PER_EPOCH);  // era-0 epoch pool

  console.log("──────────────────────────────────────────────────────────────");
  console.log(`[Verify] Chain tip height:     ${tipHeight}`);
  console.log(`[Verify] Outputs to address:   ${count}`);
  console.log(`[Verify] Spendable (mature):   ${formatJGC(mature)} JGC`);
  console.log(`[Verify] Immature:             ${formatJGC(immature)} JGC`);
  console.log(`[Verify] Expected epoch pool:  ${formatJGC(expectedPool)} JGC (single miner takes all)`);
  console.log("──────────────────────────────────────────────────────────────");

  if (mature === expectedPool) {
    console.log(`[Verify] ✓ PASS — full epoch reward landed as SPENDABLE JGC at ${address}`);
  } else if (mature > 0n) {
    console.log(`[Verify] ✓ spendable balance present (${formatJGC(mature)} JGC), but ≠ expected pool — investigate`);
    process.exitCode = 1;
  } else {
    console.error(`[Verify] ✗ FAIL — no spendable balance at the address`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error("[Verify] FATAL:", err);
  process.exitCode = 1;
});
