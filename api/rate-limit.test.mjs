import assert from "node:assert/strict";
import { test } from "node:test";
import { rateLimitOk } from "./rate-limit.mjs";

test("only loopback development requests bypass an absent limiter binding", async () => {
  assert.equal(await rateLimitOk({}, new Request("http://localhost:8787/api/subscribe"), "newsletter"), true);
  assert.equal(await rateLimitOk({}, new Request("http://127.0.0.1:8787/api/subscribe"), "newsletter"), true);
  await assert.rejects(
    rateLimitOk({}, new Request("https://api.example/api/subscribe"), "newsletter"),
    /Rate limiter unavailable/,
  );
});

test("allows only successful limiter decisions and scopes keys by bucket and IP", async () => {
  let observedKey;
  const request = new Request("https://api.example/api/subscribe", {
    headers: { "CF-Connecting-IP": "192.0.2.10" },
  });
  const env = { RATE_LIMITER: { limit: async ({ key }) => { observedKey = key; return { success: true }; } } };
  assert.equal(await rateLimitOk(env, request, "newsletter"), true);
  assert.equal(observedKey, "newsletter:192.0.2.10");
  assert.equal(await rateLimitOk({ RATE_LIMITER: { limit: async () => ({ success: false }) } }, request, "newsletter"), false);
});

test("rate limiter outages fail closed without exposing upstream errors", async () => {
  await assert.rejects(
    rateLimitOk({ RATE_LIMITER: { limit: async () => { throw new Error("private upstream detail"); } } },
      new Request("https://api.example/api/subscribe"), "newsletter"),
    (error) => error.message === "Rate limiter unavailable" && !error.message.includes("private"),
  );
});
