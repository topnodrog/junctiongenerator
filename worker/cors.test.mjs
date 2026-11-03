import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedOrigins, corsHeadersFor } from "./cors.mjs";

const request = (origin) => new Request("https://api.example/api/health", {
  headers: origin ? { Origin: origin } : {},
});

test("unrecognized origins are never reflected", () => {
  for (const origin of [
    "https://evil.example",
    "https://attacker-junction.vercel.app",
    "https://junctiongenerator.net.attacker.example",
    "null",
    "https://evil.vercel.app.evil.example",
  ]) {
    assert.equal(corsHeadersFor(request(origin))["Access-Control-Allow-Origin"], "https://junctiongenerator.net");
  }
  assert.equal(corsHeadersFor(request(""))["Access-Control-Allow-Origin"], "https://junctiongenerator.net");
});

test("production and local development origins are reflected exactly", () => {
  for (const origin of [
    "https://junctiongenerator.net",
    "https://www.junctiongenerator.net",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]) {
    assert.equal(corsHeadersFor(request(origin))["Access-Control-Allow-Origin"], origin);
  }
});

test("preview origins require an explicit https allowlist entry", () => {
  const env = { ALLOWED_PREVIEW_ORIGINS: "https://jg-preview-team.vercel.app, https://review.example.org" };
  assert.ok(allowedOrigins(env).has("https://jg-preview-team.vercel.app"));
  assert.ok(allowedOrigins(env).has("https://review.example.org"));
  assert.equal(corsHeadersFor(request("https://jg-preview-team.vercel.app"), env)["Access-Control-Allow-Origin"], "https://jg-preview-team.vercel.app");
  assert.equal(corsHeadersFor(request("https://other-account.vercel.app"), env)["Access-Control-Allow-Origin"], "https://junctiongenerator.net");
});

test("malformed preview entries are ignored rather than trusted", () => {
  const env = { ALLOWED_PREVIEW_ORIGINS: "http://plain.example, https://u:p@bad.example, not-a-url, https://ok.example/path" };
  assert.deepEqual([...allowedOrigins(env)].filter((o) => !o.startsWith("http://localhost")), [
    "https://junctiongenerator.net",
    "https://www.junctiongenerator.net",
    "http://127.0.0.1:3000",
  ]);
});
