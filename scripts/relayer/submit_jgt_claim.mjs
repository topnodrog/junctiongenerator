#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  formatEther,
  getAddress,
  isAddress,
  keccak256,
  isHexString,
  verifyTypedData,
} from "ethers";

const require = createRequire(import.meta.url);
const { assertNotCompromisedDeployer } = require("../deploy/deployment-safety.js");

const BASE_CHAIN_ID = 8453n;
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const EXPECTED_TOKEN = "0x7Fe2E89075F570ABcCf5451A00Bf780787FEc587";
const EXPECTED_DISPENSER_CODE_HASH = process.env.JGT_DISPENSER_CODE_HASH || "";
const EXPECTED_CLEAN_OWNER = process.env.JGT_CLEAN_OWNER_ADDRESS || "";
const TOKEN_UNIT = 10n ** 18n;
const CLAIM_STEP = 2n * TOKEN_UNIT;
const ABI = [
  "function token() view returns (address)",
  "function accrued(address account) view returns (uint256)",
  "function claimable(address account) view returns (uint256)",
  "function nonces(address account) view returns (uint256)",
  "function claimWithSig(address account,uint256 amount,uint256 deadline,address relayer,bytes signature) returns (uint256)",
];
const TOKEN_ABI = [
  "function owner() view returns (address)",
  "function authorizedMinters(address minter) view returns (bool)",
];
const TYPES = {
  Claim: [
    { name: "account", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "relayer", type: "address" },
  ],
};

function fail(message) {
  console.error(`JGT relayer: ${message}`);
  process.exit(1);
}

function formatJGT(amount) {
  return `${formatEther(amount)} JGT`;
}

