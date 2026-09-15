import { HDNodeWallet, Transaction, getAddress, keccak256 } from "ethers";
import { normalizeRecoveryPhrase } from "./recovery.js";

export type EthereumTestNetwork = "anvil" | "sepolia";
export function ethereumChainId(network: EthereumTestNetwork): bigint {
  if (network === "anvil") return 31337n;
  if (network === "sepolia") return 11155111n;
  throw new Error("Only Ethereum anvil and sepolia are enabled");
}
export interface EthereumTransfer {
  to: string; valueWei: bigint; nonce: number; gasLimit: bigint;
  maxFeePerGas: bigint; maxPriorityFeePerGas: bigint;
}
export interface SignedEthereumTransfer {
  network: EthereumTestNetwork; chainId: bigint; from: string; to: string;
  valueWei: bigint; maxExecutionFeeWei: bigint; nonce: number; rawTransaction: string; hash: string;
}

export class EthereumTestWallet {
  private signer?: HDNodeWallet;
  readonly derivationPath: string;
  readonly address: string;
  constructor(phrase: string, readonly network: EthereumTestNetwork, account = 0) {
    ethereumChainId(network);
    if (!Number.isSafeInteger(account) || account < 0 || account >= 100) throw new Error("Invalid Ethereum account index");
    this.derivationPath = `m/44'/60'/0'/0/${account}`;
    this.signer = HDNodeWallet.fromPhrase(normalizeRecoveryPhrase(phrase), "", this.derivationPath);
    this.address = this.signer.address;
  }
  lock(): void { this.signer = undefined; } // JS cannot guarantee erasure of immutable strings.

  async signTransfer(request: EthereumTransfer): Promise<SignedEthereumTransfer> {
    if (!this.signer) throw new Error("Ethereum wallet is locked");
    const chainId = ethereumChainId(this.network);
    const to = getAddress(request.to);
    if (to === "0x0000000000000000000000000000000000000000") throw new Error("Refusing the zero destination");
    if (typeof request.valueWei !== "bigint" || request.valueWei <= 0n || request.valueWei >= 2n ** 256n) throw new Error("Invalid Ethereum amount");
    if (!Number.isSafeInteger(request.nonce) || request.nonce < 0) throw new Error("Invalid Ethereum nonce");
    // This release signs only plain native transfers, never calldata, approvals,
    // contract creation, arbitrary typed data, or delegated authorizations.
    if (typeof request.gasLimit !== "bigint" || request.gasLimit !== 21_000n) throw new Error("Only 21000-gas native EOA transfers are supported");
    if (typeof request.maxFeePerGas !== "bigint" || typeof request.maxPriorityFeePerGas !== "bigint" ||
      request.maxFeePerGas <= 0n || request.maxFeePerGas > 100_000_000_000n || request.maxPriorityFeePerGas < 0n || request.maxPriorityFeePerGas > request.maxFeePerGas) throw new Error("Invalid Ethereum fee limits");
    const rawTransaction = await this.signer.signTransaction({ type: 2, chainId, to, value: request.valueWei,
      nonce: request.nonce, gasLimit: request.gasLimit, maxFeePerGas: request.maxFeePerGas,
      maxPriorityFeePerGas: request.maxPriorityFeePerGas, data: "0x", accessList: [] });
    const decoded = Transaction.from(rawTransaction);
    if (decoded.from !== this.address || decoded.chainId !== chainId || decoded.to !== to || decoded.value !== request.valueWei) throw new Error("Signed Ethereum transfer failed self-check");
    return { network: this.network, chainId, from: this.address, to, valueWei: request.valueWei,
      maxExecutionFeeWei: request.gasLimit * request.maxFeePerGas, nonce: request.nonce, rawTransaction, hash: keccak256(rawTransaction) };
  }
}

