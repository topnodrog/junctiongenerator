/**
 * Safe public-testnet node launcher.
 *
 * Defaults bind both services to loopback. Operators must explicitly pass
 * --host 0.0.0.0 before accepting inbound peers; this keeps the development
 * JSON transport off the public internet by default.
 */
import { resolve } from "path";
import type { NodeConfig } from "../types/index.js";
import { JGCNode } from "../network/node.js";
import { startP2PServer, maintainPeers, type PeerLinks, type P2PServer } from "../network/transport.js";
import { startStatusServer, type NodeStatus, type StatusServerHandle } from "../network/status-server.js";
import { makeGenesisBlock } from "../sim/harness.js";
import { hashBlockHeader } from "../consensus/block.js";
import { setQuantumVerifierMode } from "../crypto/pq.js";

const VERSION = "0.1.0";
const TESTNET_MAGIC = 0x4a474354; // ASCII "JGCT"

interface Options {
  host: string;
  port: number;
  statusHost: string;
  statusPort: number;
  dataDir: string;
  advertiseUrl?: string;
  seeds: string[];
}

function value(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function positivePort(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined) return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`${name} must be an integer from 0 to 65535`);
  }
  return port;
}

export function parseTestnetOptions(argv: string[]): Options {
  const seedValues = argv
    .map((arg, i) => arg === "--seed" ? argv[i + 1] : undefined)
    .filter((seed): seed is string => Boolean(seed));

  return {
    host: value(argv, "--host") ?? "127.0.0.1",
    port: positivePort(value(argv, "--port"), 19444, "--port"),
    statusHost: value(argv, "--status-host") ?? "127.0.0.1",
    statusPort: positivePort(value(argv, "--status-port"), 7777, "--status-port"),
    dataDir: resolve(value(argv, "--datadir") ?? "./data/testnet"),
    advertiseUrl: value(argv, "--advertise"),
    seeds: seedValues,
  };
}

async function main(): Promise<void> {
  const opts = parseTestnetOptions(process.argv.slice(2));
  setQuantumVerifierMode("strict");

  const genesis = makeGenesisBlock();
  const config: NodeConfig = {
    listenPort: opts.port,
    rpcPort: opts.statusPort,
    networkMagic: TESTNET_MAGIC,
    maxPeers: 32,
    enableBroker: false,
    junctionGeneratorMode: false,
    dataDir: opts.dataDir,
    advertiseUrl: opts.advertiseUrl,
  };
  const node = new JGCNode(config, genesis);
  const startedAt = Date.now();

  let p2p: P2PServer | undefined;
  let links: PeerLinks | undefined;
  let status: StatusServerHandle | undefined;

  try {
    p2p = await startP2PServer(node, opts.port, opts.host);
    links = maintainPeers(node, opts.seeds, { maxOutbound: 8 });
    status = await startStatusServer((): NodeStatus => {
      const chain = node.getChainInfo();
      return {
        running: true,
        version: VERSION,
        network: "jgc-testnet-v1",
        startedAt,
        uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
        height: chain.tipHeight,
        chain: true,
        address: null,
        label: null,
        balanceJGC: "0",
        pendingJGC: "0",
        model: process.env.JUNCTIONING_MODEL ?? null,
      };
    }, { host: opts.statusHost, port: opts.statusPort });

    console.log(`[testnet] network: jgc-testnet-v1 (strict post-quantum verification)`);
    console.log(`[testnet] genesis: ${hashBlockHeader(genesis.header)}`);
    console.log(`[testnet] data:    ${opts.dataDir}`);
    console.log(`[testnet] p2p:     ws://${opts.host}:${p2p.port}`);
    console.log(`[testnet] status:  http://${status.host}:${status.port}/status`);
    console.log(`[testnet] seeds:   ${opts.seeds.length ? opts.seeds.join(", ") : "(none; standalone node)"}`);
  } catch (error) {
    links?.close();
    await status?.close();
    await p2p?.close();
    throw error;
  }

  let stopping = false;
  const shutdown = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.log("\n[testnet] shutting down...");
    links?.close();
    await status?.close();
    await p2p?.close();
  };

  process.once("SIGINT", () => void shutdown().then(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown().then(() => process.exit(0)));
}

main().catch((error: unknown) => {
  console.error(`[testnet] fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
