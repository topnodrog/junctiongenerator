import { TESTNET_GENESIS_HASH } from "../config/networks.js";
import type { ExplorerSnapshot, ExplorerBlock } from "../network/public-testnet-api.js";
import { startMonitor, advanceMonitor, validateRunner, observationFindings, type MonitorObservation, type MonitorState } from "../ops/hosted-soak-monitor.js";

const WINDOW = "owner-test-window";
const PARTICIPANTS = ["1QGC" + "a".repeat(40), "1QGC" + "b".repeat(40)];
const START_HEIGHT = 1006;
const BASE = Date.parse("2026-09-09T10:00:00Z");
const hash = (height: number): string => height.toString(16).padStart(64, "0");

function observation(height = START_HEIGHT, milliseconds = BASE + (height - START_HEIGHT) * 600_000): MonitorObservation {
  const capturedAt = new Date(milliseconds).toISOString();
  const index = (height + 1) % 144;
  const pending = index * 50;
  const total = (height + 1) * 50;
  const blocks: ExplorerBlock[] = Array.from({ length: 12 }, (_, n) => {
    const h = height - n;
    return { height: h, hash: hash(h), previousHash: hash(h - 1), timestamp: Math.floor(BASE / 1000) + (h - START_HEIGHT) * 600,
      participants: [...PARTICIPANTS], transactionCount: 1, contributionCount: 2, totalParticipationWeight: 2000,
      computeRoot: "0".repeat(64), epochRoot: "0".repeat(64) };
  });
  const explorer: ExplorerSnapshot = {
    capturedAt, network: "jgtc-testnet-v2", proofMode: "simnet-receipts-v1", currencySymbol: "JGTC",
    targetBlockIntervalSec: 600, genesisHash: TESTNET_GENESIS_HASH, height, tipHash: hash(height),
    peerCount: 4, mempoolSize: 0, pendingContributions: 2, targetParticipationWeight: 1000, health: "healthy",
    producer: { running: true, intervalSec: 600, producedBlocks: height, lastProducedHeight: height, lastProducedAt: milliseconds, lastError: null, waitingForTFLOPS: 1000 },
    epoch: { index: Math.floor((height + 1) / 144), blockIndex: index, blocksRemaining: 144 - index,
      nextSettlementHeight: height + 144 - index, totalParticipationWeight: index * 2000,
      pendingRewardPoolJGTC: String(pending), participants: index ? PARTICIPANTS.map(address => ({ address, participationWeight: index * 1000, sharePercent: 50, projectedJGTC: "3600" })) : [] },
    issuance: { preminedJGTC: "0", genesisSpendableSupplyJGTC: "0", settlementIntervalBlocks: 144,
      settlementsCompleted: Math.floor((height + 1) / 144), utxoSupplyJGTC: String(total - pending), pendingEmissionJGTC: String(pending),
      accountedSupplyJGTC: String(total), expectedSupplyJGTC: String(total), supplyConserved: true }, recentBlocks: blocks,
  };
  return { capturedAt, explorer, transport: [{ seed: "seed-a", reachable: true, latencyMs: 5 }, { seed: "seed-b", reachable: true, latencyMs: 10 }],
    runner: { windowId: WINDOW, capturedAt, running: true, network: "jgtc-testnet-v2", height, peerCount: 2, producerEnabled: false,
      uptimeSec: 1000 + (milliseconds - BASE) / 1000, nodeVersion: "0.1.0", platform: "win32", architecture: "x64", runtimeVersion: "v22.0.0" } };
}

