import { MessageType, type NodeConfig, type PeerMessage } from "../types/index.js";
import { createGenesisBlock } from "../consensus/block.js";
import { JGCNode, type PeerConnection } from "../network/node.js";
import { peerMessageSignatureHash } from "../network/wire.js";
import { AuthSession } from "../network/auth-session.js";
import { jest } from "@jest/globals";
import { startP2PServer, dialPeer } from "../network/transport.js";
import { BlockProducer, DEFAULT_MINERS, makeContribution } from "../sim/harness.js";
import {
  pqGenerateKeyPair,
  pqSignHash,
  pqVerifyHashSignature,
} from "../crypto/pq-signatures.js";

const MAGIC = 0x4a474332;
const keyPair = pqGenerateKeyPair("11".repeat(32));
const remoteKey = pqGenerateKeyPair("44".repeat(32));

function config(overrides: Partial<NodeConfig> = {}): NodeConfig {
  return {
    listenPort: 0,
    rpcPort: 0,
    networkMagic: MAGIC,
    maxPeers: 8,
    enableBroker: false,
    junctionGeneratorMode: false,
    requirePeerAuthentication: true,
    requireNetworkIdentity: true,
    chainId: "auth-rehearsal",
    consensusVersion: createGenesisBlock().header.version,
    proofMode: "simnet-receipts-v1",
    p2pPrivateKey: keyPair.privateKey,
    p2pPublicKey: keyPair.publicKey,
    ...overrides,
  };
}

function peer(sent: PeerMessage[], disconnected: { value: boolean }): PeerConnection {
  return {
    info: {
      peerId: "peer-auth",
      address: "127.0.0.1:9444",
      version: 0,
      services: 0n,
      userAgent: "test",
      startHeight: 0,
      bestBlock: "0".repeat(64),
      connectedAt: 0,
      lastSeen: 0,
      bytesSent: 0,
      bytesReceived: 0,
      inbound: false,
    },
    send: async (msg) => { sent.push(msg); },
    disconnect: () => { disconnected.value = true; },
  };
}

function signedMessage(
  type: MessageType,
  payload: unknown,
  timestamp: number,
): PeerMessage {
  const unsigned = { type, payload, timestamp, senderPublicKey: keyPair.publicKey };
  return {
    ...unsigned,
    signature: pqSignHash(
      keyPair.privateKey,
      peerMessageSignatureHash(unsigned, MAGIC),
    ),
  };
}

async function handshake(node: JGCNode, connection: PeerConnection, sent: PeerMessage[]): Promise<AuthSession> {
  const remote = new AuthSession(remoteKey.publicKey, remoteKey.privateKey, MAGIC);
  remote.open(sent[0]!);
  await node.processMessage(connection.info.peerId, remote.seal(signedMessage(MessageType.VERSION, sent[0]!.payload, Math.floor(Date.now() / 1000)))!);
  remote.open(sent[1]!);
  await node.processMessage(connection.info.peerId, remote.seal(signedMessage(MessageType.VERACK, {}, Math.floor(Date.now() / 1000)))!);
  return remote;
}

