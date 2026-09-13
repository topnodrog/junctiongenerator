# Wallet setup and recovery

This command-line wallet supports native JGTC on the current testnet and native
Bitcoin/Ethereum test-network adapters. Mainnet commands remain blocked.
Bitcoin regtest and Ethereum Anvil round trips have passed locally; public
signet/Sepolia operation has not yet been rehearsed. No real BTC/ETH, Base,
tokens, other networks, bridges or swaps are enabled. Use valueless test coins.

## Create a wallet

From `packages/jgc-node`, build with `npm run build`, then use a private terminal:

```text
npm run wallet -- setup --keystore ./my-wallet.keystore.json
```

Setup requires an explicit acknowledgement, displays 24 English recovery words,
then clears the display and asks you to enter all 24 words from your backup with
input hidden. Incorrect words or cancellation do not save a wallet. It then
asks twice for a local encryption password of at least 12 characters, encrypts
the wallet, verifies decryption and saves to a new file without overwriting one.
An interrupted file write can leave an unusable file; retain the written words
and restore into another new path.

Write the words in order and store them offline. Anyone with the words controls
the wallet. There is no password reset. Do not send the words to support, a
website, a chat assistant or another person. Clearing a terminal cannot remove
screen recordings, screenshots or external logging. A backup check demonstrates
that you can reproduce the words; it cannot prove you stored them safely.

The local encryption password protects the saved file. It is not an extra
recovery word. The 24 words can recover the accounts with a new local password.
Store the recovery scheme `jgc-ml-dsa65-bip39-hkdf-v1`, network
`jgtc-testnet-v2`, and account count alongside the words.

## Check, add and recover accounts

```text
npm run wallet -- verify-backup --keystore ./my-wallet.keystore.json
npm run wallet -- new savings --keystore ./my-wallet.keystore.json
npm run wallet -- restore --accounts 2 --keystore ./recovered.keystore.json
npm run wallet -- list --keystore ./recovered.keystore.json
```

All new accounts in a recovery wallet derive sequentially from the same words.
Restore the number of accounts you created, up to 100. If unsure, recovering
100 includes every supported index; automatic account discovery is not yet
implemented. Local aliases such as `savings` are not recovered: restored labels
are `account-0`, `account-1`, and so on, with the same keys and addresses.
Imported random keys are rejected in recovery wallets because their words
would not recover those keys. Use one wallet-writing process at a time.

## Native Bitcoin and Ethereum test accounts

The same words also derive separate native Bitcoin and Ethereum accounts. JGC
private keys are never repurposed as secp256k1 keys. Bitcoin uses BIP84
`m/84'/1'/account'/0/0` for receiving and `m/84'/1'/account'/1/0` for change.
Ethereum uses `m/44'/60'/0'/0/index`. Keep the native account indexes with your
backup; `restore --accounts` restores the JGC account count only. Native indexes
are selected separately and are not automatically discovered.

```text
npm run wallet -- btc-address --btc-network regtest --keystore ./my-wallet.keystore.json
npm run wallet -- btc-balance --btc-network regtest --btc-rpc http://127.0.0.1:18443 --btc-cookie /path/to/regtest/.cookie --keystore ./my-wallet.keystore.json
npm run wallet -- btc-send <bcrt1q-address> 990000 --fee-sats 1000 --btc-network regtest --btc-rpc http://127.0.0.1:18443 --btc-cookie /path/to/regtest/.cookie --keystore ./my-wallet.keystore.json
npm run wallet -- eth-address --eth-network anvil --keystore ./my-wallet.keystore.json
npm run wallet -- eth-balance --eth-network anvil --eth-rpc http://127.0.0.1:8545 --keystore ./my-wallet.keystore.json
npm run wallet -- eth-send <0x-address> 400000000000000000 --max-fee-gwei 20 --tip-gwei 1 --eth-network anvil --eth-rpc http://127.0.0.1:8545 --keystore ./my-wallet.keystore.json
npm run wallet -- eth-receipt <0x-hash> --eth-network anvil --eth-rpc http://127.0.0.1:8545
```

Every native send previews the destination, amount and fee before requiring
`SEND <network>` in an interactive terminal. Keys stay local. The RPC endpoints
must be literal loopback addresses. These adapters trust the operator's full
node for canonical state; chain identity is checked before scanning or sending.
Submission is not confirmation or irreversible settlement.

