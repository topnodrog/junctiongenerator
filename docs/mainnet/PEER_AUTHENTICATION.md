# Peer authentication acceptance record

Scope: the `peerAuthentication` engineering gate for the candidate node.
Independent network/security review and end-to-end quantum security are separate
mandatory gates. This protocol does not encrypt traffic, prevent traffic analysis,
prove independent operators, or grant a peer consensus authority.

## Implemented protocol

1. Each connection generates a fresh 32-byte OS-random challenge. Its signed
   VERSION carries that challenge and the existing network identity.
2. Both peers derive a session digest from the network magic and ordered pairs
   of full public keys and challenges. A signed VERACK binds this session and
   proves possession of the remote key in response to the local challenge.
3. Every later message signs the session digest, monotonically increasing
   per-direction sequence, type, timestamp, full sender key and application
   payload. The receiver accepts exactly the next sequence. No replay cache
   eviction or wall-clock change can make an old sequence acceptable.
4. Application messages and discovery wait for VERACK. Repeated VERSION/VERACK,
   self-connections, altered keys, wrong sessions, stale/future timestamps,
   unsigned messages and sequence gaps/duplicates disconnect the peer.
5. Reconnection and process restart create new challenges. An unfinished
   handshake expires after ten seconds; disconnect removes its timer/session.

Authenticated mode is required by the existing mainnet constructor guard.
It never falls back to legacy signatures or unsigned mode. The running unsigned
JGTC pilot retains its protocol; old experimental authenticated peers must
upgrade together. This is not a deployed mainnet launcher.

## Resource limits

- Existing 8 MiB frame limit, decoded-value limits, maximum peer count,
  per-host inbound cap and message-rate guards remain enforced.
- Incoming work queues allow at most 128 messages and 16 MiB per connection.
  Outbound buffered frames are capped at 16 MiB. Overflow terminates the socket.
- Replay state is two counters per connection, with safe-integer exhaustion
  rejected. No per-message history is retained.
- Host defense records are capped at 4,096. Full capacity rejects new hosts;
  inactive records become reclaimable after the ban-retention interval. Live
  connections and unexpired bans are not evicted to admit new hosts.

## Acceptance evidence

- `auth-session.test.ts`: actual wire-codec round trips, mutual proof, replay,
  sequence gaps, repeated handshakes, cross-connection replay, reflection,
  wrong network, tampering, malformed signatures and timestamp bounds.
- `network-authentication.test.ts`: required matching keys, pre-handshake
  rejection, restart/reconnect replay, handshake timeout and actual WebSocket
  authentication, block synchronization and reconnect.
- `transport-bounds.test.ts`: slow-handler message/byte overflow and outbound
  buffered-byte overflow terminate the peer.
- `peer-guard.test.ts`: rate/host limits, host-capacity pressure and ban retention.
- Existing mainnet guard tests require authenticated mode, with no gate bypass.

Local release rehearsal: 51 suites / 427 tests plus four release-manifest tests,
typecheck, build and staged bundle verification passed before the additional
block-sync assertion. The final focused test and CI evidence must be recorded
before this gate is marked complete.
