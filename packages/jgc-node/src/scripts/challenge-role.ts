import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CANONICAL_CPU_MAX_TOKENS,
  CANONICAL_CPU_MODEL,
  CanonicalCpuChallengeRuntime,
} from "../broker/canonical-cpu-runtime.js";
import type { VerifiableTask } from "../broker/junctioning.js";
import { makeClaim, verifyReplay, type JunctioningClaim } from "../broker/verification.js";

type Role = "requester" | "miner" | "verifier";

interface TaskArtifact {
  version: 1;
  taskId: string;
  createdAt: string;
  task: Omit<VerifiableTask, "executionProfile">;
}

interface ClaimArtifact {
  version: 1;
  taskId: string;
  minedAt: string;
  claim: JunctioningClaim;
  accounting: { promptTokens: number; outputTokens: number };
}

const exchangeDir = process.env.JGC_EXCHANGE_DIR ?? "/exchange";
const waitTimeoutMs = positiveInteger(process.env.JGC_ROLE_TIMEOUT_MS ?? "900000", "JGC_ROLE_TIMEOUT_MS");

async function main(): Promise<void> {
  const role = process.argv[2] as Role | undefined;
  if (role === "requester") await requester();
  else if (role === "miner") await withOllama(miner);
  else if (role === "verifier") await withOllama(verifier);
  else throw new Error("usage: challenge-role <requester|miner|verifier>");
}

async function requester(): Promise<void> {
  const prompt = required(process.env.JGC_PROMPT, "JGC_PROMPT");
  const artifact: TaskArtifact = {
    version: 1,
    taskId: process.env.JGC_TASK_ID?.trim() || randomUUID(),
    createdAt: new Date().toISOString(),
    task: { prompt, model: CANONICAL_CPU_MODEL, maxTokens: CANONICAL_CPU_MAX_TOKENS, temperature: 0, seed: 0 },
  };
  await writeArtifact("task.json", artifact);
  console.log(`[requester] published task ${artifact.taskId}`);
}

async function miner(): Promise<void> {
  const task = await waitForArtifact<TaskArtifact>("task.json");
  validateTaskArtifact(task);
  const runtime = new CanonicalCpuChallengeRuntime();
  const profile = await runtime.executionProfile(task.task.model);
  if (!profile) throw new Error("canonical model/runtime profile is unavailable; refusing to mine");
  const result = await runtime.run(task.task);
  const claim = makeClaim({ ...task.task, executionProfile: profile }, result.text);
  const artifact: ClaimArtifact = {
    version: 1,
    taskId: task.taskId,
    minedAt: new Date().toISOString(),
    claim,
    accounting: { promptTokens: result.promptTokens, outputTokens: result.outputTokens },
  };
  await writeArtifact("claim.json", artifact);
  console.log(`[miner] published claim ${claim.commitment} for task ${task.taskId}`);
}

async function verifier(): Promise<void> {
  const artifact = await waitForArtifact<ClaimArtifact>("claim.json");
  validateClaimArtifact(artifact);
  const result = await verifyReplay(artifact.claim, new CanonicalCpuChallengeRuntime());
  const outcome = result.compatible ? (result.verified ? "pass" : "fraud-evidence") : "inconclusive";
  await writeArtifact("verdict.json", {
    version: 1,
    taskId: artifact.taskId,
    verifiedAt: new Date().toISOString(),
    outcome,
    ...result,
  });
  console.log(`[verifier] ${outcome} for task ${artifact.taskId}`);
  if (outcome !== "pass") process.exitCode = outcome === "inconclusive" ? 2 : 1;
}

async function withOllama(action: () => Promise<void>): Promise<void> {
  let child: ChildProcess | undefined;
  try {
    if ((process.env.JGC_MANAGE_OLLAMA ?? "1") === "1") {
      child = spawn("ollama", ["serve"], { stdio: "inherit", env: { ...process.env, OLLAMA_HOST: "127.0.0.1:11434" } });
      child.once("exit", (code) => { if (code && process.exitCode === undefined) process.exitCode = code; });
      await waitForOllama();
      if ((process.env.JGC_OLLAMA_PULL ?? "1") === "1") await runCommand("ollama", ["pull", CANONICAL_CPU_MODEL]);
    }
    await action();
  } finally {
    child?.kill("SIGTERM");
  }
}

async function waitForOllama(): Promise<void> {
  const deadline = Date.now() + waitTimeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:11434/api/version");
      if (response.ok) return;
    } catch { /* runtime is still starting */ }
    await delay(500);
  }
  throw new Error("timed out waiting for the loopback Ollama runtime");
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

async function waitForArtifact<T>(name: string): Promise<T> {
  const path = join(exchangeDir, name);
  const deadline = Date.now() + waitTimeoutMs;
  while (Date.now() < deadline) {
    try { return JSON.parse(await readFile(path, "utf8")) as T; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await delay(250);
  }
  throw new Error(`timed out waiting for ${path}`);
}

async function writeArtifact(name: string, value: unknown): Promise<void> {
  await mkdir(exchangeDir, { recursive: true });
  const destination = join(exchangeDir, name);
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, destination);
}

function validateTaskArtifact(value: TaskArtifact): void {
  if (value.version !== 1 || typeof value.taskId !== "string" || value.taskId.length === 0 || !value.task) throw new Error("invalid task artifact");
  const expected = value.task;
  if (expected.model !== CANONICAL_CPU_MODEL || expected.maxTokens !== CANONICAL_CPU_MAX_TOKENS || expected.temperature !== 0 || expected.seed !== 0 || typeof expected.prompt !== "string" || expected.prompt.length === 0) {
    throw new Error("task artifact is not canonical");
  }
}

function validateClaimArtifact(value: ClaimArtifact): void {
  if (value.version !== 1 || typeof value.taskId !== "string" || !value.claim || value.claim.task.model !== CANONICAL_CPU_MODEL || value.claim.task.executionProfile === undefined) {
    throw new Error("invalid claim artifact");
  }
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value;
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

main().catch((error: unknown) => {
  console.error(`[challenge-role] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
