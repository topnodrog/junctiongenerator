import { pqGenerateKeyPair, pqAddressFromPublicKey } from "../crypto/pq-signatures.js";
import type { AuditAssignment } from "../broker/audit-schedule.js";
import {
  AuditLifecycle,
  auditVerdictCommitment,
  createAuditVote,
  makeAuditRequest,
  validateAuditVerdictRecord,
  verifyAuditVote,
} from "../broker/audit-protocol.js";

const CLAIM = "11".repeat(32);
const OTHER = "22".repeat(32);
const keys = ["a", "b", "c", "d"].map((seed) => pqGenerateKeyPair(seed.repeat(64).slice(0, 64)));
const ids = keys.map((key) => pqAddressFromPublicKey(key.publicKey));

function assignment(): AuditAssignment {
  return {
    windowIndex: 0,
    claimId: "block-claim-0",
    claimantId: ids[3]!,
    commitment: CLAIM,
    claimHeight: 7,
    beaconHeight: 12,
    beaconHash: "aa".repeat(32),
    committee: ids.slice(0, 3),
    reason: "coverage",
  };
}

describe("audit request and vote lifecycle", () => {
  test("accepts a valid deterministic request once", () => {
    const lifecycle = new AuditLifecycle();
    const request = makeAuditRequest(assignment(), 10);
    expect(lifecycle.registerRequest(request, 12)).toEqual({ accepted: true });
    expect(lifecycle.registerRequest(request, 12)).toEqual({
      accepted: false,
      error: "audit already registered",
    });
  });

  test("signs votes with the selected validator identity", () => {
    const request = makeAuditRequest(assignment());
    const vote = createAuditVote(request, CLAIM, 13, keys[0]!);
    expect(vote.validatorId).toBe(ids[0]);
    expect(verifyAuditVote(vote)).toBe(true);
    expect(verifyAuditVote({ ...vote, observedCommitment: OTHER })).toBe(false);
  });

  test("rejects outsiders, duplicate votes, bad signatures, and late votes", () => {
    const lifecycle = new AuditLifecycle();
    const request = makeAuditRequest(assignment(), 10);
    lifecycle.registerRequest(request, 12);

    const outsider = createAuditVote(request, CLAIM, 13, keys[3]!);
    expect(lifecycle.submitVote(outsider, 13).error).toBe("validator is not assigned to this audit");

    const valid = createAuditVote(request, CLAIM, 13, keys[0]!);
    expect(lifecycle.submitVote({ ...valid, signature: "00" }, 13).error).toBe("invalid audit vote signature");
    expect(lifecycle.submitVote(valid, 13)).toEqual({ accepted: true });
    expect(lifecycle.submitVote(valid, 13).error).toBe("validator already voted");

    const late = createAuditVote(request, CLAIM, 23, keys[1]!);
    expect(lifecycle.submitVote(late, 23).error).toBe("vote is outside the response window");
  });

  test("passes only when the entire committee supermajority matches the claim", () => {
    const lifecycle = new AuditLifecycle();
    const request = makeAuditRequest(assignment());
    lifecycle.registerRequest(request, 12);
    lifecycle.submitVote(createAuditVote(request, CLAIM, 13, keys[0]!), 13);
    lifecycle.submitVote(createAuditVote(request, CLAIM, 13, keys[1]!), 13);

    expect(lifecycle.finalize(request.auditId, 13)).toBeNull();
    lifecycle.submitVote(createAuditVote(request, OTHER, 14, keys[2]!), 14);
    const verdict = lifecycle.finalize(request.auditId, 14)!;
    expect(verdict.verdict).toBe("pass");
    expect(verdict.topCount).toBe(2);
    expect(verdict.requiredVotes).toBe(2);
  });

  test("records fraud when a supermajority converges away from the claim", () => {
    const lifecycle = new AuditLifecycle();
    const request = makeAuditRequest(assignment());
    lifecycle.registerRequest(request, 12);
    lifecycle.submitVote(createAuditVote(request, OTHER, 13, keys[0]!), 13);
    lifecycle.submitVote(createAuditVote(request, OTHER, 13, keys[1]!), 13);
    lifecycle.submitVote(createAuditVote(request, CLAIM, 13, keys[2]!), 13);

    const verdict = lifecycle.finalize(request.auditId, 13)!;
    expect(verdict.verdict).toBe("fraud");
    expect(verdict.evidence).toHaveLength(3);
    expect(validateAuditVerdictRecord(verdict)).toBeNull();
    expect(validateAuditVerdictRecord({ ...verdict, topCount: 1 }))
      .toBe("verdict summary does not match signed evidence");
  });

  test("breaks tied observations deterministically regardless of vote arrival order", () => {
    const tieKeys = ["e", "f", "1", "2"].map((seed) =>
      pqGenerateKeyPair(seed.repeat(64).slice(0, 64))
    );
    const tieAssignment = {
      ...assignment(),
      committee: tieKeys.map((key) => pqAddressFromPublicKey(key.publicKey)),
    };
    const request = makeAuditRequest(tieAssignment);
    const votes = tieKeys.map((key, index) =>
      createAuditVote(request, index % 2 === 0 ? CLAIM : OTHER, 13, key)
    );

    const finalize = (orderedVotes: typeof votes) => {
      const lifecycle = new AuditLifecycle();
      lifecycle.registerRequest(request, 12);
      for (const vote of orderedVotes) lifecycle.submitVote(vote, 13);
      return lifecycle.finalize(request.auditId, 13)!;
    };

    const forward = finalize(votes);
    const reverse = finalize([...votes].reverse());
    expect(forward.verdict).toBe("inconclusive");
    expect(forward.topCommitment).toBe(CLAIM);
    expect(auditVerdictCommitment(forward)).toBe(auditVerdictCommitment(reverse));
  });

  test("deadline expiry without a committee supermajority is inconclusive", () => {
    const lifecycle = new AuditLifecycle();
    const request = makeAuditRequest(assignment(), 5);
    lifecycle.registerRequest(request, 12);
    lifecycle.submitVote(createAuditVote(request, OTHER, 13, keys[0]!), 13);

    expect(lifecycle.finalizeDue(17)).toEqual([]);
    const [verdict] = lifecycle.finalizeDue(18);
    expect(verdict?.verdict).toBe("inconclusive");
    expect(verdict?.topCount).toBe(1);
  });

  test("malformed committees and excessive deadlines are rejected safely", () => {
    const lifecycle = new AuditLifecycle({ maxResponseBlocks: 20 });
    const selfAssignment = { ...assignment(), committee: [ids[0]!, ids[1]!, ids[3]!] };
    expect(lifecycle.registerRequest(makeAuditRequest(selfAssignment), 12).error)
      .toBe("claimant cannot audit itself");
    expect(lifecycle.registerRequest(makeAuditRequest(assignment(), 21), 12).error)
      .toBe("audit deadline is too far away");
  });

  test("restores open and finalized evidence only after revalidation", () => {
    const original = new AuditLifecycle();
    const request = makeAuditRequest(assignment());
    original.registerRequest(request, 12);
    original.submitVote(createAuditVote(request, CLAIM, 13, keys[0]!), 13);

    const restoredOpen = new AuditLifecycle();
    const openResult = restoredOpen.restoreState(original.snapshotState(), 13);
    expect(openResult).toMatchObject({ restored: 1, dropped: 0 });
    expect(restoredOpen.getVotes(request.auditId)).toHaveLength(1);

    original.submitVote(createAuditVote(request, CLAIM, 13, keys[1]!), 13);
    original.submitVote(createAuditVote(request, OTHER, 13, keys[2]!), 13);
    original.finalize(request.auditId, 13);

    const restoredFinal = new AuditLifecycle();
    const finalResult = restoredFinal.restoreState(original.snapshotState(), 13);
    expect(finalResult).toMatchObject({ restored: 1, dropped: 0 });
    expect(restoredFinal.getVerdicts()[0]?.verdict).toBe("pass");
  });

  test("drops persisted evidence when its chain anchor is stale", () => {
    const original = new AuditLifecycle();
    const request = makeAuditRequest(assignment());
    original.registerRequest(request, 12);

    const restored = new AuditLifecycle();
    const result = restored.restoreState(original.snapshotState(), 12, () => false);
    expect(result.restored).toBe(0);
    expect(result.dropped).toBe(1);
    expect(restored.getOpenRequests()).toEqual([]);
  });
});
