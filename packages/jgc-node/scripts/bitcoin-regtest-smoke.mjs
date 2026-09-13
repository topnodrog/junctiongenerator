/** Isolated Bitcoin Core integration. All funds and words here are public test data. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BitcoinCoreClient } from "../dist/wallet/bitcoin-core.js";
import { Wallet } from "../dist/wallet/wallet.js";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const binary = process.env.BITCOIND_BIN;
if (!binary || !existsSync(binary)) throw new Error("Set BITCOIND_BIN to a verified Bitcoin Core executable");
const scratch = join(packageRoot, ".tmp", "bitcoin-regtest");
mkdirSync(scratch, { recursive: true });
const dataDir = mkdtempSync(join(scratch, "run-"));
const server = createServer();
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const child = spawn(binary, ["-regtest", `-datadir=${dataDir}`, "-server=1", "-listen=0", "-connect=0", "-discover=0", "-dnsseed=0",
  "-rpcbind=127.0.0.1", "-rpcallowip=127.0.0.1", `-rpcport=${port}`, "-fallbackfee=0.00001", "-printtoconsole=0"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
let launchError;
child.on("error", error => { launchError = error; });
let stderr = "";
child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-2000); });
let rpc;
try {
  const cookiePath = join(dataDir, "regtest", ".cookie");
  for (let i = 0; i < 150; i++) {
    if (launchError) throw launchError;
    if (child.exitCode !== null) throw new Error(`Bitcoin Core exited: ${stderr}`);
    if (existsSync(cookiePath)) {
      rpc = new BitcoinCoreClient(`http://127.0.0.1:${port}`, readFileSync(cookiePath, "utf8"), "regtest");
      try { await rpc.assertNetwork(); break; } catch { rpc = undefined; }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(rpc, "Bitcoin Core did not become ready");
  await assert.rejects(new BitcoinCoreClient(`http://127.0.0.1:${port}`, readFileSync(cookiePath, "utf8"), "signet").assertNetwork(), /network mismatch/);
  await rpc.call("createwallet", ["rehearsal"]);
  const faucet = await rpc.call("getnewaddress", ["faucet", "bech32"]);
  await rpc.call("generatetoaddress", [101, faucet]);

  const phrase = "abandon ".repeat(23) + "art";
  const wallet = Wallet.fromRecoveryPhrase(phrase, "jgtc-testnet-v2");
  const receive = wallet.bitcoin("regtest");
  const fundingTxid = await rpc.call("sendtoaddress", [receive.address(), 0.01]);
  await rpc.call("generatetoaddress", [1, faucet]);
  const deposited = await rpc.scan(receive);
  assert.equal(deposited.balanceSats, 1_000_000n);

  // Recover on a fresh wallet, without its original encrypted key file.
  const recovered = Wallet.fromRecoveryPhrase(phrase, "jgtc-testnet-v2").bitcoin("regtest");
  assert.equal(recovered.address(), receive.address());
  const spend = recovered.buildSpend({ inputs: deposited.inputs, toAddress: faucet, amountSats: 990_000n, feeSats: 1_000n });
  const sent = await rpc.broadcast(spend);
  const [confirmationBlock] = await rpc.call("generatetoaddress", [1, faucet]);
  assert.equal((await rpc.scan(recovered)).balanceSats, 9_000n);
  const accepted = await rpc.call("getrawtransaction", [sent, true, confirmationBlock]);
  assert.equal(accepted.confirmations, 1);
  await assert.rejects(rpc.broadcast(spend), /rejected/);

  // Invalidate confirmation: the spend returns to the mempool, so neither its
  // spent input nor its unconfirmed change counts as confirmed spendable funds.
  await rpc.call("invalidateblock", [confirmationBlock]);
  assert.equal((await rpc.scan(recovered)).balanceSats, 0n);
  await rpc.call("reconsiderblock", [confirmationBlock]);
  assert.equal((await rpc.scan(recovered)).balanceSats, 9_000n);
  const report = { network: "regtest", bitcoinCore: await rpc.call("getnetworkinfo").then(info => info.subversion),
    fundingTxid, returnTxid: sent, receivedSats: "1000000", returnedSats: "990000", feeSats: "1000", changeSats: "9000",
    recoveredFromWords: true, coreAccepted: true, confirmed: true, reconsideredBlock: true, wrongNetworkRejected: true, duplicateSpendRejected: true };
  writeFileSync(join(dataDir, "evidence.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  console.log(`Evidence: ${join(dataDir, "evidence.json")}`);
  receive.destroy(); recovered.destroy();
} finally {
  if (rpc) { try { await rpc.call("stop"); } catch { /* May have already stopped. */ } }
  if (child.exitCode === null) {
    await Promise.race([new Promise(resolve => child.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
    if (child.exitCode === null) child.kill();
  }
}
