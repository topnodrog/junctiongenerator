/**
 * @file src/network/status-server.ts
 * @description Tiny read-only HTTP status endpoint for a running JGC node.
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
 *  - Read-only. There is no spend path, no key material, no mutation — the worst
 *    a caller learns is a public address and its balance (both already on-chain).
 *  - CORS + Private-Network-Access headers are set so an HTTPS page may fetch the
 *    loopback endpoint. Chrome/Edge/Firefox treat http://127.0.0.1 as potentially
 *    trustworthy (not mixed content) and gate it behind a PNA preflight, which we
 *    answer with `Access-Control-Allow-Private-Network: true`.
 *
 * Dependency-free (Node's built-in `http`) so it adds nothing to the node's
 * supply chain.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";

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
}

/** Produces a fresh snapshot per request so balances track the live chain. */
export type StatusProvider = () => NodeStatus | Promise<NodeStatus>;

export interface StatusServerOptions {
  /** TCP port. Default $JGC_STATUS_PORT or 7777. */
  port?: number;
  /** Bind address. Default 127.0.0.1 (loopback). Override at your own risk. */
  host?: string;
}

export interface StatusServerHandle {
  readonly port: number;
  readonly host: string;
  close(): Promise<void>;
}

const DEFAULT_PORT = 7777;
const DEFAULT_HOST = "127.0.0.1";

/** Apply permissive read-only CORS + Private-Network-Access headers. */
function setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  // No credentials are ever used, so echoing the origin (or "*") is safe.
  res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  // Answer the PNA preflight so an HTTPS page may reach this loopback server.
  if (req.headers["access-control-request-private-network"] === "true") {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  res.setHeader("Access-Control-Max-Age", "600");
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
 *   OPTIONS *      → 204 (CORS/PNA preflight)
 */
export function startStatusServer(
  provider: StatusProvider,
  opts: StatusServerOptions = {},
): Promise<StatusServerHandle> {
  const port = opts.port ?? (Number(process.env.JGC_STATUS_PORT) || DEFAULT_PORT);
  const host = opts.host ?? DEFAULT_HOST;

  const server: Server = createServer((req, res) => {
    setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== "GET") {
      sendJson(res, 405, { error: "method not allowed" });
      return;
    }

    // Strip any query string before matching the path.
    const path = (req.url ?? "/").split("?")[0];

    if (path === "/healthz") {
      sendJson(res, 200, { ok: true });
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
