/**
 * @file src/broker/compute-broker.ts
 * @description Excess compute broker — routes underutilized node capacity
 * to high-yield commercial bidders or fallback scientific platforms.
 *
 * SYSTEM CONTEXT
 * ──────────────
 * The JGC network requires miners to perform AI/scientific compute for PoUC.
 * Between block intervals (10-minute windows), nodes may have spare capacity.
 * The compute broker:
 *
 *   1. MEASURES idle TFLOPS: monitors each connected node's utilization.
 *   2. PRIORITIZES tasks:
 *        a. Junction Generator internal AI cluster (highest priority per spec)
 *        b. Commercial bidders (ranked by price/TFLOPS, highest first)
 *        c. Scientific fallback platforms (Folding@Home, Rosetta@Home, etc.)
 *   3. ASSIGNS work units to available nodes.
 *   4. VERIFIES completion via ZK proofs submitted by nodes.
 *   5. RELEASES payment to nodes upon verified completion.
 *
 * INCENTIVE MODEL:
 *   - Nodes earn JGC for consensus PoUC work (epoch settlement).
 *   - Nodes earn additional JGC from broker task payments (immediate, per-task).
 *   - This creates a dual revenue stream: consensus + compute marketplace.
 *
 * PRIORITY SYSTEM:
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ Priority 1: JG Internal AI Cluster  (consensus PoUC tasks)     │
 *   │             LLM inference/training for JunctionGenerator.net    │
 *   │             → always routed first, non-negotiable               │
 *   ├─────────────────────────────────────────────────────────────────┤
 *   │ Priority 2: Commercial Bidders       (sorted by $/TFLOPS desc)  │
 *   │             Any verified commercial task buyer                  │
 *   │             → routed when excess capacity exists               │
 *   ├─────────────────────────────────────────────────────────────────┤
 *   │ Priority 3: Scientific Fallback      (Folding@Home, etc.)      │
 *   │             No minimum price; routed to prevent node idle waste │
 *   └─────────────────────────────────────────────────────────────────┘
 */

import { randomBytes } from "crypto";
import type {
  Address, ComputeBid, ComputeAssignment, ComputeTaskType,
  PublicKey, UnixTimestamp,
} from "../types/index.js";
import type { Hash256 } from "../types/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Node Capacity Tracking
// ─────────────────────────────────────────────────────────────────────────────

/** Real-time resource snapshot from a participating compute node. */
export interface NodeCapacity {
  nodePublicKey: PublicKey;
  minerAddress:  Address;

  /** Total TFLOPS this node can sustain. */
  totalTFLOPS:    number;
  /** TFLOPS currently committed to consensus PoUC (for the current block slot). */
  consensusTFLOPS: number;
  /** TFLOPS currently assigned to JG AI cluster tasks. */
  jgClusterTFLOPS: number;
  /** TFLOPS currently assigned to broker tasks. */
  brokerTFLOPS:   number;

  /** Derived: totalTFLOPS - consensusTFLOPS - jgClusterTFLOPS - brokerTFLOPS */
  idleTFLOPS:     number;

  /** Supported task types (set of circuit families this GPU/CPU can run). */
  supportedTaskTypes: ComputeTaskType[];

  /** Last heartbeat UNIX timestamp — broker ignores stale (>60s) nodes. */
  lastHeartbeatAt: UnixTimestamp;

