'use strict';

/**
 * rescue_7702.js — recover JGT from a compromised EOA on Base whose ETH is being
 * auto-stolen by an EIP-7702 sweeper.
 *
 * Why the old rescue_jgt.js can't work: the compromised account has EIP-7702 code
 * installed (`0xef0100…`). Any ETH sent to it is bounced out by that code in the
 * same transaction, so the account can NEVER hold gas to sign its own transfer().
 *
 * This script sidesteps that entirely. A clean "sponsor" wallet pays all gas and
 * sends one type-4 (EIP-7702) transaction that:
 *   1) carries an authorization — signed off-chain by the compromised key (no gas) —
 *      that re-points the compromised account's delegation to our RescueDelegate, and
 *   2) calls rescue() on the compromised account, which (now running our code in the
 *      account's own context) transfers all JGT to the safe wallet and hands over
 *      token ownership.
 *
 * The compromised wallet needs ZERO ETH. The only ETH at risk is the small amount in
 * the sponsor wallet, which is only ever spent on our own transactions.
 *
 * Env vars (gitignored .env.rescue next to this file):
 *   SPONSOR_PRIVATE_KEY  clean wallet that pays gas and sends the tx (required; keep secret)
 *   OLD_PRIVATE_KEY      compromised wallet's key — used ONLY to sign the authorization (required)
 *   RECEIVER_ADDRESS     clean destination address for the JGT + ownership (required)
 *   JGT_ADDRESS          JGT token (default: known Base deployment)
 *   BASE_RPC_URL         RPC (default: https://mainnet.base.org)
 *   RESCUE_DELEGATE_ADDRESS  reuse an already-deployed RescueDelegate (optional)
 *   EXECUTE              "1" to actually deploy + send. Without it, this is a dry run.
 */

const { ethers } = require('ethers');
const solc = require('solc');
const fs = require('fs');
const path = require('path');

// Zero-dependency .env.rescue loader (matches the repo's gitignored `.env*` rule).
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
const EXECUTE = process.env.EXECUTE === '1';
const PREDEPLOYED = process.env.RESCUE_DELEGATE_ADDRESS;

