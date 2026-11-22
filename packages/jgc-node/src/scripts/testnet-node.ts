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
} from "../network/public-testnet-api.js";
import {
  loadOrCreateTestnetParticipantIdentity,
  TestnetParticipant,
} from "../miner/testnet-participant.js";
import { prepareTestnetGenesisReset } from "../config/testnet-reset.js";
import { diagnose, enroll } from "../ops/system-card.js";
import { startWorkload } from "../ops/soak-workload.js";
import { terminalRecoveryPrompts } from "../wallet/terminal-prompts.js";
import { appendFileSync } from "node:fs";

const VERSION = "0.1.0";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const withCard = argv.includes("--system-card");
  const opts = parseTestnetOptions(argv, withCard ? { ...process.env,
    JGC_DATA_DIR: process.env.JGC_DATA_DIR ?? "./data/card-soak" } : process.env);
  let enrollment: Awaited<ReturnType<typeof enroll>> | undefined;
  if (withCard) {
    if (!opts.participate || opts.produce || !opts.seeds.length || opts.host !== "127.0.0.1" ||
        opts.statusHost !== "127.0.0.1" || opts.publicApiPort !== undefined || opts.advertiseUrl ||
        process.env.JGC_RESET_TO_GENESIS || process.env.JGC_RESET_ID) {
      throw new Error("System-card enrollment requires seeds, a loopback participant, and no producer, public API or reset");
    }
    const keyArg = argv.indexOf("--keystore");
    const keystore = keyArg >= 0 ? argv[keyArg + 1] : undefined;
    if (!keystore || keystore.startsWith("--")) throw new Error("Supply --keystore with your dedicated testnet recovery wallet path");
    enrollment = await enroll(terminalRecoveryPrompts(), opts.dataDir, keystore, opts.seeds, diagnose());
  }
  // The local testnet currently transports research receipts. Signatures and
  // all non-proof consensus checks remain enforced, while production forbids
  // enabling this simulation-only proof mode.
  setQuantumVerifierMode("simnet");
  console.warn("[JGTC testnet] simulation receipts enabled; monetary and settlement rules match JGC, but useful-compute proof soundness is not production-ready");

  const genesis = createNetworkGenesis(TESTNET_NETWORK);
  const genesisHash = hashBlockHeader(genesis.header);
  const reset = prepareTestnetGenesisReset(opts.dataDir, genesisHash);
  if (reset) {
    console.warn(
      reset.archiveDir
        ? `[JGTC testnet] archived ${reset.movedFiles.length} old state file(s) at ${reset.archiveDir}`
        : "[JGTC testnet] recorded fresh-genesis reset; no previous chain state was present",
    );
  }
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
  const participant = opts.participate
    ? new TestnetParticipant(
      node,
      enrollment?.identity ?? loadOrCreateTestnetParticipantIdentity(join(opts.dataDir, "participant-identity.json")),
    )
    : undefined;
  const role = opts.produce ? "designated-producer" : participant ? "participant" : "back-checker";
  const startedAt = Date.now();

  let p2p: P2PServer | undefined;
  let links: PeerLinks | undefined;
  let status: StatusServerHandle | undefined;
  let publicApi: StatusServerHandle | undefined;

  const explorerApi = {
    explorer: () => explorerSnapshot(node, producer),
    balance: (address: string) => addressBalance(node, address),
  };

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
        address: participant?.address ?? null,
        label: null,
        balanceJGC: "0",
        pendingJGC: "0",
        model: process.env.JUNCTIONING_MODEL ?? null,
        role,
        participating: Boolean(participant),
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
      statusToken: opts.statusToken,
      allowPrivateStatusOnPublicBind: opts.allowPrivateStatusOnPublicBind,
      allowedOrigins: opts.allowedOrigins,
      // Backwards compatibility: without a dedicated public listener, keep the
      // narrow public routes on the private loopback status server.
      publicApi: opts.publicApiPort === undefined ? explorerApi : undefined,
    });
    if (opts.publicApiPort !== undefined) {
      publicApi = await startStatusServer((): NodeStatus => {
        throw new Error("private status is not available on the public API listener");
      }, {
        host: opts.publicApiHost ?? "127.0.0.1",
        port: opts.publicApiPort,
        publicApi: explorerApi,
        publicApiOnly: true,
        allowedOrigins: opts.allowedOrigins,
      });
    }

    console.log(`[testnet] network: ${TESTNET_NETWORK.chainId} (${TESTNET_NETWORK.proofMode})`);
    console.log(`[testnet] genesis: ${genesisHash}`);
    console.log(`[testnet] data:    ${opts.dataDir}`);
    console.log(`[testnet] p2p:     ws://${opts.host}:${p2p.port}`);
    console.log(`[testnet] status:  http://${status.host}:${status.port}/status`);
    console.log(`[testnet] seeds:   ${opts.seeds.length ? opts.seeds.join(", ") : "(none; standalone node)"}`);
    console.log(`[testnet] explorer: http://${publicApi?.host ?? status.host}:${publicApi?.port ?? status.port}/explorer`);
    if (publicApi) {
      console.log(`[testnet] private status: http://${status.host}:${status.port}/status (not routed by the public listener)`);
    }
    console.log(`[testnet] role:    ${opts.produce ? `designated producer (${opts.blockIntervalSec}s interval)` : participant ? "participant" : "validator/back-checker"}`);
    if (participant) console.log(`[testnet] participant: ${participant.address} (equal-weight pilot receipts)`);
    if (opts.produce) producer.start();
    participant?.start();
  } catch (error) {
    links?.close();
    await publicApi?.close();
    await status?.close();
    await p2p?.close();
    throw error;
  }

  let stopping = false;
  let stopWork: (() => void) | undefined;
  let observations: NodeJS.Timeout | undefined;
  function observe(event: "start" | "sample" | "stop"): void {
    if (!enrollment) return;
    const { tipHeight, tipHash, peerCount } = node.getChainInfo();
    const sample = { cardId: enrollment.id, event, at: new Date().toISOString(), network: TESTNET_NETWORK.chainId,
      genesisHash, address: enrollment.identity.address, height: tipHeight, tipHash, peerCount };
    appendFileSync(join(opts.dataDir, `observations-${enrollment.id}.jsonl`), JSON.stringify(sample) + "\n", { mode: 0o600 });
  }
  const shutdown = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    stopWork?.();
    clearInterval(observations);
    try { observe("stop"); } catch { console.error("Could not save the final soak observation"); }
    console.log("\n[testnet] shutting down...");
    participant?.stop();
    producer.stop();
    links?.close();
    await publicApi?.close();
    await status?.close();
    await p2p?.close();
  };

  process.once("SIGINT", () => void shutdown().then(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown().then(() => process.exit(0)));
  if (enrollment) {
    const finish = (error?: Error) => {
      if (error) console.error(error.message);
      void shutdown().then(() => process.exit(error ? 1 : 0));
    };
    const sample = (event: "start" | "sample") => {
      try { observe(event); } catch { finish(new Error("Could not record soak evidence")); }
    };
    sample("start");
    if (stopping) return;
    observations = setInterval(() => sample("sample"), 300_000);
    stopWork = startWorkload(enrollment.selected, finish);
  }
}

main().catch((error: unknown) => {
  console.error(`[testnet] fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
