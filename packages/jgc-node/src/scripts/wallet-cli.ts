/**
 * @file src/scripts/wallet-cli.ts
 * @description `jgc-wallet` — a command-line wallet over the JGC ledger.
 *
 * Keystore commands operate on an encrypted file (standalone, no chain):
 *   setup                  create and verify a 24-word recovery wallet
 *   restore                recover into a new file
 *   new <label>            add an account to an existing wallet
 *   import <label> <priv> <pub>  import an ML-DSA keypair (legacy only)
 *   address <label>        print a key's address
 *   list                   list labels + addresses
 *   export <label>         print a private key (handle with care)
 *
 * Chain commands boot a node from a block store (--datadir) and read/spend coins:
 *   balance <label>                       spendable balance
 *   utxos   <label>                        list spendable outputs
 *   send    <label> <toAddr> <amount>      build + sign a spend
 *           [--fee <amt>] [--broadcast ws://host:port]
 *
 * Options:  --keystore <path> (or $JGC_KEYSTORE, default ./wallet.keystore.json)
 *           hidden password prompt by default; $JGC_WALLET_PASS for automation
 *           --datadir <dir>   block store for chain commands
 *           --network <name>  testnet (default) or mainnet
 *
 * Run:  npm run wallet -- <command> [...]      (after npm run build)
 */

import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { NodeConfig } from "../types/index.js";
import { JGCNode } from "../network/node.js";
import {
  createNetworkGenesis,
  networkByName,
} from "../config/networks.js";
import { serializeTransaction } from "../consensus/block.js";
import { connectToPeers } from "../network/transport.js";
import { Wallet, formatJGC, parseJGC, type KeystoreFile } from "../wallet/wallet.js";
import { atomicWriteFile, syncDirectory } from "../storage/durable-file.js";
import { createVerifiedRecoveryWallet, verifyWalletRecovery } from "../wallet/onboarding.js";
import { terminalRecoveryPrompts } from "../wallet/terminal-prompts.js";
import { assertMainnetLaunchAllowed } from "../config/mainnet-readiness.js";
import { BitcoinCoreClient } from "../wallet/bitcoin-core.js";
import { bitcoinNetwork, type BitcoinTestNetwork } from "../wallet/bitcoin.js";
import { EthereumNodeClient, ethereumChainId, type EthereumTestNetwork } from "../wallet/ethereum.js";

const DEFAULT_FEE = "0.0001"; // JGC

const HELP = `jgc-wallet — command-line wallet for the JGC ledger

KEYSTORE (standalone)
  setup                       create a wallet after verifying its 24-word backup
  restore [--accounts <n>]     restore recovery accounts into a NEW keystore
  verify-backup               check recovery words against every wallet account
  new <label>                 add an account to an existing wallet
  import <label> <priv> <pub>  import a matching ML-DSA keypair (legacy wallets only)
  address <label>             print a key's address
  list                        list labels + addresses
  export <label>              print a private key (handle with care)

CHAIN (need --datadir <block-store>)
  balance <label>             spendable balance
  utxos   <label>             list spendable outputs
  send    <label> <toAddr> <amount> [--fee <amt>] [--broadcast ws://host:port]

NATIVE BITCOIN (regtest/signet only; recovery wallet required)
  btc-address                 show native receive/change addresses
  btc-balance                 scan confirmed, spendable native Bitcoin outputs
  btc-send <toAddr> <satoshis> --fee-sats <satoshis>
  --btc-network <name>         regtest or signet (required)
  --btc-account <index>        BIP84 account, default 0; keep with your backup
  --btc-rpc <url>              local Bitcoin Core RPC, e.g. http://127.0.0.1:18443
  --btc-cookie <path>          Bitcoin Core authentication cookie file
  BTC sends require a private terminal and explicit confirmation before relay.

NATIVE ETHEREUM (anvil/sepolia only; recovery wallet required)
  eth-address                 show the native Ethereum account address
  eth-balance                 read the native ETH balance in wei
  eth-send <toAddr> <wei> --max-fee-gwei <integer> --tip-gwei <integer>
  eth-receipt <hash>           inspect transaction inclusion/status
  --eth-network <name>         anvil or sepolia (required)
  --eth-account <index>        standard account index, default 0
  --eth-rpc <url>              local execution-node RPC
  Native ETH only; no tokens, approvals, contracts, Base or other L2s yet.

OPTIONS
  --keystore <path>   keystore file (or $JGC_KEYSTORE, default ./wallet.keystore.json)
  --pass <phrase>     legacy option; prefer hidden prompt (or $JGC_WALLET_PASS)
  --datadir <dir>     block store directory (chain commands)
  --network <name>    testnet (default) or mainnet

Run via:  npm run wallet -- <command> [...]`;

