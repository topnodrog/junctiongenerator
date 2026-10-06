# Legacy JGT Base faucet

**Status:** implementation draft only. The minting dispenser has not been
compiled, independently reviewed, deployed, or authorized on Base. The website
keeps claim actions inactive until
`NEXT_PUBLIC_JGT_DISPENSER_ADDRESS` and
`NEXT_PUBLIC_JGT_DISPENSER_CODE_HASH` point to the reviewed deployment and
`NEXT_PUBLIC_JGT_CLEAN_OWNER_ADDRESS` names the independently verified clean
current token owner.

This is a giveaway of the legacy JGT ERC-20, separate from JGTC (the valueless
JGC testnet coin). It is not a sale or an investment offer.

## Proposed on-chain behavior

- Token address: `0x7Fe2E89075F570ABcCf5451A00Bf780787FEc587` on Base mainnet; verify
  the address, bytecode, owner, supply, and minter state on-chain before use.
- The dispenser mints **2 JGT for the first successful claim**, then **2 JGT per
  completed 24-hour period**. Unclaimed periods accumulate, and partial-day time
  carries forward. Visiting the page or connecting a wallet does not start
  accrual. **Open policy mismatch:** the implementation grants the first 2 JGT
  immediately; confirm whether that one-time bonus is acceptable under the
  requirement of 2 JGT per completed 24-hour interval before any activation.
- At construction, the dispenser snapshots the token's then-current
  `remainingSupply()` as its immutable `mintCap`. It cannot mint more than that
  allotment, and the token still enforces its global maximum supply. If the
  verified on-chain state at deployment really has 900 million JGT remaining,
  the faucet's cap will be 900 million JGT. **That amount is not assumed by the
  code or verified by the currently available read.**
- The token's remaining supply is global. Any other authorized minter or the
  token owner can consume it; if that happens, the dispenser's available amount
  falls accordingly and it cannot mint beyond the token's hard cap. Review and
  resolve the on-chain minter list before authorizing this dispenser.
- The dispenser has no owner, withdrawal, or pause function. It can call the
  JGT token's `mint()` only after the token contract's current owner authorizes
  the dispenser as a minter. A clean token owner can later revoke that
  authorization. The dispenser itself does not grant or control that
  authorization.
- `claim()` mints the connected wallet's currently available whole 2-JGT
  periods. `claimWithSig()` allows a one-use EIP-712 authorization for a relayer
  to submit; EOA signatures use `ecrecover`, contract wallets can use EIP-1271,
  and the signature binds the exact JGT amount, nonce, expiry, and optional
  relayer. It cannot move other assets.
- A wallet is not a person: multiple wallets can bypass a per-wallet limit.
  There is no proof-of-humanhood, bot resistance, or per-person limit. The cap
  protects total token supply, not fairness or the speed at which the supply is
  claimed.

## Three future ad slots

The page includes three separate 30-, 45-, and 60-second ad placeholders. For
now, clicking one only displays **“You can be advertising here”** and awards no
JGT. The `AD_SLOTS` list in `src/components/JGTClaimFaucet.tsx` makes a same-origin
MP4/WebM creative straightforward to insert.

The planned reward is 1 JGT per successfully completed ad, but a browser video
`ended` event or button click is not proof that a real person watched an ad.
Do not enable payments from client-only playback. A real ad launch needs a
server/provider-verified completion flow, replay protection, abuse controls,
and a reviewed way to authorize the exact one-JGT reward on-chain.

## Gas and deployment cost

“2 Gwei” as an ETH amount is `0.000000002 ETH`, not 2 ETH. At the BaseScan gas
price observed during the initial review (0.005 Gwei), that amount would cover
only about 400 units of gas before any L1 data fee—far below contract
deployment. If “2 Gwei” means a gas-price quote, it is not a balance; transaction
cost is the gas used multiplied by the fee per gas, plus Base's L1 data fee.

There are at least two distinct deployment transactions: deploying the
contract, and having the JGT token's current owner authorize it as a minter.
Both need a funded, uncompromised sender. Later, a direct claimant can pay their
own claim gas, or a relayer can pay after receiving the signed request. The page
shows a fee estimate; the connected wallet's final transaction screen is the
source of truth because L1 data fees and wallet settings can change the total.
No wallet seed phrase or private key is requested by the site.

## Mandatory clean-owner security gate

The original JGT deployer wallet is compromised and **must never be reused** for
deployment, token-owner authorization, funding, or any other action. Do not
load its key into a script, wallet, environment variable, or relayer.

The repository records that JGT was rescued to a clean wallet, but this draft's
read-only RPC attempts could not verify the token's current `owner()` or
`authorizedMinters()` state. A BaseScan creator address or historical
`Authorize Minter` transaction does not prove current ownership or current
minters. Before any deployment or activation:

