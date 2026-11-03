/**
 * @file src/network/status-server.ts
 * @description Small HTTP status and deliberately narrow public testnet API.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The public site (junctiongenerator.net) wants to show a live "node is running"
 * panel — chain height, public balances, and epoch participation —
 * sourced from the operator's OWN node rather than re-simulated. A node has no
 * UI, so it exposes a single JSON snapshot a browser can poll.
 *
 * SECURITY POSTURE (hardened 2026-11-02)
 * ────────────────────────────────────
 *  - Loopback only by default (127.0.0.1). Wallet balances must never be served
 *    to the LAN; bind elsewhere only with deliberate intent.
 *  - `/status` is private. When the server is bound to a non-loopback address,
 *    private routes are disabled unless `allowPrivateStatusOnPublicBind` AND a
 *    `statusToken` are both supplied. This prevents a deployment that exposes
 *    port 7777 "just for the explorer" from leaking operator status/balances.
 *  - CORS origins are allowlisted, never reflected. An unrelated web page can
 *    no longer read a local node's private status through a browser.
 *  - `Access-Control-Allow-Private-Network` is emitted only for an allowlisted
 *    origin on a loopback-bound server, so arbitrary sites cannot use the
 *    browser as a private-network proxy.
 *  - The optional public API is read-only: /healthz, /explorer and /balance.
 *    No key material, configuration or operator status is exposed.
 *
 * Dependency-free (Node's built-in `http`) so it adds nothing to the node's
 * supply chain.
 */

import { createHash, timingSafeEqual } from "crypto";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";
import type { AddressBalance, ExplorerSnapshot } from "./public-testnet-api.js";

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
  /** Active process role; this distinguishes a participant from a back-checker. */
  role: "back-checker" | "participant" | "designated-producer" | "status-observer";
  /** Whether this process is currently submitting pilot participation receipts. */
  participating: boolean;
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
  /** Bind address. Default 127.0.0.1 (loopback). */
  host?: string;
  /** Optional, deliberately narrow public testnet API. `/status` stays private. */
  publicApi?: {
    explorer(): ExplorerSnapshot | Promise<ExplorerSnapshot>;
    balance(address: string): AddressBalance | Promise<AddressBalance>;
  };
  /** Exact browser origins allowed to read responses cross-origin. */
  allowedOrigins?: readonly string[];
  /** Bearer token required for private /status routes. Never sent by browsers. */
  statusToken?: string;
  /** Expose private routes on a public bind; requires statusToken. */
  allowPrivateStatusOnPublicBind?: boolean;
  /** Serve only the narrow public read-only routes, even on loopback. */
  publicApiOnly?: boolean;
  /** Permit the loopback Private-Network-Access preflight for allowlisted origins. */
  allowPrivateNetwork?: boolean;
}

export interface StatusServerHandle {
  readonly port: number;
  readonly host: string;
  close(): Promise<void>;
}

const DEFAULT_PORT = 7777;
const DEFAULT_HOST = "127.0.0.1";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost", "[::1]", "0:0:0:0:0:0:0:1"]);
const SITE_ORIGINS = ["https://junctiongenerator.net", "https://www.junctiongenerator.net"];
const LOCAL_DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];
const MAX_REQUEST_URL_BYTES = 2048;

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

/** Resolve the exact, non-reflecting CORS allowlist for this bind. */
export function allowedStatusOrigins(host: string, override?: readonly string[]): string[] {
  if (override) return [...new Set(override.map((origin) => origin.trim()).filter(Boolean))];
  const env = process.env.JGC_STATUS_ALLOWED_ORIGINS;
  if (env !== undefined) return [...new Set(env.split(",").map((origin) => origin.trim()).filter(Boolean))];
  return isLoopbackHost(host) ? [...SITE_ORIGINS, ...LOCAL_DEV_ORIGINS] : [...SITE_ORIGINS];
}

function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
}

