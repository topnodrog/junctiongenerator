import { WebSocket } from "ws";
import { jest } from "@jest/globals";
import { startP2PServer, MAX_QUEUED_PEER_MESSAGES, MAX_QUEUED_PEER_BYTES } from "../network/transport.js";
import { JGCNode } from "../network/node.js";
import { createGenesisBlock } from "../consensus/block.js";
import { encodePeerMessage } from "../network/wire.js";
import { MessageType } from "../types/index.js";

test.each(["count", "bytes"])("terminates a peer whose queued %s exceed the bound during slow processing", async limit => {
  const node = new JGCNode({ listenPort: 0, rpcPort: 0, networkMagic: 123, maxPeers: 2, enableBroker: false, junctionGeneratorMode: false }, createGenesisBlock());
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const process = jest.spyOn(node, "processMessage").mockImplementation(async () => blocked);
  const server = await startP2PServer(node, 0);
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}`);
  try {
    await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    const closed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("queue overflow did not close peer")), 3000);
      socket.once("close", () => { clearTimeout(timer); resolve(); });
    });
    const payload = limit === "count" ? { nonce: 1 } : { padding: new Array(6).fill("x".repeat(1024 * 1024)) };
    const frame = encodePeerMessage({ type: MessageType.PING, payload, timestamp: 1, senderPublicKey: "test", signature: "test" }, 123);
    for (let i = 0; i < (limit === "count" ? MAX_QUEUED_PEER_MESSAGES + 2 : 3); i++) socket.send(frame);
    await closed;
    expect(node.peerCount()).toBe(0);
    expect(process.mock.calls.length).toBeLessThanOrEqual(1);
  } finally { release(); socket.terminate(); await server.close(); process.mockRestore(); }
});

test("terminates an outbound peer when its buffered bytes exceed the bound", async () => {
  const node = new JGCNode({ listenPort: 0, rpcPort: 0, networkMagic: 123, maxPeers: 2, enableBroker: false, junctionGeneratorMode: false }, createGenesisBlock());
  const buffered = jest.spyOn(WebSocket.prototype, "bufferedAmount", "get").mockReturnValue(MAX_QUEUED_PEER_BYTES);
  const server = await startP2PServer(node, 0);
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}`);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("outbound overflow did not disconnect")), 3000);
      socket.once("close", () => { clearTimeout(timer); resolve(); });
      socket.once("error", reject);
    });
    expect(node.peerCount()).toBe(0);
  } finally { buffered.mockRestore(); socket.terminate(); await server.close(); }
});
