import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JGCNode, type PeerConnection } from "../network/node.js";
import { AuthSession } from "../network/auth-session.js";
import { MAINNET_NETWORK, createNetworkGenesis, TESTNET_NETWORK } from "../config/networks.js";
import { MAINNET_READINESS, MAINNET_GATE_KEYS, type MainnetGateRecord } from "../config/mainnet-readiness.js";
import { BlockProducer, DEFAULT_MINERS } from "../sim/harness.js";
import { pqGenerateKeyPair, pqSignContribution } from "../crypto/pq-signatures.js";
import { pqProveCompute, pqToComputeProof } from "../crypto/pq-zkp.js";
import { computeEpochRoot } from "../consensus/epoch.js";
import { hashBlockHeader } from "../consensus/block.js";
import { SnapshotStore, BlockStore } from "../storage/persistence.js";
import { MessageType as MT, ComputeTaskType, type Block, type NodeConfig, type PeerMessage } from "../types/index.js";
import { prefersChainTip } from "../config/difficulty-policy.js";

const key = pqGenerateKeyPair("61".repeat(32));
const remote = pqGenerateKeyPair("62".repeat(32));
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const genesis = () => createNetworkGenesis(MAINNET_NETWORK);
// Test-only readiness overrides exercise candidate rules with zero-value,
// constrained simulation receipts. They are not mainnet proof evidence.
const config = (dataDir?: string): NodeConfig => ({
  listenPort: 0, rpcPort: 0, maxPeers: 8, enableBroker: false, junctionGeneratorMode: false,
  networkMagic: MAINNET_NETWORK.networkMagic, chainId: MAINNET_NETWORK.chainId,
  consensusVersion: MAINNET_NETWORK.consensusVersion, proofMode: MAINNET_NETWORK.proofMode,
  requireNetworkIdentity: true, requirePeerAuthentication: true,
  p2pPublicKey: key.publicKey, p2pPrivateKey: key.privateKey, dataDir, snapshotIntervalBlocks: 1,
  mainnetReadiness: { ...MAINNET_READINESS, status: "ready", gates: Object.fromEntries(MAINNET_GATE_KEYS.map(k => [k, true])) as unknown as MainnetGateRecord },
});
function blocks(count: number, offset = 0): Block[] {
  const producer = new BlockProducer(genesis());
  return Array.from({ length: count }, (_, i) => {
    const height = i + 1;
    const contributions = DEFAULT_MINERS.map(miner => {
      const output = hash(`candidate-vector/${height}/${miner.address}`);
      const proof = { ...pqToComputeProof(pqProveCompute("PQ_CIRCUIT_AI_INFERENCE_V1", output,
        { taskCommitment: output, nonce: hash(`nonce/${output}`), tflopsWeight: miner.tflops })),
        taskCommitment: output, taskType: ComputeTaskType.AI_INFERENCE, computeStartedAt: "2026-06-11T00:00:00Z" };
      const contribution = { minerAddress: miner.address, publicKey: miner.pubKey, proof, signature: "" };
      contribution.signature = pqSignContribution(miner.secretKey, contribution, height);
      return contribution;
    });
    const block = producer.produceBlock(contributions);
    block.header.timestamp = genesis().header.timestamp + height * 600 + offset;
    producer.confirmBlock(block);
    return block;
  });
}
async function feeder(node: JGCNode) {
  const sent: PeerMessage[] = [];
  const connection: PeerConnection = {
    info: { peerId: "candidate-peer", address: "127.0.0.1:1", version: 0, services: 0n, userAgent: "test", startHeight: 0, bestBlock: "0".repeat(64), connectedAt: 0, lastSeen: 0, bytesSent: 0, bytesReceived: 0, inbound: false },
    send: async msg => { sent.push(msg); }, disconnect: () => {},
  };
  node.connectPeer(connection);
  const session = new AuthSession(remote.publicKey, remote.privateKey, MAINNET_NETWORK.networkMagic);
  session.open(sent[0]!);
  const message = (type: MT, payload: unknown): PeerMessage => ({ type, payload, timestamp: 0, senderPublicKey: "", signature: "" });
  await node.processMessage(connection.info.peerId, session.seal(message(MT.VERSION, sent[0]!.payload))!);
  session.open(sent[1]!);
  await node.processMessage(connection.info.peerId, session.seal(message(MT.VERACK, {}))!);
  return (block: Block) => node.processMessage(connection.info.peerId, session.seal(message(MT.BLOCK, structuredClone(block)))!);
}
function state(node: JGCNode) {
  return { tip: node.getChainInfo().tipHash, epoch: computeEpochRoot(node.getEpochState()),
    difficulty: node.getCurrentDifficultyBits(), utxos: [...node.getUTXOSet().entries()].sort((a, b) => `${a.txid}:${a.vout}` < `${b.txid}:${b.vout}` ? -1 : 1) };
}

