/**
 * Safe public-testnet node launcher.
 *
 * Defaults bind both services to loopback. Operators must explicitly pass
 * --host 0.0.0.0 before accepting inbound peers; this keeps the development
 * JSON transport off the public internet by default.
 */
import type { NodeConfig } from "../types/index.js";
import { JGCNode } from "../network/node.js";
import { startP2PServer, maintainPeers, type PeerLinks, type P2PServer } from "../network/transport.js";
import { startStatusServer, type NodeStatus, type StatusServerHandle } from "../network/status-server.js";
import {
  createNetworkGenesis,
  TESTNET_FAUCET_ADDRESS,
  TESTNET_NETWORK,
} from "../config/networks.js";
import { hashBlockHeader } from "../consensus/block.js";
import { setQuantumVerifierMode } from "../crypto/pq.js";
import { DesignatedBlockProducer } from "../network/designated-producer.js";
import { parseTestnetOptions } from "../config/testnet-options.js";
import { join } from "path";
import {
  addressBalance,
  explorerSnapshot,
  TestnetFaucet,
} from "../network/public-testnet-api.js";
import {
  loadOrCreateTestnetParticipantIdentity,
  TestnetParticipant,
} from "../miner/testnet-participant.js";

const VERSION = "0.1.0";

async function main(): Promise<void> {
  const opts = parseTestnetOptions(process.argv.slice(2));
  // The local testnet currently transports research receipts. Signatures and
  // all non-proof consensus checks remain enforced, while production forbids
  // enabling this simulation-only proof mode.
  setQuantumVerifierMode("simnet");
  console.warn("[JGC testnet] simulation receipts enabled; no production proof-of-compute rewards");

  const genesis = createNetworkGenesis(TESTNET_NETWORK);
  const config: NodeConfig = {
    listenPort: opts.port,
    rpcPort: opts.statusPort,
    networkMagic: TESTNET_NETWORK.networkMagic,
    maxPeers: 32,
    enableBroker: false,
    junctionGeneratorMode: false,
    dataDir: opts.dataDir,
    advertiseUrl: opts.advertiseUrl,
    chainId: TESTNET_NETWORK.chainId,
    consensusVersion: TESTNET_NETWORK.consensusVersion,
    proofMode: TESTNET_NETWORK.proofMode,
    requireNetworkIdentity: true,
  };
  const node = new JGCNode(config, genesis);
  const producer = new DesignatedBlockProducer(node, opts.blockIntervalSec);
  const faucet = new TestnetFaucet(node, join(opts.dataDir, "faucet-claims.json"));
  const participant = opts.participate
    ? new TestnetParticipant(
      node,
      loadOrCreateTestnetParticipantIdentity(join(opts.dataDir, "participant-identity.json")),
    )
    : undefined;
  const startedAt = Date.now();

  let p2p: P2PServer | undefined;
  let links: PeerLinks | undefined;
  let status: StatusServerHandle | undefined;

  try {
    p2p = await startP2PServer(node, opts.port, opts.host);
    links = maintainPeers(node, opts.seeds, { maxOutbound: 8 });
    status = await startStatusServer((): NodeStatus => {
      const chain = node.getChainInfo();
      const producerStatus = producer.getStatus();
      return {
        running: true,
        version: VERSION,
        network: TESTNET_NETWORK.chainId,
        startedAt,
        uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
        height: chain.tipHeight,
        peerCount: chain.peerCount,
        chain: true,
        address: null,
        label: null,
        balanceJGC: "0",
        pendingJGC: "0",
        model: process.env.JUNCTIONING_MODEL ?? null,
        producer: {
          enabled: opts.produce,
          producedBlocks: producerStatus.producedBlocks,
          lastProducedHeight: producerStatus.lastProducedHeight,
          lastError: producerStatus.lastError,
          waitingForTFLOPS: producerStatus.waitingForTFLOPS,
        },
      };
    }, {
      host: opts.statusHost,
      port: opts.statusPort,
      publicApi: {
        explorer: () => explorerSnapshot(node, producer),
        balance: (address) => addressBalance(node, address),
        faucet: (address) => {
          if (!opts.produce) throw new Error("faucet is available only on the designated producer");
          return faucet.claim(address);
        },
      },
    });

    console.log(`[testnet] network: ${TESTNET_NETWORK.chainId} (${TESTNET_NETWORK.proofMode})`);
    console.log(`[testnet] genesis: ${hashBlockHeader(genesis.header)}`);
    console.log(`[testnet] data:    ${opts.dataDir}`);
    console.log(`[testnet] p2p:     ws://${opts.host}:${p2p.port}`);
    console.log(`[testnet] status:  http://${status.host}:${status.port}/status`);
    console.log(`[testnet] seeds:   ${opts.seeds.length ? opts.seeds.join(", ") : "(none; standalone node)"}`);
    console.log(`[testnet] faucet:  ${TESTNET_FAUCET_ADDRESS}`);
    console.log(`[testnet] explorer: http://${status.host}:${status.port}/explorer`);
    console.log(`[testnet] role:    ${opts.produce ? `designated producer (${opts.blockIntervalSec}s interval)` : "validator/back-checker"}`);
    if (participant) console.log(`[testnet] participant: ${participant.address} (equal-weight pilot receipts)`);
    if (opts.produce) producer.start();
    participant?.start();
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
    participant?.stop();
    producer.stop();
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