1. Independently read the token's current `owner()`, `totalSupply()`,
   `remainingSupply()`, and relevant `authorizedMinters()` values from a trusted
   Base RPC / explorer, and verify the token bytecode matches the reviewed
   source.
2. Confirm that the current owner is a known clean, uncompromised wallet under
   the owner's control. If that cannot be proven—or if it is still the
   compromised original wallet—**stop**. Do not try to recover or authorize
   using the compromised key.
3. Review the current authorized-minter list and revoke any untrusted minter
   only from that verified clean owner. Confirm no other minter is expected to
   consume the faucet's global supply allotment.
4. Have an independent Solidity reviewer inspect the new minting contract,
   including its immutable cap, carry-forward accrual, signature checks,
   reentrancy guard, and lack of admin/recovery paths. Run unit, fuzz, and
   testnet tests before mainnet use.

If a clean on-chain owner is unavailable, the existing token cannot safely
authorize this faucet. A new contract deployer wallet alone cannot grant itself
minter rights. No live minting faucet should be represented as ready.

## Review and activation checklist

Do not put a real dispenser address in production until all security gates above
are satisfied:

1. Compile and test `contracts/JGTClaimDispenser.sol` against the exact JGT token
   ABI and bytecode. The deployment constructor reads the verified token's
   current `remainingSupply()` and uses it as the faucet's hard allotment.
2. Deploy from a fresh, hardware-backed, funded wallet that is not the
   compromised original deployer. Pass only the verified JGT token address as
   the constructor argument. Deployment costs gas; 2 Gwei of ETH is nowhere
   near enough.
3. Verify the dispenser source, constructor argument, immutable token address,
   and `mintCap` on BaseScan. Independently compute `keccak256` of the deployed
   runtime bytecode. The hash is deployment-specific because the token address
   is immutable; with the repo's `ethers` dependency installed, for example:
   ```sh
   DISPENSER_ADDRESS=0x... node --input-type=module <<'NODE'
   import { JsonRpcProvider, keccak256 } from "ethers";
   const rpc = new JsonRpcProvider(process.env.BASE_RPC_URL || "https://mainnet.base.org");
   const code = await rpc.getCode(process.env.DISPENSER_ADDRESS);
   if (code === "0x") throw new Error("No contract bytecode at that address");
   console.log(keccak256(code));
   NODE
   ```
4. From the **verified clean current token owner**, authorize the dispenser with
   `authorizeMinter(dispenserAddress, true)`. Never use the compromised original
   deployer wallet. Verify the transaction and then read back
   `authorizedMinters(dispenserAddress) == true` and the current owner.
5. Confirm the dispenser reports the expected token, initial mint cap,
   remaining faucet allotment, and claimable calculations. Test direct and
   signed claims with a small, disposable test deployment before activation.
6. Set `NEXT_PUBLIC_JGT_DISPENSER_ADDRESS`,
   `NEXT_PUBLIC_JGT_DISPENSER_CODE_HASH`, and
   `NEXT_PUBLIC_JGT_CLEAN_OWNER_ADDRESS` in the website host's build-time
   environment, then deploy the frontend. Before every claim flow, the page
   checks the configured runtime hash and token address through the connected
   Base wallet and requires the live token owner to equal that independently
   verified clean-owner address. It also reads minter status and disables claims
   if the owner is the known compromised original deployer or differs from the
   configured clean owner.

Leaving any required environment variable blank intentionally keeps claim
actions inactive. Deploying or publishing the website does not itself deploy the
contract or grant minter authorization.

## Sponsored claims and proposed bounty

A relayer can receive a signed JSON request from the page and submit
`claimWithSig()`. The on-chain call still costs the relayer Base ETH. Bind the
authorization to the sponsor's address when possible; an unbound
(`address(0)`) request may be submitted by any account, though the JGT still goes
only to the signer.

`scripts/relayer/submit_jgt_claim.mjs` is an opt-in submitter. It defaults to
validation/fee estimation; broadcasting requires an explicit `--broadcast`,
`RELAYER_PRIVATE_KEY`, `JGT_DISPENSER_CODE_HASH`, and
`JGT_CLEAN_OWNER_ADDRESS` supplied by the operator through its own environment.
Before estimating or broadcasting, it checks the Base chain, exact reviewed
runtime-code hash, token address, exact configured clean token owner, active
minter state, signature, nonce, and claim cap. It refuses the
compromised wallet as recipient, bound relayer, token owner, or transaction
sender. Do not commit a relayer key or paste it into the website.

The proposed **10,000 JGT gas-sponsor bounty** is not escrowed or guaranteed.
The owner must publish final eligibility and completion terms and create a
separately verifiable escrow before anyone fronts ETH in reliance on it. JGT is
not gas and has no guaranteed market value.
