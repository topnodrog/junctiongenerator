import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { prepareTestnetGenesisReset } from "../config/testnet-reset.js";

const GENESIS = "a".repeat(64);

describe("intentional testnet genesis reset", () => {
  const dataDir = join(tmpdir(), `jgtc-reset-${process.pid}`);

  beforeEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
    mkdirSync(dataDir, { recursive: true });
  });

  afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

  test("archives chain state exactly once and preserves participant identity", () => {
    writeFileSync(join(dataDir, "storage-manifest.json"), JSON.stringify({ chainId: "jgc-testnet-v3" }));
    writeFileSync(join(dataDir, "blocks.dat"), "old blocks");
    writeFileSync(join(dataDir, "chainstate.snapshot"), "old state");
    writeFileSync(join(dataDir, "audits.json"), "old audits");
    writeFileSync(join(dataDir, "participant-identity.json"), "keep me");

    const result = prepareTestnetGenesisReset(dataDir, GENESIS, GENESIS, "");

    expect(result?.movedFiles).toEqual([
      "audits.json",
      "blocks.dat",
      "chainstate.snapshot",
      "storage-manifest.json",
    ]);
    expect(result?.archiveDir).not.toBeNull();
    expect(existsSync(join(result!.archiveDir!, "blocks.dat"))).toBe(true);
    expect(readFileSync(join(dataDir, "participant-identity.json"), "utf8")).toBe("keep me");
    expect(result?.resetId).toBeNull();
    expect(prepareTestnetGenesisReset(dataDir, GENESIS, GENESIS, "")).toBeNull();
  });

  test("a named reset archives a later chain without overwriting the first archive", () => {
    writeFileSync(join(dataDir, "storage-manifest.json"), JSON.stringify({ chainId: "jgtc-testnet-v1" }));
    writeFileSync(join(dataDir, "blocks.dat"), "first chain");
    const first = prepareTestnetGenesisReset(dataDir, GENESIS, GENESIS, "initial-launch");

    writeFileSync(join(dataDir, "storage-manifest.json"), JSON.stringify({ chainId: "jgtc-testnet-v1" }));
    writeFileSync(join(dataDir, "blocks.dat"), "second chain");
    writeFileSync(join(dataDir, "participant-identity.json"), "keep me");
    const second = prepareTestnetGenesisReset(dataDir, GENESIS, GENESIS, "settlement-txid-v1");

    expect(first?.archiveDir).not.toBe(second?.archiveDir);
    expect(readFileSync(join(first!.archiveDir!, "blocks.dat"), "utf8")).toBe("first chain");
    expect(readFileSync(join(second!.archiveDir!, "blocks.dat"), "utf8")).toBe("second chain");
    expect(second?.resetId).toBe("settlement-txid-v1");
    expect(readFileSync(join(dataDir, "participant-identity.json"), "utf8")).toBe("keep me");
    expect(prepareTestnetGenesisReset(
      dataDir,
      GENESIS,
      GENESIS,
      "settlement-txid-v1",
    )).toBeNull();
  });

  test("does nothing unless the operator token matches the compiled genesis", () => {
    writeFileSync(join(dataDir, "blocks.dat"), "old blocks");

    expect(prepareTestnetGenesisReset(dataDir, GENESIS, "", "")).toBeNull();
    expect(() => prepareTestnetGenesisReset(dataDir, GENESIS, "b".repeat(64), "")).toThrow(
      "does not match expected genesis",
    );
    expect(readFileSync(join(dataDir, "blocks.dat"), "utf8")).toBe("old blocks");
  });

  test("rejects an unsafe or unpaired reset generation before touching state", () => {
    writeFileSync(join(dataDir, "blocks.dat"), "old blocks");

    expect(() => prepareTestnetGenesisReset(dataDir, GENESIS, GENESIS, "../escape")).toThrow(
      "JGC_RESET_ID",
    );
    expect(() => prepareTestnetGenesisReset(dataDir, GENESIS, "", "settlement-txid-v1")).toThrow(
      "requires JGC_RESET_TO_GENESIS",
    );
    expect(readFileSync(join(dataDir, "blocks.dat"), "utf8")).toBe("old blocks");
  });
});
