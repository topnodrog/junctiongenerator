/**
 * @file src/network/transport.ts
 * @description WebSocket transport binding for JGCNode.
 *
 * BITCOIN COMPARISON — net.cpp
 * ─────────────────────────────
 * Bitcoin's CConnman owns raw TCP sockets, a select/poll loop, and per-peer
 * send/receive buffers, feeding deserialized messages into PeerManager.
 *
 * JGC v0 uses WebSocket (the `ws` package) as the framed transport so we get
 * message boundaries, backpressure, and keep-alive for free, and binds each
 * socket to the JGCNode peer API:
 *
 *   socket lifecycle  → connectPeer() / disconnectPeer()
 *   incoming frames   → decodePeerMessage() → processMessage()
 *   PeerConnection.send → encodePeerMessage() → ws.send()
 *
 * ORDERING GUARANTEE: incoming messages are processed through a per-peer
 * promise pipeline. processMessage is async (block validation awaits), and
 * without serialization two BLOCK frames could validate concurrently — the
 * second would race the first's tip update and be rejected as out-of-order.
 * TCP gives us in-order delivery; the pipeline preserves it through async
 * processing (Bitcoin equivalent: one ProcessMessages pass per peer per loop).
 */

import { randomBytes } from "crypto";
import { WebSocket, WebSocketServer } from "ws";
import type { JGCNode, PeerConnection } from "./node.js";
import { encodePeerMessage, decodePeerMessage } from "./wire.js";

/**
 * Bind an open WebSocket to a node as a peer.
 * Registers the peer (which triggers the VERSION handshake) and wires
 * frame decode → serialized processMessage dispatch.
 */
function attachSocket(
  node:    JGCNode,
  ws:      WebSocket,
  address: string,
  inbound: boolean,
): PeerConnection {
  const nowUnix = Math.floor(Date.now() / 1000);
  const peerId  = `${inbound ? "in" : "out"}:${address}#${randomBytes(4).toString("hex")}`;

  const conn: PeerConnection = {
    info: {
      peerId,
      address,
      version:       0,
      services:      0n,
      userAgent:     "",
      startHeight:   0,
      bestBlock:     "0".repeat(64),
      connectedAt:   nowUnix,
      lastSeen:      nowUnix,
      bytesSent:     0,
      bytesReceived: 0,
      inbound,
    },
    send: (msg) => new Promise<void>((resolve, reject) => {
      const data = encodePeerMessage(msg);
      conn.info.bytesSent += data.length;
      ws.send(data, err => (err ? reject(err) : resolve()));
    }),
    disconnect: () => ws.close(),
  };

  // Per-peer serialized processing pipeline (see file header).
  let pipeline: Promise<void> = Promise.resolve();
  ws.on("message", (data) => {
    const text = data.toString();
    conn.info.bytesReceived += text.length;
    pipeline = pipeline
      .then(async () => {
        const msg = decodePeerMessage(text);
        if (msg === null) {
          console.warn(`[Transport] ${peerId}: dropping malformed message`);
          return;
        }
        await node.processMessage(peerId, msg);
      })
      .catch(err => console.error(`[Transport] ${peerId}: ${String(err)}`));
  });

  ws.on("close", () => node.disconnectPeer(peerId));
  ws.on("error", (err) => console.error(`[Transport] ${peerId}: socket error: ${String(err)}`));

  node.connectPeer(conn);
  return conn;
}

export interface P2PServer {
  port: number;
  close(): Promise<void>;
}

/**
 * Start listening for inbound peer connections.
 *
 * @param node Node to bind inbound peers to.
 * @param port TCP port to listen on.
 * @param host Bind address — defaults to loopback; pass "0.0.0.0" to expose
 *             publicly (NOT recommended until binary framing + checksums land).
 */
export function startP2PServer(
  node: JGCNode,
  port: number,
  host: string = "127.0.0.1",
): Promise<P2PServer> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port, host });

    wss.on("connection", (ws, req) => {
      const address = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
      attachSocket(node, ws, address, true);
    });

    wss.on("listening", () => resolve({
      port,
      close: () => new Promise<void>((done) => {
        for (const client of wss.clients) client.terminate();
        wss.close(() => done());
      }),
    }));

    wss.on("error", reject);
  });
}

/**
 * Open an outbound connection to a peer.
 * Resolves once the socket is open and the peer is registered with the node
 * (the VERSION handshake is already in flight at that point).
 */
export function dialPeer(node: JGCNode, url: string): Promise<PeerConnection> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on("open",  () => resolve(attachSocket(node, ws, url, false)));
    ws.on("error", reject);
  });
}
