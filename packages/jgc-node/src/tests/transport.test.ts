import { createNetworkGenesis, TESTNET_NETWORK } from "../config/networks.js";
import { JGCNode } from "../network/node.js";
import { dialPeer, startP2PServer } from "../network/transport.js";
import { MessageType, type NodeConfig, type PeerMessage } from "../types/index.js";
import { BlockProducer, makePeer, mineBlocks } from "../sim/harness.js";

function config(): NodeConfig {
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

describe("WebSocket transport", () => {
  test("a fresh validator downloads history across multiple peer message windows", async () => {
    const genesis = createNetworkGenesis(TESTNET_NETWORK);
    const seed = new JGCNode({ ...config(), requireNetworkIdentity: false }, genesis);
    const source = makePeer("test-producer", "local");
    seed.connectPeer(source.conn);
    await mineBlocks(seed, "test-producer", new BlockProducer(genesis), 15);
    const server = await startP2PServer(seed, 0);
    const client = new JGCNode({ ...config(), peerMessagesPerWindow: 10, peerMessageWindowMs: 200 }, genesis);
    try {
      await dialPeer(client, `ws://127.0.0.1:${server.port}`);
      const deadline = Date.now() + 10000;
      while (client.getChainInfo().tipHeight < 15 && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(client.getChainInfo().tipHash).toBe(seed.getChainInfo().tipHash);
      expect(client.peerCount()).toBe(1);
    } finally { await server.close(); }
  }, 20000);

  test("treats a send racing with socket shutdown as a disconnected peer", async () => {
    const serverNode = new JGCNode(config(), createNetworkGenesis(TESTNET_NETWORK));
    const clientNode = new JGCNode(config(), createNetworkGenesis(TESTNET_NETWORK));
    const server = await startP2PServer(serverNode, 0);
    const peer = await dialPeer(clientNode, `ws://127.0.0.1:${server.port}`);
    const message: PeerMessage = {
      type: MessageType.PING,
      payload: { nonce: 1 },
      timestamp: Math.floor(Date.now() / 1000),
      senderPublicKey: "",
      signature: "",
    };

    peer.disconnect();
    await expect(peer.send(message)).resolves.toBeUndefined();
    expect(clientNode.peerCount()).toBe(0);

    await server.close();
  });
});
