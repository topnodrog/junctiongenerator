import {
  CONSENSUS_BLOCK_VERSION,
  createGenesisBlock,
  GENESIS_DIFFICULTY_BITS,
  hashBlockHeader,
} from "../consensus/block.js";
import type { Block } from "../types/index.js";
import { TARGET_BLOCK_INTERVAL_SECONDS } from "../consensus/emission.js";

export type ProofModeId = "simnet-receipts-v1" | "strict-groth16-v1";

export interface NetworkDefinition {
  readonly chainId: string;
  readonly networkMagic: number;
  readonly consensusVersion: number;
  readonly proofMode: ProofModeId;
  readonly currencySymbol: "JGTC" | "JGC";
  readonly targetBlockIntervalSec: number;
  readonly defaultP2PPort: number;
  readonly defaultStatusPort: number;
}

export const TESTNET_NETWORK: NetworkDefinition = Object.freeze({
  chainId: "jgtc-testnet-v1",
  networkMagic: 0x4a474354, // ASCII "JGCT"
  consensusVersion: CONSENSUS_BLOCK_VERSION,
  proofMode: "simnet-receipts-v1",
  currencySymbol: "JGTC",
  targetBlockIntervalSec: TARGET_BLOCK_INTERVAL_SECONDS,
  defaultP2PPort: 19444,
  defaultStatusPort: 7777,
});

/** Distinct zero-value JGTC genesis. No spendable test coins exist before epoch settlement. */
export const TESTNET_GENESIS_TIMESTAMP = Date.UTC(2026, 7, 15, 4, 0, 0) / 1000;
export const TESTNET_GENESIS_MESSAGE = "JGTC 2026-08-15: No premine; earned by compute every 144 blocks";
export const TESTNET_GENESIS_HASH = "738588b974ed62ed52e74a946371bc8b6d84508b6c38203f56ada38fce4bab36";

export const MAINNET_NETWORK: NetworkDefinition = Object.freeze({
  chainId: "jgc-mainnet-v3",
  networkMagic: 0xd9b4bef9,
  consensusVersion: CONSENSUS_BLOCK_VERSION,
  proofMode: "strict-groth16-v1",
  currencySymbol: "JGC",
  targetBlockIntervalSec: TARGET_BLOCK_INTERVAL_SECONDS,
  defaultP2PPort: 9444,
  defaultStatusPort: 7777,
});

export function createNetworkGenesis(network: NetworkDefinition): Block {
  if (network.chainId !== TESTNET_NETWORK.chainId) return createGenesisBlock();
  return createGenesisBlock(
    GENESIS_DIFFICULTY_BITS,
    TESTNET_GENESIS_TIMESTAMP,
    TESTNET_GENESIS_MESSAGE,
  );
}

export function networkGenesisHash(network: NetworkDefinition): string {
  return hashBlockHeader(createNetworkGenesis(network).header);
}

export function networkByName(name: string): NetworkDefinition {
  if (name === "testnet") return TESTNET_NETWORK;
  if (name === "mainnet") return MAINNET_NETWORK;
  throw new Error(`unknown network "${name}" (expected testnet or mainnet)`);
}