/** Return whether an Origin header is present and allowed. Never reflect it. */
function setCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins: readonly string[],
  allowPrivateNetwork: boolean,
): { originPresent: boolean; originAllowed: boolean } {
  const origin = req.headers.origin;
  setSecurityHeaders(res);
  if (!origin) return { originPresent: false, originAllowed: true };
  if (!allowedOrigins.includes(origin)) return { originPresent: true, originAllowed: false };
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
  if (allowPrivateNetwork && req.headers["access-control-request-private-network"] === "true") {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  return { originPresent: true, originAllowed: true };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(payload);
}

function bearerMatches(req: IncomingMessage, expected: string): boolean {
  const header = req.headers.authorization ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const digest = (value: string): Buffer => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(provided), digest(expected)) && provided.length > 0;
}

/**
 * Start the status server. Returns a handle once it is listening. The `provider`
 * is invoked on every GET /status; keep it cheap (a UTXO scan, not a re-sync).
 *
 * Routes (GET only, plus OPTIONS preflight):
 *   GET  /healthz  → { ok: true }   (liveness, no wallet data)
 *   GET  /explorer → public chain snapshot (when configured)
 *   GET  /balance  → public address balance (when configured)
 *   GET  /status   → NodeStatus JSON (private; loopback by default)
 *   GET  /         → alias of /status (private)
 */
export function startStatusServer(
  provider: StatusProvider,
  opts: StatusServerOptions = {},
): Promise<StatusServerHandle> {
  const port = opts.port ?? (Number(process.env.JGC_STATUS_PORT) || DEFAULT_PORT);
  const host = opts.host ?? DEFAULT_HOST;
  const loopback = isLoopbackHost(host);
  const privateRoutesAllowed = !opts.publicApiOnly
    && (loopback || opts.allowPrivateStatusOnPublicBind === true);
  if (!loopback && privateRoutesAllowed && !opts.statusToken) {
    return Promise.reject(new Error("exposing /status on a public bind requires statusToken"));
  }
  const allowedOrigins = allowedStatusOrigins(host, opts.allowedOrigins);
  const allowPrivateNetwork = (opts.allowPrivateNetwork ?? true) && loopback;
  const server: Server = createServer((req, res) => {
    const cors = setCorsHeaders(req, res, allowedOrigins, allowPrivateNetwork);

    if (req.method === "OPTIONS") {
      res.statusCode = cors.originAllowed ? 204 : 403;
      if (!cors.originAllowed) sendJson(res, 403, { error: "origin not allowed" });
      else res.end();
      return;
    }
    if (cors.originPresent && !cors.originAllowed) {
      sendJson(res, 403, { error: "origin not allowed" });
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "method not allowed" });
      return;
    }
    if ((req.url?.length ?? 0) > MAX_REQUEST_URL_BYTES) {
      sendJson(res, 414, { error: "request too long" });
      return;
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;

    if (path === "/healthz") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (opts.publicApi && path === "/explorer") {
      Promise.resolve(opts.publicApi.explorer())
        .then((snapshot) => sendJson(res, 200, snapshot))
        .catch((err: unknown) => sendJson(res, 503, {
          error: err instanceof Error ? err.message : String(err),
        }));
      return;
    }

    if (opts.publicApi && path === "/balance") {
      const address = url.searchParams.get("address") ?? "";
      Promise.resolve()
        .then(() => opts.publicApi!.balance(address))
        .then((balance) => sendJson(res, 200, balance))
        .catch((err: unknown) => sendJson(res, 400, {
          error: err instanceof Error ? err.message : String(err),
        }));
      return;
    }

    if (path === "/status" || path === "/") {
      if (!privateRoutesAllowed) {
        // Do not distinguish "private route exists" from "unknown route" on a
        // public bind: a 404 gives an attacker less information than a 401.
        sendJson(res, 404, { error: "not found" });
        return;
      }
      if (opts.statusToken && !bearerMatches(req, opts.statusToken)) {
        sendJson(res, 401, { error: "unauthorized" });
        return;
      }
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
