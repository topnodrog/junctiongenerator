'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { assertNotCompromisedDeployer, COMPROMISED_JGT_DEPLOYER } = require('./deployment-safety.js');

const scriptsDir = __dirname;

test('blocklist matches the repository-documented compromised original deployer', () => {
  const readme = fs.readFileSync(path.join(scriptsDir, '../../README.md'), 'utf8');
  const documented = readme.match(/Original deployer wallet \(COMPROMISED — DO NOT USE\):\*\* `([^`]+)`/);
  assert.ok(documented, 'README must clearly label the original deployer as compromised');
  assert.equal(documented[1].toLowerCase(), COMPROMISED_JGT_DEPLOYER.toLowerCase());
});

test('JGT faucet route is retired from the public site', () => {
  const repoRoot = path.join(scriptsDir, '../..');
  const faucetPage = fs.readFileSync(path.join(repoRoot, 'src/app/jgt-faucet/page.tsx'), 'utf8');
  const faucetUiPath = path.join(repoRoot, 'src/components/JGTClaimFaucet.tsx');
  assert.match(faucetPage, /permanentRedirect\("\/"\)/);
  assert.doesNotMatch(faucetPage, /\bJGT\b/);
  assert.equal(fs.existsSync(faucetUiPath), false, 'JGT claim UI must be removed');
});

test('relayer and verifier refuse the compromised wallet for claims and sponsorship', () => {
  const repoRoot = path.join(scriptsDir, '../..');
  const relayer = fs.readFileSync(path.join(repoRoot, 'scripts/relayer/submit_jgt_claim.mjs'), 'utf8');
  const verifier = fs.readFileSync(path.join(repoRoot, 'tools/jgt-rescue/verify_jgt_state.js'), 'utf8');
  const verifierAddress = verifier.match(/const COMPROMISED_DEPLOYER = getAddress\('([^']+)'\)/);
  assert.ok(verifierAddress, 'read-only verifier must define the compromised deployer address');
  assert.equal(verifierAddress[1].toLowerCase(), COMPROMISED_JGT_DEPLOYER.toLowerCase());
  assert.match(relayer, /assertNotCompromisedDeployer\(account,/);
  assert.match(relayer, /assertNotCompromisedDeployer\(submitter,/);
  assert.match(relayer, /assertNotCompromisedDeployer\(String\(tokenOwner\)/);
  assert.match(relayer, /keccak256\(runtimeCode\)/);
  assert.match(relayer, /JGT_CLEAN_OWNER_ADDRESS/);
  assert.match(relayer, /authorizedMinters/);
});

test('rejects the compromised JGT deployer and malformed addresses', () => {
  assert.throws(
    () => assertNotCompromisedDeployer(COMPROMISED_JGT_DEPLOYER, 'test deployment'),
    /compromised and must never be used/i,
  );
  assert.throws(() => assertNotCompromisedDeployer('not-an-address'), /invalid sender address/i);
});

test('allows a valid distinct sender', () => {
  assert.doesNotThrow(() => assertNotCompromisedDeployer('0x1111111111111111111111111111111111111111'));
});

test('known unsafe legacy deploy scripts refuse before loading keys or dependencies', () => {
  for (const script of ['deploy_market.js', 'deploy_staking.js', 'deploy_dispenser.js']) {
    const result = spawnSync(process.execPath, [path.join(scriptsDir, script)], {
      cwd: scriptsDir,
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    });
    assert.notEqual(result.status, 0, `${script} should be blocked`);
    assert.match(`${result.stdout}\n${result.stderr}`, /deployment blocked/i, script);
  }
});

test('new token deployment requires an explicit opt-in before loading a wallet', () => {
  const result = spawnSync(process.execPath, [path.join(scriptsDir, 'deploy.js')], {
    cwd: scriptsDir,
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /DEPLOY_JGT_TOKEN=1/);
});
