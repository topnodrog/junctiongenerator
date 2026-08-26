import {
  GENESIS_BLOCK_HASH,
  GENESIS_MESSAGE,
  GENESIS_TIMESTAMP,
  computeAuditVerdictsMerkleRoot,
  computeTransactionMerkleRoot,
  createGenesisBlock,
  hashBlockHeader,
} from "../consensus/block.js";
import { computeContributionsMerkleRoot, computeEpochRoot } from "../consensus/epoch.js";
import {
  TESTNET_GENESIS_HASH,
  TESTNET_GENESIS_MESSAGE,
  TESTNET_GENESIS_TIMESTAMP,
  TESTNET_NETWORK,
  createNetworkGenesis,
  networkGenesisHash,
} from "../config/networks.js";
import { JGCNode } from "../network/node.js";
import { makeMessage, makePeer } from "../sim/harness.js";
import { MessageType as MT, type NodeConfig } from "../types/index.js";

const GOLDEN_GENESIS_HASH = "3f02891f049982583721143d3cd81dd96faabc7e3f3ce2452540cf834b13e7ff";

function testnetConfig(): NodeConfig {
  return {
    listenPort: 0,
    rpcPort: 0,
    networkMagic: TESTNET_NETWORK.networkMagic,
    maxPeers: 8,
    enableBroker: false,
    junctionGeneratorMode: false,
    chainId: TESTNET_NETWORK.chainId,
    consensusVersion: TESTNET_NETWORK.consensusVersion,
    proofMode: TESTNET_NETWORK.proofMode,
    requireNetworkIdentity: true,
  };
}

function matchingIdentity(): Record<string, unknown> {
  return {
    version: 70015,
    startHeight: 0,
    chainId: TESTNET_NETWORK.chainId,
    genesisHash: networkGenesisHash(TESTNET_NETWORK),
    consensusVersion: TESTNET_NETWORK.consensusVersion,
    proofMode: TESTNET_NETWORK.proofMode,
  };
}

describe("canonical genesis", () => {
  test("uses the declared 2026 launch timestamp and immutable golden hash", () => {
    expect(GENESIS_TIMESTAMP).toBe(Date.UTC(2026, 5, 11) / 1000);
    expect(GENESIS_BLOCK_HASH).toBe(GOLDEN_GENESIS_HASH);
    expect(hashBlockHeader(createGenesisBlock().header)).toBe(GOLDEN_GENESIS_HASH);
  });

  test("freezes a distinct zero-premine JGTC testnet genesis", () => {
    const testnetGenesis = createNetworkGenesis(TESTNET_NETWORK);
    expect(TESTNET_NETWORK.chainId).toBe("jgtc-testnet-v2");
    expect(TESTNET_NETWORK.networkMagic).toBe(0x4a474332);
    expect(TESTNET_GENESIS_TIMESTAMP).toBe(Date.UTC(2026, 7, 20, 20, 0, 0) / 1000);
    expect(networkGenesisHash(TESTNET_NETWORK)).toBe(TESTNET_GENESIS_HASH);
    expect(testnetGenesis.header.timestamp).toBe(TESTNET_GENESIS_TIMESTAMP);
    expect(testnetGenesis.header.merkleRoot)
      .toBe(computeTransactionMerkleRoot(testnetGenesis.transactions));
    expect(testnetGenesis.transactions).toHaveLength(1);
    expect(testnetGenesis.transactions[0]!.outputs.every((output) => output.value === 0n)).toBe(true);
    expect(Buffer.from(testnetGenesis.transactions[0]!.outputs[0]!.scriptPubKey, "hex").toString("utf8"))
      .toContain(TESTNET_GENESIS_MESSAGE);

    const node = new JGCNode(testnetConfig(), testnetGenesis);
    expect([...node.getUTXOSet().entries()]).toHaveLength(0);
  });

  test("commits exactly to its transaction, compute, epoch, and audit bodies", () => {
    const genesis = createGenesisBlock();
    expect(genesis.header.merkleRoot).toBe(computeTransactionMerkleRoot(genesis.transactions));
    expect(genesis.header.computeRoot).toBe(computeContributionsMerkleRoot(genesis.computeProofs));
    expect(genesis.header.epochRoot).toBe(computeEpochRoot(genesis.epochState));
    expect(genesis.header.auditRoot).toBe(computeAuditVerdictsMerkleRoot(genesis.auditVerdicts));
    expect(Buffer.from(genesis.transactions[0]!.outputs[0]!.scriptPubKey, "hex").toString("utf8"))
      .toContain(GENESIS_MESSAGE);
  });
});

describe("public-testnet compatibility handshake", () => {
  test("advertises the complete frozen network identity", () => {
    const node = new JGCNode(testnetConfig(), createNetworkGenesis(TESTNET_NETWORK));
    const { conn, sent } = makePeer("peer-a", "127.0.0.1:20001");
    node.connectPeer(conn);
    expect(sent[0]!.type).toBe(MT.VERSION);
    expect(sent[0]!.payload).toEqual(expect.objectContaining(matchingIdentity()));
  });

  test("rejects a missing or mismatched identity before chain sync", async () => {
    const earlyDataNode = new JGCNode(testnetConfig(), createNetworkGenesis(TESTNET_NETWORK));
    const earlyDataPeer = makePeer("peer-early-data", "127.0.0.1:20005");
    earlyDataNode.connectPeer(earlyDataPeer.conn);
    await earlyDataNode.processMessage("peer-early-data", makeMessage(MT.BLOCK, {}));
    expect(earlyDataNode.peerCount()).toBe(0);

    const missingNode = new JGCNode(testnetConfig(), createNetworkGenesis(TESTNET_NETWORK));
    const missingPeer = makePeer("peer-missing", "127.0.0.1:20002");
    missingNode.connectPeer(missingPeer.conn);
    await missingNode.processMessage("peer-missing", makeMessage(MT.VERSION, { startHeight: 99 }));
    expect(missingNode.peerCount()).toBe(0);
    expect(missingPeer.sent.some(message => message.type === MT.GETHEADERS)).toBe(false);

    const mismatchNode = new JGCNode(testnetConfig(), createNetworkGenesis(TESTNET_NETWORK));
    const mismatchPeer = makePeer("peer-mismatch", "127.0.0.1:20003");
    mismatchNode.connectPeer(mismatchPeer.conn);
    await mismatchNode.processMessage("peer-mismatch", makeMessage(MT.VERSION, {
      ...matchingIdentity(),
      chainId: "some-other-chain",
      startHeight: 99,
    }));
    expect(mismatchNode.peerCount()).toBe(0);
    expect(mismatchPeer.sent.some(message => message.type === MT.GETHEADERS)).toBe(false);
  });

  test("accepts an exact identity and completes the handshake", async () => {
    const node = new JGCNode(testnetConfig(), createNetworkGenesis(TESTNET_NETWORK));
    const { conn, sent } = makePeer("peer-ok", "127.0.0.1:20004");
    node.connectPeer(conn);
    await node.processMessage("peer-ok", makeMessage(MT.VERSION, matchingIdentity()));
    expect(node.peerCount()).toBe(1);
    expect(sent.some(message => message.type === MT.VERACK)).toBe(true);
    expect(sent.some(message => message.type === MT.GETADDR)).toBe(true);
  });
});
