import { MessageType, type NodeConfig, type PeerMessage } from "../types/index.js";
import { createGenesisBlock } from "../consensus/block.js";
import { JGCNode, type PeerConnection } from "../network/node.js";
import { peerMessageSignatureHash } from "../network/wire.js";
import {
  pqGenerateKeyPair,
  pqSignHash,
  pqVerifyHashSignature,
} from "../crypto/pq-signatures.js";

const MAGIC = 0x4a474332;
const keyPair = pqGenerateKeyPair("11".repeat(32));

function config(overrides: Partial<NodeConfig> = {}): NodeConfig {
  return {
    listenPort: 0,
    rpcPort: 0,
    networkMagic: MAGIC,
    maxPeers: 8,
    enableBroker: false,
    junctionGeneratorMode: false,
    requirePeerAuthentication: true,
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

    const now = Math.floor(Date.now() / 1000);
    const valid = signedMessage(MessageType.PING, { nonce: 7 }, now);
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
    const valid = signedMessage(MessageType.PING, { nonce: 2 }, now);
    await secondNode.processMessage(secondConnection.info.peerId, valid);
    expect(secondDisconnected.value).toBe(false);
    await secondNode.processMessage(secondConnection.info.peerId, valid);
    expect(secondDisconnected.value).toBe(true);
  });
});
