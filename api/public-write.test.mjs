import assert from "node:assert/strict";
import { test } from "node:test";
import { PUBLIC_ACTIONS, readPublicJson, validateTurnstile } from "./public-write.mjs";

const env = { TURNSTILE_SECRET_KEY: "test-secret", TURNSTILE_HOSTNAMES: "junctiongenerator.net,www.junctiongenerator.net" };
const request = new Request("https://api.example/api/subscribe", { headers: { "CF-Connecting-IP": "192.0.2.1" } });
const verified = (overrides = {}) => async () => Response.json({
  success: true, action: "newsletter", hostname: "junctiongenerator.net", ...overrides,
});

test("only active public forms use Turnstile; legacy airdrop stays retired", () => {
  assert.deepEqual(Object.values(PUBLIC_ACTIONS), ["newsletter", "hire", "community-join", "community-activate"]);
  assert.equal(PUBLIC_ACTIONS["/api/airdrop/register"], undefined);
});

test("missing config, missing tokens, and oversized tokens fail before network calls", async () => {
  const noFetch = () => { throw new Error("Must not call Siteverify"); };
  assert.equal((await validateTurnstile(request, {}, {}, "newsletter", noFetch)).status, 503);
  for (const token of [undefined, "", " ", {}, "x".repeat(2049)]) {
    assert.equal((await validateTurnstile(request, env, { turnstileToken: token }, "newsletter", noFetch)).status, 400);
  }
});

test("validates tokens with Cloudflare and binds acceptance to the hostname and action", async () => {
  let sent;
  const fetcher = async (url, options) => {
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    sent = JSON.parse(options.body);
    return verified()();
  };
  assert.equal((await validateTurnstile(request, env, { turnstileToken: "token" }, "newsletter", fetcher)).status, 200);
  assert.deepEqual(sent, { secret: "test-secret", response: "token", remoteip: "192.0.2.1" });
  for (const invalid of [
    { success: false, "error-codes": ["timeout-or-duplicate"] },
    { success: "true" }, { action: "hire" }, { hostname: "attacker.example" },
    { hostname: "junctiongenerator.net.attacker.example" }, { hostname: "localhost" },
  ]) {
    assert.equal((await validateTurnstile(request, env, { turnstileToken: "token" }, "newsletter", verified(invalid))).status, 400);
  }
});

test("verification outages fail closed without exposing upstream details", async () => {
  for (const fetcher of [async () => { throw new Error("private upstream detail"); },
    async () => new Response("upstream failure", { status: 500 }),
    async () => new Response("invalid JSON")]) {
    const result = await validateTurnstile(request, env, { turnstileToken: "token" }, "newsletter", fetcher);
    assert.equal(result.status, 503);
    assert.ok(!result.error.includes("private"));
  }
});

test("reads bounded JSON and rejects malformed, non-object, or oversized submissions", async () => {
  const form = (body, type = "application/json") => new Request("https://api.example", {
    method: "POST", headers: { "Content-Type": type }, body,
  });
  assert.deepEqual(await readPublicJson(form('{"email":"reader@example.com"}')), { body: { email: "reader@example.com" } });
  for (const body of ["{", "[]", "null", '"text"']) {
    assert.equal((await readPublicJson(form(body))).status, 400);
  }
  assert.equal((await readPublicJson(form("{}", "text/plain"))).status, 415);
  assert.equal((await readPublicJson(form("x".repeat(16385)))).status, 413);
});
