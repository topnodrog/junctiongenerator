import { afterEach, describe, expect, it } from "@jest/globals";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { TESTNET_NETWORK, createNetworkGenesis } from "../config/networks.js";
import { quantumAddressFromPublicKey, quantumGenerateKeyPair } from "../crypto/pq.js";
import { DesignatedBlockProducer } from "../network/designated-producer.js";
import { JGCNode } from "../network/node.js";
import {
  addressBalance,
  explorerSnapshot,
} from "../network/public-testnet-api.js";
import { startStatusServer } from "../network/status-server.js";
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

describe("public JGTC testnet explorer", () => {
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

  it("reports zero-premine issuance and balances from canonical chain state", () => {
    const testNode = node();
    const producer = new DesignatedBlockProducer(testNode);
    const snapshot = explorerSnapshot(testNode, producer);

    expect(snapshot.network).toBe("jgtc-testnet-v1");
    expect(snapshot.currencySymbol).toBe("JGTC");
    expect(snapshot.targetBlockIntervalSec).toBe(600);
    expect(snapshot.height).toBe(0);
    expect(snapshot.recentBlocks).toHaveLength(1);
    expect(snapshot.recentBlocks[0]?.height).toBe(0);
    expect(snapshot.health).toBe("waiting");
    expect(snapshot.issuance).toEqual({
      preminedJGTC: "0",
      genesisSpendableSupplyJGTC: "0",
      settlementIntervalBlocks: 144,
      settlementsCompleted: 0,
      utxoSupplyJGTC: "0",
      pendingEmissionJGTC: "50",
      accountedSupplyJGTC: "50",
      expectedSupplyJGTC: "50",
      supplyConserved: true,
    });
    expect(snapshot.epoch).toMatchObject({ blocksRemaining: 143, nextSettlementHeight: 143 });
    const key = quantumGenerateKeyPair("91".repeat(32));
    expect(addressBalance(testNode, quantumAddressFromPublicKey(key.publicKey))).toMatchObject({
      currencySymbol: "JGTC",
      balanceJGTC: "0",
      pendingJGTC: "0",
      asOfHeight: 0,
    });
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
