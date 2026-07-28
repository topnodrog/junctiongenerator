# Testnet V3 Deployment State

## Frozen identity
- Chain ID: `jgc-testnet-v3`
- Network magic: `0x4a474354` (`JGCT`)
- Consensus version: `0x03000000`
- Proof mode: `simnet-receipts-v1`
- Genesis timestamp: `1781136000` (2026-06-11 00:00:00 UTC)
- Testnet genesis hash: `df5d37d6a1e7799621bba84580c9cf94ddd37ae4fec008bb3356ea990b77b485`

Old V2 and early V3 development data is intentionally incompatible and should
be archived or deleted before starting this identity.

## Implemented operator paths
- `npm run testnet` starts a validator/back-checker by default.
- `npm run testnet:producer -- --block-interval 30` explicitly enables the one
  designated producer for a small network.
- Producer state is derived from node chainstate, so persisted restart, sync,
  reorg, and difficulty changes do not require a second state database.
- `npm run wallet -- faucet <address> <amount> --datadir <dir> --broadcast <url>`
  creates a signed spend from the testnet-only allocation.
- `docker compose -f compose.testnet.yml up --build` defines a loopback-exposed
  producer and independent back-checker with separate persistent volumes.
- `/status` reports producer health, last height/error, and remaining TFLOPS.

## Verification at capture
- Node typecheck passed.
- Node production build passed.
- 30 Jest suites / 280 tests passed.
- A compiled `--produce` launcher booted on loopback and returned healthy status
  for `jgc-testnet-v3`, waiting for 1000 TFLOPS as expected.
- GitHub Actions passed Node 20 on Linux/Windows/macOS, Node 22 on Linux, and the
  pinned Rust/WASM verifier build and tests after correcting the package-local
  Jest path used by clean installs.
- Docker could not be executed locally because Docker is not installed. The
  Dockerfile and Compose topology remain reviewable but not runtime-verified in
  this session.
- The previously completed strict Rust/WASM six-proof demo remains the bounded
  sound-proof evidence. A local repeat under the newly pinned toolchain was
  blocked by rustup cache permissions, while the clean GitHub Rust job passed.

## Remaining public deployment gates
1. Deploy at least two public seeds behind TLS/WSS and monitored firewalls.
2. Add versioned atomic/fsynced storage writes, corrupt-tail recovery, migrations,
   and explicit incompatible-store diagnostics.
3. Exercise CI natively on ARM64 and add independent verifier vectors.
4. Add an explorer-lite and rate-limited faucet service around the implemented
   faucet transaction path.
5. Run multi-day multi-machine soak with reorgs, clock skew, restarts, hostile
   traffic, slow validators, audit quorum behavior, and backup restoration.
6. Replace simnet receipts before economically meaningful rewards; keep strict
   bounded proofs and general useful-compute proof claims clearly separated.