  /** Hardware identifier (for matching task hardware requirements). */
  hardwareProfile: {
    gpuModel:       string;
    gpuVRAMGB:      number;
    cpuCores:       number;
    networkMbps:    number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Broker Core
// ─────────────────────────────────────────────────────────────────────────────

export class ComputeBroker {
  /** Registered compute nodes: publicKey → capacity snapshot. */
  private nodes = new Map<PublicKey, NodeCapacity>();

  /** Active bids in the order book: bidId → bid. */
  private orderBook = new Map<string, ComputeBid>();

  /** Active assignments: assignmentId → assignment. */
  private assignments = new Map<string, ComputeAssignment>();

  /** Completed assignments awaiting payment: assignmentId → assignment. */
  private pendingPayments = new Map<string, ComputeAssignment>();

  /** JG internal cluster task definitions (highest priority). */
  private jgTaskQueue: JGClusterTask[] = [];

  /**
   * Register or update a node's capacity snapshot.
   * Called on each node heartbeat (every ~30 seconds).
   *
   * @param capacity  Current capacity report from the node.
   */
  registerNode(capacity: NodeCapacity): void {
    // Compute derived idleTFLOPS field.
    capacity.idleTFLOPS = Math.max(
      0,
      capacity.totalTFLOPS
        - capacity.consensusTFLOPS
        - capacity.jgClusterTFLOPS
        - capacity.brokerTFLOPS
    );
    this.nodes.set(capacity.nodePublicKey, capacity);
  }

  /**
   * Remove a node from the active pool (peer disconnect / timeout).
   */
  deregisterNode(nodePublicKey: PublicKey): void {
    this.nodes.delete(nodePublicKey);
    // Reassign any active tasks from this node to other nodes.
    this.reassignTasksFromNode(nodePublicKey);
  }

  /**
   * Submit a new compute bid to the order book.
   * Called by commercial buyers via the P2P BID message or RPC endpoint.
   *
   * @param bid  The ComputeBid from the buyer.
   * @returns true if bid was accepted, false if invalid.
   */
  submitBid(bid: ComputeBid): boolean {
    // Validate bid fields.
    //
    // NaN HAZARD: `NaN <= 0` evaluates to false, so a bid carrying NaN in
    // totalTFLOPSHours would pass a bare `<= 0` check and poison allocation
    // arithmetic downstream (remainingTFLOPS becomes NaN). Explicit
    // Number.isFinite() guards are required — same input-sanitisation
    // discipline Bitcoin applies in CheckTransaction() (validation.cpp:
    // MoneyRange() bounds every amount before any arithmetic).
    //
    // minTFLOPSRequired must be STRICTLY positive: a zero-minimum bid would
    // match nodes with zero idle capacity in findBestNodeForTask()
    // (0 >= 0), producing zero-TFLOPS assignments that make no allocation
    // progress — see the loop-progress guard in allocateCommercialBids().
    if (bid.pricePerTFLOPSHour <= 0n) return false;
    if (!Number.isFinite(bid.totalTFLOPSHours) || bid.totalTFLOPSHours <= 0) return false;
    if (!Number.isFinite(bid.minTFLOPSRequired) || bid.minTFLOPSRequired <= 0) return false;
    if (bid.expiresAt <= Math.floor(Date.now() / 1000)) return false;

    this.orderBook.set(bid.bidId, bid);
    this.runAllocationCycle();
    return true;
  }

  /**
   * Push a Junction Generator AI cluster task.
   * These are always dispatched before commercial bids (per spec: "compute is used
   * mainly for the AI cluster that will be running the Junction Generator business").
   *
   * @param task  Internal JG task descriptor.
   */
  queueJGClusterTask(task: JGClusterTask): void {
    this.jgTaskQueue.push(task);
    this.runAllocationCycle();
  }

  /**
   * Main allocation cycle — called whenever capacity or demand changes.
   *
   * Allocation order:
   *   1. JG internal cluster tasks (drain queue)
   *   2. Commercial bids (sort by pricePerTFLOPSHour desc)
   *   3. Scientific fallback (fill remaining idle capacity)
   */
  runAllocationCycle(): void {
    const now = Math.floor(Date.now() / 1000);

    // Expire stale nodes (no heartbeat in 60s).
    for (const [key, node] of this.nodes) {
      if (now - node.lastHeartbeatAt > 60) {
        this.deregisterNode(key);
      }
    }

    // Expire stale bids.
    for (const [id, bid] of this.orderBook) {
      if (bid.expiresAt <= now) this.orderBook.delete(id);
    }

    // ── Phase 1: JG Internal AI Cluster (highest priority) ────────────────
    this.allocateJGClusterTasks(now);

    // ── Phase 2: Commercial bids (sorted by price desc) ───────────────────
    this.allocateCommercialBids(now);

    // ── Phase 3: Scientific fallback (fill remaining idle) ────────────────
    this.allocateScientificFallback(now);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Allocation Phases
  // ─────────────────────────────────────────────────────────────────────────

  private allocateJGClusterTasks(now: UnixTimestamp): void {
    while (this.jgTaskQueue.length > 0) {
      const task = this.jgTaskQueue[0]!;
      const node = this.findBestNodeForTask(task.requiredTFLOPS, task.taskType, now);
      if (!node) break;  // No capacity available — tasks queue until nodes free up.

      // Build a synthetic ComputeBid to reuse createAssignment.
      const syntheticBid: ComputeBid = {
        bidId:               `jg_internal_${task.taskId}`,
        bidderAddress:       "jg_internal",
        taskType:            task.taskType,
        pricePerTFLOPSHour:  0n,
        minTFLOPSRequired:   task.requiredTFLOPS,
        totalTFLOPSHours:    task.requiredTFLOPS,
        taskPayloadHash:     task.taskPayloadHash,
        expiresAt:           now + task.deadlineSecs,
        isFallback:          false,
      };
      this.createAssignment(syntheticBid, node, task.requiredTFLOPS, now, task.deadlineSecs);
      node.jgClusterTFLOPS += task.requiredTFLOPS;
      node.idleTFLOPS       = Math.max(0, node.idleTFLOPS - task.requiredTFLOPS);
      this.jgTaskQueue.shift();
      console.log(
        `[Broker] JG Cluster task ${task.taskId} assigned to node ${node.nodePublicKey.slice(0, 16)}… ` +
        `(${task.requiredTFLOPS} TFLOPS)`
      );
    }
  }

  private allocateCommercialBids(now: UnixTimestamp): void {
    // Sort commercial bids by price/TFLOPS descending (highest yield first).
    const sortedBids = Array.from(this.orderBook.values())
      .filter(b => !b.isFallback && b.expiresAt > now)
      .sort((a, b) => (b.pricePerTFLOPSHour > a.pricePerTFLOPSHour ? 1 : -1));

    for (const bid of sortedBids) {
      let remainingTFLOPS = bid.totalTFLOPSHours;

      while (remainingTFLOPS > 0) {
        const node = this.findBestNodeForTask(bid.minTFLOPSRequired, bid.taskType, now);
        if (!node) break;  // No more capacity for this bid.

        const assignedTFLOPS = Math.min(node.idleTFLOPS, remainingTFLOPS);

        // LOOP-PROGRESS GUARD (DoS hardening): every iteration MUST strictly
        // decrease remainingTFLOPS. If the best node cannot contribute a
        // positive slice, no further allocation is possible this cycle —
        // without this break, a zero-TFLOPS assignment loops forever while
        // createAssignment() grows this.assignments unboundedly (OOM).
        // Bitcoin enforces the same bounded-work discipline on every
        // message-driven loop in net_processing.cpp (e.g. MAX_INV_SZ,
        // MAX_HEADERS_RESULTS caps).
        if (assignedTFLOPS <= 0) break;

        this.createAssignment(bid, node, assignedTFLOPS, now, 3600);

        node.brokerTFLOPS += assignedTFLOPS;
        node.idleTFLOPS    = Math.max(0, node.idleTFLOPS - assignedTFLOPS);
        remainingTFLOPS   -= assignedTFLOPS;

        console.log(
          `[Broker] Commercial bid ${bid.bidId} partial assignment: ` +
          `${assignedTFLOPS} TFLOPS → node ${node.nodePublicKey.slice(0, 16)}… ` +
          `(price: ${bid.pricePerTFLOPSHour} sats/TFLOPS-hr)`
        );
      }
    }
  }

  private allocateScientificFallback(now: UnixTimestamp): void {
    const fallbacks = Array.from(this.orderBook.values())
      .filter(b => b.isFallback && b.expiresAt > now);

    // Distribute idle capacity evenly across scientific fallback tasks.
    const idleNodes = Array.from(this.nodes.values())
      .filter(n => n.idleTFLOPS > 0 && n.lastHeartbeatAt > now - 60);

    if (idleNodes.length === 0 || fallbacks.length === 0) return;

    for (const node of idleNodes) {
      // Round-robin across fallback tasks.
      const fallback = fallbacks[
        Math.floor(Math.random() * fallbacks.length)
      ];
      if (!fallback || node.idleTFLOPS < 1) continue;

      const assignedTFLOPS = node.idleTFLOPS;
      this.createAssignment(fallback, node, assignedTFLOPS, now, 7200);

      node.brokerTFLOPS += assignedTFLOPS;
      node.idleTFLOPS    = 0;

      console.log(
        `[Broker] Fallback task ${fallback.bidId} assigned to node ` +
        `${node.nodePublicKey.slice(0, 16)}… (${assignedTFLOPS} TFLOPS idle → scientific use)`
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Assignment Management
  // ─────────────────────────────────────────────────────────────────────────

  private createAssignment(
    bid:           ComputeBid,
    node:          NodeCapacity,
    assignedTFLOPS: number,
    now:           UnixTimestamp,
    deadlineSecs:  number,
  ): ComputeAssignment {
    const assignmentId = randomBytes(16).toString("hex");
    const assignment: ComputeAssignment = {
      assignmentId,
      bidId:          bid.bidId,
      nodePublicKey:  node.nodePublicKey,
      assignedTFLOPS,
      startedAt:      now,
      deadlineAt:     now + deadlineSecs,
      status:         "IN_PROGRESS",
    };
    this.assignments.set(assignmentId, assignment);
    return assignment;
  }

  /**
   * Accept a completed task from a node (with ZK proof).
   * Marks assignment as COMPLETED and queues it for payment.
   *
   * @param assignmentId  The assignment ID issued during allocation.
   * @param proof         ZK proof of computation completion.
   */
  completeAssignment(
    assignmentId: string,
    proof:        import("../types/index.js").ComputeProof,
  ): boolean {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) return false;
    if (assignment.status !== "IN_PROGRESS") return false;

    const now = Math.floor(Date.now() / 1000);
    if (now > assignment.deadlineAt) {
      assignment.status = "EXPIRED";
      return false;
    }

    assignment.completionProof = proof;
    assignment.status          = "COMPLETED";
    this.pendingPayments.set(assignmentId, assignment);

    // Free node capacity.
    const node = this.nodes.get(assignment.nodePublicKey);
    if (node) {
      node.brokerTFLOPS = Math.max(0, node.brokerTFLOPS - assignment.assignedTFLOPS);
      node.idleTFLOPS   += assignment.assignedTFLOPS;
    }

    console.log(
      `[Broker] Assignment ${assignmentId} completed — queued for payment ` +
      `(${assignment.assignedTFLOPS} TFLOPS)`
    );

    // Trigger re-allocation with freed capacity.
    this.runAllocationCycle();
    return true;
  }

  /**
   * Fail an assignment (node timeout or proof rejection).
   * Reassigns the work if the bid hasn't expired.
   */
  failAssignment(assignmentId: string, reason: string): void {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) return;

    assignment.status = "FAILED";
    console.warn(
      `[Broker] Assignment ${assignmentId} FAILED: ${reason}. Will re-allocate.`
    );

    // Free capacity and retrigger.
    const node = this.nodes.get(assignment.nodePublicKey);
    if (node) {
      node.brokerTFLOPS = Math.max(0, node.brokerTFLOPS - assignment.assignedTFLOPS);
      node.idleTFLOPS   += assignment.assignedTFLOPS;
    }

    this.runAllocationCycle();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Node Selection
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Find the best node for a task: most idle TFLOPS, hardware compatibility.
   */
  private findBestNodeForTask(
    minTFLOPS:  number,
    taskType:   ComputeTaskType,
    now:        UnixTimestamp,
  ): NodeCapacity | null {
    let best: NodeCapacity | null = null;

    for (const node of this.nodes.values()) {
      // Freshness check.
      if (node.lastHeartbeatAt < now - 60) continue;
      // A node with no idle capacity can never make progress on any task.
      // This also closes the minTFLOPS=0 corner where `0 >= 0` would match
      // a fully-committed node and starve the allocation loop (see
      // loop-progress guard in allocateCommercialBids).
      if (node.idleTFLOPS <= 0) continue;
      // Capacity check.
      if (node.idleTFLOPS < minTFLOPS) continue;
      // Task type support.
      if (!node.supportedTaskTypes.includes(taskType)) continue;
      // Prefer node with most idle capacity (greedy allocation).
      if (best === null || node.idleTFLOPS > best.idleTFLOPS) {
        best = node;
      }
    }

    return best;
  }

  private reassignTasksFromNode(nodePublicKey: PublicKey): void {
    for (const [id, assignment] of this.assignments) {
      if (assignment.nodePublicKey === nodePublicKey && assignment.status === "IN_PROGRESS") {
        this.failAssignment(id, "Node disconnected");
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Metrics & Observability
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Return a broker status snapshot for monitoring dashboards.
   */
  getStatus(): BrokerStatus {
    const nodes = Array.from(this.nodes.values());
    const totalTFLOPS     = nodes.reduce((s, n) => s + n.totalTFLOPS,    0);
    const idleTFLOPS      = nodes.reduce((s, n) => s + n.idleTFLOPS,     0);
    const jgTFLOPS        = nodes.reduce((s, n) => s + n.jgClusterTFLOPS,0);
    const brokerTFLOPS    = nodes.reduce((s, n) => s + n.brokerTFLOPS,   0);
    const consensusTFLOPS = nodes.reduce((s, n) => s + n.consensusTFLOPS,0);

    return {
      timestamp:             Math.floor(Date.now() / 1000),
      activeNodes:           this.nodes.size,
      totalNetworkTFLOPS:    totalTFLOPS,
      consensusTFLOPS,
      jgClusterTFLOPS:       jgTFLOPS,
      brokerTFLOPS,
      idleTFLOPS,
      utilizationPercent:    totalTFLOPS > 0 ? ((totalTFLOPS - idleTFLOPS) / totalTFLOPS) * 100 : 0,
      activeBids:            this.orderBook.size,
      activeAssignments:     Array.from(this.assignments.values()).filter(a => a.status === "IN_PROGRESS").length,
      pendingPayments:       this.pendingPayments.size,
      jgQueuedTasks:         this.jgTaskQueue.length,
    };
  }

  /** Get pending payment assignments (to be settled in next block). */
  drainPendingPayments(): ComputeAssignment[] {
    const payments = Array.from(this.pendingPayments.values());
    this.pendingPayments.clear();
    return payments;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Supporting Types
// ─────────────────────────────────────────────────────────────────────────────

/** Internal JG AI cluster task (smart contract generation, marketing, ops). */
export interface JGClusterTask {
  taskId:        string;
  taskType:      ComputeTaskType;
  description:   string;  // "LLM inference for smart contract audit", etc.
  requiredTFLOPS: number;
  deadlineSecs:  number;
  taskPayloadHash: Hash256;
  /** Priority within JG tasks (lower = higher priority). */
  priority:      number;
}

/** Snapshot of broker system state for monitoring. */
export interface BrokerStatus {
  timestamp:            UnixTimestamp;
  activeNodes:          number;
  totalNetworkTFLOPS:   number;
  consensusTFLOPS:      number;
  jgClusterTFLOPS:      number;
  brokerTFLOPS:         number;
  idleTFLOPS:           number;
  utilizationPercent:   number;
  activeBids:           number;
  activeAssignments:    number;
  pendingPayments:      number;
  jgQueuedTasks:        number;
}

/** Singleton broker instance. */
export const globalBroker = new ComputeBroker();
