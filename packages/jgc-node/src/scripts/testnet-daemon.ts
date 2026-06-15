/**
 * @file src/scripts/testnet-daemon.ts
 * @description Persistent single-node JGC testnet that mines on a timer to one
 * payout address, settles epoch rewards, and persists to a datadir so balances
 * survive restarts. This is the long-running counterpart to testnet-verify.
 *
 * Each tick: the miner gossips one compute proof, the producer assembles a block
 * (at the node's LIVE difficulty so it survives 2016-block retargets, stamped at
 * wall-clock time), and the block goes through the full validateBlock pipeline.
 * Epoch rewards settle at every 144th block to the address's canonical P2PKH —
 * the exact script the wallet recognizes and can spend after 100-block maturity.
 *
 * On restart the node replays its datadir to the tip and the producer is re-seeded
 * from that live state, so mining resumes seamlessly (important across reboots).
 *
 * SIMNET/DEV ONLY: placeholder proofs (structural verifier path), low genesis
 * difficulty, single miner. Reward schedule is identical to mainnet.
 *
 * Run:  npm run testnet -- --address 1JGC<40-hex> [--datadir <dir>] [--interval <ms>] [--max-blocks <n>]
 */

import { mkdirSync } from "fs";
import { JGCNode } from "../network/node.js";
import { loadVerifierWasm } from "../crypto/zkp.js";
import { encodeDifficultyBits, BLOCKS_PER_EPOCH } from "../consensus/emission.js";
import { COINBASE_MATURITY } from "../consensus/utxo.js";
import {
  makeGenesisBlock, makePeer, makeMessage, makeContribution, BlockProducer, type SimMinerSpec,
} from "../sim/harness.js";
import { MessageType } from "../types/index.js";
import { scriptPubKeyFromAddress } from "../crypto/signatures.js";
import { formatJGC } from "../wallet/wallet.js";

const JGC_ADDRESS_RE = /^1JGC[0-9a-fA-F]{40}$/;
const GENESIS_TFLOPS = 150;          // low genesis difficulty: one simnet miner clears it
const MINER_TFLOPS   = 1_000_000;    // = circuit max; clears ~7 retarget windows (~5d @30s)
const PEER_ID        = "local-miner";

interface Flags { address: string; datadir: string; interval: number; maxBlocks: number; }

