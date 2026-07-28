/**
 * CI-only testnet contributor.
 *
 * This process gossips deterministic, signed simulation receipts until the
 * requested smoke-test height is reached. It is deliberately locked behind an
 * explicit environment flag and must never be used as evidence of real useful
 * computation.
 */
import { createNetworkGenesis, TESTNET_NETWORK } from "../config/networks.js";
import { setQuantumVerifierMode } from "../crypto/pq.js";
import { JGCNode } from "../network/node.js";
import { maintainPeers } from "../network/transport.js";
import {
  DEFAULT_MINERS,
  makeContribution,
  makeMessage,
  makePeer,
} from "../sim/harness.js";
import { MessageType as MT, type NodeConfig } from "../types/index.js";

const ENABLE_FLAG = "JGC_ENABLE_SMOKE_CONTRIBUTOR";

function positiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

async function statusHeight(url: string): Promise<number> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`status endpoint returned HTTP ${response.status}`);
  const body = await response.json() as { height?: unknown };
  if (!Number.isInteger(body.height) || (body.height as number) < 0) {
    throw new Error("status endpoint returned an invalid height");
  }
  return body.height as number;
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  description: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for ${description}`);
}

async function main(): Promise<void> {
  if (process.env[ENABLE_FLAG] !== "1") {
    throw new Error(`${ENABLE_FLAG}=1 is required; this command is CI-only`);
  }

  const seed = process.env.JGC_SMOKE_SEED ?? "ws://producer:19444";
  const statusUrl = process.env.JGC_SMOKE_STATUS ?? "http://producer:7777/status";
  const targetHeight = positiveInteger(
    process.env.JGC_SMOKE_TARGET_HEIGHT,
    1,
    "JGC_SMOKE_TARGET_HEIGHT",
  );
  const timeoutSec = positiveInteger(process.env.JGC_SMOKE_TIMEOUT_SEC, 90, "JGC_SMOKE_TIMEOUT_SEC");
  const timeoutMs = timeoutSec * 1_000;

  setQuantumVerifierMode("simnet");
  const config: NodeConfig = {
    listenPort: 0,
    rpcPort: 0,
    networkMagic: TESTNET_NETWORK.networkMagic,
    maxPeers: 4,
    enableBroker: false,
    junctionGeneratorMode: false,
    chainId: TESTNET_NETWORK.chainId,
    consensusVersion: TESTNET_NETWORK.consensusVersion,
    proofMode: TESTNET_NETWORK.proofMode,
    requireNetworkIdentity: false,
  };
  const node = new JGCNode(config, createNetworkGenesis(TESTNET_NETWORK));
  const localMiner = makePeer("ci-smoke-miner", "ci-smoke-miner");
  node.connectPeer(localMiner.conn);
  const links = maintainPeers(node, [seed], { maxOutbound: 1, retryMs: 500 });

  try {
    await waitFor(() => node.peerCount() >= 2, timeoutMs, "the producer P2P connection");
    // VERSION is the first frame sent on the ordered WebSocket stream. Give the
    // producer a moment to verify it before sending chain data behind it.
    await new Promise((resolve) => setTimeout(resolve, 500));

    while (await statusHeight(statusUrl) < targetHeight) {
      const height = await statusHeight(statusUrl) + 1;
      for (const miner of DEFAULT_MINERS) {
        await node.processMessage(
          localMiner.conn.info.peerId,
          makeMessage(MT.COMPUTE_PROOF, makeContribution(miner, height)),
        );
      }
      await waitFor(
        async () => await statusHeight(statusUrl) >= height,
        timeoutMs,
        `producer height ${height}`,
      );
    }

    console.log(`[smoke-contributor] producer reached height ${targetHeight}`);
  } finally {
    links.close();
    node.disconnectPeer(localMiner.conn.info.peerId);
  }
}

main().catch((error: unknown) => {
  console.error(`[smoke-contributor] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
