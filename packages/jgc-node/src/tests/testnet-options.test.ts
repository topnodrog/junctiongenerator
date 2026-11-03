import { describe, expect, it } from "@jest/globals";
import { resolve } from "path";
import { isLocalPeerHost, parseTestnetOptions, validatePeerUrl } from "../config/testnet-options.js";

describe("public testnet options", () => {
  it("keeps the safe local defaults", () => {
    expect(parseTestnetOptions([], {})).toEqual({
      host: "127.0.0.1",
      port: 19444,
      statusHost: "127.0.0.1",
      statusPort: 7777,
      dataDir: resolve("./data/testnet"),
      advertiseUrl: undefined,
      seeds: [],
      produce: false,
      participate: false,
      blockIntervalSec: 600,
      allowPrivateStatusOnPublicBind: false,
    });
  });

  it("reads container configuration from the environment", () => {
    const options = parseTestnetOptions([], {
      JGC_P2P_HOST: "0.0.0.0",
      JGC_P2P_PORT: "20000",
      JGC_STATUS_HOST: "0.0.0.0",
      JGC_STATUS_PORT: "8000",
      JGC_DATA_DIR: "/data",
      JGC_ADVERTISE_URL: "wss://seed-b.example.test",
      JGC_SEEDS: "wss://seed-a.example.test, wss://seed-c.example.test",
      JGC_PRODUCE: "yes",
      JGC_PARTICIPATE: "true",
      JGC_BLOCK_INTERVAL_SEC: "45",
    });

    expect(options).toMatchObject({
      host: "0.0.0.0",
      port: 20000,
      statusHost: "0.0.0.0",
      statusPort: 8000,
      dataDir: resolve("/data"),
      advertiseUrl: "wss://seed-b.example.test",
      seeds: ["wss://seed-a.example.test", "wss://seed-c.example.test"],
      produce: true,
      participate: true,
      blockIntervalSec: 45,
    });
  });

  it("gives command-line values precedence over environment values", () => {
    const options = parseTestnetOptions([
      "--host", "127.0.0.2",
      "--seed", "wss://cli-a.example.test",
      "--seed", "wss://cli-b.example.test",
      "--advertise", "wss://cli.example.test",
      "--block-interval", "10",
    ], {
      JGC_P2P_HOST: "0.0.0.0",
      JGC_SEEDS: "wss://environment.example.test",
      JGC_ADVERTISE_URL: "wss://environment-advertise.example.test",
      JGC_BLOCK_INTERVAL_SEC: "60",
    });

    expect(options.host).toBe("127.0.0.2");
    expect(options.seeds).toEqual([
      "wss://cli-a.example.test",
      "wss://cli-b.example.test",
    ]);
    expect(options.advertiseUrl).toBe("wss://cli.example.test");
    expect(options.blockIntervalSec).toBe(10);
  });

  it.each([
    ["JGC_P2P_PORT", "70000"],
    ["JGC_STATUS_PORT", "not-a-port"],
    ["JGC_PRODUCE", "sometimes"],
    ["JGC_PARTICIPATE", "sometimes"],
    ["JGC_BLOCK_INTERVAL_SEC", "0"],
  ])("rejects invalid %s", (name, value) => {
    expect(() => parseTestnetOptions([], { [name]: value })).toThrow();
  });

  it("reads the separate public API listener and status token from the environment", () => {
    expect(parseTestnetOptions([], {
      JGC_PUBLIC_API_HOST: "0.0.0.0",
      JGC_PUBLIC_API_PORT: "7778",
      JGC_STATUS_TOKEN: "operator-secret",
      JGC_STATUS_ALLOWED_ORIGINS: "https://junctiongenerator.net, https://www.junctiongenerator.net",
    })).toMatchObject({
      publicApiHost: "0.0.0.0",
      publicApiPort: 7778,
      statusToken: "operator-secret",
      allowedOrigins: ["https://junctiongenerator.net", "https://www.junctiongenerator.net"],
    });
  });
});

describe("bootstrap URL validation", () => {
  it("accepts only websocket URLs and preserves the operator's literal string", () => {
    expect(validatePeerUrl("wss://seed.example.test", "seed")).toBe("wss://seed.example.test");
    expect(validatePeerUrl("wss://seed.example.test/peer", "seed")).toBe("wss://seed.example.test/peer");
    expect(validatePeerUrl(" ws://producer:19444 ", "seed")).toBe("ws://producer:19444");
  });

  it.each([
    "http://seed.example.test",
    "https://seed.example.test",
    "ws://public-seed.example.net",
    "wss://user:password@seed.example.test",
    "wss://seed.example.test/?token=abc",
    "wss://seed.example.test/#fragment",
    "not-a-url",
  ])("rejects unsafe bootstrap URL %s", (value) => {
    expect(() => validatePeerUrl(value, "seed")).toThrow();
  });

  it("rejects cleartext public seeds, duplicate seeds, and seed floods", () => {
    expect(() => parseTestnetOptions([], { JGC_SEEDS: "ws://seed.example.net" })).toThrow(/cleartext/);
    expect(() => parseTestnetOptions([], {
      JGC_SEEDS: "wss://a.example.test,wss://a.example.test",
    })).toThrow(/duplicate/);
    expect(() => parseTestnetOptions([], {
      JGC_SEEDS: Array.from({ length: 33 }, (_, i) => `wss://s${i}.example.test`).join(","),
    })).toThrow(/at most 32/);
  });

  it("classifies only local/private hosts as eligible for cleartext ws", () => {
    for (const host of ["localhost", "127.0.0.1", "10.1.2.3", "192.168.1.4", "172.20.0.2", "producer", "[::1]"]) {
      expect(isLocalPeerHost(host)).toBe(true);
    }
    for (const host of ["seed.example.net", "8.8.8.8", "172.32.0.1"]) {
      expect(isLocalPeerHost(host)).toBe(false);
    }
  });
});
