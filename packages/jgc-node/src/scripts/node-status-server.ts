/**
 * @file src/scripts/node-status-server.ts
 * @description `node-status` — serve a live JSON status snapshot for the website
 * panel (running state, wallet address, current + pending JGC).
 *
 * Two ways to name the wallet to report on:
 *   --address <addr>          watch-only; no passphrase, no key material touched
 *   --label <l> [--pass ...]  derive the address from an unlocked keystore key
 *
 * Real balances need a block store; point --datadir at the same store the wallet
 * CLI uses. Without one, the address and running state are still real and the
 * balances report 0 with chain:false (never a faked number).
 *
 * Examples:
 *   npm run node-status -- --address jgc1...        # watch-only, no chain
 *   npm run node-status -- --address jgc1... --datadir ./data   # real balances
 *   JGC_WALLET_PASS=… npm run node-status -- --label miner --datadir ./data
 *
 * Options:
 *   --address <addr>   watch-only address to report (skips the keystore)
 *   --label <label>    keystore label (default: first key) — needs --pass
 *   --keystore <path>  keystore file (or $JGC_KEYSTORE, default ./wallet.keystore.json)
 *   --pass <phrase>    passphrase (or $JGC_WALLET_PASS)
 *   --datadir <dir>    block store for real balances
 *   --network <name>   label shown in the panel (default "regtest")
 *   --port <n>         listen port (or $JGC_STATUS_PORT, default 7777)
 *   --host <addr>      bind address (default 127.0.0.1 — loopback)
 *
 * Run:  npm run node-status -- [options]      (after npm run build)
 */

import { existsSync, readFileSync } from "fs";
import type { NodeConfig } from "../types/index.js";
import { JGCNode } from "../network/node.js";
import { makeGenesisBlock } from "../sim/harness.js";
import { UTXOSet, COINBASE_MATURITY } from "../consensus/utxo.js";
import { Wallet, formatJGC, type KeystoreFile } from "../wallet/wallet.js";
import { scriptPubKeyFromAddress, p2pkhScript } from "../crypto/signatures.js";
import { startStatusServer, type NodeStatus } from "../network/status-server.js";

const VERSION = "0.1.0";

interface Args { flags: Record<string, string> }

function parseArgs(argv: string[]): Args {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) flags[a.slice(2)] = argv[++i] ?? "";
  }
  return { flags };
}

/** Resolve the address to report on (watch-only flag wins; else keystore key). */
function resolveTarget(f: Args): { address: string | null; label: string | null; scriptPubKey: string | null } {
  if (f.flags.address) {
    return { address: f.flags.address, label: null, scriptPubKey: scriptPubKeyFromAddress(f.flags.address) };
  }

  const path = f.flags.keystore ?? process.env.JGC_KEYSTORE ?? "./wallet.keystore.json";
  if (!existsSync(path)) return { address: null, label: null, scriptPubKey: null };

  const pass = f.flags.pass ?? process.env.JGC_WALLET_PASS;
  if (!pass) {
    console.warn(`[node-status] keystore found but no passphrase — pass --address <addr> for watch-only, or --pass to unlock.`);
    return { address: null, label: null, scriptPubKey: null };
  }

  const wallet = Wallet.fromKeystore(JSON.parse(readFileSync(path, "utf8")) as KeystoreFile, pass);
  const label = f.flags.label ?? wallet.labels()[0];
  if (!label || !wallet.has(label)) return { address: null, label: null, scriptPubKey: null };
  return { address: wallet.address(label), label, scriptPubKey: p2pkhScript(wallet.publicKey(label)) };
}

/** Split a script's UTXOs into mature (spendable now) and immature coinbase. */
function scanBalances(utxo: UTXOSet, scriptPubKey: string, height: number): { mature: bigint; pending: bigint } {
  let mature = 0n;
  let pending = 0n;
  for (const { entry } of utxo.entries()) {
    if (entry.scriptPubKey !== scriptPubKey) continue;
    const immature = entry.isCoinbase && height - entry.height < COINBASE_MATURITY;
    if (immature) pending += entry.value;
    else mature += entry.value;
  }
  return { mature, pending };
}

function bootNode(datadir: string): JGCNode {
  const cfg: NodeConfig = {
    listenPort: 0, rpcPort: 0, networkMagic: 0xD9B4BEF9, maxPeers: 8,
    enableBroker: false, junctionGeneratorMode: false, dataDir: datadir,
  };
  return new JGCNode(cfg, makeGenesisBlock()); // constructor replays the store
}

async function main(): Promise<void> {
  const f = parseArgs(process.argv.slice(2));
  const target = resolveTarget(f);
  const network = f.flags.network ?? "regtest";
  const datadir = f.flags.datadir;
  const node = datadir ? bootNode(datadir) : null;
  const startedAt = Date.now();

  const provider = (): NodeStatus => {
    let height: number | null = null;
    let chain = false;
    let balanceJGC = "0";
    let pendingJGC = "0";

    if (node && target.scriptPubKey) {
      chain = true;
      height = node.getChainInfo().tipHeight;
      const { mature, pending } = scanBalances(node.getUTXOSet(), target.scriptPubKey, height + 1);
      balanceJGC = formatJGC(mature);
      pendingJGC = formatJGC(pending);
    }

    return {
      running: true,
      version: VERSION,
      network,
      startedAt,
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      height,
      chain,
      address: target.address,
      label: target.label,
      balanceJGC,
      pendingJGC,
      model: process.env.JUNCTIONING_MODEL ?? null,
    };
  };

  const handle = await startStatusServer(provider, {
    port: f.flags.port ? Number(f.flags.port) : undefined,
    host: f.flags.host,
  });

  console.log(`[node-status] serving on http://${handle.host}:${handle.port}/status`);
  console.log(`[node-status] address: ${target.address ?? "(none — pass --address or unlock a keystore)"}`);
  console.log(`[node-status] chain:   ${datadir ? `loaded from ${datadir}` : "none (balances report 0, chain:false)"}`);
  console.log(`[node-status] Ctrl-C to stop.`);

  const shutdown = (): void => {
    console.log("\n[node-status] shutting down…");
    handle.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  console.error(`[node-status] fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
