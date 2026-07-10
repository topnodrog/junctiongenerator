# Distribution kit — "How Crypto Actually Gets Stolen"

Post URL (goes live once `junctioning` is merged to `main` and Vercel deploys):
**https://junctiongenerator.net/blog/how-crypto-gets-stolen**

> Before posting anywhere: make sure the post is actually live at that URL. Then
> stagger the channels over a day or two — don't blast all at once. Once the
> Cloudflare Analytics token is set, watch which referrer actually converts and
> double down there.

---

## 1. X / Twitter thread

Copy tweets one at a time. Each is under 280 chars. Trim to taste.

**1/**
Most stolen crypto isn't "hacked."
The owner signs it away.

I build anti-scam infrastructure for a living — and I've still watched a bot drain a wallet I controlled, in real time.

Here's how crypto actually gets stolen, and how to not be next. 🧵

**2/**
The uncomfortable truth: nobody broke the cryptography. Somebody clicked "approve."

A valid signature from you is indistinguishable from a legitimate one. Modern theft is built entirely around that fact.

**3/**
The biggest category by dollars isn't technical at all.

Pig butchering / romance scams: a stranger builds trust over weeks, points you to a "trading platform" showing fake gains. Deposits are real. Withdrawals never come.

Tell: the opportunity found YOU.

**4/**
Wallet drainers.

A fake airdrop/mint page asks you to "approve." You sign — often an unlimited allowance. The contract calls transferFrom and takes it all.

You weren't breached. You authorized it.

**5/**
Seed-phrase phishing.

Fake wallet apps, "validate your wallet" popups, support agents who DM you the second you post a problem.

One rule, no exceptions: no legit service will EVER ask for your seed phrase.

**6/**
Address poisoning + clipboard malware.

The attacker seeds your history with a lookalike address, or silently swaps what you copied. You paste "your" address — it's theirs.

Verify first + last characters. Better: paste from a saved allowlist.

**7/**
The thread connecting all of them: you performed the losing action yourself.

So "just be careful" is not a strategy. Everyone is careful until the one tired evening. Defense has to be structural.

**8/**
The structural defense, in priority order:

• Hardware wallet for anything you're not actively trading
• Regulated exchange for on/off-ramps
• Separate hot + cold wallets
• Revoke old token approvals
• Seed phrase offline, always

**9/**
"But what if it already happened?"

When a key leaks, attackers now install an EIP-7702 delegation — a sweeper that auto-drains any ETH you send for gas. So the obvious rescue (send gas, move tokens) is impossible. The bot eats the gas first.

**10/**
How I got mine back:

A clean wallet paid the gas. One atomic tx re-delegated the compromised account to a rescue contract I wrote, which moved the tokens + contract ownership out in the same tx. The account only had to sign — never hold a wei.

It's a nonce race. It worked.

**11/**
The asymmetry is the whole point: the rescue took custom contract code, a year-old Ethereum feature, and luck in a race against the attacker.

The hardware wallet that would've prevented it costs about a nice dinner.

**12/**
Full breakdown — every attack pattern + the defense playbook:
https://junctiongenerator.net/blog/how-crypto-gets-stolen

I write these because I'm building verifiable, trust-minimized systems at Junction Generator. Stay skeptical. Verify everything.

---

## 2. Hacker News

**Do NOT use "Show HN."** That's for things people can run or try; a blog post is a
normal link submission. HN also dislikes clickbait titles — keep it factual and
lead with the technical angle (the EIP-7702 rescue), which is what HN actually
upvotes. The intro-level scam advice alone won't catch there; the war story will.

**Title (pick one):**
- How EIP-7702 is used to drain compromised wallets — and to rescue them
- Sweeper bots, EIP-7702, and clawing back a compromised wallet

**URL:** https://junctiongenerator.net/blog/how-crypto-gets-stolen

**Suggested first comment (post it yourself right after submitting — HN norm):**

> Author here. I build cryptoeconomic systems (currently a proof-of-useful-compute
> L1), and a while back the key to a wallet I controlled leaked. The attacker had
> installed an EIP-7702 delegation that auto-swept any ETH sent to the account, so
> the usual "send a little gas, then move the funds" recovery was impossible — the
> sweeper front-ran the gas every time.
>
> The rescue was a single atomic type-4 transaction: a clean sponsor wallet paid
> gas, re-delegated the compromised account to a small rescue contract, and moved
> the tokens + contract ownership out in the same call. The compromised account
> only signed the authorization; it never held a wei. It's a nonce race against the
> attacker who holds the same key, so it took a precise gas limit and a couple of
> tries.
>
> The post is broader than the rescue — it's really about how most crypto theft is
> self-authorized (approvals, seed phishing, romance scams) and why defense has to
> be structural rather than vigilance-based. Happy to go deeper on the 7702
> mechanics.

**Timing:** weekday, ~8–10am ET. Don't ask for upvotes (fastest way to get flagged).
Reply to every substantive comment.

---

## 3. Reddit

Reddit punishes pure link-drops and self-promo. Lead with genuine value in the
body; put the link at the end as "I wrote the full version up here." Check each
sub's self-promotion rule (many enforce ~9 contributions per 1 self-post).

**r/CryptoCurrency or r/CryptoScams**
Title: Most stolen crypto isn't "hacked" — it's authorized by the owner. How the money actually disappears, and how to defend structurally.

Body: paste tweets 2–8 rewritten as prose (the attack patterns + the defense
playbook), then: "Full write-up, including how I recovered a compromised wallet
on-chain: [link]."

**r/ethereum or r/ethdev** (lead with the technical angle)
Title: Recovering a compromised wallet with an atomic EIP-7702 rescue

Body: the mechanics from the HN first comment above, then the link. This audience
cares about the 7702 detail, not the scam-awareness framing.

---

## 4. Farcaster

Crypto-native and technical — lead with the 7702 rescue, skip the intro advice.

**Cast 1:**
Most stolen crypto isn't hacked — the owner signs it away. I build anti-scam infra and still had a wallet drained by a sweeper bot.

Wrote up how theft actually works + how I clawed it back with an atomic EIP-7702 rescue:

**Cast 2 (reply):**
The trick: a key-leaked account with a 7702 sweeper eats any gas you send it. So a clean wallet pays gas and one atomic tx re-delegates the account to a rescue contract that moves everything out in the same call. Nonce race, but it works.

https://junctiongenerator.net/blog/how-crypto-gets-stolen

---

## Newsletter blurb (for the next send)

Subject: How crypto actually gets stolen (and how I got a drained wallet back)

Body: Most stolen crypto isn't hacked — the owner authorizes it. New post breaks
down the real attack patterns (romance scams, wallet drainers, seed phishing,
address poisoning), a structural defense playbook, and the on-chain EIP-7702
rescue I used to recover a compromised wallet. Read it: [link].
