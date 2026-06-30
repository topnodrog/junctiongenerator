---
name: compromised-wallet-7702-sweeper
description: RESOLVED 2026-06-17 — JGT rescued off the EIP-7702 sweeper wallet; 100M JGT + token ownership now in good wallet 0x3f3e
metadata: 
  node_type: memory
  type: project
  originSessionId: c7461b70-0a40-4c3a-ac85-74348f333355
---

**RESOLVED 2026-06-17.** Rescue succeeded. All 100M JGT and JGT token ownership moved from compromised wallet `0x5f89…91d4` to good wallet `0x3f3e604eA29bfA66d0e6CA07f4B6BCA5e36ce7C8` via two sponsored EIP-7702 txs on Base: tx1 `0xf260fcfa82267773a839fd860dfe158a6421b9b815d7b9bad12ea7eddd1e408f` moved the tokens; tx2 `0x1f4faa4ac5752d4462c4909c4f0852c0d96de9e4ebc63c271405cc15a11f8f7a` moved ownership (tx1 under-estimated gas at 84.5k so the ownership call OOG'd inside a try/catch — fixed by setting an explicit 300k gasLimit). Sponsor/gas wallet `0xE9D25b21a5DF01b6339261AeB36472F2EcDa037e` (a fresh account from the user's good seed, ~0.002 Base ETH). RescueDelegate deployed at `0x257ae9d8222b2fa36d49d9Be54c08abeaC2fb5A7`. Verified: old wallet 0 JGT, owner == good wallet, supply still 100M, zero MinterAuthorized events in history (no rogue minters). The compromised wallet is now empty + harmless — abandon it. Historical detail below.

---

The compromised JGT deployer wallet `0x5f89d06E0D4dBe3C125a49FD9213624aD8a991d4` (Base, chainId 8453) has an **EIP-7702 delegation** installed: its on-chain code is `0xef0100df02e0aa8a707f2b190b355f320ce7d3bc698792`, delegating to sweeper contract `0xdf02e0aa8a707f2b190b355f320CE7d3Bc698792`. A test of 0.00006 ETH (tx `0x457f3c3b9d92d6e90d47058bf5adb9ce8ce72e759af2dcd1bf487e4ee3cf9f14`, block 47463331) confirmed credited but balance returns to 0 — a sweeper bot drains any incoming ETH.

JGT token `0x7Fe2E89075F570ABcCf5451A00Bf780787FEc587` (100M supply, untampered) is still held by this wallet. `tools/jgt-rescue/rescue_jgt.js` (the gas-funding approach) CANNOT work — the 7702 code bounces any ETH out on arrival, so the account can never hold gas.

The viable rescue is `tools/jgt-rescue/rescue_7702.js` + `RescueDelegate.sol` (built 2026-06-17): a CLEAN sponsor wallet pays gas and sends one EIP-7702 type-4 tx that re-delegates the compromised account to our RescueDelegate and calls `rescue(token, safe)` — moving JGT + token ownership to a safe wallet. Compromised wallet needs zero ETH (signs the authorization only). ethers 6.16 `wallet.authorize()` + `authorizationList`/`type:4`; solc 0.8.26 installed in the tool. Dry run validated (auth nonce 6, chainId 8453, delegate compiles to 668 bytes). It's a nonce race vs the attacker who holds the same key; may need retries. Live run gated behind `EXECUTE=1`; needs `SPONSOR_PRIVATE_KEY` (fresh wallet funded ~$3-5 Base ETH).

**Why:** The plain-transfer rescue assumes a normal EOA; this is a 7702-hijacked account. **How to apply:** Don't tell the user to send more gas ETH — it's lost on arrival. Relates to [[leaked-secrets-risk]] and [[project-vision]] (JGT is the compromised token; site already removed JGT widgets).
