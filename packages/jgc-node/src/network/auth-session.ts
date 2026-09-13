/** Connection-bound authentication. VERSION exchanges random challenges; VERACK
 * proves possession of the peer key over both challenges. Application messages
 * have strictly increasing per-direction sequence numbers, with constant storage.
 */
import { createHash, randomBytes } from "node:crypto";
import { MessageType, type PeerMessage } from "../types/index.js";
import { pqIsValidPublicKey, pqSignHash, pqVerifyHashSignature, PQ_SIZES } from "../crypto/pq-signatures.js";
import { isPeerMessageTimestampFresh, peerMessageSignatureHash } from "./wire.js";

export class AuthSession {
  readonly nonce = randomBytes(32).toString("hex");
  private remoteKey?: string;
  private sessionId?: string;
  private sent = 0;
  private received = 0;
  ready = false;

  constructor(private readonly publicKey: string, private readonly privateKey: string,
    private readonly networkMagic: number) {}

  get authenticatedPublicKey(): string | undefined { return this.ready ? this.remoteKey : undefined; }

  seal(message: PeerMessage): PeerMessage | undefined {
    let payload: unknown;
    if (message.type === MessageType.VERSION) {
      payload = { ...(message.payload as object), authNonce: this.nonce };
    } else {
      // Drop broadcasts until handshake completion; normal sync retrieves them.
      if (!this.sessionId || (!this.ready && message.type !== MessageType.VERACK)) return undefined;
      if (!Number.isSafeInteger(this.sent + 1)) throw new Error("Authentication sequence exhausted");
      payload = { sessionId: this.sessionId, sequence: ++this.sent, body: message.payload };
    }
    const unsigned = { type: message.type, payload, timestamp: Math.floor(Date.now() / 1000), senderPublicKey: this.publicKey };
    return { ...unsigned, signature: pqSignHash(this.privateKey, peerMessageSignatureHash(unsigned, this.networkMagic)) };
  }

  open(message: PeerMessage): PeerMessage {
    if (!pqIsValidPublicKey(message.senderPublicKey)
        || typeof message.signature !== "string" || message.signature.length !== PQ_SIZES.signature * 2
        || !/^[0-9a-fA-F]+$/.test(message.signature)
        || !isPeerMessageTimestampFresh(message.timestamp)
        || !pqVerifyHashSignature(message.signature, peerMessageSignatureHash(message, this.networkMagic), message.senderPublicKey)) {
      throw new Error("Invalid session signature");
    }
    const payload = message.payload as Record<string, unknown> | null;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid session payload");
    if (message.type === MessageType.VERSION) {
      if (this.remoteKey || message.senderPublicKey === this.publicKey || typeof payload.authNonce !== "string" || !/^[0-9a-f]{64}$/.test(payload.authNonce)
          || payload.authNonce === this.nonce) throw new Error("Invalid session challenge");
      this.remoteKey = message.senderPublicKey;
      const parties = [[this.publicKey, this.nonce], [this.remoteKey, payload.authNonce]].sort((a, b) =>
        JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
      this.sessionId = createHash("sha3-256").update(JSON.stringify(["JGC-P2P-SESSION/V1", this.networkMagic, parties])).digest("hex");
      return message;
    }
    if (!this.sessionId || message.senderPublicKey !== this.remoteKey
        || payload.sessionId !== this.sessionId || !Number.isSafeInteger(payload.sequence)
        || payload.sequence !== this.received + 1 || !Object.hasOwn(payload, "body")
        || (!this.ready && message.type !== MessageType.VERACK)
        || (this.ready && message.type === MessageType.VERACK)) throw new Error("Invalid session sequence or handshake");
    this.received = payload.sequence as number;
    if (message.type === MessageType.VERACK) this.ready = true;
    return { ...message, payload: payload.body };
  }
}
