'use strict';

// Read-only verifier for public Base state. This script never loads a wallet,
// private key, .env file, or transaction signer.
const {
  Contract,
  JsonRpcProvider,
  formatUnits,
  getAddress,
} = require('ethers');

const BASE_CHAIN_ID = 8453n;
const JGT_ADDRESS = getAddress(
  process.env.JGT_ADDRESS || '0x7Fe2E89075F570ABcCf5451A00Bf780787FEc587',
);
const COMPROMISED_DEPLOYER = getAddress('0x5f89d06E0D4dBe3C125a49FD9213624aD8a991d4');
const RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function owner() view returns (address)',
  'function totalSupply() view returns (uint256)',
  'function MAX_SUPPLY() view returns (uint256)',
  'function remainingSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function authorizedMinters(address minter) view returns (bool)',
];

function candidateMinters() {
  const supplied = [
    ...(process.env.JGT_MINTER_ADDRESSES || '').split(','),
    ...process.argv.slice(2),
  ].map((value) => value.trim()).filter(Boolean);
  const checked = new Set([COMPROMISED_DEPLOYER.toLowerCase()]);
  for (const address of supplied) {
    const checkedAddress = getAddress(address);
    checked.add(checkedAddress.toLowerCase());
  }
  return [...checked].map(getAddress);
}

async function main() {
  const provider = new JsonRpcProvider(RPC_URL, undefined, { batchMaxCount: 1 });
  const network = await provider.getNetwork();
  if (network.chainId !== BASE_CHAIN_ID) {
    throw new Error(`RPC returned chain ID ${network.chainId}; Base mainnet (8453) is required.`);
  }

  const token = new Contract(JGT_ADDRESS, ABI, provider);
  const blockTag = await provider.getBlockNumber();
  const read = (name, ...args) => token.getFunction(name).staticCall(...args, { blockTag });
  const [name, symbol, decimals, owner, totalSupply, maxSupply, remainingSupply, compromisedBalance] =
    await Promise.all([
      read('name'),
      read('symbol'),
      read('decimals'),
      read('owner'),
      read('totalSupply'),
      read('MAX_SUPPLY'),
      read('remainingSupply'),
      read('balanceOf', COMPROMISED_DEPLOYER),
    ]);

  const candidates = candidateMinters();
  const minterStates = await Promise.all(candidates.map(async (address) => ({
    address,
    isOwner: address.toLowerCase() === String(owner).toLowerCase(),
    authorized: await read('authorizedMinters', address),
  })));

  console.log(`Read-only JGT state at Base block ${blockTag}`);
  let rpcHost = 'custom RPC';
  try { rpcHost = new URL(RPC_URL).host || rpcHost; } catch { /* do not print the configured URL */ }
  console.log(`RPC host: ${rpcHost}`);
  console.log(`Token: ${JGT_ADDRESS} (${name}, ${symbol}, ${decimals} decimals)`);
  console.log(`Owner: ${owner}${String(owner).toLowerCase() === COMPROMISED_DEPLOYER.toLowerCase() ? '  !!! COMPROMISED OWNER — STOP !!!' : ''}`);
  console.log(`Total supply: ${formatUnits(totalSupply, decimals)} / ${formatUnits(maxSupply, decimals)} ${symbol}`);
  console.log(`Remaining supply: ${formatUnits(remainingSupply, decimals)} ${symbol}`);
  console.log(`Compromised deployer balance (read-only): ${formatUnits(compromisedBalance, decimals)} ${symbol}`);
  console.log('Candidate minter status (owner can mint even if authorizedMinters is false):');
  for (const state of minterStates) {
    console.log(`  ${state.address}: owner=${state.isOwner}, authorizedMinters=${state.authorized}`);
  }
  console.log('');
  console.log('This tool submits no transactions and does not prove that any other minter is absent.');
  console.log('Never use the compromised wallet key; confirm the clean owner independently before any authorization.');
}

main().catch(() => {
  console.error('Read-only verification failed. Check Base RPC connectivity, token address, and ABI; RPC credentials are intentionally not echoed.');
  process.exitCode = 1;
});
