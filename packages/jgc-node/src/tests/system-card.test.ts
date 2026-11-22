import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allocation, DAY, enroll, verifyCard } from "../ops/system-card.js";
import { bookingRemaining } from "../ops/soak-workload.js";
import { Wallet } from "../wallet/wallet.js";
import { generateRecoveryPhrase } from "../wallet/recovery.js";
import { TESTNET_NETWORK } from "../config/networks.js";

const caps = { maxWorkers: 4, maxBufferMiB: 512, totalMiB: 16000, availableMiB: 4096, logicalCpus: 12 };
test("either full selection expires at its original deadline even after a restart", () => {
  for (const [cpu, ram] of [[4, 0], [0, 512]]) {
    const first = allocation(cpu, ram, caps, 1);
    expect(first).toMatchObject({ mode: "first-full", expiresAt: DAY + 1 });
    expect(allocation(cpu, ram, caps, DAY, 1).expiresAt).toBe(DAY + 1);
    expect(bookingRemaining(first, DAY + 1)).toBe(0);
    const followOn = { ...first, sharedUntil: first.expiresAt + DAY };
    expect(bookingRemaining(followOn, first.expiresAt - 1)).toBe(1);
    expect(bookingRemaining(followOn, first.expiresAt)).toBe(15000);
    expect(bookingRemaining(followOn, first.expiresAt + 15000)).toBe(0);
    expect(bookingRemaining(followOn, followOn.sharedUntil)).toBe(0);
    const shared = allocation(cpu, ram, caps, DAY + 1, 1);
    expect(shared.mode).toBe("shared");
    expect(bookingRemaining(shared, shared.startsAt)).toBe(15000);
    expect(bookingRemaining(shared, shared.startsAt + 15000)).toBe(0);
    expect(bookingRemaining(shared, shared.startsAt + 60000)).toBe(15000);
  }
  expect(allocation(1, 32, caps, 1).mode).toBe("shared");
  expect(allocation(1, 0, { ...caps, maxBufferMiB: 0 }, 1).workers).toBe(1);
  expect(() => allocation(0, 1, { ...caps, maxBufferMiB: 0 }, 1)).toThrow();
  for (const [cpu, ram] of [[0, 0], [-1, 0], [1, 513], [4.5, 0]]) {
    expect(() => allocation(cpu, ram, caps, 1)).toThrow();
  }
  expect(() => allocation(4, 0, caps, 1, 2)).toThrow();
});

test("only explicit consent signs a card that verifies against a restored reward wallet", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jg-system-card-"));
  try {
    const phrase = generateRecoveryPhrase();
    const wallet = Wallet.fromRecoveryPhrase(phrase, TESTNET_NETWORK.chainId);
    const key = join(dir, "test.keystore.json");
    writeFileSync(key, JSON.stringify(wallet.toKeystore("only for this test")));
    // Enrollment tests use an explicit diagnostic snapshot, independent of CI load.
    const run = (confirm: string) => {
      const answers = ["0", "1", confirm];
      return enroll({ clear() {}, show() {}, secret: async () => "only for this test",
        acknowledge: async () => answers.shift()! }, dir, key, ["ws://127.0.0.1:19444"], caps);
    };
    await expect(run("")).rejects.toThrow("cancelled");
    expect(readdirSync(dir)).toEqual(["test.keystore.json"]);
    const { identity } = await run("ACCEPT");
    const name = readdirSync(dir).find(n => n.startsWith("card-"))!;
    const raw = readFileSync(join(dir, name), "utf8");
    expect(raw).not.toContain(phrase);
    expect(raw).not.toContain(identity.privateKey);
    const receipt = JSON.parse(raw);
    expect(verifyCard(receipt)).toBe(true);
    const restored = Wallet.fromRecoveryPhrase(phrase, TESTNET_NETWORK.chainId);
    expect(identity.address).toBe(restored.address("account-0"));
    receipt.card.bufferMiB++;
    expect(verifyCard(receipt)).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
