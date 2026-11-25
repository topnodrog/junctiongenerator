// Exercises the compiled participant on loopback using a disposable identity.
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { superviseCard } from "../dist/ops/card-session.js";
import { quantumAddressFromPublicKey, quantumGenerateKeyPair } from "../dist/crypto/pq.js";

if (process.argv[2] === "controller") {
  const [, , , dir, port, lifetime] = process.argv;
  const key = quantumGenerateKeyPair();
  const now = Date.now();
  const identity = { ...key, address: quantumAddressFromPublicKey(key.publicKey),
    version: 1, createdAt: new Date(now).toISOString() };
  await superviseCard(dir, ["--participate", "--system-card", "--port", "0", "--status-port", port,
    "--seed", "ws://127.0.0.1:1", "--datadir", dir, "--keystore", "unused-fixture"], {
    id: "smoke", identity, selected: { startsAt: now, expiresAt: now + Number(lifetime),
      workers: 0, bufferMiB: 1, mode: "shared" }
  });
  process.once("disconnect", () => process.emit("SIGTERM"));
} else {
  const dir = await mkdtemp(join(tmpdir(), "jgtc-pause-"));
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const url = `http://127.0.0.1:${port}/status`;
  const prefs = join(dir, "pause-settings.json");
  const setPause = async manual => {
    await writeFile(prefs + ".tmp", JSON.stringify({ manual, quietStart: null }));
    await rename(prefs + ".tmp", prefs);
  };
  let child;
  let closed;
  function launch(lifetime) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("JGC_")));
    child = fork(new URL(import.meta.url), ["controller", dir, String(port), String(lifetime)],
      { env, stdio: ["ignore", "inherit", "inherit", "ipc"] });
    closed = once(child, "exit");
  }
  async function state(wanted) {
    const until = Date.now() + 25000;
    while (Date.now() < until) {
      let status;
      try { status = JSON.parse(await readFile(join(dir, "session-status.json"), "utf8")); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      if (status?.state === wanted && status.pid === child.pid) return status;
      assert.equal(child.exitCode, null, `controller stopped before ${wanted}`);
      await wait(100);
    }
    throw new Error(`Timed out waiting for ${wanted}`);
  }
  try {
    launch(120000);
    const first = await state("Running");
    const address = (await (await fetch(url)).json()).address;
    assert.ok(address);
    await setPause(true);
    await state("Paused");
    await assert.rejects(fetch(url));
    const journal = join(dir, "observations-smoke.jsonl");
    const observations = await readFile(journal, "utf8");
    assert.equal(JSON.parse(observations.trim().split("\n").at(-1)).event, "stop");
    await wait(1200);
    assert.equal(await readFile(journal, "utf8"), observations);
    await setPause(false);
    assert.equal((await state("Running")).endsAt, first.endsAt);
    assert.equal((await (await fetch(url)).json()).address, address);
    child.disconnect();
    assert.equal((await closed)[0], 0);
    await setPause(true);
    launch(2200);
    await state("Paused");
    await state("Expired");
    // The fixture's IPC listener keeps it alive until the harness disconnects.
    child.disconnect();
    assert.equal((await closed)[0], 0);
    await assert.rejects(fetch(url));
    console.log("Participant paused, resumed with the same wallet, and expired during a break.");
  } finally {
    if (child?.connected) child.disconnect();
    if (closed) await closed;
    await rm(dir, { recursive: true, force: true });
  }
}
