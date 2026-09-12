/** Native ETH round trip on an isolated Anvil chain. No public-network calls. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EthereumNodeClient } from "../dist/wallet/ethereum.js";
import { Wallet } from "../dist/wallet/wallet.js";

const binary = process.env.ANVIL_BIN;
if (!binary || !existsSync(binary)) throw new Error("Set ANVIL_BIN to a verified Anvil executable");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scratch = join(root, ".tmp", "ethereum-local");
mkdirSync(scratch, { recursive: true });
const evidenceDir = mkdtempSync(join(scratch, "run-"));
const server = createServer();
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const child = spawn(binary, ["--host", "127.0.0.1", "--port", String(port), "--chain-id", "31337", "--silent"], { windowsHide: true, stdio: "ignore" });
let launchError;
child.on("error", error => { launchError = error; });
const rpc = new EthereumNodeClient(`http://127.0.0.1:${port}`, "anvil");
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (launchError) throw launchError;
    if (child.exitCode !== null) throw new Error("Anvil exited before startup");
    try { await rpc.assertNetwork(); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert(ready, "Anvil did not become ready");
  const [faucet] = await rpc.call("eth_accounts");
  const phrase = "abandon ".repeat(23) + "art";
  const wallet = Wallet.fromRecoveryPhrase(phrase, "jgtc-testnet-v2").ethereum("anvil");
  const fundingHash = await rpc.call("eth_sendTransaction", [{ from: faucet, to: wallet.address, value: "0xde0b6b3a7640000" }]);
  await rpc.call("evm_mine");
  assert.equal(await rpc.balance(wallet.address), 1_000_000_000_000_000_000n);
  const recovered = Wallet.fromRecoveryPhrase(phrase, "jgtc-testnet-v2").ethereum("anvil");
  assert.equal(recovered.address, wallet.address);
  const snapshot = await rpc.call("evm_snapshot");
  const transfer = await rpc.prepare(recovered, faucet, 400_000_000_000_000_000n, 20_000_000_000n, 1_000_000_000n);
  const hash = await rpc.broadcast(transfer);
  await rpc.call("evm_mine");
  const receipt = await rpc.receipt(hash);
  assert.equal(receipt.status, "0x1");
  const actualFee = BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice);
  const expectedBalance = 600_000_000_000_000_000n - actualFee;
  assert.equal(await rpc.balance(recovered.address), expectedBalance);
  await assert.rejects(rpc.broadcast(transfer), /nonce changed/);
  await assert.rejects(new EthereumNodeClient(`http://127.0.0.1:${port}`, "sepolia").assertNetwork(), /chain ID/);
  await rpc.call("evm_revert", [snapshot]);
  assert.equal(await rpc.receipt(hash), null);
  assert.equal(await rpc.balance(recovered.address), 1_000_000_000_000_000_000n);
  await rpc.broadcast(transfer);
  await rpc.call("evm_mine");
  assert.equal((await rpc.receipt(hash)).status, "0x1");
  const report = { network: "anvil", chainId: 31337, client: await rpc.call("web3_clientVersion"), fundingHash, returnHash: hash,
    receivedWei: "1000000000000000000", returnedWei: "400000000000000000", actualFeeWei: actualFee.toString(),
    recoveredFromWords: true, receiptSucceeded: true, wrongChainRejected: true, staleNonceRejected: true, revertedStateObserved: true };
  writeFileSync(join(evidenceDir, "evidence.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  console.log(`Evidence: ${join(evidenceDir, "evidence.json")}`);
  wallet.lock(); recovered.lock();
} finally {
  child.kill();
  if (!launchError && child.exitCode === null && child.signalCode === null) {
    await Promise.race([new Promise(resolve => child.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
}
