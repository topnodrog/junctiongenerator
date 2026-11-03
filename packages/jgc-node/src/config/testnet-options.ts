import { resolve } from "path";
import { TESTNET_NETWORK } from "./networks.js";

export interface TestnetOptions {
  host: string;
  port: number;
  statusHost: string;
  statusPort: number;
  dataDir: string;
  advertiseUrl?: string;
  seeds: string[];
  produce: boolean;
  participate: boolean;
  blockIntervalSec: number;
  /** Optional second listener exposing only /healthz, /explorer and /balance. */
  publicApiHost?: string;
  publicApiPort?: number;
  /** Bearer token for private /status routes (never used by the browser panel). */
  statusToken?: string;
  /** Explicitly allow private /status on a non-loopback bind (requires token). */
  allowPrivateStatusOnPublicBind?: boolean;
  /** Exact allowed browser origins; overrides the status-server defaults. */
  allowedOrigins?: string[];
}

function argumentValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function optionValue(
  argv: string[],
  name: string,
  env: NodeJS.ProcessEnv,
  environmentName: string,
): string | undefined {
  return argumentValue(argv, name) ?? env[environmentName];
}

function port(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`${name} must be an integer from 0 to 65535`);
  }
  return parsed;
}

function optionalPort(raw: string | undefined, name: string): number | undefined {
  return raw === undefined ? undefined : port(raw, 0, name);
}

function positiveSeconds(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer number of seconds`);
  }
  return parsed;
}

function boolean(raw: string | undefined, fallback: boolean, name: string): boolean {
  if (raw === undefined) return fallback;
  if (["1", "true", "yes"].includes(raw.toLowerCase())) return true;
  if (["0", "false", "no"].includes(raw.toLowerCase())) return false;
  throw new Error(`${name} must be one of true, false, 1, 0, yes, or no`);
}

function environmentSeeds(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((seed) => seed.trim())
    .filter(Boolean);
}

/**
 * Only wss:// bootstrap URLs are accepted on the public internet. Cleartext
 * ws:// is permitted for loopback, single-label container hostnames and RFC
 * 1918 addresses so local Compose/CI rehearsals keep working. Credentials,
 * query strings and fragments are always rejected: they are a common way to
 * smuggle operator secrets into logs and peer-discovery messages.
 */
export function isLocalPeerHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
  if (!host.includes(".")) return true; // single-label container/service name
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

export function validatePeerUrl(raw: string, name: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
  if (url.protocol !== "wss:" && url.protocol !== "ws:") {
    throw new Error(`${name} must use wss:// (or ws:// for local/container peers)`);
  }
  if (url.username || url.password) throw new Error(`${name} must not contain credentials`);
  if (url.search || url.hash) throw new Error(`${name} must not contain a query string or fragment`);
  if (!url.hostname) throw new Error(`${name} has no hostname`);
  if (url.protocol === "ws:" && !isLocalPeerHost(url.hostname)) {
    throw new Error(`${name} uses cleartext ws:// for a public host; use wss://`);
  }
  // Preserve the operator's exact string: discovery messages and tests compare
  // URLs literally, and URL.toString() would add a trailing slash.
  return raw.trim();
}

function validateUrls(urls: string[], name: string): string[] {
  if (urls.length > 32) throw new Error(`${name} supports at most 32 entries`);
  const validated = urls.map((entry) => validatePeerUrl(entry, name));
  const unique = new Set(validated);
  if (unique.size !== validated.length) throw new Error(`${name} contains duplicate entries`);
  return validated;
}

/**
 * Parse the public-testnet launcher configuration. Command-line values take
 * precedence over environment values so an operator can make a one-off,
 * visible override without rebuilding a container.
 */
export function parseTestnetOptions(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): TestnetOptions {
  const argumentSeeds = argv
    .map((arg, index) => arg === "--seed" ? argv[index + 1] : undefined)
    .filter((seed): seed is string => Boolean(seed));
  const advertiseUrl = optionValue(argv, "--advertise", env, "JGC_ADVERTISE_URL");
  const seeds = validateUrls(
    argumentSeeds.length ? argumentSeeds : environmentSeeds(env.JGC_SEEDS),
    "JGC_SEEDS/--seed",
  );
  const allowedOrigins = env.JGC_STATUS_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim()).filter(Boolean);

  return {
    host: optionValue(argv, "--host", env, "JGC_P2P_HOST") ?? "127.0.0.1",
    port: port(
      optionValue(argv, "--port", env, "JGC_P2P_PORT"),
      TESTNET_NETWORK.defaultP2PPort,
      "--port/JGC_P2P_PORT",
    ),
    statusHost: optionValue(argv, "--status-host", env, "JGC_STATUS_HOST") ?? "127.0.0.1",
    statusPort: port(
      optionValue(argv, "--status-port", env, "JGC_STATUS_PORT"),
      TESTNET_NETWORK.defaultStatusPort,
      "--status-port/JGC_STATUS_PORT",
    ),
    dataDir: resolve(optionValue(argv, "--datadir", env, "JGC_DATA_DIR") ?? "./data/testnet"),
    advertiseUrl: advertiseUrl ? validatePeerUrl(advertiseUrl, "JGC_ADVERTISE_URL/--advertise") : undefined,
    seeds,
    produce: argv.includes("--produce") || boolean(env.JGC_PRODUCE, false, "JGC_PRODUCE"),
    participate: argv.includes("--participate") || boolean(
      env.JGC_PARTICIPATE,
      false,
      "JGC_PARTICIPATE",
    ),
    blockIntervalSec: positiveSeconds(
      optionValue(argv, "--block-interval", env, "JGC_BLOCK_INTERVAL_SEC"),
      TESTNET_NETWORK.targetBlockIntervalSec,
      "--block-interval/JGC_BLOCK_INTERVAL_SEC",
    ),
    publicApiHost: env.JGC_PUBLIC_API_HOST,
    publicApiPort: optionalPort(env.JGC_PUBLIC_API_PORT, "JGC_PUBLIC_API_PORT"),
    statusToken: env.JGC_STATUS_TOKEN || undefined,
    allowPrivateStatusOnPublicBind: boolean(
      env.JGC_ALLOW_PRIVATE_STATUS_ON_PUBLIC_BIND,
      false,
      "JGC_ALLOW_PRIVATE_STATUS_ON_PUBLIC_BIND",
    ),
    allowedOrigins: allowedOrigins?.length ? allowedOrigins : undefined,
  };
}
