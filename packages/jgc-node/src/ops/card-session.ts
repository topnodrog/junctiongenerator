import { fork, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import type { enroll } from "./system-card.js";

export type Enrollment = Awaited<ReturnType<typeof enroll>>;
export interface PauseSettings { manual: boolean; quietStart: string | null }

export function pauseReason(settings: PauseSettings, localTime: Date): string | null {
  if (!settings || typeof settings.manual !== "boolean" ||
      !(settings.quietStart === null || (typeof settings.quietStart === "string" &&
      /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(settings.quietStart)))) throw new Error("Invalid pause settings");
  if (settings.manual) return "Manual pause";
  if (settings.quietStart !== null) {
    const [hour, minute] = settings.quietStart.split(":").map(Number);
    const offset = (localTime.getHours() * 60 + localTime.getMinutes() - hour * 60 - minute + 1440) % 1440;
    if (offset < 240) return "Daily four-hour break";
  }
  return null;
}

/** The small controller keeps signed consent in memory. Pausing exits the entire worker node. */
export async function superviseCard(directory: string, argv: string[], enrollment: Enrollment): Promise<void> {
  const digest = createHash("sha256").update(process.platform === "win32" ? resolve(directory).toLowerCase() : resolve(directory)).digest("hex").slice(0, 24);
  const address = process.platform === "win32" ? `\\\\.\\pipe\\jgtc-card-${digest}` :
    process.platform === "linux" ? `\0jgtc-card-${digest}` : join(tmpdir(), `jgtc-card-${digest}.sock`);
  const lock = createServer(socket => socket.destroy());
  await new Promise<void>((ok, fail) => { lock.once("error", fail); lock.listen(address, ok); });
  const prefs = join(directory, "pause-settings.json");
  const view = join(directory, "session-status.json");
  const endsAt = enrollment.selected.sharedUntil ?? enrollment.selected.expiresAt;
  const remaining = endsAt - Date.now();
  const start = performance.now();
  let worker: ChildProcess | undefined;
  let ready = false;
  let pauseRequested = false;
  let tip: { height: number; peers: number } | null = null;
  let reason: string | null = null;
  let ending = "";
  let timer: NodeJS.Timeout;
  function publish(state: string): void {
    writeFileSync(view + ".tmp", JSON.stringify({ state, reason, tip, endsAt, pid: process.pid,
      cardId: enrollment.id, updatedAt: Date.now() }), { mode: 0o600 });
    renameSync(view + ".tmp", view);
  }
  function end(message: string): void {
    ending ||= message;
    clearInterval(timer);
    if (worker) {
      if (worker.connected) worker.disconnect();
      return;
    }
    try { publish(ending); } catch (error) { console.error("Could not save final session status", error); }
    lock.close();
  }
  function tick(): void {
    if (ending) return;
    if (Date.now() >= endsAt || performance.now() - start >= remaining) return end("Expired");
    try {
      const settings = existsSync(prefs) ? JSON.parse(readFileSync(prefs, "utf8").replace(/^\uFEFF/, "")) : { manual: false, quietStart: null };
      reason = pauseReason(settings, new Date());
    } catch { reason = "Unreadable pause settings"; }
    if (reason && worker?.connected) {
      pauseRequested = true;
      worker.disconnect();
    }
    if (!reason && !worker) {
      ready = false;
      pauseRequested = false;
      tip = null;
      const child = fork(new URL("../scripts/testnet-node.js", import.meta.url), [...argv, "--card-session-child"],
        { stdio: ["ignore", "inherit", "inherit", "ipc"], execArgv: [] });
      worker = child;
      child.on("message", (m: { height?: number; peers?: number }) => {
        if (Number.isSafeInteger(m?.height) && Number.isSafeInteger(m?.peers)) {
          ready = true; tip = { height: m.height!, peers: m.peers! };
        }
      });
      child.on("error", error => {
        console.error(error.message);
        if (!child.pid) worker = undefined;
        process.exitCode = 1;
        end("Error");
      });
      child.once("exit", code => {
        worker = undefined; ready = false; tip = null;
        if (ending) return end(ending);
        if (code !== 0) { process.exitCode = 1; end("Error"); }
        else if (Date.now() >= endsAt || performance.now() - start >= remaining) end("Expired");
        else if (!pauseRequested) end("Stopped");
      });
      child.send(enrollment);
    }
    publish(worker ? (!worker.connected ? "Pausing" : ready ? "Running" : "Starting") : "Paused");
  }
  function poll(): void {
    try { tick(); } catch (error) { console.error(error); process.exitCode = 1; end("Error"); }
  }
  process.once("SIGINT", () => end("Stopped"));
  process.once("SIGTERM", () => end("Stopped"));
  timer = setInterval(poll, 1000);
  poll();
}
