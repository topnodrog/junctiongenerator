const { ethers } = require("ethers");
const solc = require("solc");
const fs = require("fs");
const path = require("path");

try { require("dotenv").config(); } catch { /* optional: npm i dotenv */ }
const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
// SECURITY: never hard-code a private key. Provide it via the PRIVATE_KEY env var
// (e.g. an untracked .env). The key previously committed here was leaked and must
// stay retired — deploy only from a fresh, secured wallet.
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error("PRIVATE_KEY not set. Put it in your environment or an untracked .env (never commit it).");
  process.exit(1);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const balance = await provider.getBalance(wallet.address);
  console.log("Deployer:", wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH\n");

  // Compile JGTToken
  console.log("=== Compiling JGTToken ===");
  const tokenSource = fs.readFileSync(path.join(__dirname, "contracts/JGTToken.sol"), "utf8");

  const input = {
    language: "Solidity",
    sources: { "JGTToken.sol": { content: tokenSource } },
    settings: {
      outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
      optimizer: { enabled: true, runs: 200 }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  const errors = (output.errors || []).filter(e => e.severity === "error");
  if (errors.length > 0) {
    console.log("Compilation errors:");
    errors.forEach(e => console.log(e.formattedMessage));
    return;
  }

  const tokenContract = output.contracts["JGTToken.sol"]["JGTToken"];
  const tokenAbi = tokenContract.abi;
  const tokenBytecode = tokenContract.evm.bytecode.object;
  console.log("Compiled. Bytecode:", tokenBytecode.length / 2, "bytes\n");

  // Deploy JGTToken
  console.log("=== Deploying JGTToken ===");
  const tokenFactory = new ethers.ContractFactory(tokenAbi, tokenBytecode, wallet);

  console.log("Sending deployment transaction...");
  const token = await tokenFactory.deploy();
  console.log("Waiting for confirmation...");
  const tokenReceipt = await token.deploymentTransaction().wait();

  const tokenAddress = await token.getAddress();
  console.log("\n✅ JGTToken deployed!");
  console.log("Address:", tokenAddress);
  console.log("Tx hash:", tokenReceipt.hash);
  console.log("Block:", tokenReceipt.blockNumber);
  console.log("Gas used:", tokenReceipt.gasUsed.toString());

  // Verify
  const totalSupply = await token.totalSupply();
  const maxSupply = await token.MAX_SUPPLY();
  const owner = await token.owner();
  console.log("\nTotal supply:", ethers.formatEther(totalSupply), "JGT");
  console.log("Max supply:", ethers.formatEther(maxSupply), "JGT");
  console.log("Owner:", owner);

  // Remaining balance
  const remainingBalance = await provider.getBalance(wallet.address);
  console.log("\nRemaining ETH:", ethers.formatEther(remainingBalance));

  // Save deployment info
  const deploymentInfo = {
    network: "base",
    chainId: 8453,
    deployer: wallet.address,
    contracts: {
      JGTToken: {
        address: tokenAddress,
        txHash: tokenReceipt.hash,
        blockNumber: tokenReceipt.blockNumber,
        gasUsed: tokenReceipt.gasUsed.toString(),
        abi: tokenAbi
      }
    },
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(path.join(__dirname, "deployment-base.json"), JSON.stringify(deploymentInfo, null, 2));
  console.log("\nSaved to deployment-base.json");
}

main().catch(err => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
