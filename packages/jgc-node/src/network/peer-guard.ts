/**
 * Bounded, deterministic peer admission and abuse accounting.
 * Scores are keyed by host (not ephemeral source port) so reconnecting does not
 * erase a ban. Message buckets are intentionally in-memory: bans are defensive
 * networking state, not consensus state.
 */
export interface PeerGuardPolicy {
  maxInboundPerHost: number;
  messagesPerWindow: number;
  messageWindowMs: number;
  banScore: number;
  banDurationMs: number;
}

export const DEFAULT_PEER_GUARD_POLICY: Readonly<PeerGuardPolicy> = {
  maxInboundPerHost: 4,
  messagesPerWindow: 120,
  messageWindowMs: 10_000,
  banScore: 100,
  banDurationMs: 15 * 60_000,
};

interface HostState {
  inbound: number;
  connections: number;
  lastSeen: number;
  score: number;
  bannedUntil: number;
}
export const MAX_PEER_GUARD_HOSTS = 4096;

interface MessageBucket {
  startedAt: number;
  count: number;
}

export type PeerViolation = "malformed-frame" | "message-flood" | "invalid-data";

const PENALTY: Readonly<Record<PeerViolation, number>> = {
  "malformed-frame": 20,
  "message-flood": 50,
  "invalid-data": 10,
};

/** Extract a stable host from ws URLs, IPv4 host:port, and [IPv6]:port forms. */
export function peerHost(address: string): string {
  try {
    const url = new URL(address);
    return url.hostname.toLowerCase();
  } catch {
    const bracketed = address.match(/^\[([^\]]+)\](?::\d+)?$/);
    if (bracketed) return bracketed[1]!.toLowerCase();
    const ipv4 = address.match(/^(.+):\d+$/);
    return (ipv4?.[1] ?? address).toLowerCase();
  }
}

export class PeerGuard {
  private readonly hosts = new Map<string, HostState>();
  private readonly buckets = new Map<string, MessageBucket>();

  constructor(
    private readonly policy: PeerGuardPolicy = DEFAULT_PEER_GUARD_POLICY,
    private readonly now: () => number = Date.now,
  ) {}

  admit(address: string, inbound: boolean): boolean {
    const host = peerHost(address);
    const state = this.state(host);
    this.expireBan(state);
    if (state.bannedUntil > this.now()) return false;
    if (inbound && state.inbound >= this.policy.maxInboundPerHost) return false;
    if (inbound) state.inbound++;
    state.connections++;
    return true;
  }

  release(address: string, inbound: boolean): void {
    const state = this.state(peerHost(address));
    if (inbound) state.inbound = Math.max(0, state.inbound - 1);
    state.connections = Math.max(0, state.connections - 1);
  }

  allowMessage(peerId: string, address: string): boolean {
    const hostState = this.state(peerHost(address));
    this.expireBan(hostState);
    if (hostState.bannedUntil > this.now()) return false;
    const now = this.now();
    let bucket = this.buckets.get(peerId);
    if (!bucket || now - bucket.startedAt >= this.policy.messageWindowMs) {
      bucket = { startedAt: now, count: 0 };
      this.buckets.set(peerId, bucket);
    }
    bucket.count++;
    if (bucket.count <= this.policy.messagesPerWindow) return true;
    this.penalize(address, "message-flood");
    return false;
  }

  penalize(address: string, violation: PeerViolation): boolean {
    const state = this.state(peerHost(address));
    this.expireBan(state);
    state.score += PENALTY[violation];
    if (state.score < this.policy.banScore) return false;
    state.bannedUntil = this.now() + this.policy.banDurationMs;
    state.score = 0;
    return true;
  }

  forgetPeer(peerId: string): void {
    this.buckets.delete(peerId);
  }

  isBanned(address: string): boolean {
    const state = this.state(peerHost(address));
    this.expireBan(state);
    return state.bannedUntil > this.now();
  }

  private state(host: string): HostState {
    let state = this.hosts.get(host);
    if (!state) {
      if (this.hosts.size >= MAX_PEER_GUARD_HOSTS) {
        for (const [key, old] of this.hosts) {
          if (old.connections === 0 && old.bannedUntil <= this.now()
              && this.now() - old.lastSeen >= this.policy.banDurationMs) this.hosts.delete(key);
        }
        // Never evict an active ban or connection to admit a fresh identity.
        if (this.hosts.size >= MAX_PEER_GUARD_HOSTS) return { inbound: 0, connections: 0, lastSeen: this.now(), score: 0, bannedUntil: Infinity };
      }
      state = { inbound: 0, connections: 0, lastSeen: this.now(), score: 0, bannedUntil: 0 };
      this.hosts.set(host, state);
    }
    state.lastSeen = this.now();
    return state;
  }

  private expireBan(state: HostState): void {
    if (state.bannedUntil !== 0 && state.bannedUntil <= this.now()) {
      state.bannedUntil = 0;
      state.score = 0;
    }
  }
}
