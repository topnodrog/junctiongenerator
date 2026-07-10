# DRAFT — technical deep-dive (not yet wired into the site)

- **Intended slug:** `rescuing-a-compromised-wallet-eip-7702`
- **Status:** draft. Not in `src/lib/blogPosts.ts` yet, so it does NOT publish until you say so.
- **Decision needed before publish:** keep or cut the "Receipts" section at the bottom (real Base tx hashes + contract address). Cutting keeps it consistent with the main post; keeping it gives HN/ethdev verifiable proof.
- **Renderer note:** this uses fenced code blocks. The site's current `BlogPostBody` renderer doesn't support ``` code blocks yet — wiring this in cleanly needs a small renderer upgrade (add code-block handling). Flagged so it's not a surprise.

---

**Title:** Rescuing a Compromised Wallet with an Atomic EIP-7702 Transaction

**Excerpt:** When a wallet's key leaks, attackers now install an EIP-7702 sweeper that eats any gas you send — so the normal recovery is impossible. Here's how I got the funds and contract ownership back with a sponsor-paid, atomic rescue, and the gas-estimation bug that nearly cost me the ownership transfer.

---

## The situation

A private key I controlled leaked. By the time I noticed, the account was not just being drained — it had been *upgraded against me*. Its on-chain code was set to an EIP-7702 delegation pointing at a sweeper contract:

```
code = 0xef0100 || <sweeper address>
```

That `0xef0100` prefix is an EIP-7702 delegation indicator: every call to the account now executes the sweeper's logic in the account's own context. In practice it meant a bot drained any ETH the instant it arrived. I tested with a dust transfer — credited, then zero again within a block.

That single fact breaks the intuitive recovery. You cannot "just send a little ETH for gas and move the tokens to safety," because the account can never hold gas long enough to spend it. The sweeper front-runs you every time, using your own funds.

## Why EIP-7702 is the way out, not just the way in

[EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) shipped in Ethereum's Pectra upgrade. It lets an externally-owned account (EOA) set its code to *delegate* to a contract, via a new transaction type (`0x04`) carrying an **authorization list**. Each authorization is a tuple `(chain_id, address, nonce)` signed by the account's key. Crucially:

1. The authorization can be **included by anyone** — a separate "sponsor" account submits the type-4 transaction and pays the gas.
2. The compromised key can still **sign an authorization**, even though the account can't hold ETH.

So the attacker used 7702 to install a sweeper. I could use the same mechanism to install *my own* delegate for the length of one transaction — and do the rescue before the sweeper ever runs.

## The rescue delegate

The plan: a clean sponsor wallet submits one type-4 transaction that (a) re-delegates the compromised account to a small `RescueDelegate` contract I wrote, and (b) calls `rescue(token, safe)` on it. Because delegated code runs in the compromised account's context, `RescueDelegate` can move the account's token balance and — since that account was the owner of an ERC-20 I'd deployed — hand ownership to a safe wallet, all in one shot.

```solidity
// Runs in the context of the compromised account via 7702 delegation.
contract RescueDelegate {
    function rescue(address token, address safe) external {
        // 1. move the whole token balance out
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) IERC20(token).transfer(safe, bal);

        // 2. move contract ownership out (this account is the owner)
        try IOwnable(token).transferOwnership(safe) {} catch {}
    }
}
```

The sponsor-side transaction, with ethers v6:

```js
// compromised = wallet from the leaked key (signs the authorization only)
// sponsor      = clean, funded wallet that pays gas
const auth = await compromised.authorize({
  address: rescueDelegate,          // delegate target
  // chainId + nonce filled from the compromised account
});

const tx = await sponsor.sendTransaction({
  type: 4,
  to: compromised.address,          // call into the (now re-delegated) account
  authorizationList: [auth],
  data: iface.encodeFunctionData("rescue", [token, safe]),
  gasLimit: 300_000n,               // see the gotcha below — do NOT trust the estimate
});
```

The compromised account never needs a single wei. It only signs the authorization; the sponsor pays. The sweeper's delegation is overridden for this transaction, so it never gets a chance to run.

## The bug that nearly cost me ownership

My first live attempt used an estimated gas limit of about 84.5k. The token transfer succeeded — but the `transferOwnership` call ran out of gas *inside the `try/catch`*, so it silently failed while the overall transaction succeeded. I had my tokens back but the contract was still owned by a dead wallet.

Two lessons, both the hard way:

- **A `try/catch` around a sub-call swallows an out-of-gas in the inner call.** The outer transaction looks successful. Always verify the *effect* on-chain, not just the receipt status.
- **Don't trust gas estimation for delegated 7702 calls that make external calls.** I set an explicit `gasLimit` of 300k and re-ran; ownership moved cleanly in a second transaction.

So the "atomic" rescue was atomic in design but, thanks to that gas under-estimate, actually landed as two sponsored transactions in practice: one that recovered the balance, one that recovered ownership. If I did it again, I'd set a generous explicit gas limit from the start and it would be a single transaction.

## The race you can't fully avoid

The attacker holds the same key. Nothing stops them from broadcasting their own authorization or transactions in parallel — including bumping the account nonce out from under you, which invalidates your signed authorization. Mitigations:

- Pre-sign and submit fast; minimize the window.
- Use a private transaction relay where available so the mempool doesn't telegraph your move.
- Be ready to retry with an updated nonce. I needed a couple of attempts.

## Afterward: verify everything

Recovery isn't done when the transaction confirms. I checked that the old account held zero balance, that ownership was actually the safe wallet, that total supply was untouched, and that there were no rogue minter-authorization events in the contract's history. Only then was the compromised account safe to abandon.

## The real lesson

This worked, and it's a genuinely useful tool if you're ever in this spot. But look at what it took: a custom contract, working knowledge of a months-old transaction type, careful gas handling, and luck in a race against an adversary. Every bit of that was avoidable.

The wallet drainer that starts this whole story only wins if your keys are reachable from an internet-connected machine in the first place. A hardware wallet — keys that never leave the device — would have made the leak impossible. The rescue was a good day at the end of a bad week. Prevention would have been no bad week at all.

*(For the full breakdown of how crypto actually gets stolen and how to defend structurally, see the companion post: How Crypto Actually Gets Stolen.)*

---

## Receipts (OPTIONAL — decide before publishing)

> Keeping this block gives verifiable, on-chain proof — strong for the HN/ethdev
> crowd. Cutting it keeps this consistent with the main post's decision to
> withhold specifics. Note that it ties your identity to the compromised wallet
> and the token. Your call.

- Chain: Base (chainId 8453)
- RescueDelegate: `0x257ae9d8222b2fa36d49d9Be54c08abeaC2fb5A7`
- Tx 1 (tokens): `0xf260fcfa82267773a839fd860dfe158a6421b9b815d7b9bad12ea7eddd1e408f`
- Tx 2 (ownership, after the gas fix): `0x1f4faa4ac5752d4462c4909c4f0852c0d96de9e4ebc63c271405cc15a11f8f7a`
- Safe wallet: `0x3f3e604eA29bfA66d0e6CA07f4B6BCA5e36ce7C8` (already public — the site's donation address)