function parseFlags(argv: string[]): Flags {
  const f: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i]!.startsWith("--")) f[argv[i]!.slice(2)] = argv[++i] ?? "";
  }
  return {
    address:   f.address ?? "",
    datadir:   f.datadir ?? "./testnet-data",
    interval:  f.interval !== undefined ? Number(f.interval) : 30_000,
    maxBlocks: f["max-blocks"] !== undefined ? Number(f["max-blocks"]) : 0, // 0 = run forever
  };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  if (!JGC_ADDRESS_RE.test(flags.address)) {
    console.error("usage: npm run testnet -- --address 1JGC<40-hex> [--datadir <dir>] [--interval <ms>] [--max-blocks <n>]");
    process.exit(1);
  }
  mkdirSync(flags.datadir, { recursive: true });

  console.log("══════════════════════════════════════════════════════════════");
  console.log("  JGC testnet daemon");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`[Testnet] Payout address: ${flags.address}`);
  console.log(`[Testnet] Data dir:       ${flags.datadir}`);
  console.log(`[Testnet] Block interval: ${flags.interval} ms${flags.maxBlocks ? `  (stop after ${flags.maxBlocks} blocks)` : "  (runs until stopped)"}`);

  await loadVerifierWasm({ mode: "simnet" });

  const difficultyBits = encodeDifficultyBits(GENESIS_TFLOPS);
  const node = new JGCNode(
    {
      listenPort: 0, rpcPort: 0, networkMagic: 0xD9B4BEF9,
      maxPeers: 8, enableBroker: false, junctionGeneratorMode: false,
      dataDir: flags.datadir,   // node replays this on construction
    },
    makeGenesisBlock(difficultyBits),
  );
  const peer = makePeer(PEER_ID, "inproc");
  node.connectPeer(peer.conn);

  // Re-seed the producer from the node's live tip so a restart resumes mid-chain
  // (for a fresh chain this equals genesis bootstrapping).
  const producer = new BlockProducer(makeGenesisBlock(difficultyBits), {
    resume: {
      tipHeader:  node.getTipHeader(),
      height:     node.getChainInfo().tipHeight,
      epochState: node.getEpochState(),
    },
  });

  const miner: SimMinerSpec = { address: flags.address, pubKey: "02" + "11".repeat(32), tflops: MINER_TFLOPS };
  const expectedScript = scriptPubKeyFromAddress(flags.address);

  const spendable = (): bigint => {
    const currentHeight = node.getChainInfo().tipHeight + 1;
    let sum = 0n;
    for (const { entry } of node.getUTXOSet().entries()) {
      if (entry.scriptPubKey !== expectedScript) continue;
      if (entry.isCoinbase && currentHeight - entry.height < COINBASE_MATURITY) continue;
      sum += entry.value;
    }
    return sum;
  };

  const startHeight = node.getChainInfo().tipHeight;
  if (startHeight > 0) console.log(`[Testnet] Resumed from datadir at height ${startHeight}; spendable so far: ${formatJGC(spendable())} JGC`);

  let mined = 0;
  let stop  = false;
  const shutdown = (sig: string): void => {
    console.log(`\n[Testnet] ${sig} — stopping after current block. Tip height ${node.getChainInfo().tipHeight}, spendable ${formatJGC(spendable())} JGC.`);
    stop = true;
  };
  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  async function mineOne(): Promise<void> {
    const height = node.getChainInfo().tipHeight + 1;

    // Gossip the miner's proof into the pending pool.
    await node.processMessage(PEER_ID, makeMessage(MessageType.COMPUTE_PROOF, makeContribution(miner, height)));

    // Stamp at wall-clock time, strictly after the current tip (median-past rule).
    const tipTs = node.getTipHeader().timestamp;
    const ts    = Math.max(Math.floor(Date.now() / 1000), tipTs + 1);

    const block = producer.produceBlock(node.getPendingProofs(), [], {
      difficultyBits: node.getCurrentDifficultyBits(),  // live-retargeted
      timestamp:      ts,
    });
    await node.processMessage(PEER_ID, makeMessage(MessageType.BLOCK, block));

    if (node.getChainInfo().tipHeight !== height) {
      console.error(`[Testnet] Block at height ${height} REJECTED — halting to avoid a stuck loop.`);
      stop = true;
      return;
    }
    producer.confirmBlock(block);
    mined++;

    // Heartbeat each block; richer line on epoch boundaries.
    if (height % BLOCKS_PER_EPOCH === BLOCKS_PER_EPOCH - 1) {
      console.log(`[Testnet] ✦ epoch settled at height ${height} — spendable now: ${formatJGC(spendable())} JGC`);
    } else if (height % 10 === 0) {
      console.log(`[Testnet] height ${height} | spendable ${formatJGC(spendable())} JGC | difficulty bits 0x${node.getCurrentDifficultyBits().toString(16)}`);
    }
  }

  // Recursive-timeout loop: never overlaps mining with the next tick.
  await new Promise<void>((resolve) => {
    const tick = async (): Promise<void> => {
      if (stop || (flags.maxBlocks > 0 && mined >= flags.maxBlocks)) { resolve(); return; }
      await mineOne();
      if (stop || (flags.maxBlocks > 0 && mined >= flags.maxBlocks)) { resolve(); return; }
      setTimeout(() => { void tick(); }, flags.interval);
    };
    void tick();
  });

  console.log("──────────────────────────────────────────────────────────────");
  console.log(`[Testnet] Stopped. Mined ${mined} block(s) this run; tip height ${node.getChainInfo().tipHeight}.`);
  console.log(`[Testnet] Spendable at ${flags.address}: ${formatJGC(spendable())} JGC`);
  console.log(`[Testnet] Check from the wallet:  npm run wallet -- balance <label> --datadir ${flags.datadir}`);
}

main().catch((err: unknown) => {
  console.error("[Testnet] FATAL:", err);
  process.exitCode = 1;
});