async function main() {
  const requestFile = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
  const broadcast = process.argv.includes("--broadcast");
  if (!requestFile) {
    fail("usage: node scripts/relayer/submit_jgt_claim.mjs <signed-request.json> [--broadcast]");
  }
  if (!isHexString(EXPECTED_DISPENSER_CODE_HASH, 32)) {
    fail("set JGT_DISPENSER_CODE_HASH to the independently reviewed 32-byte runtime code hash");
  }
  if (!isAddress(EXPECTED_CLEAN_OWNER) || EXPECTED_CLEAN_OWNER === ZeroAddress) {
    fail("set JGT_CLEAN_OWNER_ADDRESS to the independently verified clean token owner");
  }
  assertNotCompromisedDeployer(getAddress(EXPECTED_CLEAN_OWNER), "configured clean token owner");

  let request;
  try {
    request = JSON.parse(await readFile(requestFile, "utf8"));
  } catch {
    fail("could not read a valid request JSON file");
  }

  if (Number(request.chainId) !== Number(BASE_CHAIN_ID)) fail("request is not for Base mainnet (chain ID 8453)");
  const account = getAddress(request.account);
  const tokenAddress = getAddress(request.tokenAddress);
  const dispenserAddress = getAddress(request.dispenserAddress);
  const relayer = getAddress(request.relayer || ZeroAddress);
  assertNotCompromisedDeployer(account, "JGT faucet recipient");
  if (relayer !== ZeroAddress) assertNotCompromisedDeployer(relayer, "JGT faucet relayer");
  const amount = BigInt(request.amount);
  const nonce = BigInt(request.nonce);
  const deadline = BigInt(request.deadline);
  const signature = String(request.signature || "");
  if (tokenAddress.toLowerCase() !== EXPECTED_TOKEN.toLowerCase()) fail("request token address does not match the published JGT token");
  if (amount <= 0n || amount % CLAIM_STEP !== 0n) fail("claim amount must be a positive multiple of the 2 JGT daily reward");
  if (!isHexString(signature) || signature === "0x") fail("request does not contain a valid hex signature");
  if (deadline <= BigInt(Math.floor(Date.now() / 1000))) fail("authorization has expired");

  const provider = new JsonRpcProvider(BASE_RPC_URL);
  const network = await provider.getNetwork();
  if (network.chainId !== BASE_CHAIN_ID) fail(`RPC returned chain ID ${network.chainId}, expected 8453`);
  const runtimeCode = await provider.getCode(dispenserAddress);
  if (runtimeCode === "0x") fail("no dispenser contract exists at the request address");
  if (keccak256(runtimeCode).toLowerCase() !== EXPECTED_DISPENSER_CODE_HASH.toLowerCase()) {
    fail("dispenser runtime code hash does not match the independently reviewed operator configuration");
  }

  const faucet = new Contract(dispenserAddress, ABI, provider);
  const token = new Contract(EXPECTED_TOKEN, TOKEN_ABI, provider);
  const [onChainToken, onChainNonce, accrued, claimable, tokenOwner, dispenserAuthorized] = await Promise.all([
    faucet.getFunction("token").staticCall(),
    faucet.getFunction("nonces").staticCall(account),
    faucet.getFunction("accrued").staticCall(account),
    faucet.getFunction("claimable").staticCall(account),
    token.getFunction("owner").staticCall(),
    token.getFunction("authorizedMinters").staticCall(dispenserAddress),
  ]);
  if (String(onChainToken).toLowerCase() !== EXPECTED_TOKEN.toLowerCase()) fail("dispenser is not configured for the published JGT token");
  assertNotCompromisedDeployer(String(tokenOwner), "JGT token owner before relaying");
  if (String(tokenOwner).toLowerCase() !== getAddress(EXPECTED_CLEAN_OWNER).toLowerCase()) {
    fail("current token owner does not match JGT_CLEAN_OWNER_ADDRESS");
  }
  if (!dispenserAuthorized) {
    fail("dispenser is not an active JGT minter");
  }
  if (onChainNonce !== nonce) fail("request nonce is stale or has already been used");
  if (amount > accrued || amount > claimable) fail("signed amount is no longer accrued or the remaining faucet allotment cannot cover it");

  const domain = {
    name: "JGTClaimDispenser",
    version: "1",
    chainId: Number(BASE_CHAIN_ID),
    verifyingContract: dispenserAddress,
  };
  const value = { account, amount, nonce, deadline, relayer };
  if ((await provider.getCode(account)) === "0x") {
    let recoveredAccount;
    try {
      recoveredAccount = getAddress(verifyTypedData(domain, TYPES, value, signature));
    } catch {
      fail("EOA signature is not a valid EIP-712 claim authorization");
    }
    if (recoveredAccount !== account) fail("signature does not match the recipient wallet");
  }
  // Contract-wallet signatures are checked on-chain through EIP-1271 by the
  // claimWithSig gas simulation below before any optional broadcast.

  const privateKey = process.env.RELAYER_PRIVATE_KEY;
  let submitter = "0x000000000000000000000000000000000000dEaD";
  let connectedFaucet = faucet;
  if (broadcast) {
    if (!privateKey) fail("RELAYER_PRIVATE_KEY must be set in the operator environment to broadcast");
    const wallet = new Wallet(privateKey, provider);
    submitter = wallet.address;
    assertNotCompromisedDeployer(submitter, "JGT faucet relayer transaction");
    if (relayer !== ZeroAddress && submitter.toLowerCase() !== relayer.toLowerCase()) {
      fail("the signed request is bound to a different relayer address");
    }
    connectedFaucet = faucet.connect(wallet);
  } else if (relayer !== ZeroAddress) {
    submitter = relayer;
  }

  const method = connectedFaucet.getFunction("claimWithSig");
  const gasLimit = await method.estimateGas(account, amount, deadline, relayer, signature, { from: submitter });
  const feeData = await provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (!maxFeePerGas) fail("Base fee data was unavailable; no transaction was sent");

  console.log(`Recipient: ${account}`);
  console.log(`Amount: ${formatJGT(amount)}`);
  console.log(`Dispenser: ${dispenserAddress}`);
  console.log(`Relayer: ${submitter}${relayer === ZeroAddress ? " (authorization is unbound)" : " (bound)"}`);
  console.log(`Estimated gas: ${gasLimit.toString()}`);
  console.log(`Estimated L2 execution fee ceiling: ${formatEther(gasLimit * maxFeePerGas)} ETH`);
  console.log("The all-in Base fee can be higher due to L1 data charges; wallet/RPC receipt is authoritative.");

  if (!broadcast) {
    console.log("Dry run only. No transaction was sent. Add --broadcast and set RELAYER_PRIVATE_KEY to submit.");
    return;
  }

  const tx = await method.send(account, amount, deadline, relayer, signature);
  console.log(`Submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt.blockNumber}; gas used ${receipt.gasUsed.toString()}.`);
}

main().catch(() => {
  console.error("JGT relayer failed. Check request data, reviewed code-hash configuration, Base RPC connectivity, and wallet state; RPC credentials are intentionally not echoed.");
  process.exitCode = 1;
});