describe("hosted owner soak monitor", () => {
  test("refuses an unhealthy or incomplete baseline", () => {
    const missing = observation(); missing.runner = null;
    expect(() => startMonitor(WINDOW, PARTICIPANTS, missing)).toThrow(/baseline/);
    const absent = observation(); absent.explorer!.epoch.participants = []; absent.explorer!.epoch.totalParticipationWeight = 0;
    expect(() => startMonitor(WINDOW, PARTICIPANTS, absent)).toThrow(/participants/);
    expect(() => startMonitor(WINDOW, [PARTICIPANTS[0], PARTICIPANTS[0]], observation())).toThrow(/configuration/);
  });

  test("starts at the next full epoch and does not credit the partial epoch", () => {
    const state = startMonitor(WINDOW, PARTICIPANTS, observation());
    expect(state.firstFullEpochHeight).toBe(1008);
    expect(state.targetSettlementHeights).toEqual([1151, 1295, 1439]);
    expect(state.formalAcceptancePassed).toBe(false);
    expect(state.settlementPayoutBytesVerified).toBe(false);
  });

  test("retains transport failures and stale runner evidence", () => {
    const row = observation(); row.transport[1].reachable = false; row.runner!.capturedAt = new Date(BASE - 16 * 60_000).toISOString();
    expect(observationFindings(row, WINDOW).map(f => f.id)).toEqual(expect.arrayContaining(["seed-b.transport", "runner.stale"]));
  });

  test("detects a missing hourly observation even when later chain data is valid", () => {
    const state = startMonitor(WINDOW, PARTICIPANTS, observation());
    const result = advanceMonitor(state, observation(START_HEIGHT + 6, BASE + 61 * 60_000));
    expect(result.state.observationGaps).toBe(1);
    expect(result.findings.map(f => f.id)).toContain("coverage.gap");
    const recovered = advanceMonitor(result.state, observation(START_HEIGHT + 7, BASE + 71 * 60_000));
    expect(recovered.state.findingsById["coverage.gap"].count).toBe(1);
  });

  test("records changed canonical blocks and missing owner contributions", () => {
    let state = startMonitor(WINDOW, PARTICIPANTS, observation());
    state = advanceMonitor(state, observation(1008)).state;
    const row = observation(1009); row.explorer!.recentBlocks[1].hash = "f".repeat(64);
    row.explorer!.recentBlocks[0].participants = [PARTICIPANTS[0]];
    const result = advanceMonitor(state, row);
    expect(result.findings.map(f => f.id)).toEqual(expect.arrayContaining(["chain.changed", "participant.missing"]));
    expect(state.blocks["1008"].hash).toBe(hash(1008));
  });

  test("completes three fully observed contribution epochs but never certifies payout bytes or formal acceptance", () => {
    let state: MonitorState = startMonitor(WINDOW, PARTICIPANTS, observation());
    for (let height = 1007; height <= 1439; height++) state = advanceMonitor(state, observation(height)).state;
    expect(state.phase).toBe("completed");
    expect(state.completeContributionEpochs).toBe(3);
    expect(Object.keys(state.blocks)).toHaveLength(432);
    expect(state.formalAcceptancePassed).toBe(false);
    expect(state.settlementPayoutBytesVerified).toBe(false);
    expect(() => advanceMonitor(state, observation(1440))).toThrow(/closed/);
  });

  test("ends incomplete at the fixed deadline when targets were not reached", () => {
    const state = startMonitor(WINDOW, PARTICIPANTS, observation());
    const result = advanceMonitor(state, observation(1007, Date.parse(state.hardEndAt)));
    expect(result.state.phase).toBe("incomplete");
  });

  test("does not turn an observed restart into proof of an identity-preservation drill", () => {
    const state = startMonitor(WINDOW, PARTICIPANTS, observation());
    const row = observation(1007); row.runner!.uptimeSec = 2;
    expect(advanceMonitor(state, row).findings.map(f => f.id)).toContain("runner.restart");
  });

  test("sanitizes runner data and rejects another window or malformed status", () => {
    expect(validateRunner({ ...observation().runner, secret: "do-not-copy" }, WINDOW)).not.toHaveProperty("secret");
    expect(() => validateRunner(observation().runner, "different-window")).toThrow();
    expect(() => validateRunner({ ...observation().runner, height: "1006" }, WINDOW)).toThrow();
  });
});
