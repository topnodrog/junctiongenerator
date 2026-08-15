import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import { decodeDifficultyBits } from "../consensus/emission.js";
import {
  quantumAddressFromPublicKey,
  quantumGenerateKeyPair,
} from "../crypto/pq.js";
import type { JGCNode } from "../network/node.js";
import { ComputeTaskType, type MinerComputeContribution } from "../types/index.js";
import { generateContribution, type MinerIdentity } from "./miner.js";

export interface TestnetParticipantIdentityFile {
  version: 1;
  createdAt: string;
  address: string;
  publicKey: string;
  privateKey: string;
}

export function loadOrCreateTestnetParticipantIdentity(
  path: string,
): TestnetParticipantIdentityFile {
  if (existsSync(path)) {
    const identity = JSON.parse(readFileSync(path, "utf8")) as TestnetParticipantIdentityFile;
    if (identity.version !== 1 || quantumAddressFromPublicKey(identity.publicKey) !== identity.address) {
      throw new Error("invalid testnet participant identity file");
    }
    return identity;
  }

  const key = quantumGenerateKeyPair();
  const identity: TestnetParticipantIdentityFile = {
    version: 1,
    createdAt: new Date().toISOString(),
    address: quantumAddressFromPublicKey(key.publicKey),
    publicKey: key.publicKey,
    privateKey: key.privateKey,
  };
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, `${JSON.stringify(identity, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  renameSync(temp, path);
  return identity;
}

/**
 * Pilot-only participation loop. Each identity submits one equal-weight,
 * signed simulation receipt per block slot. The receipt is an on-chain record
 * of testnet presence, not proof that useful AI computation occurred.
 */
export class TestnetParticipant {
  private timer?: NodeJS.Timeout;
  private targetHeight: number | null = null;
  private contribution: MinerComputeContribution | null = null;
  private sending = false;

  readonly address: string;

  constructor(
    private readonly node: JGCNode,
    file: TestnetParticipantIdentityFile,
    private readonly intervalMs = 10_000,
  ) {
    this.address = file.address;
    this.identity = {
      minerAddress: file.address,
      publicKey: file.publicKey,
      secretKey: file.privateKey,
      circuitId: "PQ_CIRCUIT_COMMERCIAL_V1",
      taskType: ComputeTaskType.COMMERCIAL,
    };
  }

  private readonly identity: MinerIdentity;

  start(): void {
    if (this.timer) return;
    const submit = () => void this.tick().catch((error: unknown) => {
      console.warn(`[Participant] Receipt submission failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    this.timer = setInterval(submit, this.intervalMs);
    this.timer.unref();
    submit();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async tick(): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    try {
      const height = this.node.getChainInfo().tipHeight + 1;
      if (this.targetHeight !== height || !this.contribution) {
        const weight = Math.ceil(decodeDifficultyBits(this.node.getCurrentDifficultyBits()));
        this.targetHeight = height;
        this.contribution = generateContribution(
          this.identity,
          weight,
          height % 144,
          height,
        );
      }
      const result = await this.node.broadcastComputeProof(this.contribution);
      if (!result.ok && result.error !== "contribution already pending for this miner") {
        throw new Error(result.error ?? "participation receipt rejected");
      }
    } finally {
      this.sending = false;
    }
  }
}
