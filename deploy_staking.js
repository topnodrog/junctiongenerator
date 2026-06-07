const { ethers } = require("ethers");
const solc = require("solc");
const fs = require("fs");
const path = require("path");

const RPC_URL = "https://mainnet.base.org";
const PRIVATE_KEY = "0x865f69f6983da672b3c77d00d4ac0f3a6e29b4ba5b60790df332db09f993372d";
const JGT_TOKEN_ADDRESS = "0x7Fe2E89075F570ABcCf5451A00Bf780787FEc587";

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH\n");

  // Compile staking contract
  console.log("=== Compiling JGTStaking ===");
  const source = fs.readFileSync(path.join(__dirname, "contracts/JGTStaking.sol"), "utf8");

  const input = {
    language: "Solidity",
    sources: { "JGTStaking.sol": { content: source } },
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

  const stakingContract = output.contracts["JGTStaking.sol"]["JGTStaking"];
  const stakingAbi = stakingContract.abi;
  const stakingBytecode = stakingContract.evm.bytecode.object;
  console.log("Compiled. Bytecode:", stakingBytecode.length / 2, "bytes\n");

  // Deploy staking
  console.log("=== Deploying JGTStaking ===");
  const factory = new ethers.ContractFactory(stakingAbi, stakingBytecode, wallet);
  const staking = await factory.deploy(JGT_TOKEN_ADDRESS, wallet.address);
  console.log("Waiting for confirmation...");
  const receipt = await staking.deploymentTransaction().wait();

  const stakingAddress = await staking.getAddress();
  console.log("\n✅ JGTStaking deployed!");
  console.log("Address:", stakingAddress);
  console.log("Tx hash:", receipt.hash);
  console.log("Block:", receipt.blockNumber);
  console.log("Gas used:", receipt.gasUsed.toString());

  // Authorize staking contract to mint JGT
  console.log("\n=== Authorizing staking contract to mint JGT ===");
  const tokenAbi = ["function authorizeMinter(address minter, bool authorized) external"];
  const token = new ethers.Contract(JGT_TOKEN_ADDRESS, tokenAbi, wallet);
  const authTx = await token.authorizeMinter(stakingAddress, true);
  await authTx.wait();
  console.log("Staking contract authorized to mint JGT!");

  // Save deployment info
  const deploymentInfo = JSON.parse(fs.readFileSync(path.join(__dirname, "deployment-base.json"), "utf8"));
  deploymentInfo.contracts.JGTStaking = {
    address: stakingAddress,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    abi: stakingAbi
  };
  fs.writeFileSync(path.join(__dirname, "deployment-base.json"), JSON.stringify(deploymentInfo, null, 2));

  const remainingBalance = await provider.getBalance(wallet.address);
  console.log("\nRemaining ETH:", ethers.formatEther(remainingBalance));
  console.log("\nSaved to deployment-base.json");
}

main().catch(err => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
