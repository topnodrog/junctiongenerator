import {
  evaluatePilotReadiness,
  type PilotReadinessSnapshot,
} from "../ops/pilot-readiness.js";

const capturedAt = "2026-08-13T12:00:00.000Z";

function healthySnapshot(): PilotReadinessSnapshot {
  return {
    capturedAt,
    externalRunnerConnected: true,
    seeds: [
      {
        id: "seed-a",
        provider: "Google Cloud",
        reachable: true,
        network: "jgtc-testnet-v1",
        height: 400,
        peerCount: 2,
        producerEnabled: true,
        diskUsedPercent: 22,
        certificateExpiresAt: "2026-11-13T12:00:00.000Z",
        lastSnapshotAt: "2026-08-13T06:00:00.000Z",
        lastRestoreTestAt: "2026-08-10T12:00:00.000Z",
        billingAlertConfigured: true,
        corruptionErrors: 0,
        repeatedPeerBans: 0,
      },
      {
        id: "seed-b",
        provider: "Fly.io",
        reachable: true,
        network: "jgtc-testnet-v1",
        height: 399,
        peerCount: 2,
        producerEnabled: false,
        diskUsedPercent: 18,
        certificateExpiresAt: "2026-11-13T12:00:00.000Z",
        lastSnapshotAt: "2026-08-13T05:30:00.000Z",
        lastRestoreTestAt: "2026-08-10T12:00:00.000Z",
        billingAlertConfigured: true,
        corruptionErrors: 0,
        repeatedPeerBans: 0,
      },
    ],
  };
}

describe("pilot readiness tracking", () => {
  test("passes a healthy two-seed snapshot", () => {
    const report = evaluatePilotReadiness(healthySnapshot());
    expect(report.status).toBe("pass");
    expect(report.summary.failures).toBe(0);
  });

  test("fails on divergence and missing recovery evidence", () => {
    const snapshot = healthySnapshot();
    snapshot.seeds[1].height = 390;
    snapshot.seeds[1].lastRestoreTestAt = undefined;
    const report = evaluatePilotReadiness(snapshot);
    expect(report.status).toBe("fail");
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "pair.height", severity: "fail" }),
      expect.objectContaining({ id: "seed-b.restore", severity: "fail" }),
    ]));
  });

  test("fails when log-review evidence is missing", () => {
    const snapshot = healthySnapshot();
    snapshot.seeds[0].corruptionErrors = undefined;
    snapshot.seeds[1].repeatedPeerBans = undefined;
    const report = evaluatePilotReadiness(snapshot);
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "seed-a.corruption", severity: "fail" }),
      expect.objectContaining({ id: "seed-b.peer-bans", severity: "fail" }),
    ]));
  });

  test("passes a declared seed-loss drill when the runner survives", () => {
    const snapshot = healthySnapshot();
    snapshot.expectedOutage = "seed-a";
    snapshot.seeds[0].reachable = false;
    const report = evaluatePilotReadiness(snapshot);
    expect(report.status).toBe("pass");
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "seed-a.outage", severity: "pass" }),
      expect.objectContaining({ id: "outage.external-runner", severity: "pass" }),
    ]));
  });

  test("fails an outage drill when external continuity is unproven", () => {
    const snapshot = healthySnapshot();
    snapshot.expectedOutage = "seed-b";
    snapshot.externalRunnerConnected = false;
    snapshot.seeds[1].reachable = false;
    expect(evaluatePilotReadiness(snapshot).status).toBe("fail");
  });
});
