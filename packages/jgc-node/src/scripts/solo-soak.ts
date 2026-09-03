/**
 * Run a repeatable, operator-only multi-node soak on simnet.
 *
 * This deliberately uses the real WebSocket transport and node validation
 * pipeline, but the simnet verifier and zero-value transactions. It creates a
 * five-node line, mines on node A, partitions the tail, then reconnects it and
 * verifies catch-up. The resulting JSON is evidence for local rehearsal only;
 * it cannot satisfy the independent-security or production-proof gates.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { NodeConfig } from "../types/index.js";
import { JGCNode } from "../network/node.js";
import { loadVerifierWasm } from "../crypto/zkp.js";
import { setQuantumVerifierMode } from "../crypto/pq.js";
import { startP2PServer, connectToPeers, type P2PServer, type PeerLinks } from "../network/transport.js";
import { makeGenesisBlock, makePeer, BlockProducer, mineBlocks } from "../sim/harness.js";

const DEFAULT_NODES = 5;
const DEFAULT_BLOCKS = 1000;
const DEFAULT_BASE_PORT = 29500;
const MAX_NODES = 9;
const MAX_BLOCKS = 100_000;

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function positiveInteger(raw: string | undefined, fallback: number, name: string, maximum: number): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be a positive integer <= ${maximum}`);
  }
  return value;
}

const nodeCount = positiveInteger(flag("--nodes"), DEFAULT_NODES, "--nodes", MAX_NODES);
const blockCount = positiveInteger(flag("--blocks"), DEFAULT_BLOCKS, "--blocks", MAX_BLOCKS);
const basePort = positiveInteger(flag("--base-port"), DEFAULT_BASE_PORT, "--base-port", 65_000 - MAX_NODES);
const outputPath = resolve(flag("--output") ?? ".tmp/solo-soak/soak-current.json");

const sleep = (milliseconds: number): Promise<void> => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));

async function waitFor(condition: () => boolean, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await sleep(50);
  }
  return condition();
}

function config(port: number): NodeConfig {
  return {
    listenPort: port,
    rpcPort: port - 1000,
    networkMagic: 0xDAB5BFFA,
    maxPeers: 32,
    enableBroker: false,
    junctionGeneratorMode: false,
  };
}

async function main(): Promise<void> {
  setQuantumVerifierMode("simnet");
  await loadVerifierWasm({ mode: "simnet" });
  const genesis = makeGenesisBlock();
  const nodes = Array.from({ length: nodeCount }, (_, index) => new JGCNode(config(basePort + index), genesis));
  const servers: P2PServer[] = [];
  const links: PeerLinks[] = [];
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const url = (port: number): string => `ws://127.0.0.1:${port}`;

  try {
    for (let index = 0; index < nodes.length; index++) {
      servers.push(await startP2PServer(nodes[index]!, basePort + index));
    }
    for (let index = 1; index < nodes.length; index++) {
      links.push(connectToPeers(nodes[index]!, [url(basePort + index - 1)], { retryMs: 250 }));
    }
    await sleep(500);

    const miner = makePeer("solo-soak-miner", "inproc");
    nodes[0]!.connectPeer(miner.conn);
    const producer = new BlockProducer(genesis);
    const firstSegment = Math.max(1, Math.floor(blockCount / 2));
    await mineBlocks(nodes[0]!, miner.conn.info.peerId, producer, firstSegment);
    const firstTip = nodes[0]!.getChainInfo().tipHash;
    const firstSegmentSynced = await waitFor(() => nodes.every(node => {
      const info = node.getChainInfo();
      return info.tipHeight === firstSegment && info.tipHash === firstTip;
    }));

    let partitionedNodeHeight = firstSegment;
    let reconnectSynced = true;
    let partitioned = false;
    if (blockCount > firstSegment && links.length > 0) {
      const tailLink = links.at(-1)!;
      const tailNode = nodes.at(-1)!;
      tailLink.close();
      partitioned = true;
      await mineBlocks(nodes[0]!, miner.conn.info.peerId, producer, blockCount - firstSegment);
      const connectedTip = nodes[0]!.getChainInfo().tipHash;
      const connectedNodesSynced = await waitFor(() => nodes.slice(0, -1).every(node => {
        const info = node.getChainInfo();
        return info.tipHeight === blockCount && info.tipHash === connectedTip;
      }));
      partitionedNodeHeight = tailNode.getChainInfo().tipHeight;
      if (!connectedNodesSynced || partitionedNodeHeight >= blockCount) {
        throw new Error("partition did not isolate the tail node");
      }
      links[links.length - 1] = connectToPeers(tailNode, [url(basePort + nodeCount - 2)], { retryMs: 250 });
      reconnectSynced = await waitFor(() => {
        const info = tailNode.getChainInfo();
        return info.tipHeight === blockCount && info.tipHash === connectedTip;
      });
    }

    const finalTips = nodes.map(node => node.getChainInfo());
    const finalTipHash = finalTips[0]!.tipHash;
    const allNodesAgree = finalTips.every(info => info.tipHeight === blockCount && info.tipHash === finalTipHash);
    const evidence = {
      schemaVersion: "jgc-solo-soak/v1",
      mode: "simnet",
      startedAt,
      completedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedMs,
      nodes: nodeCount,
      blocksRequested: blockCount,
      blocksProduced: blockCount,
      topology: "line",
      partition: {
        exercised: partitioned,
        isolatedNodeHeight: partitionedNodeHeight,
        firstSegmentSynced,
        reconnectSynced,
      },
      allNodesAgree,
      finalTips,
      releaseBoundary: "Local simnet evidence only; production proof, economics, fork-choice, and independent review remain required.",
    };
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    console.log(`[SoloSoak] ${allNodesAgree ? "PASS" : "FAIL"}: ${nodeCount} nodes, ${blockCount} blocks`);
    console.log(`[SoloSoak] Wrote evidence to ${outputPath}`);
    if (!allNodesAgree || !firstSegmentSynced || !reconnectSynced) process.exitCode = 1;
  } finally {
    for (const link of links) link.close();
    for (const server of servers) await server.close();
  }
}

main().catch((error: unknown) => {
  console.error("[SoloSoak] FATAL:", error);
  process.exitCode = 1;
});
