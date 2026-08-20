import { createNetworkGenesis, TESTNET_NETWORK } from "../config/networks.js";
import { JGCNode } from "../network/node.js";
import { dialPeer, startP2PServer } from "../network/transport.js";
import { MessageType, type NodeConfig, type PeerMessage } from "../types/index.js";

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
