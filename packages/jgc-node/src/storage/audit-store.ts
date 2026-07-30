/**
 * @file src/storage/audit-store.ts
 * @description Atomic persistence for audit requests, signed votes, and verdicts.
 *
 * Audit state is derived security evidence, not consensus state. The complete
 * bounded snapshot is atomically replaced after each mutation. On restart the
 * lifecycle revalidates all signatures and active-chain anchors before use.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "fs";
import { dirname, join } from "path";
import type { AuditLifecycleState } from "../broker/audit-protocol.js";
import { atomicWriteFile, syncDirectory } from "./durable-file.js";

const AUDIT_STORE_VERSION = 1;
const MAX_AUDIT_STORE_BYTES = 32 * 1024 * 1024;

interface AuditStoreFile {
  version: number;
  state: AuditLifecycleState;
}

export class AuditStore {
  private readonly file: string;
  private readonly tmp: string;
  private readonly dataDir: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.dataDir = dataDir;
    this.file = join(dataDir, "audits.json");
    this.tmp = join(dataDir, "audits.json.tmp");
  }

  load(): AuditLifecycleState | null {
    if (!existsSync(this.file)) return null;
    if (statSync(this.file).size > MAX_AUDIT_STORE_BYTES) {
      throw new Error("audit store exceeds safety limit");
    }
    const parsed = JSON.parse(readFileSync(this.file, "utf8")) as Partial<AuditStoreFile>;
    if (parsed.version !== AUDIT_STORE_VERSION || !parsed.state ||
        !Array.isArray(parsed.state.requests) ||
        !Array.isArray(parsed.state.openVotes) ||
        !Array.isArray(parsed.state.verdicts)) {
      throw new Error("unsupported or malformed audit store");
    }
    return parsed.state;
  }

  write(state: AuditLifecycleState): void {
    const body = JSON.stringify({ version: AUDIT_STORE_VERSION, state } satisfies AuditStoreFile);
    if (Buffer.byteLength(body, "utf8") > MAX_AUDIT_STORE_BYTES) {
      throw new Error("audit store exceeds safety limit");
    }
    atomicWriteFile(this.file, this.tmp, body);
  }

  clear(): void {
    if (existsSync(this.file)) rmSync(this.file);
    if (existsSync(this.tmp)) rmSync(this.tmp);
    syncDirectory(this.dataDir);
  }

  /** Preserve a malformed file for inspection while allowing a clean restart. */
  quarantine(): string | null {
    if (!existsSync(this.file)) return null;
    const target = join(dirname(this.file), `audits.corrupt.${Date.now()}.json`);
    renameSync(this.file, target);
    if (existsSync(this.tmp)) rmSync(this.tmp);
    syncDirectory(this.dataDir);
    return target;
  }
}
