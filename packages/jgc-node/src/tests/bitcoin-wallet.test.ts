import * as btc from "@scure/btc-signer";
import { BitcoinTestWallet } from "../wallet/bitcoin.js";
import { BitcoinCoreClient } from "../wallet/bitcoin-core.js";
import { Wallet } from "../wallet/wallet.js";

const PHRASE = `${"abandon ".repeat(23)}art`;
function fixture() {
  const wallet = new BitcoinTestWallet(PHRASE, "regtest");
  const recipient = new BitcoinTestWallet(PHRASE, "regtest", 1);
  const previous = new btc.Transaction();
  previous.addInput({ txid: "ab".repeat(32), index: 0 });
  previous.addOutputAddress(wallet.address(), 100_000n, { ...btc.TEST_NETWORK, bech32: "bcrt" });
  const input = { txid: previous.id, vout: 0, rawTransaction: Buffer.from(previous.unsignedTx).toString("hex") };
  return { wallet, recipient, input, request: { inputs: [input], toAddress: recipient.address(), amountSats: 90_000n, feeSats: 1_000n } };
}

describe("native Bitcoin test wallet", () => {
  test("restores native Bitcoin accounts from the JGC wallet without reusing JGC keys", () => {
    const wallet = Wallet.fromRecoveryPhrase(PHRASE, "jgtc-testnet-v2");
    const bitcoin = wallet.bitcoin("regtest");
    expect(bitcoin.address()).toMatch(/^bcrt1q/);
    expect(bitcoin.changeAddress()).not.toBe(bitcoin.address());
    expect(Wallet.fromKeystore(wallet.toKeystore("password"), "password").bitcoin("regtest").address()).toBe(bitcoin.address());
    expect(wallet.bitcoin("signet").address()).toMatch(/^tb1q/);
    expect(wallet.bitcoin("regtest", 1).address()).not.toBe(bitcoin.address());
    expect(() => wallet.bitcoin("mainnet" as "regtest")).toThrow("Only");
  });

  test("signs exact destination, change and fee and exports a parseable PSBT", () => {
    const { wallet, request } = fixture();
    const spend = wallet.buildSpend(request);
    expect(spend.feeSats).toBe(1000n);
    expect(spend.changeSats).toBe(9000n);
    const tx = btc.Transaction.fromRaw(Buffer.from(spend.rawTransaction, "hex"));
    expect(tx.id).toBe(spend.txid);
    expect(tx.getOutput(0).amount).toBe(90_000n);
    expect(tx.getOutputAddress(1, { ...btc.TEST_NETWORK, bech32: "bcrt" })).toBe(wallet.changeAddress());
    const psbt = btc.Transaction.fromPSBT(Buffer.from(spend.psbt, "base64"));
    psbt.finalize();
    expect(psbt.id).toBe(spend.txid);
  });

  test("rejects mainnet/wrong-network destinations, duplicate and foreign inputs", () => {
    const { wallet, recipient, input, request } = fixture();
    expect(() => wallet.buildSpend({ ...request, toAddress: new BitcoinTestWallet(PHRASE, "signet").address() })).toThrow();
    expect(() => wallet.buildSpend({ ...request, inputs: [input, input] })).toThrow("Duplicate");
    expect(() => recipient.buildSpend(request)).toThrow("does not belong");
  });

  test("binds input amounts to the complete funding transaction", () => {
    const { wallet, input, request } = fixture();
    expect(() => wallet.buildSpend({ ...request, inputs: [{ ...input, txid: "ff".repeat(32) }] })).toThrow("ID mismatch");
    expect(() => wallet.buildSpend({ ...request, inputs: [{ ...input, vout: 999 }] })).toThrow();
    expect(() => wallet.buildSpend({ ...request, inputs: [{ ...input, rawTransaction: "00" }] })).toThrow();
  });

  test("rejects insufficient funds, dust, excessive fees and a destroyed signing key", () => {
    const { wallet, request } = fixture();
    expect(() => wallet.buildSpend({ ...request, amountSats: 100_000n })).toThrow("Insufficient");
    expect(() => wallet.buildSpend({ ...request, amountSats: 100n })).toThrow("dust");
    expect(() => wallet.buildSpend({ ...request, amountSats: 98_900n })).toThrow("dust");
    expect(() => wallet.buildSpend({ ...request, feeSats: 100_001n })).toThrow("fee");
    expect(() => wallet.buildSpend({ ...request, amountSats: 1000n, feeSats: 90_000n })).toThrow("sat/vB");
    wallet.destroy();
    expect(() => wallet.buildSpend(request)).toThrow("locked");
  });

  test("never sends node credentials to a remote or ambiguous RPC URL", () => {
    for (const endpoint of ["http://example.com", "http://localhost", "http://127.0.0.1.evil.test", "http://user:pass@127.0.0.1", "http://127.0.0.1/?proxy=evil", "https://127.0.0.1"]) {
      expect(() => new BitcoinCoreClient(endpoint, "test:cookie", "regtest")).toThrow("loopback");
    }
    expect(() => new BitcoinCoreClient("http://127.0.0.1:18443", "test:cookie", "regtest")).not.toThrow();
  });
});
