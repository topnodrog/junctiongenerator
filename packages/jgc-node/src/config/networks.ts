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
  chainId: "jgtc-testnet-v2",
  networkMagic: 0x4a474332, // ASCII "JGC2"
  consensusVersion: CONSENSUS_BLOCK_VERSION,
  proofMode: "simnet-receipts-v1",
  currencySymbol: "JGTC",
  targetBlockIntervalSec: TARGET_BLOCK_INTERVAL_SECONDS,
  defaultP2PPort: 19444,
  defaultStatusPort: 7777,
});

/** Distinct zero-value JGTC genesis. No spendable test coins exist before epoch settlement. */
export const TESTNET_GENESIS_TIMESTAMP = Date.UTC(2026, 7, 20, 20, 0, 0) / 1000;
export const TESTNET_GENESIS_MESSAGE = "JGTC 2026-08-20: Settlement IDs commit boundary height";
export const TESTNET_GENESIS_HASH = "da5c0c28e076211e13e75f8cd28fe98f81080dafefc5ad803620961d16ee1d77";

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
