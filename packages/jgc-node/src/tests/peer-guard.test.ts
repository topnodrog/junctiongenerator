import { PeerGuard, peerHost } from "../network/peer-guard.js";

describe("peer guard", () => {
  test("normalizes reconnecting hosts across ports and URL forms", () => {
    expect(peerHost("127.0.0.1:1234")).toBe("127.0.0.1");
    expect(peerHost("ws://EXAMPLE.com:19444")).toBe("example.com");
    expect(peerHost("[2001:db8::1]:19444")).toBe("2001:db8::1");
  });

  test("caps inbound connections per host and releases slots", () => {
    const guard = new PeerGuard({
      maxInboundPerHost: 2, messagesPerWindow: 10, messageWindowMs: 1000,
      banScore: 100, banDurationMs: 1000,
    });
    expect(guard.admit("10.0.0.1:1", true)).toBe(true);
    expect(guard.admit("10.0.0.1:2", true)).toBe(true);
    expect(guard.admit("10.0.0.1:3", true)).toBe(false);
    guard.release("10.0.0.1:1", true);
    expect(guard.admit("10.0.0.1:3", true)).toBe(true);
  });

  test("rate-limits messages and bans repeated malformed frames across reconnects", () => {
    let now = 100;
    const guard = new PeerGuard({
      maxInboundPerHost: 4, messagesPerWindow: 2, messageWindowMs: 1000,
      banScore: 40, banDurationMs: 5000,
    }, () => now);
    expect(guard.allowMessage("p", "10.0.0.2:1")).toBe(true);
    expect(guard.allowMessage("p", "10.0.0.2:1")).toBe(true);
    expect(guard.allowMessage("p", "10.0.0.2:1")).toBe(false);
    expect(guard.penalize("10.0.0.3:1", "malformed-frame")).toBe(false);
    expect(guard.penalize("10.0.0.3:2", "malformed-frame")).toBe(true);
    expect(guard.admit("10.0.0.3:3", true)).toBe(false);
    now += 5001;
    expect(guard.admit("10.0.0.3:3", true)).toBe(true);
  });
});
