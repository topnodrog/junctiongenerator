export type SeedId = "seed-a" | "seed-b";
export type ReadinessSeverity = "pass" | "warn" | "fail";

export interface SeedTelemetry {
  id: SeedId;
  provider: string;
  reachable: boolean;
  network?: string;
  height?: number;
  peerCount?: number;
  producerEnabled?: boolean;
  diskUsedPercent?: number;
  certificateExpiresAt?: string;
  lastSnapshotAt?: string;
  lastRestoreTestAt?: string;
  billingAlertConfigured?: boolean;
  corruptionErrors?: number;
  repeatedPeerBans?: number;
  /** Sanitized collection failure details; must never include credentials. */
  collectionError?: string;
}

export interface PilotReadinessSnapshot {
  capturedAt: string;
  expectedOutage?: SeedId;
  externalRunnerConnected?: boolean;
  seeds: [SeedTelemetry, SeedTelemetry];
}

export interface ReadinessCheck {
  id: string;
  severity: ReadinessSeverity;
  message: string;
}

export interface PilotReadinessReport {
  capturedAt: string;
  status: ReadinessSeverity;
  checks: ReadinessCheck[];
  summary: { passed: number; warnings: number; failures: number };
}

const EXPECTED_NETWORK = "jgc-testnet-v3";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function check(
  checks: ReadinessCheck[],
  id: string,
  severity: ReadinessSeverity,
  message: string,
): void {
  checks.push({ id, severity, message });
}

