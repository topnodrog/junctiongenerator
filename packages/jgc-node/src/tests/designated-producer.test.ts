import { existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createGenesisBlock } from "../consensus/block.js";
import { DesignatedBlockProducer } from "../network/designated-producer.js";
import { JGCNode } from "../network/node.js";
import {
  DEFAULT_MINERS,
  makeContribution,
  makeMessage,
  makePeer,
} from "../sim/harness.js";
import { MessageType as MT, type NodeConfig } from "../types/index.js";

function config(dataDir?: string): NodeConfig {
  return {
    listenPort: 0,
    rpcPort: 0,
    networkMagic: 0x4a474354,
    maxPeers: 8,
    enableBroker: false,
    junctionGeneratorMode: false,
    dataDir,
  };
}

async function addProofs(node: JGCNode, peerId: string, height: number): Promise<void> {
  for (const miner of DEFAULT_MINERS) {
    await node.processMessage(peerId, makeMessage(MT.COMPUTE_PROOF, makeContribution(miner, height)));
  }
}

describe("designated block producer", () => {
  test("waits for enough work, then validates and connects a live-state template", async () => {
    const node = new JGCNode(config(), createGenesisBlock());
    const peer = makePeer("miner", "127.0.0.1:21001");
    node.connectPeer(peer.conn);
    const producer = new DesignatedBlockProducer(node, 30);

    expect(await producer.tickNow()).toBeNull();
    expect(producer.getStatus().waitingForTFLOPS).toBeGreaterThan(0);

    await addProofs(node, "miner", 1);
    const block = await producer.tickNow();
    expect(block?.header.height).toBe(1);
    expect(node.getChainInfo().tipHeight).toBe(1);
    expect(producer.getStatus()).toEqual(expect.objectContaining({
      producedBlocks: 1,
      lastProducedHeight: 1,
      lastError: null,
    }));
  });

  test("continues from replayed chainstate without a separate producer database", async () => {
    const dataDir = join(tmpdir(), `jgc-producer-${process.pid}-${Date.now()}`);
    try {
      const first = new JGCNode(config(dataDir), createGenesisBlock());
      const firstPeer = makePeer("miner-a", "127.0.0.1:21002");
      first.connectPeer(firstPeer.conn);
      await addProofs(first, "miner-a", 1);
      expect((await new DesignatedBlockProducer(first).tickNow())?.header.height).toBe(1);

      const restarted = new JGCNode(config(dataDir), createGenesisBlock());
      expect(restarted.getChainInfo().tipHeight).toBe(1);
      const secondPeer = makePeer("miner-b", "127.0.0.1:21003");
      restarted.connectPeer(secondPeer.conn);
      await addProofs(restarted, "miner-b", 2);
      expect((await new DesignatedBlockProducer(restarted).tickNow())?.header.height).toBe(2);
      expect(restarted.getChainInfo().tipHeight).toBe(2);
    } finally {
      if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
