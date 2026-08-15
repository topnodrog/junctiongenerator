import { EventEmitter } from "events";
import { decodeDifficultyBits } from "../consensus/emission.js";
import type { Block } from "../types/index.js";
import type { JGCNode } from "./node.js";

export interface ProducerStatus {
  running: boolean;
  intervalSec: number;
  producedBlocks: number;
  lastProducedHeight: number | null;
  lastProducedAt: number | null;
  lastError: string | null;
  waitingForTFLOPS: number;
}

/**
 * Single designated producer for a testnet. It derives every template from the
 * node's live chainstate, so restart, sync, reorg, and difficulty retarget do not
 * require a separate producer database.
 */
export class DesignatedBlockProducer extends EventEmitter {
  private timer?: NodeJS.Timeout;
  private producing = false;
  private status: ProducerStatus;

  constructor(
    private readonly node: JGCNode,
    intervalSec = 600,
  ) {
    super();
    if (!Number.isInteger(intervalSec) || intervalSec < 1) {
      throw new RangeError("producer interval must be a positive integer number of seconds");
    }
    this.status = {
      running: false,
      intervalSec,
      producedBlocks: 0,
      lastProducedHeight: null,
      lastProducedAt: null,
      lastError: null,
      waitingForTFLOPS: Math.ceil(decodeDifficultyBits(node.getCurrentDifficultyBits())),
    };
  }

  start(): void {
    if (this.timer) return;
    this.status.running = true;
    this.timer = setInterval(() => void this.tickNow(), this.status.intervalSec * 1000);
    this.timer.unref();
    void this.tickNow();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.status.running = false;
  }

  getStatus(): ProducerStatus {
    return { ...this.status };
  }

  /** One production attempt; exposed for health checks and deterministic tests. */
  async tickNow(): Promise<Block | null> {
    if (this.producing) return null;
    this.producing = true;
    try {
      const target = Math.ceil(decodeDifficultyBits(this.node.getCurrentDifficultyBits()));
      const available = this.node.getPendingProofs()
        .reduce((sum, contribution) => sum + contribution.proof.tflopsWeight, 0);
      this.status.waitingForTFLOPS = Math.max(0, target - available);
      if (available < target) return null;

      const block = this.node.buildBlockCandidate();
      const result = await this.node.submitBlock(block);
      if (!result.ok) {
        this.status.lastError = result.error ?? "block rejected";
        this.emit("rejected", this.status.lastError);
        return null;
      }

      this.status.producedBlocks++;
      this.status.lastProducedHeight = block.header.height;
      this.status.lastProducedAt = Date.now();
      this.status.lastError = null;
      this.status.waitingForTFLOPS = Math.ceil(decodeDifficultyBits(this.node.getCurrentDifficultyBits()));
      this.emit("block", block);
      return block;
    } catch (error) {
      this.status.lastError = error instanceof Error ? error.message : String(error);
      this.emit("producer:error", error);
      return null;
    } finally {
      this.producing = false;
    }
  }
}
