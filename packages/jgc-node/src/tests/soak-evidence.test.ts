import { createNetworkGenesis, TESTNET_NETWORK } from "../config/networks.js";
import { DesignatedBlockProducer } from "../network/designated-producer.js";
import { JGCNode } from "../network/node.js";
import { explorerSnapshot } from "../network/public-testnet-api.js";
import { evaluateExplorerEvidence, parseExplorerEvidence } from "../ops/soak-evidence.js";
import type { NodeConfig } from "../types/index.js";

function node(): JGCNode {
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
  return new JGCNode(config, createNetworkGenesis(TESTNET_NETWORK));
}

describe("public soak evidence", () => {
  test("reports canonical zero-premine supply conservation", () => {
    const testNode = node();
    const snapshot = explorerSnapshot(testNode, new DesignatedBlockProducer(testNode));

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
    expect(evaluateExplorerEvidence(snapshot)).toMatchObject({
      status: "warn",
      summary: { failures: 0, warnings: 2 },
      observed: { height: 0, settlementsCompleted: 0, participantCount: 0 },
    });
  });

  test("fails evidence when accounted and scheduled supply diverge", () => {
    const testNode = node();
    const snapshot = explorerSnapshot(testNode, new DesignatedBlockProducer(testNode));
    snapshot.issuance.accountedSupplyJGTC = "49";
    snapshot.issuance.supplyConserved = false;

    const report = evaluateExplorerEvidence(snapshot);
    expect(report.status).toBe("fail");
    expect(report.checks).toContainEqual(expect.objectContaining({
      id: "issuance.conservation",
      severity: "fail",
    }));
  });

  test("accepts a freshly reset epoch at a settlement boundary", () => {
    const testNode = node();
    const snapshot = explorerSnapshot(testNode, new DesignatedBlockProducer(testNode));
    snapshot.height = 143;
    snapshot.epoch.blockIndex = 0;
    snapshot.epoch.blocksRemaining = 144;
    snapshot.epoch.nextSettlementHeight = 287;
    snapshot.issuance.settlementsCompleted = 1;

    expect(evaluateExplorerEvidence(snapshot).checks).toContainEqual(expect.objectContaining({
      id: "epoch.progress",
      severity: "pass",
    }));
  });

  test("rejects incomplete public responses before recording evidence", () => {
    expect(() => parseExplorerEvidence({ network: TESTNET_NETWORK.chainId }))
      .toThrow("explorer.epoch must be a JSON object");
  });
});
