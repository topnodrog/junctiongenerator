import assert from "node:assert/strict";
import { test } from "node:test";
import { checkSeeds, seedHttpsOrigin } from "./monitor.mjs";

const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const healthyExplorer = {
  network: "jgtc-testnet-v2", height: 42, peerCount: 2,
  health: "healthy", issuance: { supplyConserved: true },
};

test("derives an https origin only from a clean wss seed", () => {
  assert.equal(seedHttpsOrigin("wss://seed.example.test"), "https://seed.example.test");
  assert.throws(() => seedHttpsOrigin("ws://seed.example.test"), /wss/);
  assert.throws(() => seedHttpsOrigin("wss://user:pass@seed.example.test"), /credentials/);
  assert.throws(() => seedHttpsOrigin("wss://seed.example.test/?token=1"), /query/);
});

test("accepts healthy, supply-conserving seeds", async () => {
  const report = await checkSeeds(["wss://seed-a.example.test", "wss://seed-b.example.test"], async (url) => {
    return url.endsWith("/healthz") ? response({ ok: true }) : response(healthyExplorer);
  });
  assert.equal(report.healthy, 2);
  assert.equal(report.total, 2);
  assert.equal(report.results[0].height, 42);
});

test("fails closed on wrong network, broken supply, unhealthy status and errors", async () => {
  const cases = [
    response({ ...healthyExplorer, network: "other-chain" }),
    response({ ...healthyExplorer, issuance: { supplyConserved: false } }),
    response({ error: "down" }, 503),
  ];
  for (const explorer of cases) {
    const report = await checkSeeds(["wss://seed.example.test"], async (url) =>
      url.endsWith("/healthz") ? response({ ok: true }) : explorer);
    assert.equal(report.healthy, 0);
    assert.ok(report.results[0].error);
  }
  const failing = await checkSeeds(["wss://seed.example.test"], async () => { throw new Error("private detail"); });
  assert.equal(failing.healthy, 0);
  assert.ok(failing.results[0].error);
});

test("rejects empty or oversized seed lists", async () => {
  await assert.rejects(() => checkSeeds([], async () => response({ ok: true })), /1\.\.32/);
  await assert.rejects(() => checkSeeds(Array.from({ length: 33 }, (_, i) => `wss://s${i}.example.test`),
    async () => response({ ok: true })), /1\.\.32/);
});
