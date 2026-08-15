/**
 * @file src/network/status-server.ts
 * @description Small HTTP status and deliberately narrow public testnet API.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The public site (junctiongenerator.net) wants to show a live "node is running"
 * panel — wallet address, mature ("current") JGC, and immature ("pending") JGC —
 * sourced from the operator's OWN node rather than re-simulated. A node has no
 * UI, so it exposes a single JSON snapshot a browser can poll.
 *
 * SECURITY POSTURE
 * ────────────────
 *  - Loopback only by default (127.0.0.1). Wallet balances must never be served
 *    to the LAN; bind elsewhere only with deliberate intent.
 *  - `/status` remains read-only and loopback-only by default. The optional public
 *    API adds explorer reads and one tightly bounded faucet mutation; its signing
 *    key and claims ledger never appear in a response.
 *  - CORS + Private-Network-Access headers are set so an HTTPS page may fetch the
 *    loopback endpoint. Chrome/Edge/Firefox treat http://127.0.0.1 as potentially
 *    trustworthy (not mixed content) and gate it behind a PNA preflight, which we
 *    answer with `Access-Control-Allow-Private-Network: true`.
 *
 * Dependency-free (Node's built-in `http`) so it adds nothing to the node's
 * supply chain.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";
import type { AddressBalance, ExplorerSnapshot, FaucetClaim } from "./public-testnet-api.js";

/**
 * The snapshot served at GET /status. All money fields are pre-formatted decimal
 * JGC strings (the node speaks BigInt base units internally; the browser must not
 * have to). `null` means "not known to this process", never a faked zero.
 */
export interface NodeStatus {
  running: true;
  version: string;
  /** "regtest" | "testnet" | "mainnet" — the chain this node is on. */
  network: string;
  /** epoch ms when the status server started. */
  startedAt: number;
  uptimeSec: number;
  /** chain tip height, or null when no chain store is loaded. */
  height: number | null;
  /** Connected P2P peers, or null when this status process has no live node. */
  peerCount: number | null;
  /** whether real chain state backs the balance figures below. */
  chain: boolean;
  /** the watched/owned address, or null if none configured. */
  address: string | null;
  /** keystore label, when the address came from an unlocked key. */
  label: string | null;
  /** mature, spendable balance — "current JGC". */
  balanceJGC: string;
  /** immature coinbase awaiting maturity — "pending JGC". */
  pendingJGC: string;
  /** configured junctioning model (informational), or null. */
  model: string | null;
  /** Present when this process can act as the designated testnet producer. */
  producer?: {
    enabled: boolean;
    producedBlocks: number;
    lastProducedHeight: number | null;
    lastError: string | null;
    waitingForTFLOPS: number;
  };
}

/** Produces a fresh snapshot per request so balances track the live chain. */
export type StatusProvider = () => NodeStatus | Promise<NodeStatus>;

export interface StatusServerOptions {
  /** TCP port. Default $JGC_STATUS_PORT or 7777. */
  port?: number;
  /** Bind address. Default 127.0.0.1 (loopback). Override at your own risk. */
  host?: string;
  /** Optional, deliberately narrow public testnet API. `/status` stays private. */
  publicApi?: {
    explorer(): ExplorerSnapshot | Promise<ExplorerSnapshot>;
    balance(address: string): AddressBalance | Promise<AddressBalance>;
    faucet(address: string): FaucetClaim | Promise<FaucetClaim>;
  };
}

export interface StatusServerHandle {
  readonly port: number;
  readonly host: string;
  close(): Promise<void>;
}

const DEFAULT_PORT = 7777;
const DEFAULT_HOST = "127.0.0.1";

/** Apply CORS + Private-Network-Access headers for the browser-facing routes. */
function setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  // No credentials are ever used, so echoing the origin (or "*") is safe.
  res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  // Answer the PNA preflight so an HTTPS page may reach this loopback server.
  if (req.headers["access-control-request-private-network"] === "true") {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  res.setHeader("Access-Control-Max-Age", "600");
}

