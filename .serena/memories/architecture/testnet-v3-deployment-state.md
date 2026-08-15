# JGTC Testnet V1 Deployment State

This record supersedes the retired `jgc-testnet-v3` deployment state. The old
identity and provider data were archived during the coordinated 2026-08-15 reset
and remain historical evidence only.

## Frozen identity
- Chain ID: `jgtc-testnet-v1`
- Network magic: `0x4a475443` (`JGTC`)
- Consensus version: `0x03000000`
- Proof mode: `simnet-receipts-v1` (test-only signed receipt adapter)
- Genesis timestamp: 2026-08-15 04:00:00 UTC
- Genesis hash: `738588b974ed62ed52e74a946371bc8b6d84508b6c38203f56ada38fce4bab36`
- Genesis spendable supply: zero
- Target block interval: 600 seconds
- Settlement interval: 144 blocks; first settlement height 143

There is no premine, faucet, or private genesis allocation. JGTC is valueless.
New test coins become spendable outputs only through the 144-block settlement
path, paid directly to addresses whose signed participation is recorded.

## Implemented operator paths
- `npm run testnet:public` starts the designated Seed A producer.
- `npm run testnet:participate` starts an ordinary participant/back-checker and
  connects to both public seeds without granting production authority.
- Node.js 22 is the supported launch runtime on both seeds and the initial
  workstation participant.
- Explorer and balance endpoints are read-only views over canonical chainstate;
  they do not create or dispense coins.
- Versioned storage rejects an old chain identity and archives it before reset.

## Launch evidence captured 2026-08-15
- Google Seed A and independent Fly.io Seed B were reset onto the frozen JGTC
  identity after their `jgc-testnet-v3` state was archived. Seed A retained its
  operator identity and is the sole designated producer; Seed B is a
  non-producing back-checker.
- Both seeds run Node.js 22.23.2 behind their existing TLS/WSS endpoints.
- This workstation joined as an ordinary participant at address
  `1QGC4b18d104e2eb0cd0cd95615d2539aad9d62f0ad0`.
- Block 1 synchronized across both seeds and the workstation with tip
  `0799949e151a538eadc5d296f9abcf83f21a14db96ff808b9f3709aa0811e328`.
- Block 1 records two equal-weight contributions (1000 each), giving the anchor
  and workstation 50/50 projected settlement shares.
- The 100 JGTC shown after block 1 is an unsettled accounting pool (50 for the
  genesis slot and 50 for block 1), not spendable or pre-created supply.
- Seed A reported height 1, three peers, one produced block, and no producer
  error. Seed B reported height 1 and three peers. The workstation reported
  height 1 and two peers.
- Node typecheck/build and 37 Jest suites / 318 tests passed under Node.js 22;
  website lint/build and every GitHub/Vercel PR check passed.

## Remaining gates
1. Run and preserve a multi-day, multi-machine soak with restarts, clock skew,
   hostile traffic, slow validators, height convergence, and backup restoration.
2. Recruit independent external participants and record their signed addresses
   and contribution history for future JGTC settlements.
3. Add native ARM execution and independent verifier vectors to the release
   evidence matrix.
4. Replace `simnet-receipts-v1` before any economically meaningful network;
   current receipts record testnet participation but do not prove useful compute.
5. Complete external security and economics review before any JGC mainnet.