const JGT_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function owner() view returns (address)',
  'function balanceOf(address) view returns (uint256)',
];

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Put it in the gitignored .env.rescue (never commit it).`);
    process.exit(1);
  }
  return v;
}

function compileDelegate() {
  const source = fs.readFileSync(path.join(__dirname, 'RescueDelegate.sol'), 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'RescueDelegate.sol': { content: source } },
    settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }, optimizer: { enabled: true, runs: 200 } },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errs = (out.errors || []).filter((e) => e.severity === 'error');
  if (errs.length) {
    errs.forEach((e) => console.error(e.formattedMessage));
    process.exit(1);
  }
  const c = out.contracts['RescueDelegate.sol']['RescueDelegate'];
  return { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL, undefined, { batchMaxCount: 1 });
  const net = await provider.getNetwork();

  const sponsor = new ethers.Wallet(need('SPONSOR_PRIVATE_KEY'), provider);
  const old = new ethers.Wallet(need('OLD_PRIVATE_KEY'), provider);
  let receiver;
  try {
    receiver = ethers.getAddress(need('RECEIVER_ADDRESS'));
  } catch {
    console.error('RECEIVER_ADDRESS is not a valid 0x address.');
    process.exit(1);
  }

  console.log(`Network        : chainId ${net.chainId} (${RPC_URL})`);
  console.log(`JGT token      : ${JGT_ADDRESS}`);
  console.log(`Compromised    : ${old.address}  (signs authorization only, pays no gas)`);
  console.log(`Sponsor (gas)  : ${sponsor.address}`);
  console.log(`Receiver (safe): ${receiver}`);
  console.log(`Mode           : ${EXECUTE ? 'EXECUTE (live)' : 'DRY RUN (no tx sent)'}`);
  console.log('');

  // ---- preconditions --------------------------------------------------------
  const token = new ethers.Contract(JGT_ADDRESS, JGT_ABI, provider);
  const symbol = await token.symbol();
  const decimals = await token.decimals();
  const bal = await token.balanceOf(old.address);
  const owner = await token.owner();
  const sponsorEth = await provider.getBalance(sponsor.address);
  const oldCode = await provider.getCode(old.address);

  console.log(`Compromised ${symbol} balance : ${ethers.formatUnits(bal, decimals)}`);
  console.log(`JGT owner                : ${owner}${owner.toLowerCase() === old.address.toLowerCase() ? '  (== compromised — ownership move will work)' : '  (NOT the compromised wallet — ownership move will be skipped)'}`);
  console.log(`Sponsor ETH balance      : ${ethers.formatEther(sponsorEth)} ETH`);
  console.log(`Compromised code         : ${oldCode === '0x' ? '(none)' : oldCode}`);
  if (oldCode.slice(2, 8).toLowerCase() === 'ef0100') {
    console.log(`  -> currently delegated to: 0x${oldCode.slice(8, 48)} (we will overwrite this)`);
  }
  console.log('');

  if (receiver.toLowerCase() === old.address.toLowerCase()) {
    console.error('RECEIVER_ADDRESS equals the compromised wallet — aborting.');
    process.exit(1);
  }
  const ownershipPending = owner.toLowerCase() === old.address.toLowerCase();
  if (bal === 0n && !ownershipPending) {
    console.log('Compromised wallet holds 0 JGT and is not the token owner — nothing to do. Exiting.');
    return;
  }
  if (bal === 0n && ownershipPending) {
    console.log('Note: 0 JGT to move (already transferred), but the compromised wallet is still the token owner — proceeding to move ownership only.');
  }
  if (sponsorEth === 0n) {
    const msg = 'Sponsor wallet has 0 ETH on Base — fund it with a few dollars of ETH before the live run.';
    if (EXECUTE) { console.error(msg); process.exit(1); }
    console.log(`  NOTE: ${msg}`);
  }

  // ---- compile + figure out the delegate address ----------------------------
  const { abi, bytecode } = compileDelegate();
  console.log(`RescueDelegate compiled  : ${(bytecode.length - 2) / 2} bytes`);

  let delegateAddr = PREDEPLOYED;
  if (delegateAddr) {
    console.log(`Using pre-deployed delegate: ${delegateAddr}`);
  } else if (!EXECUTE) {
    // predict where it WOULD deploy from the sponsor's next nonce
    const nonce = await provider.getTransactionCount(sponsor.address);
    delegateAddr = ethers.getCreateAddress({ from: sponsor.address, nonce });
    console.log(`RescueDelegate (predicted) : ${delegateAddr} (would deploy at sponsor nonce ${nonce})`);
  }

  // ---- build the authorization (signed by the OLD key, no gas) --------------
  // nonce auto-fills to the compromised account's current nonce; chainId auto-fills.
  if (delegateAddr) {
    const auth = await old.authorize({ address: delegateAddr });
    console.log('');
    console.log('Authorization (signed by compromised key):');
    console.log(`  delegate : ${auth.address}`);
    console.log(`  nonce    : ${auth.nonce}  (must equal compromised account nonce at mining time)`);
    console.log(`  chainId  : ${auth.chainId}`);
  }

  if (!EXECUTE) {
    console.log('');
    console.log('DRY RUN complete — nothing was deployed or sent.');
    console.log('Preconditions look ' + (owner.toLowerCase() === old.address.toLowerCase() && bal > 0n && sponsorEth > 0n ? 'GOOD.' : 'INCOMPLETE — see notes above.'));
    console.log('To run for real: set EXECUTE=1 and re-run. It will (1) deploy RescueDelegate, (2) send the sponsored rescue tx.');
    return;
  }

  // =========================== LIVE EXECUTION ================================
  // 1) deploy RescueDelegate from the sponsor (unless reusing one)
  if (!PREDEPLOYED) {
    console.log('');
    console.log('1) Deploying RescueDelegate from sponsor...');
    const factory = new ethers.ContractFactory(abi, bytecode, sponsor);
    const d = await factory.deploy();
    await d.deploymentTransaction().wait();
    delegateAddr = await d.getAddress();
    console.log(`   deployed at ${delegateAddr}`);
  }

  // 2) (re-)sign the authorization against the final delegate address + current nonce
  const auth = await old.authorize({ address: delegateAddr });
  console.log('');
  console.log(`2) Sending sponsored EIP-7702 rescue tx (delegate -> ${delegateAddr}, auth nonce ${auth.nonce})...`);
  const iface = new ethers.Interface(abi);
  const data = iface.encodeFunctionData('rescue', [JGT_ADDRESS, receiver]);
  // The public RPC's eth_estimateGas does NOT simulate the 7702-delegated code,
  // so it under-estimates badly (tx1 only got 84k and the ownership move OOG'd).
  // Set an explicit, generous limit; it's cheap on Base and only the gas actually
  // used is charged.
  const gasLimit = BigInt(process.env.GAS_LIMIT || '300000');
  const tx = await sponsor.sendTransaction({
    to: old.address,
    data,
    authorizationList: [auth],
    type: 4,
    gasLimit,
  });
  console.log(`   tx ${tx.hash} — waiting...`);
  const rcpt = await tx.wait();
  console.log(`   mined in block ${rcpt.blockNumber}, status ${rcpt.status}`);

  // ---- verify ---------------------------------------------------------------
  const [oldAfter, recvAfter, ownerAfter] = await Promise.all([
    token.balanceOf(old.address),
    token.balanceOf(receiver),
    token.owner(),
  ]);
  console.log('');
  console.log('Result:');
  console.log(`  Compromised ${symbol} : ${ethers.formatUnits(oldAfter, decimals)}`);
  console.log(`  Receiver ${symbol}    : ${ethers.formatUnits(recvAfter, decimals)}`);
  console.log(`  JGT owner now    : ${ownerAfter}${ownerAfter.toLowerCase() === receiver.toLowerCase() ? '  (== receiver ✅)' : ''}`);
  if (oldAfter === 0n && recvAfter >= bal) {
    console.log('');
    console.log('SUCCESS — JGT moved to the safe wallet.');
  } else {
    console.log('');
    console.log('Tokens did NOT fully move — check the tx on a Base explorer and re-run if needed.');
  }
}

main().catch((e) => {
  console.error('FAILED:', e.shortMessage || e.message || e);
  process.exit(1);
});