function readJsonBody(req: IncomingMessage, maxBytes = 4096): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    req.on("data", (chunk: Buffer) => {
      if (failed) return;
      size += chunk.length;
      if (size > maxBytes) {
        failed = true;
        reject(new Error("request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (failed) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(payload);
}

/**
 * Start the status server. Returns a handle once it is listening. The `provider`
 * is invoked on every GET /status; keep it cheap (a UTXO scan, not a re-sync).
 *
 * Routes:
 *   GET  /status   → NodeStatus JSON
 *   GET  /healthz  → { ok: true }   (liveness, no wallet data)
 *   GET  /explorer → public chain snapshot (when configured)
 *   GET  /balance  → public address balance (when configured)
 *   POST /faucet   → rate-limited test-coin request (when configured)
 *   OPTIONS *      → 204 (CORS/PNA preflight)
 */
export function startStatusServer(
  provider: StatusProvider,
  opts: StatusServerOptions = {},
): Promise<StatusServerHandle> {
  const port = opts.port ?? (Number(process.env.JGC_STATUS_PORT) || DEFAULT_PORT);
  const host = opts.host ?? DEFAULT_HOST;
  const faucetRequests = new Map<string, number>();

  const server: Server = createServer((req, res) => {
    setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;

    if (path === "/healthz") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (opts.publicApi && path === "/explorer" && req.method === "GET") {
      Promise.resolve(opts.publicApi.explorer())
        .then((snapshot) => sendJson(res, 200, snapshot))
        .catch((err: unknown) => sendJson(res, 503, {
          error: err instanceof Error ? err.message : String(err),
        }));
      return;
    }

    if (opts.publicApi && path === "/balance" && req.method === "GET") {
      const address = url.searchParams.get("address") ?? "";
      Promise.resolve()
        .then(() => opts.publicApi!.balance(address))
        .then((balance) => sendJson(res, 200, balance))
        .catch((err: unknown) => sendJson(res, 400, {
          error: err instanceof Error ? err.message : String(err),
        }));
      return;
    }

    if (opts.publicApi && path === "/faucet" && req.method === "POST") {
      const now = Date.now();
      if (faucetRequests.size > 10_000) {
        for (const [client, requestedAt] of faucetRequests) {
          if (now - requestedAt >= 60_000) faucetRequests.delete(client);
        }
      }
      const forwarded = req.headers["x-forwarded-for"];
      const remote = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim()
        || req.socket.remoteAddress
        || "unknown";
      const lastRequest = faucetRequests.get(remote) ?? 0;
      if (now - lastRequest < 60_000) {
        sendJson(res, 429, { error: "please wait one minute before another faucet request" });
        return;
      }
      faucetRequests.set(remote, now);
      void readJsonBody(req)
        .then((body) => {
          if (typeof body.address !== "string") throw new Error("address is required");
          return opts.publicApi!.faucet(body.address);
        })
        .then((claim) => sendJson(res, 202, claim))
        .catch((err: unknown) => sendJson(res, 400, {
          error: err instanceof Error ? err.message : String(err),
        }));
      return;
    }

    if (req.method !== "GET") {
      sendJson(res, 405, { error: "method not allowed" });
      return;
    }

    if (path === "/status" || path === "/") {
      Promise.resolve()
        .then(provider)
        .then((status) => sendJson(res, 200, status))
        .catch((err: unknown) =>
          sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) }),
        );
      return;
    }

    sendJson(res, 404, { error: "not found" });
  });

  return new Promise<StatusServerHandle>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      const address = server.address();
      resolve({
        port: typeof address === "string" || address === null ? port : address.port,
        host,
        close: () =>
          new Promise<void>((res, rej) =>
            server.close((err) => (err ? rej(err) : res())),
          ),
      });
    });
  });
}