describe("candidate deterministic consensus", () => {
  test("equal-work tips converge in either arrival order; pilot retains first-seen ties", async () => {
    const a = blocks(1)[0]!;
    const b = blocks(1, 7)[0]!;
    const expected = [hashBlockHeader(a.header), hashBlockHeader(b.header)].sort()[0];
    const left = new JGCNode(config(), genesis());
    const right = new JGCNode(config(), genesis());
    const sendL = await feeder(left), sendR = await feeder(right);
    await sendL(a); await sendL(b);
    await sendR(b); await sendR(a);
    expect(left.getChainInfo().tipHash).toBe(expected);
    expect(state(left)).toEqual(state(right));
    expect(prefersChainTip(TESTNET_NETWORK.chainId, 10n, "0".repeat(64), 10n, "f".repeat(64))).toBe(false);
  });

  test("concurrent local block submissions cannot apply the same epoch slot twice", async () => {
    const node = new JGCNode(config(), genesis());
    const results = await Promise.all([node.submitBlock(blocks(1)[0]!), node.submitBlock(blocks(1, 7)[0]!)]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(node.getEpochState().epochBlockIndex).toBe(2);
  });

  test("a child received before its inactive parent still selects the heavier branch", async () => {
    const branches = [blocks(2), blocks(2, 7)].sort((a, b) => hashBlockHeader(a[0]!.header) < hashBlockHeader(b[0]!.header) ? -1 : 1);
    const node = new JGCNode(config(), genesis());
    const send = await feeder(node);
    await send(branches[0]![0]!);
    await send(branches[1]![1]!); // Orphan: parent is not yet known.
    await send(branches[1]![0]!); // Equal-work parent is not the preferred tip.
    expect(node.getChainInfo().tipHash).toBe(hashBlockHeader(branches[1]![1]!.header));
    const reference = new JGCNode(config(), genesis());
    for (const block of branches[1]!) expect((await reference.submitBlock(block)).ok).toBe(true);
    expect(state(node)).toEqual(state(reference));
  });

  test("a preferred hash with an invalid signature cannot replace valid state", async () => {
    const tips = [blocks(1)[0]!, blocks(1, 7)[0]!].sort((a, b) => hashBlockHeader(a.header) < hashBlockHeader(b.header) ? -1 : 1);
    const node = new JGCNode(config(), genesis());
    const send = await feeder(node);
    await send(tips[1]!);
    const before = state(node);
    tips[0]!.computeProofs[0]!.signature = "00".repeat(3309);
    await send(tips[0]!);
    expect(state(node)).toEqual(before);
  });

  test("live settlement, full replay and forged-snapshot recovery produce the same pinned state", async () => {
    const directory = mkdtempSync(join(tmpdir(), "jgc-candidate-"));
    try {
      const node = new JGCNode(config(directory), genesis());
      for (const block of blocks(143)) expect((await node.submitBlock(block)).ok).toBe(true);
      const expected = state(node);
      const snapshot = new SnapshotStore(directory);
      const forged = snapshot.load()!;
      forged.utxos[0]!.value += 1n;
      forged.epochState.pendingRewardPool += 123n;
      snapshot.write(forged);
      const restarted = new JGCNode(config(directory), genesis());
      expect(state(restarted)).toEqual(expected);
      snapshot.clear();
      expect(state(new JGCNode(config(directory), genesis()))).toEqual(expected);
      expect([...node.getUTXOSet().entries()].reduce((sum, { entry }) => sum + entry.value, 0n)).toBe(7200n * 10n ** 16n);
      expect(hash(JSON.stringify(expected, (_key, value) => typeof value === "bigint" ? value.toString() : value))).toBe("8e960538c5a6d392b7cf2922cc5193baa58d45b8772aefb9b67dd09c68a026e8");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 60_000);

  test("replay rechecks signatures even when all committed body hashes still match", async () => {
    const directory = mkdtempSync(join(tmpdir(), "jgc-candidate-bad-"));
    try {
      const node = new JGCNode(config(directory), genesis());
      const block = blocks(1)[0]!;
      expect((await node.submitBlock(block)).ok).toBe(true);
      const stored = new BlockStore(directory).loadAll();
      stored[0]!.computeProofs[0]!.signature = "00".repeat(3309);
      new BlockStore(directory).rewrite(stored);
      expect(() => new JGCNode(config(directory), genesis())).toThrow("candidate validation");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