interface Args { cmd: string; pos: string[]; flags: Record<string, string>; }

function parseArgs(argv: string[]): Args {
  const pos: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) { flags[a.slice(2)] = argv[++i] ?? ""; }
    else pos.push(a);
  }
  return { cmd: pos[0] ?? "help", pos: pos.slice(1), flags };
}

function keystorePath(f: Args): string {
  return f.flags.keystore ?? process.env.JGC_KEYSTORE ?? "./wallet.keystore.json";
}
function passphrase(f: Args): string {
  const p = f.flags.pass ?? process.env.JGC_WALLET_PASS;
  if (!p) throw new Error("passphrase required (--pass <phrase> or $JGC_WALLET_PASS)");
  return p;
}

function currencySymbol(f: Args): string {
  return networkByName(f.flags.network ?? "testnet").currencySymbol;
}

function loadWallet(f: Args, mustExist: boolean): { wallet: Wallet; path: string } {
  const path = keystorePath(f);
  if (!existsSync(path)) {
    if (mustExist) throw new Error(`keystore not found: ${path}`);
    return { wallet: Wallet.create(), path };
  }
  const file = JSON.parse(readFileSync(path, "utf8")) as KeystoreFile;
  const wallet = Wallet.fromKeystore(file, passphrase(f));
  if (wallet.recoveryNetwork() && wallet.recoveryNetwork() !== networkByName(f.flags.network ?? "testnet").chainId) throw new Error("Wallet belongs to another network");
  return { wallet, path };
}

function saveWallet(wallet: Wallet, path: string, pass: string): void {
  atomicWriteFile(path, `${path}.tmp`, JSON.stringify(wallet.toKeystore(pass), null, 2) + "\n");
}

