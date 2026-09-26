# JGT state verifier and retired rescue tools

The historical wallet-rescue operation is complete. The original JGT deployer
wallet is compromised and **must never be used again**, including to deploy,
sign, authorize, fund, or run recovery actions. `rescue_jgt.js` and
`rescue_7702.js` are intentionally disabled stubs; neither loads a key nor
submits a transaction. `RescueDelegate.sol` is historical source only and must
not be deployed.

Use `verify_jgt_state.js` for **read-only** public state checks. It uses only
`owner()`, supply getters, `balanceOf()`, and `authorizedMinters()`; it never
loads a wallet or reads `.env.rescue`.

```sh
cd tools/jgt-rescue
npm ci
node verify_jgt_state.js
```

To check additional known minter addresses, pass them as command-line arguments
or set `JGT_MINTER_ADDRESSES` to a comma-separated list. `BASE_RPC_URL` and
`JGT_ADDRESS` may point to a trusted RPC and token address. Do not put RPC
credentials in a URL that will be copied into public logs. The script prints
only the RPC host and does not echo provider errors.

A successful read is not a security audit and does not prove that an unseen
minter is absent. Confirm the current owner is a known clean wallet before any
future authorization. Never paste a private key or seed phrase into chat or the
repository.
