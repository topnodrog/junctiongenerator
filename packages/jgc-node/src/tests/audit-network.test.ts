import { jest } from "@jest/globals";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";
import { JGCNode } from "../network/node.js";
import { MessageType as MT, type NodeConfig } from "../types/index.js";
import {
  BlockProducer,
  DEFAULT_MINERS,
  makeGenesisBlock,
  makeContribution,
  makeMessage,
  makePeer,
  mineBlocks,
} from "../sim/harness.js";
import { hashBlockHeader } from "../consensus/block.js";
import { pqGenerateKeyPair, pqAddressFromPublicKey } from "../crypto/pq-signatures.js";
import { computeAuditClaimId, type AuditAssignment } from "../broker/audit-schedule.js";
import { createAuditVote, makeAuditRequest } from "../broker/audit-protocol.js";

const config = (dataDir?: string): NodeConfig => ({
  listenPort: 0,
  rpcPort: 0,
  networkMagic: 0x4a474354,
  maxPeers: 8,
  enableBroker: false,
  junctionGeneratorMode: false,
  dataDir,
});

describe("audit messages across node state", () => {
  jest.setTimeout(60_000);

  test("binds requests to active-chain evidence and finalizes signed committee votes", async () => {
    const dataDir = join(tmpdir(), `jgc-audit-network-${process.pid}`);
    rmSync(dataDir, { recursive: true, force: true });
    const genesis = makeGenesisBlock();
    const node = new JGCNode(config(dataDir), genesis);
    const peer = makePeer("audit-relay", "127.0.0.1:19000");
    node.connectPeer(peer.conn);

    const blocks: ReturnType<BlockProducer["produceBlock"]>[] = [];
    const producer = new BlockProducer(genesis);
    await mineBlocks(node, peer.conn.info.peerId, producer, 12, DEFAULT_MINERS, (block) => blocks.push(block));

    const claimBlock = blocks[6]!; // height 7
    const beaconBlock = blocks[11]!; // height 12
    const contribution = claimBlock.computeProofs[0]!;
    const claimBlockHash = hashBlockHeader(claimBlock.header);

    const validatorKeys = ["31", "32", "33"].map((seed) => pqGenerateKeyPair(seed.repeat(32)));
    const committee = validatorKeys.map((key) => pqAddressFromPublicKey(key.publicKey));
    const assignment: AuditAssignment = {
      windowIndex: 0,
      claimId: computeAuditClaimId(claimBlockHash, 0),
      claimantId: contribution.minerAddress,
      commitment: contribution.proof.taskCommitment,
      claimHeight: 7,
      beaconHeight: 12,
      beaconHash: hashBlockHeader(beaconBlock.header),
      committee,
      reason: "coverage",
    };

    // A correctly structured request naming a false beacon is still rejected.
    const forged = makeAuditRequest({ ...assignment, beaconHash: "ff".repeat(32) });
    await node.processMessage(peer.conn.info.peerId, makeMessage(MT.AUDIT_REQUEST, forged));
    expect(node.getOpenAuditRequests()).toEqual([]);

    const request = makeAuditRequest(assignment);
    await node.processMessage(peer.conn.info.peerId, makeMessage(MT.AUDIT_REQUEST, request));
    expect(node.getOpenAuditRequests()).toEqual([request]);

    const firstVote = createAuditVote(request, assignment.commitment, 12, validatorKeys[0]!);
    await node.processMessage(peer.conn.info.peerId, makeMessage(MT.AUDIT_VOTE, firstVote));
    expect(node.getAuditVotes(request.auditId)).toHaveLength(1);

    // Restart from disk: the active chain, request, and signed vote all recover.
    const restarted = new JGCNode(config(dataDir), genesis);
    const restartedPeer = makePeer("audit-relay-restarted", "127.0.0.1:19001");
    restarted.connectPeer(restartedPeer.conn);
    expect(restarted.getChainInfo().tipHeight).toBe(12);
    expect(restarted.getOpenAuditRequests()).toEqual([request]);
    expect(restarted.getAuditVotes(request.auditId)).toEqual([firstVote]);

    for (const key of validatorKeys.slice(1)) {
      const vote = createAuditVote(request, assignment.commitment, 12, key);
      await restarted.processMessage(restartedPeer.conn.info.peerId, makeMessage(MT.AUDIT_VOTE, vote));
    }
    expect(restarted.getAuditVotes(request.auditId)).toHaveLength(3);

    // Connecting the next block causes the all-responded audit to finalize.
    await mineBlocks(restarted, restartedPeer.conn.info.peerId, producer, 1, DEFAULT_MINERS);
    expect(restarted.getOpenAuditRequests()).toEqual([]);
    const [verdict] = restarted.getAuditVerdicts();
    expect(verdict?.verdict).toBe("pass");
    expect(verdict?.topCount).toBe(3);
    expect(verdict?.evidence).toHaveLength(3);

    // A miner cannot commit a forged signature even if it recomputes auditRoot.
    const tamperedVerdict = {
      ...verdict!,
      evidence: verdict!.evidence.map((vote, index) =>
        index === 0 ? { ...vote, signature: "00" } : vote
      ),
    };
    const forgedBlock = producer.produceBlock(
      DEFAULT_MINERS.map((miner) => makeContribution(miner, 14)),
      [],
      [tamperedVerdict],
    );
    await restarted.processMessage(
      restartedPeer.conn.info.peerId,
      makeMessage(MT.BLOCK, forgedBlock),
    );
    expect(restarted.getChainInfo().tipHeight).toBe(13);

    // The following valid block commits the complete verdict and signatures.
    const committed: ReturnType<BlockProducer["produceBlock"]>[] = [];
    await mineBlocks(
      restarted,
      restartedPeer.conn.info.peerId,
      producer,
      1,
      DEFAULT_MINERS,
      (block) => committed.push(block),
    );
    expect(committed[0]?.auditVerdicts).toEqual([verdict]);
    expect(committed[0]?.header.auditRoot).not.toBe("0".repeat(64));
    expect(restarted.getPendingAuditVerdicts()).toEqual([]);

    // The same verdict cannot be replayed into a later reward period.
    const replayBlock = producer.produceBlock(
      DEFAULT_MINERS.map((miner) => makeContribution(miner, 15)),
      [],
      [verdict!],
    );
    await restarted.processMessage(
      restartedPeer.conn.info.peerId,
      makeMessage(MT.BLOCK, replayBlock),
    );
    expect(restarted.getChainInfo().tipHeight).toBe(14);

    // Remove the sidecar index: a fresh node must recover the verdict from chain
    // data alone, exactly as a syncing peer would.
    rmSync(join(dataDir, "audits.json"), { force: true });

    // Final verdict evidence and its containing block survive a second restart.
    const finalRestart = new JGCNode(config(dataDir), genesis);
    expect(finalRestart.getAuditVerdicts()[0]?.verdict).toBe("pass");
    expect(finalRestart.getChainInfo().tipHeight).toBe(14);
    expect(finalRestart.getPendingAuditVerdicts()).toEqual([]);
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("drops persisted audit evidence when a heavier fork replaces its anchors", async () => {
    const dataDir = join(tmpdir(), `jgc-audit-reorg-${process.pid}`);
    rmSync(dataDir, { recursive: true, force: true });
    const genesis = makeGenesisBlock();
    const node = new JGCNode(config(dataDir), genesis);
    const peer = makePeer("audit-reorg-relay", "127.0.0.1:19002");
    node.connectPeer(peer.conn);

    const branchABlocks: ReturnType<BlockProducer["produceBlock"]>[] = [];
    const producerA = new BlockProducer(genesis);
    await mineBlocks(node, peer.conn.info.peerId, producerA, 12, DEFAULT_MINERS, (block) => branchABlocks.push(block));

    const claimBlock = branchABlocks[6]!;
    const beaconBlock = branchABlocks[11]!;
    const contribution = claimBlock.computeProofs[0]!;
    const committee = ["41", "42", "43"].map((seed) => {
      const key = pqGenerateKeyPair(seed.repeat(32));
      return pqAddressFromPublicKey(key.publicKey);
    });
    const request = makeAuditRequest({
      windowIndex: 0,
      claimId: computeAuditClaimId(hashBlockHeader(claimBlock.header), 0),
      claimantId: contribution.minerAddress,
      commitment: contribution.proof.taskCommitment,
      claimHeight: 7,
      beaconHeight: 12,
      beaconHash: hashBlockHeader(beaconBlock.header),
      committee,
      reason: "coverage",
    });
    expect(node.broadcastAuditRequest(request)).toEqual({ ok: true });
    expect(node.getOpenAuditRequests()).toHaveLength(1);

    // Branch B starts at genesis with different timestamps. It remains a side
    // branch through height 12, then becomes heavier at 13 and triggers a reorg.
    const producerB = new BlockProducer(genesis, { timeOffsetSec: 7 });
    for (let height = 1; height <= 13; height++) {
      const block = producerB.produceBlock(DEFAULT_MINERS.map((miner) => makeContribution(miner, height)));
      producerB.confirmBlock(block);
      await node.processMessage(peer.conn.info.peerId, makeMessage(MT.BLOCK, block));
    }

    expect(node.getChainInfo().tipHeight).toBe(13);
    expect(node.getOpenAuditRequests()).toEqual([]);
    expect(node.getAuditVerdicts()).toEqual([]);

    const restarted = new JGCNode(config(dataDir), genesis);
    expect(restarted.getChainInfo().tipHeight).toBe(13);
    expect(restarted.getOpenAuditRequests()).toEqual([]);
    expect(restarted.getAuditVerdicts()).toEqual([]);
    rmSync(dataDir, { recursive: true, force: true });
  });
});