/** Local trusted execution-node connection. No third-party balance indexing. */
export class EthereumNodeClient {
  private readonly endpoint: string;
  constructor(endpoint: string, readonly network: EthereumTestNetwork) {
    ethereumChainId(network);
    const url = new URL(endpoint);
    if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Ethereum RPC must use an explicit loopback HTTP endpoint");
    this.endpoint = url.href;
  }
  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const response = await fetch(this.endpoint, { method: "POST", redirect: "error", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "jgc-wallet", method, params }), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Ethereum RPC HTTP ${response.status}`);
    const body = await response.json() as { result: T; error?: { code: number } };
    if (body.error) throw new Error(`Ethereum RPC ${method} failed (${body.error.code})`);
    return body.result;
  }
  async assertNetwork(): Promise<void> {
    if (BigInt(await this.call<string>("eth_chainId")) !== ethereumChainId(this.network)) throw new Error("Ethereum RPC chain ID mismatch");
    if (await this.call<false | object>("eth_syncing") !== false) throw new Error("Ethereum node is still syncing");
  }
  async balance(address: string): Promise<bigint> {
    await this.assertNetwork();
    return BigInt(await this.call<string>("eth_getBalance", [getAddress(address), "latest"]));
  }
  async prepare(wallet: EthereumTestWallet, to: string, valueWei: bigint, maxFeePerGas: bigint, maxPriorityFeePerGas: bigint): Promise<SignedEthereumTransfer> {
    if (wallet.network !== this.network) throw new Error("Ethereum wallet/network mismatch");
    await this.assertNetwork();
    const destination = getAddress(to);
    if (await this.call<string>("eth_getCode", [destination, "pending"]) !== "0x") throw new Error("Contract destinations are not supported by this native-transfer prototype");
    const nonce = Number(BigInt(await this.call<string>("eth_getTransactionCount", [wallet.address, "pending"])));
    const pendingBalance = BigInt(await this.call<string>("eth_getBalance", [wallet.address, "pending"]));
    const signed = await wallet.signTransfer({ to: destination, valueWei, nonce, gasLimit: 21_000n, maxFeePerGas, maxPriorityFeePerGas });
    if (valueWei + signed.maxExecutionFeeWei > pendingBalance) throw new Error("Insufficient Ethereum funds including maximum fee");
    return signed;
  }
  async broadcast(transfer: SignedEthereumTransfer): Promise<string> {
    if (transfer.network !== this.network || transfer.chainId !== ethereumChainId(this.network)) throw new Error("Ethereum transfer/network mismatch");
    await this.assertNetwork();
    const tx = Transaction.from(transfer.rawTransaction);
    if (tx.chainId !== ethereumChainId(this.network) || tx.hash !== transfer.hash || tx.from !== transfer.from || tx.to !== transfer.to || tx.value !== transfer.valueWei || tx.nonce !== transfer.nonce || tx.data !== "0x" || tx.type !== 2 || tx.gasLimit !== 21_000n || tx.gasLimit * (tx.maxFeePerGas ?? 0n) !== transfer.maxExecutionFeeWei) throw new Error("Ethereum transfer review does not match signed bytes");
    // Recheck after user confirmation, since another pending spend or destination
    // deployment could have changed while the user was reading the preview.
    if (await this.call<string>("eth_getCode", [transfer.to, "pending"]) !== "0x") throw new Error("Ethereum destination changed; rebuild transfer");
    if (BigInt(await this.call<string>("eth_getTransactionCount", [transfer.from, "pending"])) !== BigInt(transfer.nonce)) throw new Error("Ethereum nonce changed; rebuild transfer");
    if (BigInt(await this.call<string>("eth_getBalance", [transfer.from, "pending"])) < transfer.valueWei + transfer.maxExecutionFeeWei) throw new Error("Ethereum balance changed; rebuild transfer");
    const hash = await this.call<string>("eth_sendRawTransaction", [transfer.rawTransaction]);
    if (hash.toLowerCase() !== transfer.hash.toLowerCase()) throw new Error("Unexpected Ethereum submission response; inspect expected transaction hash before retrying");
    return hash;
  }
  async receipt(hash: string): Promise<{ status: string; blockHash: string; blockNumber: string; gasUsed: string; effectiveGasPrice: string } | null> {
    await this.assertNetwork();
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Invalid Ethereum transaction hash");
    return this.call("eth_getTransactionReceipt", [hash]);
  }
}
