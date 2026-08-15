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
    advertiseUrl: advertiseUrl || undefined,
    seeds: argumentSeeds.length ? argumentSeeds : environmentSeeds(env.JGC_SEEDS),
    produce: argv.includes("--produce") || boolean(env.JGC_PRODUCE, false, "JGC_PRODUCE"),
    participate: argv.includes("--participate") || boolean(
      env.JGC_PARTICIPATE,
      false,
      "JGC_PARTICIPATE",
    ),
    blockIntervalSec: positiveSeconds(
      optionValue(argv, "--block-interval", env, "JGC_BLOCK_INTERVAL_SEC"),
      30,
      "--block-interval/JGC_BLOCK_INTERVAL_SEC",
    ),
  };
}
