import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { isMainThread, Worker, workerData } from "node:worker_threads";
import type { Allocation } from "./system-card.js";

const MINUTE = 60_000;
const BOOKING = 15_000;
type Job = { memoryMiB: number; hash: boolean; endsAt: number; durationMs: number };

function runJob(job: Job): void {
  const deadline = performance.now() + job.durationMs;
  // Nonzero fill commits the pages. Keep the buffer live through the last job.
  const buffer = Buffer.alloc(job.memoryMiB * 1048576, 0x4a);
  const sample = buffer.length ? buffer.subarray(0, 65536) : Buffer.alloc(65536);
  function tick(): void {
    if (Date.now() >= job.endsAt || performance.now() >= deadline) return;
    if (job.hash) {
      sample[0] = createHash("sha256").update(sample).digest()[0];
      setImmediate(tick);
    } else {
      if (buffer.length) buffer[0] ^= 1;
      setTimeout(tick, 200);
    }
  }
  tick();
}

if (!isMainThread) runJob(workerData as Job);

export function bookingRemaining(selected: Allocation, now: number): number {
  const end = selected.sharedUntil ?? selected.expiresAt;
  if (now < selected.startsAt || now >= end) return 0;
  if (selected.mode === "first-full" && now < selected.expiresAt) return selected.expiresAt - now;
  const sharedStart = selected.mode === "first-full" ? selected.expiresAt : selected.startsAt;
  return Math.max(0, Math.min(end - now, BOOKING - (now - sharedStart) % MINUTE));
}

/** Only runs the fixed local demonstration. Workers have no network job input. */
export function startWorkload(selected: Allocation, onEnd: (error?: Error) => void): () => void {
  const end = selected.sharedUntil ?? selected.expiresAt;
  const wallStart = Date.now();
  const elapsedStart = performance.now();
  let stopped = false;
  let timer: NodeJS.Timeout;
  const active = new Set<Worker>();
  function stop(): void {
    stopped = true;
    clearTimeout(timer);
    for (const worker of active) void worker.terminate();
  }
  function fail(error?: Error): void {
    if (stopped) return;
    stop();
    onEnd(error);
  }
  function schedule(): void {
    if (stopped) return;
    const wall = Date.now();
    // A backward wall-clock adjustment must never extend the full-use phase.
    const now = Math.max(wall, wallStart + performance.now() - elapsedStart);
    const left = end - now;
    if (left <= 0 || wall < selected.startsAt) return fail();
    const durationMs = Math.min(bookingRemaining(selected, now), left);
    if (durationMs > 0 && !active.size) {
      const count = Math.max(1, selected.workers);
      try {
        for (let i = 0; i < count; i++) {
          const memoryMiB = Math.floor(selected.bufferMiB / count) + Number(i < selected.bufferMiB % count);
          const job: Job = { memoryMiB, hash: selected.workers > 0, endsAt: wall + durationMs, durationMs };
          const worker = new Worker(new URL("./soak-workload.js", import.meta.url), { workerData: job });
          active.add(worker);
          worker.on("error", fail);
          worker.on("exit", code => {
            active.delete(worker);
            if (code !== 0 && !stopped) fail(new Error("A demonstration worker stopped unexpectedly"));
          });
        }
      } catch (error) { return fail(error as Error); }
    }
    // Recheck wall time after suspension as well as the monotonic deadline.
    timer = setTimeout(schedule, Math.max(1, Math.min(250, left)));
  }
  schedule();
  return stop;
}
