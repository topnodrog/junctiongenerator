/** Native Bitcoin test-network wallet. No wrapped BTC, bridge or JGC conversion. */
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import * as btc from "@scure/btc-signer";
import { normalizeRecoveryPhrase } from "./recovery.js";

export type BitcoinTestNetwork = "regtest" | "signet";
export const BITCOIN_MAX_MONEY = 21_000_000n * 100_000_000n;
const MAX_INPUTS = 100;
const MAX_RAW_BYTES = 400_000;
const DUST = 546n; // Conservative floor for the supported native SegWit outputs.

export function bitcoinNetwork(network: BitcoinTestNetwork): typeof btc.TEST_NETWORK {
  if (network === "regtest") return { ...btc.TEST_NETWORK, bech32: "bcrt" };
  if (network === "signet") return btc.TEST_NETWORK;
  throw new Error("Only Bitcoin regtest and signet are enabled; mainnet support is not released");
}

export interface BitcoinPreviousOutput { txid: string; vout: number; rawTransaction: string }
export interface BitcoinSpendRequest {
  toAddress: string;
  amountSats: bigint;
  feeSats: bigint;
  inputs: BitcoinPreviousOutput[];
}
export interface BitcoinSignedSpend {
  network: BitcoinTestNetwork; txid: string; rawTransaction: string; psbt: string;
  amountSats: bigint; feeSats: bigint; changeSats: bigint; virtualBytes: number;
  toAddress: string; changeAddress: string;
}

export class BitcoinTestWallet {
  private readonly receive: HDKey;
  private readonly change: HDKey;
  readonly derivationPath: string;

  constructor(phrase: string, readonly network: BitcoinTestNetwork, account = 0) {
    bitcoinNetwork(network);
    if (!Number.isSafeInteger(account) || account < 0 || account >= 100) throw new Error("Invalid Bitcoin account index");
    const seed = mnemonicToSeedSync(normalizeRecoveryPhrase(phrase), "");
    const root = HDKey.fromMasterSeed(seed);
    this.derivationPath = `m/84'/1'/${account}'`;
    try {
      this.receive = root.derive(`${this.derivationPath}/0/0`);
      this.change = root.derive(`${this.derivationPath}/1/0`);
    } finally { seed.fill(0); root.wipePrivateData(); }
  }

  address(): string { return btc.p2wpkh(this.receive.publicKey!, bitcoinNetwork(this.network)).address; }
  changeAddress(): string { return btc.p2wpkh(this.change.publicKey!, bitcoinNetwork(this.network)).address; }
  destroy(): void { this.receive.wipePrivateData(); this.change.wipePrivateData(); }

  buildSpend(request: BitcoinSpendRequest): BitcoinSignedSpend {
    const network = bitcoinNetwork(this.network);
    if (typeof request.amountSats !== "bigint" || request.amountSats < DUST || request.amountSats > BITCOIN_MAX_MONEY) throw new Error("Invalid or dust Bitcoin amount");
    if (typeof request.feeSats !== "bigint" || request.feeSats <= 0n || request.feeSats > 100_000n) throw new Error("Bitcoin fee must be 1 to 100000 satoshis");
    if (!Array.isArray(request.inputs) || request.inputs.length < 1 || request.inputs.length > MAX_INPUTS) throw new Error("Invalid Bitcoin input count");
    // Address decoding verifies checksum and network prefix, rather than regex alone.
    if (btc.Address(network).decode(request.toAddress).type !== "wpkh") throw new Error("This prototype sends to native SegWit P2WPKH addresses only");
    const receiveScript = btc.p2wpkh(this.receive.publicKey!, network).script;
    const changeScript = btc.p2wpkh(this.change.publicKey!, network).script;
    const tx = new btc.Transaction({ version: 2 });
    let total = 0n;
    const outpoints = new Set<string>();
    const signers = new Set<HDKey>();
    for (const input of request.inputs) {
      if (!/^[0-9a-f]{64}$/.test(input.txid) || !Number.isSafeInteger(input.vout) || input.vout < 0 || input.vout > 0xffffffff) throw new Error("Invalid Bitcoin outpoint");
      const outpoint = `${input.txid}:${input.vout}`;
      if (outpoints.has(outpoint)) throw new Error("Duplicate Bitcoin input");
      outpoints.add(outpoint);
      if (typeof input.rawTransaction !== "string" || input.rawTransaction.length > MAX_RAW_BYTES * 2 || !/^(?:[0-9a-fA-F]{2})+$/.test(input.rawTransaction)) throw new Error("Invalid previous Bitcoin transaction");
      const previous = btc.Transaction.fromRaw(Buffer.from(input.rawTransaction, "hex"));
      if (previous.id !== input.txid) throw new Error("Previous Bitcoin transaction ID mismatch");
      const output = previous.getOutput(input.vout);
      if (!output.script || output.amount === undefined || output.amount <= 0n || output.amount > BITCOIN_MAX_MONEY) throw new Error("Invalid previous output");
      const script = Buffer.from(output.script);
      const signer = script.equals(Buffer.from(receiveScript)) ? this.receive : script.equals(Buffer.from(changeScript)) ? this.change : undefined;
      if (!signer) throw new Error("Bitcoin input does not belong to this account");
      signers.add(signer);
      total += output.amount;
      if (total > BITCOIN_MAX_MONEY) throw new Error("Bitcoin input total exceeds monetary bound");
      tx.addInput({ txid: input.txid, index: input.vout, witnessUtxo: { script: output.script, amount: output.amount }, sighashType: btc.SigHash.ALL, sequence: 0xfffffffd });
    }
    const changeSats = total - request.amountSats - request.feeSats;
    if (changeSats < 0n) throw new Error("Insufficient Bitcoin funds");
    if (changeSats > 0n && changeSats < DUST) throw new Error("Change would be dust; adjust amount or fee explicitly");
    tx.addOutputAddress(request.toAddress, request.amountSats, network);
    if (changeSats > 0n) tx.addOutputAddress(this.changeAddress(), changeSats, network);
    for (const signer of signers) {
      if (!signer.privateKey) throw new Error("Bitcoin wallet has been locked");
      tx.sign(signer.privateKey, [btc.SigHash.ALL]);
    }
    const psbt = Buffer.from(tx.toPSBT()).toString("base64");
    tx.finalize();
    if (tx.fee !== request.feeSats) throw new Error("Bitcoin fee mismatch");
    if (request.feeSats > BigInt(tx.vsize) * 100n) throw new Error("Bitcoin fee exceeds 100 sat/vB safety limit");
    return { network: this.network, txid: tx.id, rawTransaction: tx.hex, psbt,
      amountSats: request.amountSats, feeSats: tx.fee, changeSats, virtualBytes: tx.vsize,
      toAddress: request.toAddress, changeAddress: this.changeAddress() };
  }
}
