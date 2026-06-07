const { ethers } = require("ethers");
const solc = require("solc");
const fs = require("fs");
const path = require("path");

const RPC_URL = "https://mainnet.base.org";
const PRIVATE_KEY = "0x865f69f6983da672b3c77d00d4ac0f3a6e29b4ba5b60790df332db09f993372d";
const JGT_TOKEN_ADDR = "0x7Fe2E89075F570ABcCf5451A00Bf780787FEc587";

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  if (balance < BigInt(5e15)) {
    console.log("ERROR: Need at least 0.005 ETH. Send to:", wallet.address);
    process.exit(1);
  }

  console.log("\n=== Compiling JGTMarket ===");
  const source = fs.readFileSync(path.join(__dirname, "contracts/JGTMarket.sol"), "utf8");
  const input = {
    language: "Solidity",
    sources: { "JGTMarket.sol": { content: source } },
    settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } }, optimizer: { enabled: true, runs: 200 } }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter(e => e.severity === "error");
  if (errors.length > 0) { errors.forEach(e => console.log(e.formattedMessage)); return; }

  const compiled = output.contracts["JGTMarket.sol"]["JGTMarket"];
  console.log("Compiled:", compiled.evm.bytecode.object.length / 2, "bytes");

  console.log("\n=== Deploying JGTMarket ===");
  const factory = new ethers.ContractFactory(compiled.abi, compiled.evm.bytecode.object, wallet);
  const market = await factory.deploy(JGT_TOKEN_ADDR, wallet.address);
  const receipt = await market.deploymentTransaction().wait();
  const marketAddr = await market.getAddress();

  console.log("\nJGTMarket deployed!");
  console.log("Address:", marketAddr);
  console.log("Tx:", receipt.hash);

  // Fund market with 10M JGT
  console.log("\n=== Funding market with 10M JGT ===");
  const tokenAbi = ["function transfer(address to, uint256 amount) external returns (bool)", "function balanceOf(address) view returns (uint256)"];
  const token = new ethers.Contract(JGT_TOKEN_ADDR, tokenAbi, wallet);
  const tx = await token.transfer(marketAddr, ethers.parseEther("10000000"));
  await tx.wait();
  const marketBal = await token.balanceOf(marketAddr);
  console.log("Market JGT balance:", ethers.formatEther(marketBal));

  // Save
  let info = {};
  try { info = JSON.parse(fs.readFileSync("deployment-base.json", "utf8")); } catch {}
  info.contracts = info.contracts || {};
  info.contracts.JGTMarket = { address: marketAddr, txHash: receipt.hash, blockNumber: receipt.blockNumber, abi: compiled.abi };
  fs.writeFileSync("deployment-base.json", JSON.stringify(info, null, 2));

  const remaining = await provider.getBalance(wallet.address);
  console.log("\nRemaining ETH:", ethers.formatEther(remaining));
}

main().catch(err => { console.error("Failed:", err.message); process.exit(1); });
