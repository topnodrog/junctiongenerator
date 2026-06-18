'use strict';

/**
 * rescue_jgt.js — sweep JGT (and optionally JGT-contract ownership) out of the
 * compromised deployer wallet into a safe wallet, on Base.
 *
 * Design (keeps your good keys private):
 *   - Only the OLD (already-public, compromised) key is used by this script, to
 *     sign the transfer. JGTToken has no permit(), so the holder must sign and
 *     pay its own gas.
 *   - The DESTINATION is just an ADDRESS (RECEIVER_ADDRESS). Receiving tokens
 *     needs no private key, so your safe wallet's key never touches this machine.
 *   - Gas: the OLD wallet pays its own gas, so it needs a little ETH on Base.
 *     You fund it MANUALLY by sending ~$0.30 of ETH (from any wallet/exchange)
 *     to the old wallet's address that this script prints. No funder key needed,
 *     so your ETH wallet's key also stays private.
 *   - A single transfer() is already minimal gas; a "batch contract" would cost
 *     MORE for one transfer, so we don't use one.
 *
 * SECURITY: the old key is already public (leaked in git history). After this
 * sweep, abandon it forever. Send only minimal ETH so a sweeper has nothing to grab.
 *
 * Env vars (in a gitignored .env.rescue next to this file):
 *   OLD_PRIVATE_KEY   compromised wallet that holds the JGT (required; already public)
 *   RECEIVER_ADDRESS  safe wallet ADDRESS to receive JGT — address only (required)
 *   JGT_ADDRESS       JGT token (default: the known Base deployment)
 *   BASE_RPC_URL      RPC (default: https://mainnet.base.org)
 *   MOVE_OWNERSHIP    "1" to also transferOwnership() to RECEIVER_ADDRESS
 *   DRY_RUN           "1" to simulate (read + estimate, send nothing)
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Zero-dependency loader: read values from a gitignored .env.rescue (matches the
// repo's `.env*` ignore rule) so nothing lands in shell history or git.
(() => {
  const p = path.join(__dirname, '.env.rescue');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();

const JGT_ADDRESS = process.env.JGT_ADDRESS || '0x7Fe2E89075F570ABcCf5451A00Bf780787FEc587';
const RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const MOVE_OWNERSHIP = process.env.MOVE_OWNERSHIP === '1';
const DRY_RUN = process.env.DRY_RUN === '1';

const JGT_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function owner() view returns (address)',
  'function totalSupply() view returns (uint256)',
  'function MAX_SUPPLY() view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferOwnership(address newOwner)',
];

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Put it in the gitignored .env.rescue (never commit it).`);
    process.exit(1);
  }
  return v;
}

async function main() {
  // batchMaxCount:1 disables ethers' JSON-RPC request batching — the public Base
  // RPC mishandles batched eth_calls and returns "missing revert data", so send
  // each call as its own request.
  const provider = new ethers.JsonRpcProvider(RPC_URL, undefined, { batchMaxCount: 1 });

  const oldWallet = new ethers.Wallet(need('OLD_PRIVATE_KEY'), provider);
  let receiverAddr;
  try {
    receiverAddr = ethers.getAddress(need('RECEIVER_ADDRESS'));
  } catch {
    console.error('RECEIVER_ADDRESS is not a valid address. Use the 0x... address of your safe wallet.');
    process.exit(1);
  }
  if (receiverAddr.toLowerCase() === oldWallet.address.toLowerCase()) {
    console.error('RECEIVER_ADDRESS equals the old wallet — that would send tokens back to the compromised wallet. Aborting.');
    process.exit(1);
  }

  console.log(`Network    : Base (${RPC_URL})`);
  console.log(`JGT token  : ${JGT_ADDRESS}`);
  console.log(`From (old) : ${oldWallet.address}`);
  console.log(`To (safe)  : ${receiverAddr}`);
  console.log(`Dry run    : ${DRY_RUN}`);
  console.log('');

  const tokenRead = new ethers.Contract(JGT_ADDRESS, JGT_ABI, provider);
  const [symbol, decimals, balance, contractOwner, totalSupply, maxSupply, oldEth] = await Promise.all([
    tokenRead.symbol(),
    tokenRead.decimals(),
    tokenRead.balanceOf(oldWallet.address),
    tokenRead.owner(),
    tokenRead.totalSupply(),
    tokenRead.MAX_SUPPLY(),
    provider.getBalance(oldWallet.address),
  ]);

  console.log(`Old wallet ${symbol} balance : ${ethers.formatUnits(balance, decimals)}`);
  console.log(`Old wallet ETH balance  : ${ethers.formatEther(oldEth)}`);
  console.log(`JGT contract owner      : ${contractOwner}${contractOwner.toLowerCase() === oldWallet.address.toLowerCase() ? '  (== old wallet)' : ''}`);
  console.log(`JGT totalSupply         : ${ethers.formatUnits(totalSupply, decimals)} / max ${ethers.formatUnits(maxSupply, decimals)}`);

  // tamper check: original mint was 100M. More than that = someone used the public owner key to mint.
  const initialMint = 100_000_000n * 10n ** BigInt(decimals);
  if (totalSupply > initialMint) {
    console.log(`  !! WARNING: totalSupply exceeds the original 100,000,000 mint by ${ethers.formatUnits(totalSupply - initialMint, decimals)} ${symbol} — contract minted against (public owner key abused).`);
  }
  if (balance < initialMint && totalSupply >= initialMint) {
    console.log(`  !! NOTE: old wallet holds less than 100,000,000 ${symbol} — some may already have been moved out.`);
  }
  console.log('');

  if (balance === 0n) {
    console.log('Old wallet holds 0 JGT — nothing to move. Exiting.');
    return;
  }

  // ---- estimate the gas the OLD wallet must pay (it pays its own gas) --------
  const tokenAsOld = new ethers.Contract(JGT_ADDRESS, JGT_ABI, oldWallet);
  let gasLimit;
  try {
    gasLimit = await tokenAsOld.transfer.estimateGas(receiverAddr, balance);
  } catch {
    gasLimit = 60000n; // fallback if estimateGas is unavailable (e.g. old wallet has 0 ETH)
  }
  const fee = await provider.getFeeData();
  const gasPrice = fee.maxFeePerGas ?? fee.gasPrice;
  const perTxCost = gasLimit * gasPrice;
  const txCount = MOVE_OWNERSHIP ? 2n : 1n;
  // getFeeData()/estimateGas only cover L2 execution; Base also charges an L1
  // data fee that's often the larger share, so the L2-only estimate can UNDER-
  // shoot. Floor each tx at ~0.00003 ETH (a few cents) which comfortably covers
  // L1+L2 for a small tx on Base; take the larger of the two.
  const FLOOR_PER_TX = ethers.parseEther('0.00003');
  const computed = perTxCost * txCount * 3n;
  const floor = FLOOR_PER_TX * txCount;
  const needed = computed > floor ? computed : floor;
  const shortfall = oldEth >= needed ? 0n : needed - oldEth;

  console.log(`Est. L2 gas/tx  : ${gasLimit} units @ ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);
  console.log(`Gas needed (old): ${ethers.formatEther(needed)} ETH (${txCount} tx, incl. Base L1 fee margin)`);
  console.log(`Old wallet has  : ${ethers.formatEther(oldEth)} ETH`);
  console.log('');

  if (shortfall > 0n) {
    console.log('=> ACTION NEEDED: the old wallet needs gas. From any wallet/exchange, send');
    console.log(`   at least ${ethers.formatEther(shortfall)} ETH (round up a touch) on Base to:`);
    console.log(`   ${oldWallet.address}`);
    console.log('   then re-run. (No funder key needed — you do this send yourself.)');
    console.log('');
    if (!DRY_RUN) process.exit(1);
  } else {
    console.log('=> Old wallet already has enough ETH for gas.');
    console.log('');
  }

  if (DRY_RUN) {
    console.log('DRY_RUN=1 — no transactions sent. Fund the old wallet (if needed), then re-run without DRY_RUN.');
    return;
  }

  // ---- 1) old wallet transfers the full JGT balance to the safe address ------
  console.log(`1) Transferring ${ethers.formatUnits(balance, decimals)} ${symbol} -> ${receiverAddr} ...`);
  const t = await tokenAsOld.transfer(receiverAddr, balance);
  console.log(`   tx ${t.hash} — waiting...`);
  await t.wait();
  console.log('   tokens moved.');

  // ---- 2) optional: move contract ownership off the compromised key ----------
  if (MOVE_OWNERSHIP) {
    if (contractOwner.toLowerCase() !== oldWallet.address.toLowerCase()) {
      console.log('2) MOVE_OWNERSHIP set, but old wallet is not the JGT owner — skipping.');
    } else {
      console.log(`2) Transferring JGT ownership -> ${receiverAddr} ...`);
      const o = await tokenAsOld.transferOwnership(receiverAddr);
      console.log(`   tx ${o.hash} — waiting...`);
      await o.wait();
      console.log('   ownership moved.');
    }
  }

  // ---- verify ---------------------------------------------------------------
  const [oldAfter, recvAfter] = await Promise.all([
    tokenRead.balanceOf(oldWallet.address),
    tokenRead.balanceOf(receiverAddr),
  ]);
  console.log('');
  console.log('Done.');
  console.log(`Old wallet ${symbol}  : ${ethers.formatUnits(oldAfter, decimals)}`);
  console.log(`Safe wallet ${symbol} : ${ethers.formatUnits(recvAfter, decimals)}`);
  console.log('');
  console.log('Now ABANDON the old key permanently — it is public and unsafe.');
}

main().catch((e) => {
  console.error('FAILED:', e.shortMessage || e.message || e);
  process.exit(1);
});
