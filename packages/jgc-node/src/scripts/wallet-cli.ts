/**
 * @file src/scripts/wallet-cli.ts
 * @description `jgc-wallet` — a command-line wallet over the JGC ledger.
 *
 * Keystore commands operate on an encrypted file (standalone, no chain):
 *   new <label>            create a fresh key
 *   import <label> <priv>  import a 32-byte hex private key
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
 *           --pass <phrase>   (or $JGC_WALLET_PASS)   required for keystore access
 *           --datadir <dir>   block store for chain commands
 *           --network <name>  testnet (default) or mainnet
 *
 * Run:  npm run wallet -- <command> [...]      (after npm run build)
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import type { NodeConfig } from "../types/index.js";
import { JGCNode } from "../network/node.js";
import {
  createNetworkGenesis,
  networkByName,
  TESTNET_FAUCET_ADDRESS,
  testnetFaucetKeyPair,
} from "../config/networks.js";
import { serializeTransaction } from "../consensus/block.js";
import { connectToPeers } from "../network/transport.js";
import { Wallet, formatJGC, parseJGC, type KeystoreFile } from "../wallet/wallet.js";

const DEFAULT_FEE = "0.0001"; // JGC

const HELP = `jgc-wallet — command-line wallet for the JGC ledger

KEYSTORE (standalone)
  new <label>                 create a fresh key
  import <label> <privhex>    import a 32-byte hex private key
  address <label>             print a key's address
  list                        list labels + addresses
  export <label>              print a private key (handle with care)

CHAIN (need --datadir <block-store>)
  balance <label>             spendable balance
  utxos   <label>             list spendable outputs
  send    <label> <toAddr> <amount> [--fee <amt>] [--broadcast ws://host:port]
  faucet  <toAddr> <amount>   testnet-only funding [--broadcast ws://host:port]

OPTIONS
  --keystore <path>   keystore file (or $JGC_KEYSTORE, default ./wallet.keystore.json)
  --pass <phrase>     passphrase   (or $JGC_WALLET_PASS)
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

function loadWallet(f: Args, mustExist: boolean): { wallet: Wallet; path: string } {
  const path = keystorePath(f);
  if (!existsSync(path)) {
    if (mustExist) throw new Error(`keystore not found: ${path}`);
    return { wallet: Wallet.create(), path };
  }
  const file = JSON.parse(readFileSync(path, "utf8")) as KeystoreFile;
  return { wallet: Wallet.fromKeystore(file, passphrase(f)), path };
}

function saveWallet(wallet: Wallet, path: string, pass: string): void {
  writeFileSync(path, JSON.stringify(wallet.toKeystore(pass), null, 2));
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
  switch (f.cmd) {
    case "new": {
      const label = f.pos[0]; if (!label) throw new Error("usage: new <label>");
      const pass = passphrase(f);
      const { wallet, path } = loadWallet(f, false);
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
      console.log(`${formatJGC(wallet.balance(label, node.getUTXOSet(), height))} JGC`);
      return 0;
    }
    case "utxos": {
      const label = f.pos[0]; if (!label) throw new Error("usage: utxos <label> --datadir <dir>");
      const { wallet } = loadWallet(f, true);
      const node = bootNode(f);
      const height = node.getChainInfo().tipHeight + 1;
      const us = wallet.listUnspent(label, node.getUTXOSet(), height);
      if (us.length === 0) { console.log("(no spendable outputs)"); return 0; }
      for (const u of us) console.log(`${u.txid}:${u.vout}  ${formatJGC(u.value).padStart(20)} JGC${u.isCoinbase ? "  (coinbase)" : ""}`);
      console.log(`total: ${formatJGC(us.reduce((s, u) => s + u.value, 0n))} JGC across ${us.length} output(s)`);
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
      console.log(`  to:     ${toAddress}  ${amountStr} JGC`);
      console.log(`  fee:    ${formatJGC(fee)} JGC    change: ${formatJGC(change)} JGC`);
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
    case "faucet": {
      const [toAddress, amountStr] = f.pos;
      if (!toAddress || !amountStr) {
        throw new Error("usage: faucet <toAddr> <amount> --datadir <dir> [--broadcast ws://host:port]");
      }
      if ((f.flags.network ?? "testnet") !== "testnet") {
        throw new Error("the built-in faucet exists only on testnet");
      }
      const node = bootNode(f);
      const wallet = Wallet.create();
      const faucetKey = testnetFaucetKeyPair();
      wallet.importKey("testnet-faucet", faucetKey.privateKey, faucetKey.publicKey);
      const { tx, txid, fee } = wallet.buildSpend({
        fromLabel: "testnet-faucet",
        toAddress,
        amount: parseJGC(amountStr),
        fee: parseJGC(f.flags.fee ?? DEFAULT_FEE),
        utxo: node.getUTXOSet(),
        currentHeight: node.getChainInfo().tipHeight + 1,
      });
      console.log(`built testnet faucet spend ${txid}`);
      console.log(`  faucet: ${TESTNET_FAUCET_ADDRESS}`);
      console.log(`  to:     ${toAddress}  ${amountStr} JGC`);
      console.log(`  fee:    ${formatJGC(fee)} JGC`);

      if (f.flags.broadcast) {
        const links = connectToPeers(node, [f.flags.broadcast], { retryMs: 500 });
        await sleep(700);
        const result = await node.broadcastTransaction(tx);
        await sleep(300);
        links.close();
        if (!result.ok) { console.error(`broadcast rejected: ${result.error}`); return 1; }
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
