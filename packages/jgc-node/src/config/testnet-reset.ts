/**
 * Recoverably move chain-specific state aside before an intentional genesis reset.
 * Participant identity is deliberately excluded so contribution continuity survives.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "fs";
import { join } from "path";

const RESETTABLE_STATE = [
  /^storage-manifest\.json(?:\.tmp)?$/,
  /^blocks(?:\.dat(?:\.tmp)?|\.torn\..*)$/,
  /^chainstate(?:\.snapshot(?:\.tmp)?|\.corrupt\..*)$/,
  /^audits(?:\.json(?:\.tmp)?|\.corrupt\..*)$/,
];

export interface TestnetResetResult {
  archiveDir: string | null;
  movedFiles: string[];
  resetId: string | null;
}

function manifestChainId(dataDir: string): string {
  const manifest = join(dataDir, "storage-manifest.json");
  if (!existsSync(manifest)) return "unknown-chain";
  try {
    const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { chainId?: unknown };
    if (typeof parsed.chainId === "string" && parsed.chainId.length > 0) return parsed.chainId;
  } catch {
    // A malformed manifest still belongs in the archive; use a neutral label.
  }
  return "unknown-chain";
}

function safeLabel(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

function validatedResetId(value: string | undefined): string | null {
  if (value === undefined || value.length === 0) return null;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value)) {
    throw new Error(
      "JGC_RESET_ID must be 1-80 characters using only letters, numbers, dot, underscore, or hyphen",
    );
  }
  return value;
}

/**
 * `requestedGenesisHash` is an explicit operator safety token. When absent this
 * function is a no-op; when wrong it fails before touching any files. A named
 * `resetId` creates a distinct marker and archive directory, allowing a later
 * approved reset to the same genesis without overwriting an earlier archive.
 */
export function prepareTestnetGenesisReset(
  dataDir: string,
  expectedGenesisHash: string,
  requestedGenesisHash = process.env.JGC_RESET_TO_GENESIS,
  requestedResetId = process.env.JGC_RESET_ID,
): TestnetResetResult | null {
  const resetId = validatedResetId(requestedResetId);
  if (!requestedGenesisHash) {
    if (resetId) throw new Error("JGC_RESET_ID requires JGC_RESET_TO_GENESIS");
    return null;
  }
  if (requestedGenesisHash !== expectedGenesisHash) {
    throw new Error(
      `JGC_RESET_TO_GENESIS=${requestedGenesisHash} does not match expected genesis ${expectedGenesisHash}`,
    );
  }

  mkdirSync(dataDir, { recursive: true });
  const markerName = resetId
    ? `.reset-${resetId}-to-${expectedGenesisHash}.done`
    : `.reset-to-${expectedGenesisHash}.done`;
  const marker = join(dataDir, markerName);
  if (existsSync(marker)) return null;

  const stateFiles = readdirSync(dataDir)
    .filter((name) => RESETTABLE_STATE.some((pattern) => pattern.test(name)))
    .sort();

  let archiveDir: string | null = null;
  if (stateFiles.length > 0) {
    archiveDir = join(
      dataDir,
      "archive",
      resetId
        ? `${safeLabel(manifestChainId(dataDir))}-reset-${resetId}-to-${expectedGenesisHash.slice(0, 12)}`
        : `${safeLabel(manifestChainId(dataDir))}-to-${expectedGenesisHash.slice(0, 12)}`,
    );
    mkdirSync(archiveDir, { recursive: true });
    for (const name of stateFiles) {
      const destination = join(archiveDir, name);
      if (existsSync(destination)) {
        throw new Error(`Reset archive already contains ${destination}; refusing to overwrite it`);
      }
    }
    for (const name of stateFiles) {
      const destination = join(archiveDir, name);
      renameSync(join(dataDir, name), destination);
    }
  }

  const markerBody = JSON.stringify({
    expectedGenesisHash,
    resetId,
    resetAt: new Date().toISOString(),
    archiveDir,
    movedFiles: stateFiles,
  }, null, 2) + "\n";
  const markerTmp = `${marker}.tmp`;
  writeFileSync(markerTmp, markerBody, { encoding: "utf8", mode: 0o600 });
  renameSync(markerTmp, marker);

  return { archiveDir, movedFiles: stateFiles, resetId };
}