function parsedTime(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ageMs(now: number, value: string | undefined): number | null {
  const parsed = parsedTime(value);
  return parsed === null ? null : Math.max(0, now - parsed);
}

function evaluateFreshness(
  checks: ReadinessCheck[],
  seed: SeedTelemetry,
  now: number,
): void {
  const snapshotAge = ageMs(now, seed.lastSnapshotAt);
  if (snapshotAge === null) {
    check(checks, `${seed.id}.snapshot`, "fail", `${seed.id} has no snapshot evidence`);
  } else if (snapshotAge > 48 * HOUR_MS) {
    check(checks, `${seed.id}.snapshot`, "fail", `${seed.id} snapshot is older than 48 hours`);
  } else if (snapshotAge > 30 * HOUR_MS) {
    check(checks, `${seed.id}.snapshot`, "warn", `${seed.id} snapshot is older than 30 hours`);
  } else {
    check(checks, `${seed.id}.snapshot`, "pass", `${seed.id} snapshot is fresh`);
  }

  const restoreAge = ageMs(now, seed.lastRestoreTestAt);
  if (restoreAge === null) {
    check(checks, `${seed.id}.restore`, "fail", `${seed.id} has no recorded restore exercise`);
  } else if (restoreAge > 30 * DAY_MS) {
    check(checks, `${seed.id}.restore`, "warn", `${seed.id} restore exercise is older than 30 days`);
  } else {
    check(checks, `${seed.id}.restore`, "pass", `${seed.id} restore exercise is current`);
  }

  const expiry = parsedTime(seed.certificateExpiresAt);
  if (expiry === null) {
    check(checks, `${seed.id}.certificate`, "fail", `${seed.id} has no certificate-expiry evidence`);
  } else {
    const remaining = expiry - now;
    if (remaining < 3 * DAY_MS) {
      check(checks, `${seed.id}.certificate`, "fail", `${seed.id} certificate expires in under 3 days`);
    } else if (remaining < 14 * DAY_MS) {
      check(checks, `${seed.id}.certificate`, "warn", `${seed.id} certificate expires in under 14 days`);
    } else {
      check(checks, `${seed.id}.certificate`, "pass", `${seed.id} certificate lifetime is healthy`);
    }
  }
}

function evaluateSeed(
  checks: ReadinessCheck[],
  seed: SeedTelemetry,
  now: number,
  expectedOutage: boolean,
): void {
  if (expectedOutage) {
    check(
      checks,
      `${seed.id}.outage`,
      seed.reachable ? "warn" : "pass",
      seed.reachable
        ? `${seed.id} is still reachable; the outage drill has not removed it`
        : `${seed.id} is unavailable as expected for the outage drill`,
    );
    return;
  }

  if (!seed.reachable) {
    const detail = seed.collectionError ? `: ${seed.collectionError}` : "";
    check(checks, `${seed.id}.reachable`, "fail", `${seed.id} is unexpectedly unreachable${detail}`);
    return;
  }
  check(checks, `${seed.id}.reachable`, "pass", `${seed.id} is reachable`);

  check(
    checks,
    `${seed.id}.network`,
    seed.network === EXPECTED_NETWORK ? "pass" : "fail",
    seed.network === EXPECTED_NETWORK
      ? `${seed.id} reports ${EXPECTED_NETWORK}`
      : `${seed.id} reports ${seed.network ?? "no network identity"}`,
  );

  check(
    checks,
    `${seed.id}.peers`,
    (seed.peerCount ?? 0) >= 1 ? "pass" : "fail",
    `${seed.id} peer count is ${seed.peerCount ?? "unknown"}`,
  );

  const expectedProducer = seed.id === "seed-a";
  check(
    checks,
    `${seed.id}.producer`,
    seed.producerEnabled === expectedProducer ? "pass" : "fail",
    `${seed.id} producer is ${seed.producerEnabled === true ? "enabled" : seed.producerEnabled === false ? "disabled" : "unknown"}; expected ${expectedProducer ? "enabled" : "disabled"}`,
  );

  const disk = seed.diskUsedPercent;
  if (disk === undefined) {
    check(checks, `${seed.id}.disk`, "fail", `${seed.id} has no disk-usage evidence`);
  } else if (disk >= 95) {
    check(checks, `${seed.id}.disk`, "fail", `${seed.id} disk usage is ${disk}%`);
  } else if (disk >= 85) {
    check(checks, `${seed.id}.disk`, "warn", `${seed.id} disk usage is ${disk}%`);
  } else {
    check(checks, `${seed.id}.disk`, "pass", `${seed.id} disk usage is ${disk}%`);
  }

  check(
    checks,
    `${seed.id}.billing`,
    seed.billingAlertConfigured === true ? "pass" : "fail",
    `${seed.id} billing alert is ${seed.billingAlertConfigured === true ? "recorded" : "not recorded"}`,
  );

  if (seed.corruptionErrors === undefined) {
    check(checks, `${seed.id}.corruption`, "fail", `${seed.id} has no corruption-log evidence`);
  } else if (seed.corruptionErrors > 0) {
    check(checks, `${seed.id}.corruption`, "fail", `${seed.id} reports ${seed.corruptionErrors} corruption error(s)`);
  } else {
    check(checks, `${seed.id}.corruption`, "pass", `${seed.id} reports no corruption errors`);
  }

  if (seed.repeatedPeerBans === undefined) {
    check(checks, `${seed.id}.peer-bans`, "fail", `${seed.id} has no repeated-peer-ban evidence`);
  } else if (seed.repeatedPeerBans > 0) {
    check(checks, `${seed.id}.peer-bans`, "warn", `${seed.id} reports ${seed.repeatedPeerBans} repeated peer ban(s)`);
  } else {
    check(checks, `${seed.id}.peer-bans`, "pass", `${seed.id} reports no repeated peer bans`);
  }

  evaluateFreshness(checks, seed, now);
}

export function evaluatePilotReadiness(snapshot: PilotReadinessSnapshot): PilotReadinessReport {
  const checks: ReadinessCheck[] = [];
  const capturedAt = Date.parse(snapshot.capturedAt);
  if (!Number.isFinite(capturedAt)) {
    throw new Error(`invalid capturedAt timestamp: ${snapshot.capturedAt}`);
  }

  const byId = new Map(snapshot.seeds.map(seed => [seed.id, seed]));
  const seedA = byId.get("seed-a");
  const seedB = byId.get("seed-b");
  if (!seedA || !seedB || byId.size !== 2) {
    throw new Error("snapshot must contain exactly seed-a and seed-b");
  }

  evaluateSeed(checks, seedA, capturedAt, snapshot.expectedOutage === "seed-a");
  evaluateSeed(checks, seedB, capturedAt, snapshot.expectedOutage === "seed-b");

  const active = snapshot.seeds.filter(seed => seed.id !== snapshot.expectedOutage && seed.reachable);
  if (active.length === 2) {
    const [first, second] = active;
    const heightKnown = first!.height !== undefined && second!.height !== undefined;
    const lag = heightKnown ? Math.abs(first!.height! - second!.height!) : Number.POSITIVE_INFINITY;
    check(
      checks,
      "pair.height",
      lag <= 1 ? "pass" : "fail",
      heightKnown
        ? `seed height difference is ${lag} block(s) (${first!.height} vs ${second!.height})`
        : "one or both seed heights are missing",
    );
  }

  if (snapshot.expectedOutage) {
    check(
      checks,
      "outage.external-runner",
      snapshot.externalRunnerConnected === true ? "pass" : "fail",
      snapshot.externalRunnerConnected === true
        ? "external runner remained connected through the surviving seed"
        : "external runner survival is not confirmed",
    );
  }

  const summary = {
    passed: checks.filter(item => item.severity === "pass").length,
    warnings: checks.filter(item => item.severity === "warn").length,
    failures: checks.filter(item => item.severity === "fail").length,
  };
  const status: ReadinessSeverity = summary.failures > 0 ? "fail" : summary.warnings > 0 ? "warn" : "pass";
  return { capturedAt: snapshot.capturedAt, status, checks, summary };
}