describe("authenticated P2P messages", () => {
  test("requires a complete, matching ML-DSA keypair", () => {
    expect(() => new JGCNode(
      config({ p2pPrivateKey: undefined, p2pPublicKey: undefined }),
      createGenesisBlock(),
    )).toThrow(/requires a valid ML-DSA-65/);

    const other = pqGenerateKeyPair("22".repeat(32));
    expect(() => new JGCNode(
      config({ p2pPrivateKey: other.privateKey }),
      createGenesisBlock(),
    )).toThrow(/does not match/);
  });

  test("signs outbound messages over the canonical message body", async () => {
    const node = new JGCNode(config(), createGenesisBlock());
    const sent: PeerMessage[] = [];
    const disconnected = { value: false };
    node.connectPeer(peer(sent, disconnected));
    await Promise.resolve();

    expect(sent).toHaveLength(1);
    const version = sent[0]!;
    expect(version.senderPublicKey).toBe(keyPair.publicKey);
    expect(pqVerifyHashSignature(
      version.signature,
      peerMessageSignatureHash({
        type: version.type,
        payload: version.payload,
        timestamp: version.timestamp,
        senderPublicKey: version.senderPublicKey,
      }, MAGIC),
      keyPair.publicKey,
    )).toBe(true);
    expect(disconnected.value).toBe(false);
  });

  test("disconnects peers that forge or change an authenticated message key", async () => {
    const node = new JGCNode(config(), createGenesisBlock());
    const sent: PeerMessage[] = [];
    const disconnected = { value: false };
    const connection = peer(sent, disconnected);
    node.connectPeer(connection);
    await Promise.resolve();

    const remote = await handshake(node, connection, sent);
    const now = Math.floor(Date.now() / 1000);
    const valid = remote.seal(signedMessage(MessageType.PING, { nonce: 7 }, now))!;
    await node.processMessage(connection.info.peerId, valid);
    expect(disconnected.value).toBe(false);

    await node.processMessage(connection.info.peerId, {
      ...signedMessage(MessageType.PING, { nonce: 8 }, now + 1),
      senderPublicKey: pqGenerateKeyPair("33".repeat(32)).publicKey,
    });
    expect(disconnected.value).toBe(true);
  });

  test("rejects stale and replayed signed messages", async () => {
    const node = new JGCNode(config(), createGenesisBlock());
    const sent: PeerMessage[] = [];
    const disconnected = { value: false };
    const connection = peer(sent, disconnected);
    node.connectPeer(connection);
    await Promise.resolve();

    const now = Math.floor(Date.now() / 1000);
    await node.processMessage(connection.info.peerId, signedMessage(MessageType.PING, { nonce: 1 }, now - 15 * 60 - 1));
    expect(disconnected.value).toBe(true);

    const secondNode = new JGCNode(config(), createGenesisBlock());
    const secondSent: PeerMessage[] = [];
    const secondDisconnected = { value: false };
    const secondConnection = peer(secondSent, secondDisconnected);
    secondNode.connectPeer(secondConnection);
    await Promise.resolve();
    const remote = await handshake(secondNode, secondConnection, secondSent);
    const valid = remote.seal(signedMessage(MessageType.PING, { nonce: 2 }, now))!;
    await secondNode.processMessage(secondConnection.info.peerId, valid);
    expect(secondDisconnected.value).toBe(false);
    await secondNode.processMessage(secondConnection.info.peerId, valid);
    expect(secondDisconnected.value).toBe(true);
  });

  test("does not authenticate a signed application message before VERSION", async () => {
    const node = new JGCNode(config(), createGenesisBlock());
    const disconnected = { value: false };
    const connection = peer([], disconnected);
    node.connectPeer(connection);
    await node.processMessage(connection.info.peerId, signedMessage(MessageType.PING, { nonce: 1 }, Math.floor(Date.now() / 1000)));
    expect(disconnected.value).toBe(true);
    expect(connection.info.authenticatedPublicKey).toBeUndefined();
  });

  test("replayed handshake cannot authenticate a new connection or restart", async () => {
    const sent: PeerMessage[] = [];
    const node = new JGCNode(config(), createGenesisBlock());
    const connection = peer(sent, { value: false });
    node.connectPeer(connection);
    const remote = new AuthSession(remoteKey.publicKey, remoteKey.privateKey, MAGIC);
    remote.open(sent[0]!);
    const version = remote.seal(signedMessage(MessageType.VERSION, sent[0]!.payload, 0))!;
    await node.processMessage(connection.info.peerId, version);
    const ack = remote.seal(signedMessage(MessageType.VERACK, {}, 0))!;
    await node.processMessage(connection.info.peerId, ack);
    expect(connection.info.authenticatedPublicKey).toBe(remoteKey.publicKey);
    node.disconnectPeer(connection.info.peerId);
    for (const target of [node, new JGCNode(config(), createGenesisBlock())]) {
      const disconnected = { value: false };
      const fresh = peer([], disconnected);
      target.connectPeer(fresh);
      await target.processMessage(fresh.info.peerId, version);
      expect(fresh.info.authenticatedPublicKey).toBeUndefined();
      await target.processMessage(fresh.info.peerId, ack);
      expect(disconnected.value).toBe(true);
    }
  });

  test("authenticates both peers over WebSocket and authenticates again on reconnect", async () => {
    const serverNode = new JGCNode(config(), createGenesisBlock());
    const clientNode = new JGCNode(config({ p2pPublicKey: remoteKey.publicKey, p2pPrivateKey: remoteKey.privateKey }), createGenesisBlock());
    const localSent: PeerMessage[] = [];
    const localPeer = peer(localSent, { value: false });
    serverNode.connectPeer(localPeer);
    const producerSession = await handshake(serverNode, localPeer, localSent);
    const block = new BlockProducer(createGenesisBlock()).produceBlock(DEFAULT_MINERS.map(miner => makeContribution(miner, 1)));
    await serverNode.processMessage(localPeer.info.peerId, producerSession.seal(signedMessage(MessageType.BLOCK, block, 0))!);
    expect(serverNode.getChainInfo().tipHeight).toBe(1);
    serverNode.disconnectPeer(localPeer.info.peerId);
    const server = await startP2PServer(serverNode, 0);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const connection = await dialPeer(clientNode, `ws://127.0.0.1:${server.port}`);
        const deadline = Date.now() + 3000;
        while ((!connection.info.authenticatedPublicKey || clientNode.getChainInfo().tipHeight !== 1) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
        expect(connection.info.authenticatedPublicKey).toBe(keyPair.publicKey);
        expect(connection.info.networkIdentityVerified).toBe(true);
        expect(clientNode.getChainInfo().tipHash).toBe(serverNode.getChainInfo().tipHash);
        clientNode.disconnectPeer(connection.info.peerId);
      }
    } finally { await server.close(); }
  });

  test("expires unfinished handshakes and releases their peer slot", () => {
    jest.useFakeTimers();
    try {
      const node = new JGCNode(config(), createGenesisBlock());
      const disconnected = { value: false };
      node.connectPeer(peer([], disconnected));
      jest.advanceTimersByTime(10_000);
      expect(disconnected.value).toBe(true);
      expect(node.peerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });
});
