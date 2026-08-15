import { afterEach, describe, expect, it } from "@jest/globals";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { TESTNET_NETWORK, createNetworkGenesis } from "../config/networks.js";
import { quantumGenerateKeyPair } from "../crypto/pq.js";
import { DesignatedBlockProducer } from "../network/designated-producer.js";
import { JGCNode } from "../network/node.js";
import {
  addressBalance,
  explorerSnapshot,
  TestnetFaucet,
} from "../network/public-testnet-api.js";
import { startStatusServer } from "../network/status-server.js";
import { Wallet } from "../wallet/wallet.js";
import {
  loadOrCreateTestnetParticipantIdentity,
  TestnetParticipant,
} from "../miner/testnet-participant.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const path = mkdtempSync(join(tmpdir(), "jgc-public-api-"));
  tempDirs.push(path);
  return path;
}

function node(): JGCNode {
  return new JGCNode({
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
  }, createNetworkGenesis(TESTNET_NETWORK));
}

afterEach(() => {
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("public testnet explorer and faucet", () => {
  it("keeps one persistent participation identity across restarts", () => {
    const path = join(tempDir(), "participant.json");
    const first = loadOrCreateTestnetParticipantIdentity(path);
    const second = loadOrCreateTestnetParticipantIdentity(path);
    expect(first.address).toMatch(/^1QGC[0-9a-f]{40}$/);
    expect(second).toEqual(first);
  });

  it("advances the canonical chain from a signed pilot participation receipt", async () => {
    const testNode = node();
    const identity = loadOrCreateTestnetParticipantIdentity(join(tempDir(), "participant.json"));
    const participant = new TestnetParticipant(testNode, identity);
    const producer = new DesignatedBlockProducer(testNode);
    await participant.tick();
    expect(testNode.getChainInfo().pendingProofs).toBe(1);
    await expect(producer.tickNow()).resolves.not.toBeNull();
    expect(testNode.getChainInfo().tipHeight).toBe(1);
    expect(explorerSnapshot(testNode, producer).epoch.participants[0]).toMatchObject({
      address: identity.address,
      sharePercent: 100,
    });
  });

  it("derives explorer and faucet balances from canonical chain state", () => {
    const testNode = node();
    const producer = new DesignatedBlockProducer(testNode);
    const snapshot = explorerSnapshot(testNode, producer);

    expect(snapshot.network).toBe("jgc-testnet-v3");
    expect(snapshot.height).toBe(0);
    expect(snapshot.recentBlocks).toHaveLength(1);
    expect(snapshot.recentBlocks[0]?.height).toBe(0);
    expect(snapshot.health).toBe("waiting");
    expect(addressBalance(testNode, snapshot.faucet.address)).toMatchObject({
      balanceJGC: "1000000",
      pendingJGC: "0",
      asOfHeight: 0,
    });
  });

  it("queues a real testnet transaction and persists the faucet cooldown", async () => {
    const testNode = node();
    const recipient = Wallet.create();
    const address = recipient.importKey(
      "recipient",
      quantumGenerateKeyPair("91".repeat(32)).privateKey,
      quantumGenerateKeyPair("91".repeat(32)).publicKey,
    );
    const path = join(tempDir(), "faucet.json");
    const faucet = new TestnetFaucet(testNode, path);

    const claim = await faucet.claim(address);
    expect(claim).toMatchObject({ address, amountJGC: "100", status: "pending" });
    expect(testNode.getMempool()).toHaveLength(1);

    const restored = new TestnetFaucet(testNode, path);
    await expect(restored.claim(address)).rejects.toThrow("last 24 hours");
  });

  it("serves only the narrow public routes alongside private status", async () => {
    const testNode = node();
    const producer = new DesignatedBlockProducer(testNode);
    const handle = await startStatusServer(() => ({
      running: true,
      version: "test",
      network: TESTNET_NETWORK.chainId,
      startedAt: Date.now(),
      uptimeSec: 0,
      height: 0,
      peerCount: 0,
      chain: true,
      address: null,
      label: null,
      balanceJGC: "0",
      pendingJGC: "0",
      model: null,
    }), {
      host: "127.0.0.1",
      port: 0,
      publicApi: {
        explorer: () => explorerSnapshot(testNode, producer),
        balance: (address) => addressBalance(testNode, address),
        faucet: async () => { throw new Error("disabled in route test"); },
      },
    });

    try {
      const response = await fetch(`http://127.0.0.1:${handle.port}/explorer`);
      expect(response.status).toBe(200);
      expect((await response.json() as { height: number }).height).toBe(0);
      expect((await fetch(`http://127.0.0.1:${handle.port}/unknown`)).status).toBe(404);
    } finally {
      await handle.close();
    }
  });
});
