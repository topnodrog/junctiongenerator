// Offline, disposable proof that a recovered participant can spend an epoch payout.
// Build first. Never supply an existing wallet or seed address to this rehearsal.
import assert from "node:assert/strict";
import { TESTNET_NETWORK as network, createNetworkGenesis } from "../dist/config/networks.js";
import { BLOCKS_PER_EPOCH, BASE_UNITS_PER_JGC } from "../dist/consensus/emission.js";
import { COINBASE_MATURITY } from "../dist/consensus/utxo.js";
import { setQuantumVerifierMode } from "../dist/crypto/pq.js";
import { TestnetParticipant } from "../dist/miner/testnet-participant.js";
import { DesignatedBlockProducer } from "../dist/network/designated-producer.js";
import { JGCNode } from "../dist/network/node.js";
import { addressBalance } from "../dist/network/public-testnet-api.js";
import { parseJGC, Wallet } from "../dist/wallet/wallet.js";
import { generateRecoveryPhrase } from "../dist/wallet/recovery.js";

setQuantumVerifierMode("simnet");
const node = new JGCNode({ listenPort: 0, rpcPort: 0, networkMagic: network.networkMagic,
  maxPeers: 4, enableBroker: false, junctionGeneratorMode: false, chainId: network.chainId,
  consensusVersion: network.consensusVersion, proofMode: network.proofMode, requireNetworkIdentity: true },
createNetworkGenesis(network));
const producer = new DesignatedBlockProducer(node);
const phrase = generateRecoveryPhrase();
const wallet = Wallet.fromRecoveryPhrase(phrase, network.chainId);
const label = "account-0";
const address = wallet.address(label);
const participant = new TestnetParticipant(node, { address, publicKey: wallet.publicKey(label),
  privateKey: wallet.privateKey(label), createdAt: new Date().toISOString(), version: 1 });
async function nextBlock() {
  await participant.tick();
  assert.ok(await producer.tickNow(), producer.getStatus().lastError ?? "Expected a block");
}
const boundary = BLOCKS_PER_EPOCH - 1;
for (let height = 1; height <= boundary; height++) await nextBlock();
assert.equal(addressBalance(node, address).pendingJGTC, "7200");
for (let i = 0; i < COINBASE_MATURITY; i++) await nextBlock();
const restored = Wallet.fromRecoveryPhrase(phrase, network.chainId);
assert.equal(restored.balance(label, node.getUTXOSet(), node.getChainInfo().tipHeight), 7200n * BASE_UNITS_PER_JGC);
const recipient = Wallet.create().generate("destination");
const { tx } = restored.buildSpend({ fromLabel: label, toAddress: recipient, amount: BASE_UNITS_PER_JGC,
  fee: parseJGC("0.0001"), utxo: node.getUTXOSet(), currentHeight: node.getChainInfo().tipHeight });
const admission = node.submitTransaction(tx);
assert.ok(admission.ok, admission.error);
await nextBlock();
assert.equal(addressBalance(node, recipient).balanceJGTC, "1");
console.log("PASS: single participant settled 7200 JGTC, restored from 24 words, and confirmed a 1 JGTC spend on local simnet.");
