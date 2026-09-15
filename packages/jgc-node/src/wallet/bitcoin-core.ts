import { Transaction } from "@scure/btc-signer";
import { bitcoinNetwork, type BitcoinPreviousOutput, type BitcoinSignedSpend, type BitcoinTestNetwork, type BitcoinTestWallet } from "./bitcoin.js";

/** Trusted, local full-node transport. Cookie authentication never leaves loopback. */
export class BitcoinCoreClient {
  private readonly endpoint: string;
  constructor(endpoint: string, private readonly cookie: string, readonly network: BitcoinTestNetwork) {
    bitcoinNetwork(network);
    const url = new URL(endpoint);
    if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new Error("Bitcoin RPC must be an explicit loopback HTTP endpoint without URL credentials");
    }
    if (!cookie.trim() || /[\r\n]/.test(cookie.trim())) throw new Error("Invalid Bitcoin RPC cookie");
    this.endpoint = url.href;
  }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const response = await fetch(this.endpoint, { method: "POST", redirect: "error",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(this.cookie.trim()).toString("base64")}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: "jgc-wallet", method, params }), signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Bitcoin RPC HTTP ${response.status}`);
    const data = await response.json() as { result: T; error?: { code: number } };
    if (data.error) throw new Error(`Bitcoin RPC ${method} failed (${data.error.code})`);
    return data.result;
  }

  async assertNetwork(): Promise<void> {
    const info = await this.call<{ chain: string; initialblockdownload: boolean }>("getblockchaininfo");
    if (info.chain !== this.network) throw new Error("Bitcoin RPC network mismatch");
    if (this.network !== "regtest" && info.initialblockdownload) throw new Error("Bitcoin node is still syncing");
  }

  async scan(wallet: BitcoinTestWallet): Promise<{ inputs: BitcoinPreviousOutput[]; balanceSats: bigint }> {
    if (wallet.network !== this.network) throw new Error("Bitcoin wallet/network mismatch");
    await this.assertNetwork();
    const scan = await this.call<{ success: boolean; unspents: { txid: string; vout: number; height: number }[] }>("scantxoutset", ["start", [`addr(${wallet.address()})`, `addr(${wallet.changeAddress()})`]]);
    if (!scan.success || !Array.isArray(scan.unspents) || scan.unspents.length > 100) throw new Error("Bitcoin scan failed or exceeds the prototype's 100-input limit");
    const inputs: BitcoinPreviousOutput[] = [];
    let balanceSats = 0n;
    for (const coin of scan.unspents) {
      const current = await this.call<{ confirmations: number; coinbase: boolean } | null>("gettxout", [coin.txid, coin.vout, true]);
      if (!current || current.confirmations < 1 || (current.coinbase && current.confirmations < 101)) continue;
      const blockhash = await this.call<string>("getblockhash", [coin.height]);
      const rawTransaction = await this.call<string>("getrawtransaction", [coin.txid, false, blockhash]);
      const tx = Transaction.fromRaw(Buffer.from(rawTransaction, "hex"));
      if (tx.id !== coin.txid) throw new Error("Bitcoin RPC returned the wrong funding transaction");
      const amount = tx.getOutput(coin.vout).amount;
      if (amount === undefined) throw new Error("Bitcoin funding output has no amount");
      // Value is decoded from the raw transaction as bigint; RPC float amounts
      // are deliberately never used for balances or signing.
      balanceSats += amount;
      inputs.push({ txid: coin.txid, vout: coin.vout, rawTransaction });
    }
    return { inputs, balanceSats };
  }

  async broadcast(spend: BitcoinSignedSpend): Promise<string> {
    if (spend.network !== this.network) throw new Error("Bitcoin transaction/network mismatch");
    await this.assertNetwork();
    const tx = Transaction.fromRaw(Buffer.from(spend.rawTransaction, "hex"));
    if (tx.id !== spend.txid) throw new Error("Signed Bitcoin transaction ID mismatch");
    const verdict = await this.call<{ allowed: boolean; txid: string }[]>("testmempoolaccept", [[spend.rawTransaction]]);
    if (verdict.length !== 1 || !verdict[0].allowed || verdict[0].txid !== spend.txid) throw new Error("Bitcoin node rejected the signed transaction");
    const txid = await this.call<string>("sendrawtransaction", [spend.rawTransaction]);
    if (txid !== spend.txid) throw new Error("Unexpected Bitcoin broadcast response; check the expected transaction ID before retrying");
    return txid;
  }
}
