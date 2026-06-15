/**
 * @file src/tests/discovery.test.ts
 * @description Peer discovery (ADDR gossip): the address book learns dialable
 * peer URLs from the VERSION handshake and ADDR messages, answers GETADDR,
 * relays genuinely-new addresses, and never records the node's own URL.
 */

import type { NodeConfig, PeerMessage } from "../types/index.js";
import { MessageType as MT } from "../types/index.js";
import { JGCNode } from "../network/node.js";
import { makeGenesisBlock, makePeer, makeMessage } from "../sim/harness.js";

const SELF = "ws://127.0.0.1:5000";
const cfg = (over: Partial<NodeConfig> = {}): NodeConfig => ({
  listenPort: 0, rpcPort: 0, networkMagic: 0xD9B4BEF9, maxPeers: 8,
  enableBroker: false, junctionGeneratorMode: false, ...over,
});

function nodeWithPeer(over: Partial<NodeConfig> = {}): { node: JGCNode; sent: PeerMessage[]; peerId: string } {
  const node = new JGCNode(cfg(over), makeGenesisBlock());
  const { conn, sent } = makePeer("peerA", "ws://127.0.0.1:6001");
  node.connectPeer(conn); // sends our VERSION (sent[0])
  return { node, sent, peerId: "peerA" };
}

const types = (sent: PeerMessage[]): MT[] => sent.map(m => m.type as MT);

describe("peer discovery", () => {
  test("VERSION advertises listenUrl and triggers a GETADDR", async () => {
    const { node, sent, peerId } = nodeWithPeer({ advertiseUrl: SELF });
    expect((sent[0]!.payload as { listenUrl?: string }).listenUrl).toBe(SELF); // our VERSION self-advertises

    await node.processMessage(peerId, makeMessage(MT.VERSION, { startHeight: 0, listenUrl: "ws://127.0.0.1:6001" }));
    // We learn the peer's URL and reply VERACK + GETADDR.
    expect(node.getKnownAddresses()).toContain("ws://127.0.0.1:6001");
    expect(types(sent)).toContain(MT.VERACK);
    expect(types(sent)).toContain(MT.GETADDR);
  });

  test("GETADDR is answered with known addresses, excluding the requester", async () => {
    const { node, sent, peerId } = nodeWithPeer();
    // Peer announces itself, then a couple of other addresses.
    await node.processMessage(peerId, makeMessage(MT.VERSION, { startHeight: 0, listenUrl: "ws://127.0.0.1:6001" }));
    await node.processMessage(peerId, makeMessage(MT.ADDR, { addrs: ["ws://127.0.0.1:7001", "ws://127.0.0.1:7002"] }));

    sent.length = 0;
    await node.processMessage(peerId, makeMessage(MT.GETADDR, {}));
    const addr = sent.find(m => m.type === MT.ADDR);
    expect(addr).toBeDefined();
    const list = (addr!.payload as { addrs: string[] }).addrs;
    expect(list).toEqual(expect.arrayContaining(["ws://127.0.0.1:7001", "ws://127.0.0.1:7002"]));
    expect(list).not.toContain("ws://127.0.0.1:6001"); // don't tell a peer about itself
  });

  test("new ADDR entries are relayed to other peers (gossip)", async () => {
    const node = new JGCNode(cfg(), makeGenesisBlock());
    const a = makePeer("A", "ws://127.0.0.1:6001");
    const b = makePeer("B", "ws://127.0.0.1:6002");
    node.connectPeer(a.conn); node.connectPeer(b.conn);

    await node.processMessage("A", makeMessage(MT.ADDR, { addrs: ["ws://127.0.0.1:7777"] }));
    // Forwarded to B (not back to A).
    const relayed = b.sent.find(m => m.type === MT.ADDR);
    expect(relayed).toBeDefined();
    expect((relayed!.payload as { addrs: string[] }).addrs).toContain("ws://127.0.0.1:7777");
    expect(a.sent.some(m => m.type === MT.ADDR)).toBe(false);

    // Re-announcing the same address is not gossiped again (dedup stops loops).
    b.sent.length = 0;
    await node.processMessage("A", makeMessage(MT.ADDR, { addrs: ["ws://127.0.0.1:7777"] }));
    expect(b.sent.some(m => m.type === MT.ADDR)).toBe(false);
  });

  test("the node never records its own advertised URL, and rejects malformed URLs", async () => {
    const { node, peerId } = nodeWithPeer({ advertiseUrl: SELF });
    await node.processMessage(peerId, makeMessage(MT.ADDR, { addrs: [SELF, "not-a-url", "ws://127.0.0.1:7003"] }));
    const known = node.getKnownAddresses();
    expect(known).not.toContain(SELF);
    expect(known).not.toContain("not-a-url");
    expect(known).toContain("ws://127.0.0.1:7003");
  });

  test("getDialCandidates excludes connected peers and self", async () => {
    const { node, peerId } = nodeWithPeer({ advertiseUrl: SELF });
    // Peer A is connected (address ws://127.0.0.1:6001) and advertises itself.
    await node.processMessage(peerId, makeMessage(MT.VERSION, { startHeight: 0, listenUrl: "ws://127.0.0.1:6001" }));
    await node.processMessage(peerId, makeMessage(MT.ADDR, { addrs: ["ws://127.0.0.1:7003", SELF] }));
    const candidates = node.getDialCandidates();
    expect(candidates).toContain("ws://127.0.0.1:7003"); // learned, not connected
    expect(candidates).not.toContain("ws://127.0.0.1:6001"); // already connected
    expect(candidates).not.toContain(SELF);                  // ourselves
  });
});
