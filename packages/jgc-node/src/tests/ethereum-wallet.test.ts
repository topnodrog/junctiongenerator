import { Transaction } from "ethers";
import { EthereumTestWallet, EthereumNodeClient } from "../wallet/ethereum.js";
import { Wallet } from "../wallet/wallet.js";

const PHRASE = `${"abandon ".repeat(23)}art`;
const TO = "0x1111111111111111111111111111111111111111";
const request = { to: TO, valueWei: 100_000n, nonce: 0, gasLimit: 21_000n, maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n };

describe("native Ethereum test wallet", () => {
  test("signs a chain-bound native transfer that recovers to the correct sender", async () => {
    const wallet = Wallet.fromRecoveryPhrase(PHRASE, "jgtc-testnet-v2").ethereum("anvil");
    const signed = await wallet.signTransfer(request);
    const tx = Transaction.from(signed.rawTransaction);
    expect(tx.from).toBe(wallet.address);
    expect(tx.chainId).toBe(31337n);
    expect(tx.type).toBe(2);
    expect(tx.to).toBe(TO);
    expect(tx.value).toBe(100_000n);
    expect(tx.data).toBe("0x");
    expect(tx.nonce).toBe(0);
    expect(signed.maxExecutionFeeWei).toBe(42_000_000_000_000n);
    expect(new EthereumTestWallet(PHRASE, "anvil").address).toBe(wallet.address);
    expect(new EthereumTestWallet(PHRASE, "anvil", 1).address).not.toBe(wallet.address);
    const sepolia = await new EthereumTestWallet(PHRASE, "sepolia").signTransfer(request);
    expect(Transaction.from(sepolia.rawTransaction).chainId).toBe(11155111n);
    expect(sepolia.hash).not.toBe(signed.hash);
  });

  test("rejects unsupported networks, malformed destination, invalid amounts and unsafe fee bounds", async () => {
    expect(() => new EthereumTestWallet(PHRASE, "mainnet" as "anvil")).toThrow("Only");
    const wallet = new EthereumTestWallet(PHRASE, "anvil");
    for (const bad of [
      { to: "1QGC" + "a".repeat(40) }, { to: "0x" + "0".repeat(40) },
      { valueWei: 0n }, { valueWei: -1n }, { nonce: -1 }, { nonce: NaN },
      { gasLimit: 21_001n }, { maxFeePerGas: 100_000_000_001n }, { maxPriorityFeePerGas: 3_000_000_000n },
    ]) await expect(wallet.signTransfer({ ...request, ...bad })).rejects.toThrow();
    wallet.lock();
    await expect(wallet.signTransfer(request)).rejects.toThrow("locked");
  });

  test("rejects remote and credential-bearing RPC URLs", () => {
    for (const url of ["https://example.com", "http://localhost", "http://user:password@127.0.0.1:8545"]) {
      expect(() => new EthereumNodeClient(url, "anvil")).toThrow("loopback");
    }
  });
});