Bitcoin supports one receiving and one change address per account, confirmed
UTXOs, up to 100 inputs, and native SegWit P2WPKH recipients. It decodes amounts
from the complete funding transaction, checks outpoint ownership and duplicates,
signs SIGHASH_ALL, and caps fees at both 100,000 satoshis and 100 sat/vB. It
rejects dust change instead of silently adding it to the fee. Unconfirmed
outputs and coinbase outputs with fewer than 101 confirmations are excluded.
A scan uses `scantxoutset` and raw block transactions; a pruned node may lack
required history. RBF fee bumping and general address discovery remain future work.

Ethereum supports plain native ETH transfers to EOAs on Anvil or Sepolia with
21,000 gas, explicit EIP-1559 fee caps, a pending nonce and a balance check that
includes maximum execution fees. It does not sign contract calls, approvals,
token transfers or authorization messages. Before broadcast it rechecks the
nonce, balance and destination code. Base and other L2s remain disabled until
their extra fee and receipt semantics are implemented and rehearsed.

These accounts inherit Bitcoin/Ethereum cryptography, including its quantum
limitations. Using one phrase across assets means compromise of that phrase
exposes every derived account. Do not import an existing funded phrase into
this experimental wallet; use new test-only words until review and activation.

## Reproduce the native-network rehearsals

Set `BITCOIND_BIN` to a verified Bitcoin Core binary, then run
`npm run test:bitcoin-regtest`. Set `ANVIL_BIN` to a verified Anvil binary, then
run `npm run test:ethereum-local`. Both start isolated loopback test nodes, use
public test words and valueless local coins, write JSON evidence below `.tmp`,
and stop their child node afterwards. They never connect to public chains.
CI pins Bitcoin Core 31.1 and Anvil 1.8.1 with archive checksums.

The Bitcoin test receives 1,000,000 test satoshis, restores from words, sends
990,000 back with a 1,000-satoshi fee, and checks 9,000 change after confirmation
and a block invalidation/reconsideration. The Ethereum test receives one test
ETH, restores from words, returns 0.4 test ETH and checks actual fee accounting,
wrong-chain refusal, stale-nonce refusal and reverted-state handling.

Existing version-1 keystores still load after validation. They have independent
random keys and require a backup of that encrypted file and its password.
Creating a new recovery phrase does not back up a legacy wallet. Moving funds
requires an ordinary transaction to the new wallet, not relabelling old keys.

Words are never accepted through command-line arguments. Existing wallet
commands prompt for a hidden password when one is not supplied. The legacy
`--pass` option can expose a password through shell history or process listings;
prefer the prompt. For unattended test tooling, `JGC_WALLET_PASS` is supported.

## Cryptographic boundary

New phrases encode 256 bits from Node's OS-backed cryptographic random source
using BIP39's English wordlist and checksum. ML-DSA key generation also uses
that source and fails rather than falling back to non-cryptographic randomness.
Adding more random generators does not by itself provide more security.

Derivation is versioned: BIP39 with the empty BIP39 passphrase produces a 64-byte
seed; HKDF-SHA512 uses salt `jgc-ml-dsa65-bip39-hkdf-v1` and UTF-8 JSON
`[chainId,index]` as context to derive each 32-byte ML-DSA-65 seed. The local
encryption password is never part of this derivation. This is a JGC scheme,
not a BIP32 derivation supported by Bitcoin or Ethereum wallets.

Compatibility fixture: the public zero-entropy BIP39 vector (23 repetitions of
`abandon`, then `art`), network `jgtc-testnet-v2`, account 0, produces an ML-DSA
public key whose SHA-256 digest is
`af98a9f6cb3a976edc25d32e934302653af8f28fcdbf8f5d30230853e11f07f6`.
This is a public test vector, never a wallet to fund.

Version-2 keystores encrypt the phrase, scheme, network and generated keys using
AES-256-GCM and fixed scrypt parameters. Restore checks keypair consistency
and rederives every account. Mutable seed/key buffers are cleared where possible;
JavaScript strings and runtime copies cannot be reliably erased. A compromised
device can still steal secrets. The scheme and implementation require review.

This does not complete post-quantum security: the pilot's 160-bit address
commitments, proof system and privacy design still need the versioned changes
described in [quantum readiness](QUANTUM-READY.md). Existing networks retain
their own signature/security rules even when displayed in a JGC-branded wallet.

References: [BIP39 specification](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki),
[scure-bip39](https://github.com/paulmillr/scure-bip39),
[NIST PQC standards](https://csrc.nist.gov/projects/post-quantum-cryptography).
