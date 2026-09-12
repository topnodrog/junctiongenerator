# Wallet and participation requirements

Owner direction, 2026-09-12: keep every mainnet gate mandatory while building
a usable, self-custodial prototype that can attract participants. Early software
can continue improving after release; that does not waive ledger integrity,
recoverable wallets, payment correctness or release-specific security evidence.
An initial low token price does not establish demand or guarantee future growth.

## Native multi-network wallet

The target is one application managing separate native accounts. A BTC deposit
goes to a Bitcoin address and is later spent on Bitcoin; it does not become JGC.
A bridge or swap is a separate feature and is not required for that round trip.
Never display an unsupported network as a working receive option.

| Network family | Required implementation before enabling deposits |
| --- | --- |
| JGC / JGTC | Versioned keys and recovery, network-bound addresses and signatures, balance scanning, fees, send confirmation, broadcast and reorg handling. Current CLI supports testnet spending; new phrase recovery is implemented. |
| Bitcoin | Native BIP84 test accounts, UTXO discovery, bounded fee/change selection, PSBT signing and Core broadcast now pass a regtest receive/restore/send round trip and block rollback test. Signet operation and real-BTC activation remain unverified/disabled. |
| Ethereum and compatible chains, initially Ethereum and Base | Native Ethereum accounts, chain-ID checks, balances, pending nonce, EIP-1559 fee caps and receipt queries now pass a local Anvil receive/restore/send and rollback test. Sepolia operation remains unrehearsed. Base's additional fee handling, tokens and real-ETH activation remain disabled. |
| Other networks | Explicit native adapters and equivalent recovery/send/receive tests. A common address shape or wallet connection is not sufficient support. |

Do not reuse JGC's ML-DSA private keys as Bitcoin/Ethereum keys. Each family
needs its own documented derivation, algorithms and test vectors. Adding an
asset to this wallet does not upgrade that asset's underlying cryptography.

Rainbow's published supported-network list covers Ethereum-compatible networks,
not native JGC. This repository removed its unused RainbowKit/Wagmi/WalletConnect
surface; no current Rainbow integration is present. JGC's custom UTXO format,
addresses and ML-DSA signatures require native support. JGT on Base is a separate
token and must not be confused with JGC.

## Recovery acceptance

The current CLI requires re-entry of all 24 words before new wallet setup
completes. A checkbox cannot replace a recovery rehearsal. Further desktop or
mobile work must preserve hidden input, explicit network selection, restore
testing and clear loss-of-backup consequences. A test can verify possession of
the words at setup, not prove that paper was safely stored.

Encrypted backups can supplement the words. Passkey, hardware and social
recovery options need their own threat model, device-loss and provider-outage
tests; do not promise password-reset recovery for a self-custodial account.

## Participation before launch

Keep the public pilot valueless and measure useful work, reliability and wallet
recovery. A separately funded, capped service pilot or testing bounty could pay
participants for verified tasks without enabling valuable JGC prematurely.
That requires an explicit funded budget and eligibility/acceptance rules; this
document does not authorize spending or promise rewards.

The protocol should reject invalid spends and preserve accepted history under
its specified fork-choice rules. A longest-chain protocol has reorg risk, so
“immutable” must not mean every transaction is instantly irreversible. Record
confirmation policy and release-specific reorg tests. Do not silently rewrite
genesis, supply or prior settlement when shipping later hardening.

References: [Rainbow supported networks](https://rainbow.me/en-us/support/app/supported-networks),
[wallet recovery](../../packages/jgc-node/docs/WALLET-RECOVERY.md),
[mainnet gates](README.md).
