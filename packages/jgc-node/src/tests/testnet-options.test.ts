import { describe, expect, it } from "@jest/globals";
import { resolve } from "path";
import { parseTestnetOptions } from "../config/testnet-options.js";

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
});
