import {
  CONSENSUS_BLOCK_VERSION,
  computeTransactionMerkleRoot,
  createGenesisBlock,
  hashBlockHeader,
} from "../consensus/block.js";
import { BASE_UNITS_PER_JGC } from "../consensus/emission.js";
import {
  pqAddressFromPublicKey,
  pqGenerateKeyPair,
  pqScriptPubKeyFromAddress,
} from "../crypto/pq-signatures.js";
import type { Block, Transaction } from "../types/index.js";

export type ProofModeId = "simnet-receipts-v1" | "strict-groth16-v1";

export interface NetworkDefinition {
  readonly chainId: string;
  readonly networkMagic: number;
  readonly consensusVersion: number;
  readonly proofMode: ProofModeId;
  readonly defaultP2PPort: number;
  readonly defaultStatusPort: number;
}

export const TESTNET_NETWORK: NetworkDefinition = Object.freeze({
  chainId: "jgc-testnet-v3",
  networkMagic: 0x4a474354, // ASCII "JGCT"
  consensusVersion: CONSENSUS_BLOCK_VERSION,
  proofMode: "simnet-receipts-v1",
  defaultP2PPort: 19444,
  defaultStatusPort: 7777,
});

/** Public and intentionally insecure: these are valueless testnet funds. */
export const TESTNET_FAUCET_SEED = "f3".repeat(32);
export const TESTNET_FAUCET_ALLOCATION = 1_000_000n * BASE_UNITS_PER_JGC;

export function testnetFaucetKeyPair(): { privateKey: string; publicKey: string } {
  return pqGenerateKeyPair(TESTNET_FAUCET_SEED);
}

export const TESTNET_FAUCET_ADDRESS = pqAddressFromPublicKey(testnetFaucetKeyPair().publicKey);
export const TESTNET_GENESIS_HASH = "df5d37d6a1e7799621bba84580c9cf94ddd37ae4fec008bb3356ea990b77b485";

function createTestnetFaucetTransaction(): Transaction {
  return {
    version: 1,
    inputs: [],
    outputs: [{
      value: TESTNET_FAUCET_ALLOCATION,
      scriptPubKey: pqScriptPubKeyFromAddress(TESTNET_FAUCET_ADDRESS),
    }],
    locktime: 0,
    brokerTaskRef: "jgc-testnet-v3/faucet-allocation",
  };
}

export const MAINNET_NETWORK: NetworkDefinition = Object.freeze({
  chainId: "jgc-mainnet-v3",
  networkMagic: 0xd9b4bef9,
  consensusVersion: CONSENSUS_BLOCK_VERSION,
  proofMode: "strict-groth16-v1",
  defaultP2PPort: 9444,
  defaultStatusPort: 7777,
});

export function createNetworkGenesis(network: NetworkDefinition): Block {
  const genesis = createGenesisBlock();
  if (network.chainId !== TESTNET_NETWORK.chainId) return genesis;

  genesis.transactions.push(createTestnetFaucetTransaction());
  genesis.header.merkleRoot = computeTransactionMerkleRoot(genesis.transactions);
  return genesis;
}

export function networkGenesisHash(network: NetworkDefinition): string {
  return hashBlockHeader(createNetworkGenesis(network).header);
}

export function networkByName(name: string): NetworkDefinition {
  if (name === "testnet") return TESTNET_NETWORK;
  if (name === "mainnet") return MAINNET_NETWORK;
  throw new Error(`unknown network "${name}" (expected testnet or mainnet)`);
}