function bootNode(f: Args): JGCNode {
  const datadir = f.flags.datadir;
  if (!datadir) throw new Error("--datadir <dir> required for chain commands");
  const network = networkByName(f.flags.network ?? "testnet");
  const cfg: NodeConfig = {
    listenPort: 0, rpcPort: 0, networkMagic: network.networkMagic, maxPeers: 8,
    enableBroker: false, junctionGeneratorMode: false, dataDir: datadir,
    chainId: network.chainId,
    consensusVersion: network.consensusVersion,
    proofMode: network.proofMode,
    requireNetworkIdentity: true,
  };
  return new JGCNode(cfg, createNetworkGenesis(network)); // constructor replays the store
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

async function run(f: Args): Promise<number> {
  if (f.flags.network === "mainnet") assertMainnetLaunchAllowed();
  if (["new", "import", "address", "list", "export", "balance", "utxos", "send", "verify-backup", "btc-address", "btc-balance", "btc-send", "eth-address", "eth-balance", "eth-send"].includes(f.cmd) &&
      !f.flags.pass && !process.env.JGC_WALLET_PASS) {
    f.flags.pass = await terminalRecoveryPrompts().secret("Wallet encryption password (input hidden): ");
  }
  switch (f.cmd) {
    case "eth-receipt": {
      const network = f.flags["eth-network"] as EthereumTestNetwork;
      const rpc = new EthereumNodeClient(f.flags["eth-rpc"], network);
      const receipt = await rpc.receipt(f.pos[0]);
      console.log(receipt ? JSON.stringify(receipt, null, 2) : "Not currently included. Pending, unknown or reorganized; this is not proof of failure.");
      return 0;
    }
    case "eth-address":
    case "eth-balance":
    case "eth-send": {
      const network = f.flags["eth-network"] as EthereumTestNetwork;
      ethereumChainId(network);
      const { wallet } = loadWallet(f, true);
      const ethereum = wallet.ethereum(network, Number(f.flags["eth-account"] ?? "0"));
      try {
        console.log(`Ethereum ${network} — test ETH only\nChain ID: ${ethereumChainId(network)}\nDerivation: ${ethereum.derivationPath}\nAddress: ${ethereum.address}`);
        if (f.cmd === "eth-address") return 0;
        if (!f.flags["eth-rpc"]) throw new Error("--eth-rpc is required");
        const rpc = new EthereumNodeClient(f.flags["eth-rpc"], network);
        console.log(`Native ETH balance: ${await rpc.balance(ethereum.address)} wei`);
        if (f.cmd === "eth-balance") return 0;
        const [to, amount] = f.pos;
        const maxFee = f.flags["max-fee-gwei"], tip = f.flags["tip-gwei"];
        if (!to || !amount || !/^[0-9]{1,78}$/.test(amount) || !maxFee || !/^[0-9]{1,3}$/.test(maxFee) || !tip || !/^[0-9]{1,3}$/.test(tip)) throw new Error("eth-send requires destination, integer wei, --max-fee-gwei and --tip-gwei");
        const transfer = await rpc.prepare(ethereum, to, BigInt(amount), BigInt(maxFee) * 1_000_000_000n, BigInt(tip) * 1_000_000_000n);
        console.log(`Send ${transfer.valueWei} wei to ${transfer.to}\nMaximum execution fee: ${transfer.maxExecutionFeeWei} wei\nNonce: ${transfer.nonce}\nTransaction: ${transfer.hash}`);
        if (await terminalRecoveryPrompts().acknowledge(`Type SEND ${network} to broadcast this transaction: `) !== `SEND ${network}`) throw new Error("Ethereum send cancelled; nothing broadcast");
        console.log(`Submitted to Ethereum node: ${await rpc.broadcast(transfer)}\nUse eth-receipt to check inclusion; submission does not mean finality.`);
        return 0;
      } finally { ethereum.lock(); }
    }
    case "btc-address":
    case "btc-balance":
    case "btc-send": {
      const network = f.flags["btc-network"] as BitcoinTestNetwork;
      bitcoinNetwork(network);
      const { wallet } = loadWallet(f, true);
      const bitcoin = wallet.bitcoin(network, Number(f.flags["btc-account"] ?? "0"));
      try {
        console.log(`Bitcoin ${network} — test coins only\nDerivation: ${bitcoin.derivationPath}\nReceive: ${bitcoin.address()}\nChange: ${bitcoin.changeAddress()}`);
        if (f.cmd === "btc-address") return 0;
        if (!f.flags["btc-rpc"] || !f.flags["btc-cookie"]) throw new Error("--btc-rpc and --btc-cookie are required");
        const rpc = new BitcoinCoreClient(f.flags["btc-rpc"], readFileSync(f.flags["btc-cookie"], "utf8"), network);
        const { inputs, balanceSats } = await rpc.scan(bitcoin);
        console.log(`Confirmed spendable balance: ${balanceSats} satoshis`);
        if (f.cmd === "btc-balance") return 0;
        const [toAddress, amount] = f.pos;
        const fee = f.flags["fee-sats"];
        if (!toAddress || !amount || !/^[0-9]{1,16}$/.test(amount) || !fee || !/^[0-9]{1,6}$/.test(fee)) throw new Error("btc-send requires destination, integer satoshis and --fee-sats");
        const spend = bitcoin.buildSpend({ toAddress, amountSats: BigInt(amount), feeSats: BigInt(fee), inputs });
        console.log(`Send ${spend.amountSats} satoshis to ${spend.toAddress}\nFee: ${spend.feeSats} satoshis (${spend.virtualBytes} vB)\nChange: ${spend.changeSats} satoshis to ${spend.changeAddress}\nTransaction: ${spend.txid}`);
        const io = terminalRecoveryPrompts();
        if (await io.acknowledge(`Type SEND ${network} to broadcast this transaction: `) !== `SEND ${network}`) throw new Error("Bitcoin send cancelled; nothing broadcast");
        console.log(`Submitted to Bitcoin Core: ${await rpc.broadcast(spend)}\nWait for confirmations; node acceptance is not final settlement.`);
        return 0;
      } finally { bitcoin.destroy(); }
    }
    case "setup":
    case "restore": {
      const path = keystorePath(f);
      if (existsSync(path)) throw new Error("Destination exists; use a NEW keystore path. Existing keys will not be overwritten.");
      const io = terminalRecoveryPrompts();
      const network = networkByName(f.flags.network ?? "testnet");
      io.show(`Network: ${network.chainId} (${network.currencySymbol}). JGTC is valueless testnet currency. Native BTC/ETH use separate test-network commands and addresses; do not deposit real funds.`);
      const wallet = f.cmd === "setup"
        ? await createVerifiedRecoveryWallet(io, network.chainId)
        : Wallet.fromRecoveryPhrase(await io.secret("Enter your 24 recovery words (input hidden): "), network.chainId, Number(f.flags.accounts ?? "1"));
      const pass = await io.secret("Choose a local encryption password (at least 12 characters; input hidden): ");
      if (pass.length < 12) throw new Error("Use a password of at least 12 characters");
      if (pass !== await io.secret("Repeat the encryption password: ")) throw new Error("Passwords do not match; no wallet saved");
      const file = wallet.toKeystore(pass);
      const checked = Wallet.fromKeystore(file, pass);
      for (const label of wallet.labels()) {
        if (checked.publicKey(label) !== wallet.publicKey(label)) throw new Error("Encrypted wallet recovery check failed");
      }
      const fd = openSync(path, "wx", 0o600);
      try { writeFileSync(fd, JSON.stringify(file, null, 2) + "\n"); fsyncSync(fd); }
      finally { closeSync(fd); }
      syncDirectory(dirname(path));
      console.log(`Wallet saved: ${path}\nRecovery scheme: jgc-ml-dsa65-bip39-hkdf-v1\nNetwork: ${network.chainId}\nAccounts: ${wallet.labels().length}`);
      for (const label of wallet.labels()) console.log(`${label}: ${wallet.address(label)}`);
      console.log("Keep the recovery scheme, network and account count with your backup. Your local password is not an extra recovery word.");
      return 0;
    }
    case "verify-backup": {
      const io = terminalRecoveryPrompts();
      const { wallet } = loadWallet(f, true);
      verifyWalletRecovery(wallet, await io.secret("Enter your 24 recovery words (input hidden): "));
      console.log("Recovery verified for every account in this wallet.");
      return 0;
    }
    case "new": {
      const label = f.pos[0]; if (!label) throw new Error("usage: new <label>");
      const pass = passphrase(f);
      const { wallet, path } = loadWallet(f, true);
      const address = wallet.generate(label);
      saveWallet(wallet, path, pass);
      console.log(`created "${label}"\n  address: ${address}\n  keystore: ${path}`);
      return 0;
    }
    case "import": {
      const [label, priv, pub] = f.pos; if (!label || !priv || !pub) throw new Error("usage: import <label> <privhex> <pubhex>  (ML-DSA needs both key halves)");
      const pass = passphrase(f);
      const { wallet, path } = loadWallet(f, false);
      const address = wallet.importKey(label, priv, pub);
      saveWallet(wallet, path, pass);
      console.log(`imported "${label}"\n  address: ${address}`);
      return 0;
    }
    case "address": {
      const label = f.pos[0]; if (!label) throw new Error("usage: address <label>");
      const { wallet } = loadWallet(f, true);
      console.log(wallet.address(label));
      return 0;
    }
    case "list": {
      const { wallet } = loadWallet(f, true);
      const labels = wallet.labels();
      if (labels.length === 0) { console.log("(no keys)"); return 0; }
      for (const l of labels) console.log(`${l.padEnd(16)} ${wallet.address(l)}`);
      return 0;
    }
    case "export": {
      const label = f.pos[0]; if (!label) throw new Error("usage: export <label>");
      const { wallet } = loadWallet(f, true);
      console.error("WARNING: anyone with this private key can spend the funds.");
      console.log(wallet.privateKey(label));
      return 0;
    }
    case "balance": {
      const label = f.pos[0]; if (!label) throw new Error("usage: balance <label> --datadir <dir>");
      const { wallet } = loadWallet(f, true);
      const node = bootNode(f);
      const height = node.getChainInfo().tipHeight + 1;
      console.log(`${formatJGC(wallet.balance(label, node.getUTXOSet(), height))} ${currencySymbol(f)}`);
      return 0;
    }
    case "utxos": {
      const label = f.pos[0]; if (!label) throw new Error("usage: utxos <label> --datadir <dir>");
      const { wallet } = loadWallet(f, true);
      const node = bootNode(f);
      const height = node.getChainInfo().tipHeight + 1;
      const us = wallet.listUnspent(label, node.getUTXOSet(), height);
      if (us.length === 0) { console.log("(no spendable outputs)"); return 0; }
      const symbol = currencySymbol(f);
      for (const u of us) console.log(`${u.txid}:${u.vout}  ${formatJGC(u.value).padStart(20)} ${symbol}${u.isCoinbase ? "  (coinbase)" : ""}`);
      console.log(`total: ${formatJGC(us.reduce((s, u) => s + u.value, 0n))} ${symbol} across ${us.length} output(s)`);
      return 0;
    }
    case "send": {
      const [label, toAddress, amountStr] = f.pos;
      if (!label || !toAddress || !amountStr) throw new Error("usage: send <label> <toAddr> <amount> --datadir <dir> [--fee <amt>] [--broadcast ws://host:port]");
      const { wallet } = loadWallet(f, true);
      const node = bootNode(f);
      const height = node.getChainInfo().tipHeight + 1;
      const { tx, txid, fee, change } = wallet.buildSpend({
        fromLabel: label, toAddress,
        amount: parseJGC(amountStr),
        fee: parseJGC(f.flags.fee ?? DEFAULT_FEE),
        utxo: node.getUTXOSet(), currentHeight: height,
      });
      console.log(`built spend ${txid}`);
      const symbol = currencySymbol(f);
      console.log(`  to:     ${toAddress}  ${amountStr} ${symbol}`);
      console.log(`  fee:    ${formatJGC(fee)} ${symbol}    change: ${formatJGC(change)} ${symbol}`);
      console.log(`  inputs: ${tx.inputs.length}`);

      if (f.flags.broadcast) {
        const links = connectToPeers(node, [f.flags.broadcast], { retryMs: 500 });
        await sleep(700);
        const res = await node.broadcastTransaction(tx);
        await sleep(300);
        links.close();
        if (!res.ok) { console.error(`broadcast rejected: ${res.error}`); return 1; }
        console.log(`  broadcast to ${f.flags.broadcast} ✓`);
      } else {
        console.log(`  raw: ${serializeTransaction(tx).toString("hex")}`);
        console.log("  (not broadcast — pass --broadcast ws://host:port to relay)");
      }
      return 0;
    }
    case "help":
    default:
      console.log(HELP);
      return f.cmd === "help" ? 0 : 1;
  }
}

run(parseArgs(process.argv.slice(2)))
  .then(code => process.exit(code))
  .catch(err => { console.error(`error: ${err instanceof Error ? err.message : String(err)}`); process.exit(1); });
