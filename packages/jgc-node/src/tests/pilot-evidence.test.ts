import {
  collectPilotEvidence,
  latestSnapshotTimestamp,
  parseDiskUsedPercent,
  parseNodeStatus,
  validatePilotEvidenceAttestations,
  windowsCommandArguments,
  type CertificateExpiryReader,
  type CommandRunner,
} from "../ops/pilot-evidence.js";

describe("pilot evidence collection", () => {
  test("builds a Windows cmd invocation without quoting simple gcloud verbs", () => {
    expect(windowsCommandArguments("gcloud.cmd", ["compute", "ssh", "--command", "df -P /var/lib/jgc"]))
      .toEqual(["/d", "/s", "/c", "gcloud.cmd compute ssh --command \"df -P /var/lib/jgc\""]);
    expect(() => windowsCommandArguments("gcloud.cmd", ["compute", "bad|command"]))
      .toThrow("shell metacharacter");
  });

  test("parses private status and disk observations", () => {
    expect(parseNodeStatus(JSON.stringify({
      network: "jgc-testnet-v3",
      height: 42,
      peerCount: 2,
      producer: { enabled: true },
    }))).toEqual({
      network: "jgc-testnet-v3",
      height: 42,
      peerCount: 2,
      producerEnabled: true,
    });
    expect(parseDiskUsedPercent("/dev/sdb 20511356 1000 20400000 17% /var/lib/jgc")).toBe(17);
  });

  test("selects the newest provider snapshot across supported timestamp fields", () => {
    expect(latestSnapshotTimestamp(JSON.stringify([
      { creationTimestamp: "2026-08-11T02:00:00Z" },
      { creationTimestamp: "2026-08-13T02:00:00Z" },
    ]))).toBe("2026-08-13T02:00:00.000Z");
    expect(latestSnapshotTimestamp(JSON.stringify([
      { status: "created", created_at: "2026-08-12T03:00:00Z" },
      { status: "running", created_at: "2026-08-13T03:00:00Z" },
    ]))).toBe("2026-08-12T03:00:00.000Z");
  });

  test("validates and normalizes manual attestations", () => {
    expect(validatePilotEvidenceAttestations({
      externalRunnerConnected: null,
      seeds: {
        "seed-a": { billingAlertConfigured: null, lastRestoreTestAt: null, corruptionErrors: null },
      },
    })).toEqual({ seeds: { "seed-a": {} } });
    expect(() => validatePilotEvidenceAttestations({
      seeds: { "seed-b": { repeatedPeerBans: -1 } },
    })).toThrow("non-negative integer");
  });

  test("collects both providers into one readiness snapshot", async () => {
    const invocations: string[][] = [];
    const runner: CommandRunner = async (command, args) => {
      invocations.push([command, ...args]);
      const joined = args.join(" ");
      if (joined.includes("/status") || (command === "flyctl" && joined.includes("ssh console") && !joined.includes("df -P"))) {
        const seedA = command.startsWith("gcloud");
        return JSON.stringify({
          network: "jgc-testnet-v3",
          height: seedA ? 501 : 500,
          peerCount: 2,
          producer: { enabled: seedA },
        });
      }
      if (joined.includes("df -P") || joined.includes("df${IFS}-P")) return command.startsWith("gcloud") ? "disk 100 20 80 20% /var/lib/jgc" : "disk 100 25 75 25% /data";
      if (command.startsWith("gcloud")) return JSON.stringify([{ creationTimestamp: "2026-08-13T05:00:00Z" }]);
      return JSON.stringify([{ created_at: "2026-08-13T05:30:00Z" }]);
    };
    const certificateReader: CertificateExpiryReader = async url =>
      url.includes("seed-a") ? "2026-11-13T00:00:00.000Z" : "2026-11-14T00:00:00.000Z";

    const snapshot = await collectPilotEvidence({
      googleProject: "test-project",
      flyVolumeId: "vol_test",
    }, {
      externalRunnerConnected: true,
      seeds: {
        "seed-a": { billingAlertConfigured: true, lastRestoreTestAt: "2026-08-12T00:00:00Z", corruptionErrors: 0, repeatedPeerBans: 0 },
        "seed-b": { billingAlertConfigured: true, lastRestoreTestAt: "2026-08-12T00:00:00Z", corruptionErrors: 0, repeatedPeerBans: 0 },
      },
    }, runner, certificateReader, () => new Date("2026-08-13T12:00:00Z"));

    expect(snapshot.capturedAt).toBe("2026-08-13T12:00:00.000Z");
    expect(invocations).toContainEqual(expect.arrayContaining([
      expect.stringMatching(/^gcloud/),
      "--filter=sourceDisk~jgc-seed-a-data$",
    ]));
    expect(snapshot.seeds[0]).toEqual(expect.objectContaining({
      id: "seed-a",
      reachable: true,
      height: 501,
      diskUsedPercent: 20,
      lastSnapshotAt: "2026-08-13T05:00:00.000Z",
      producerEnabled: true,
    }));
    expect(snapshot.seeds[1]).toEqual(expect.objectContaining({
      id: "seed-b",
      reachable: true,
      height: 500,
      diskUsedPercent: 25,
      lastSnapshotAt: "2026-08-13T05:30:00.000Z",
      producerEnabled: false,
    }));
  });

  test("records sanitized collection failures instead of inventing evidence", async () => {
    const runner: CommandRunner = async command => {
      if (command.startsWith("gcloud")) throw new Error("authentication unavailable\nretry login");
      throw new Error("fly unavailable");
    };
    const certificateReader: CertificateExpiryReader = async () => {
      throw new Error("certificate unavailable");
    };
    const snapshot = await collectPilotEvidence({
      googleProject: "test-project",
      flyVolumeId: "vol_test",
    }, {}, runner, certificateReader, () => new Date("2026-08-13T12:00:00Z"));

    expect(snapshot.seeds.every(seed => seed.reachable === false)).toBe(true);
    expect(snapshot.seeds[0].collectionError).toContain("authentication unavailable retry login");
    expect(snapshot.seeds[1].collectionError).toContain("fly unavailable");
  });
});
