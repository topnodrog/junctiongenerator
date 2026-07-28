import {
  auditWindow,
  buildAuditSchedule,
  DEFAULT_AUDIT_POLICY,
  type AuditableComputeClaim,
  type AuditValidator,
} from "../broker/audit-schedule.js";

const BEACON_A = "aa".repeat(32);
const BEACON_B = "bb".repeat(32);

function claim(claimantId: string, n: number, blockHeight: number): AuditableComputeClaim {
  return {
    claimId: `${claimantId}-claim-${n}`,
    claimantId,
    commitment: Buffer.from(`${claimantId}:${n}`).toString("hex").padEnd(64, "0").slice(0, 64),
    blockHeight,
  };
}

const validators: AuditValidator[] = [
  { validatorId: "miner-a", bondedStake: 100n, active: true },
  { validatorId: "miner-b", bondedStake: 100n, active: true },
  { validatorId: "validator-c", bondedStake: 100n, active: true },
  { validatorId: "validator-d", bondedStake: 100n, active: true },
  { validatorId: "validator-e", bondedStake: 100n, active: true },
];

describe("historical compute audit scheduling", () => {
  test("uses ten-block windows and a delayed beacon by default", () => {
    expect(auditWindow(0)).toEqual({ index: 0, startHeight: 1, endHeight: 10, beaconHeight: 12 });
    expect(auditWindow(3)).toEqual({ index: 3, startHeight: 31, endHeight: 40, beaconHeight: 42 });
  });

  test("requires the exact future beacon height", () => {
    expect(() => buildAuditSchedule(
      auditWindow(0),
      { height: 11, hash: BEACON_A },
      [claim("miner-a", 1, 5)],
      validators,
    )).toThrow("audit beacon must be block 12");
  });

  test("guarantees one unpredictable coverage claim per claimant", () => {
    const claims = [
      claim("miner-a", 1, 1),
      claim("miner-a", 2, 5),
      claim("miner-a", 3, 10),
      claim("miner-b", 1, 4),
      claim("miner-b", 2, 8),
      claim("outside", 1, 11),
    ];
    const schedule = buildAuditSchedule(
      auditWindow(0),
      { height: 12, hash: BEACON_A },
      claims,
      validators,
    );

    expect(schedule.assignments).toHaveLength(2);
    expect(schedule.assignments.map((a) => a.claimantId).sort()).toEqual(["miner-a", "miner-b"]);
    expect(schedule.assignments.every((a) => a.reason === "coverage")).toBe(true);
    expect(schedule.uncoveredClaimants).toEqual([]);
  });

  test("selects independent bonded committees and excludes the claimant", () => {
    const roster = [
      ...validators,
      { validatorId: "inactive", bondedStake: 100n, active: false },
      { validatorId: "unbonded", bondedStake: 0n, active: true },
    ];
    const schedule = buildAuditSchedule(
      auditWindow(0),
      { height: 12, hash: BEACON_A },
      [claim("miner-a", 1, 5)],
      roster,
      { ...DEFAULT_AUDIT_POLICY, minimumBond: 10n },
    );
    const committee = schedule.assignments[0]!.committee;

    expect(committee).toHaveLength(3);
    expect(new Set(committee).size).toBe(3);
    expect(committee).not.toContain("miner-a");
    expect(committee).not.toContain("inactive");
    expect(committee).not.toContain("unbonded");
  });

  test("is deterministic, while a different beacon changes sortition", () => {
    const claims = Array.from({ length: 8 }, (_, i) => claim("miner-a", i, i + 1));
    const a1 = buildAuditSchedule(auditWindow(0), { height: 12, hash: BEACON_A }, claims, validators);
    const a2 = buildAuditSchedule(auditWindow(0), { height: 12, hash: BEACON_A }, claims, validators);
    const b = buildAuditSchedule(auditWindow(0), { height: 12, hash: BEACON_B }, claims, validators);

    expect(a1).toEqual(a2);
    expect(a1.assignments[0]!.claimId).not.toBe(b.assignments[0]!.claimId);
  });

  test("can sample additional claims without weakening coverage", () => {
    const claims = [
      claim("miner-a", 1, 2),
      claim("miner-a", 2, 3),
      claim("miner-a", 3, 4),
    ];
    const schedule = buildAuditSchedule(
      auditWindow(0),
      { height: 12, hash: BEACON_A },
      claims,
      validators,
      { ...DEFAULT_AUDIT_POLICY, extraClaimProbability: 1 },
    );

    expect(schedule.assignments).toHaveLength(3);
    expect(schedule.assignments.filter((a) => a.reason === "coverage")).toHaveLength(1);
    expect(schedule.assignments.filter((a) => a.reason === "random-sample")).toHaveLength(2);
  });

  test("reports a coverage failure rather than assigning an undersized quorum", () => {
    const schedule = buildAuditSchedule(
      auditWindow(0),
      { height: 12, hash: BEACON_A },
      [claim("miner-a", 1, 2)],
      [
        { validatorId: "miner-a", bondedStake: 100n, active: true },
        { validatorId: "only-one-other", bondedStake: 100n, active: true },
      ],
    );

    expect(schedule.assignments).toEqual([]);
    expect(schedule.uncoveredClaimants).toEqual(["miner-a"]);
  });

  test("rejects duplicate identities that could fake an independent quorum", () => {
    const c = claim("miner-a", 1, 2);
    expect(() => buildAuditSchedule(
      auditWindow(0),
      { height: 12, hash: BEACON_A },
      [c, { ...c }],
      validators,
    )).toThrow("duplicate or empty audit claim id");

    expect(() => buildAuditSchedule(
      auditWindow(0),
      { height: 12, hash: BEACON_A },
      [c],
      [...validators, { ...validators[2]! }],
    )).toThrow("duplicate or empty audit validator id");
  });
});
