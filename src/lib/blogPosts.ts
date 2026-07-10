export interface BlogPost {
  slug: string;
  title: string;
  /** ISO date used for metadata, sitemap, and RSS */
  dateISO: string;
  /** Human-readable date shown on the page */
  date: string;
  readTime: string;
  excerpt: string;
  content: string;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "how-crypto-gets-stolen",
    title: "How Crypto Actually Gets Stolen (and How to Not Be Next)",
    dateISO: "2026-07-10",
    date: "July 10, 2026",
    readTime: "9 min read",
    excerpt: "Most stolen crypto isn't 'hacked' — the owner authorizes it. A protocol engineer breaks down how wallet drainers, romance scams, and approval phishing really work, how to defend structurally, and what I learned clawing a compromised wallet back on-chain.",
    content: `## I build anti-scam infrastructure. I've also had a wallet drained.

I'm a protocol engineer — I design cryptoeconomic systems that are hard to cheat, and I spend my days building Junction Generator, a blockchain whose entire premise is verifiable, honest computation. So it is humbling to admit that I have stood exactly where some of you may be standing right now: watching a wallet I could no longer control get emptied by a bot, in real time.

I got it back. I will tell you how at the end — but the recovery is the least useful part of this article. The useful part is everything that has to happen before you ever need one.

Here is the uncomfortable thesis of this whole piece: **most stolen crypto is not "hacked." It is authorized by the owner.** Nobody broke the cryptography. Somebody clicked approve.

## How the money actually disappears

Forget the hooded-genius-cracking-encryption image. Real crypto theft is overwhelmingly social engineering plus self-signed transactions. A handful of patterns account for the overwhelming majority of losses.

**Romance and "pig butchering" investment scams**

This is the single largest category by dollars lost. A stranger builds a warm relationship over days or weeks — on a dating app, in a "wrong number" text, in a friendly DM. Eventually they introduce a can't-miss trading platform. It shows your balance growing, and early small "withdrawals" even work, to build trust. Then you deposit real money and the withdrawals stop — there is always one more tax, fee, or verification deposit. The US Federal Trade Commission has attributed hundreds of millions of dollars a year to romance-linked crypto fraud. The tell is simple: the opportunity was introduced by a person, not chosen by you.

**Wallet drainers and malicious approvals**

Every ERC-20 token lets you grant a contract an allowance to move your tokens. A drainer site — often a fake airdrop, mint, or "claim" page — asks you to approve, and you sign, frequently granting an unlimited allowance. Then the contract simply calls transferFrom and takes everything. Your wallet was never breached. You signed a transaction that said, in effect: you may take my tokens.

**Seed-phrase phishing and fake support**

Fake wallet apps, lookalike websites, "validate your wallet" popups, and support agents who slide into your DMs the moment you post a problem publicly. They all converge on one goal: get your 12 or 24 recovery words. Burn this into memory — no legitimate wallet or exchange will ever ask for your seed phrase. Ever. Anyone who does is stealing from you.

**Address poisoning and clipboard malware**

The attacker sends tiny transactions from an address that looks almost identical to one you use, seeding it into your history. Later you copy "your" address from that history and paste the attacker's. Clipboard malware does the same thing at the OS level, silently swapping the address the instant you copy it.

**Fake exchanges and withdrawal-fee traps**

A slick platform shows a healthy balance you can never actually withdraw — first you owe a fee, then a tax, then a "liquidity deposit." The balance was always fiction.

## The one thing they all share

Look at that list again. In almost every case, the victim performed the losing action themselves — signed the approval, entered the seed, pasted the address, sent the deposit. That is not a coincidence. Modern crypto theft is designed around the fact that a valid signature from you is indistinguishable from a legitimate one.

Which means you cannot simply be-careful your way to safety. Everyone is careful right up until the one tired evening, the one convincing page, the one message that lands in exactly the right emotional moment. Defense has to be **structural** — arranged so that a single bad click cannot cost you everything.

## The defensive playbook

| Attack | Your structural defense |
| --- | --- |
| Wallet drainer / bad approval | Hardware wallet; approve nothing with your main funds |
| Seed-phrase phishing | Seed lives offline, never typed into any site |
| Romance / pig butchering | No platform introduced by a stranger, ever |
| Address poisoning | Verify the full address; paste from a saved allowlist |
| Fake exchange | On and off-ramp only through regulated exchanges |

Concretely, in priority order:

1. Put anything you are not actively trading in cold storage. A hardware wallet keeps your private keys on a device that never touches the internet, so a malicious website literally cannot extract them. This one habit neutralizes the entire drainer category. If you hold crypto you would be upset to lose, this is not optional.
2. Use a regulated exchange to buy and cash out. Established, audited venues are not glamorous, but they are accountable, insured, and far harder to impersonate than the high-yield platform a stranger sent you.
3. Separate hot and cold. Keep a small daily-driver wallet for minting, testing, and new dapps, and keep the bulk of your holdings in a separate wallet that never signs anything experimental.
4. Revoke approvals regularly. Periodically review your token allowances and set them back to zero. An allowance you granted a year ago to a site that has since been compromised is a door you left standing open.
5. Verify every address and contract, and never approve "unlimited" unless you truly mean it. Check the first and last characters at minimum; better, paste from a saved allowlist rather than from history.
6. Treat your seed phrase as though it is the money itself — because it is. Offline, never photographed, never typed into a website, never shared with "support."

## If it already happened

First, triage: move any still-safe assets from any related wallet to a brand-new one whose seed has never touched a compromised machine. Assume anything reachable by the leaked key is already gone. Revoke approvals if you still can. And do not send more funds chasing a recovery — that instinct is exactly what withdrawal-fee scammers farm.

Now, my story. When a wallet's key leaks today, attackers frequently do more than drain it once. In my case the attacker had installed an EIP-7702 delegation on the account — an on-chain rule that hands the account's behavior to a "sweeper" contract. Any ETH that arrived to pay for gas was instantly swept back out. So the intuitive rescue — send a little gas, then move the tokens to safety — was impossible. The bot ate the gas before I could spend it.

But the account could still sign for itself. So the rescue was this: a clean, unrelated wallet paid the gas, and a single atomic transaction re-delegated the compromised account to a small rescue contract I wrote — which, in that same transaction, moved the tokens and the ownership of a contract I had deployed to a safe wallet. The compromised account never had to hold a single wei; it only signed the authorization. It was a genuine race, because the attacker held the same key and could broadcast too, so it took a precise gas limit and a couple of attempts. It worked. Everything came home.

I am not telling that story to make on-chain rescue sound routine. I am telling it to show you the asymmetry. The rescue took custom contract code, specialized knowledge of a year-old Ethereum feature, and luck in a race against an adversary. The hardware wallet that would have prevented the entire incident costs about the price of a nice dinner.

## Why this is personal

I am building Junction Generator because I believe crypto's future depends on systems you do not have to trust blindly — systems that prove they did the right thing instead of asking you to hope they did. The scams above are the same problem wearing a different mask: they all exploit the gap between what looks trustworthy and what is actually verifiable.

You cannot close that gap with willpower. You close it with structure — cold storage, separation, revocation, and a healthy refusal to trust any opportunity that found you first. Do those few things and you have already defended against the attacks that take down the most people.

If this saved you a single bad click, it did its job. The specific tools I actually recommend — a hardware wallet, and regulated exchanges — are in the partners section below, and if you want more field notes like this one, the newsletter is right there too. Stay skeptical. Verify everything.`,
  },
  {
    slug: "proof-of-useful-compute",
    title: "Proof-of-Useful-Compute: Why Hash Puzzles Are the Wrong Abstraction",
    dateISO: "2026-06-19",
    date: "June 19, 2026",
    readTime: "6 min read",
    excerpt: "Bitcoin burns 150 terawatt-hours a year solving puzzles that produce nothing. AI companies are simultaneously starved for GPU time. PoUC is the bridge.",
    content: `## The Core Waste

Bitcoin's Proof-of-Work is brilliant security design with one fatal flaw: the work is intentionally useless. Miners burn electricity to find a nonce that makes a hash fall below a target — a computation specifically designed to produce no output other than a number. The difficulty exists solely to throttle block production.

The result: the Bitcoin network consumes approximately 150 TWh of electricity per year. That is more than many countries. Every joule of it produces nothing except ledger security.

## The Simultaneous Shortage

On the other side of the same GPU market: AI companies cannot get enough compute. Training a frontier model requires thousands of GPUs running for months. Inference demand is growing 10x annually. Cloud GPU costs run $2–4 per GPU-hour and remain chronically oversold.

The GPUs exist. The electricity exists. They are being pointed at SHA-256.

## The PoUC Proposition

Proof-of-Useful-Compute replaces the hash puzzle with a verifiable AI workload. Instead of searching for a nonce, a Junction Generator miner:

1. Receives an inference workload from the JGC network
2. Runs it on their GPU hardware using a local LLM (via Ollama)
3. Submits the output with a cryptographic commitment
4. Earns $JGC proportional to verified FLOP contribution

The network verifies the work without running it again — and without trusting the miner.

## Why Verification Is the Hard Part

Anyone can claim they ran a workload. The interesting problem is proving it. Junction Generator's current testnet uses deterministic-replay verification: given the same model weights, same sampler seed, and same input, inference is reproducible. Validators can spot-check any block, replay the inference independently, and compare outputs. Cheating requires forging reproducible inference — which is equivalent to running it honestly.

This is not the final word on verification. Zero-knowledge proofs over neural network arithmetic (ZKML) would allow constant-time verification without re-execution. That is a research frontier we are actively tracking. But deterministic replay is a working, deployable primitive today — and it is live on the JGC testnet.

## What This Changes

PoUC is not a marginal improvement on PoW. It is a different premise: compute should earn rewards in proportion to its productive value, not its ability to waste electricity faster than a competitor. If that premise is right, the entire mining economy can be redirected toward AI infrastructure — a multi-trillion-dollar need — rather than toward hashing.

Junction Generator is building the protocol that makes that possible.`,
  },
  {
    slug: "junctioning-layer-1-architecture",
    title: "The Junctioning Layer-1: Architecture of a Useful-Compute Chain",
    dateISO: "2026-06-19",
    date: "June 19, 2026",
    readTime: "8 min read",
    excerpt: "A technical walkthrough of how the JGC Layer-1 block structure, FLOP measurement, and economic reward model fit together in the live testnet.",
    content: `## What Is Junctioning?

Junctioning is the name for the local Layer-1 operation in the JGC protocol. A junctioning node mines blocks by running LLM inference on a locally-served model (currently Gemma 4 via Ollama), measuring the honest compute contributed, and producing a block that commits to the result with full cryptographic traceability.

The word "junctioning" captures the core idea: the miner is a junction point between the world's idle GPU compute and the world's AI inference demand.

## Block Structure

A JGC block contains:

- **Coinbase transaction** — mints fresh $JGC to the miner's address, scaled by verified FLOP contribution
- **Inference commitment** — hash of (model ID, sampler seed, prompt hash, output hash)
- **FLOP attestation** — honest compute measurement derived from real model parameter count, not self-reported
- **Validator set snapshot** — the current quorum configuration for replay challenges

The block header links to the parent block hash and a epoch-level settlement hash, giving the chain standard Nakamoto-style tamper-evidence.

## Honest FLOP Measurement

Self-reported compute is untrustworthy. Junction Generator measures FLOPs from the actual parameter count of the model the miner declares. For a transformer model with P parameters running T tokens of inference, approximate FLOPs = 2 × P × T. This is derived at validation time from the model's published spec — a miner cannot inflate it by claiming more parameters than the model has, because the validator checks the declared model ID against a known registry.

This is an approximation, not an exact proof. It is intentionally conservative and auditable.

## The Verification Model

JGC's verification stack has three layers, each providing a different security guarantee:

**Deterministic Replay** — The base layer. Given the same model, seed, and input, inference is deterministic. Any validator can re-run a challenged block and compare outputs exactly. A miner who fabricates outputs will be caught every time they are sampled.

**Sampling + Slashing** — Validators do not re-run every block (that would eliminate the efficiency gain). Instead, they sample randomly. When a challenge is raised, validators replay the block and vote on whether the output matches. A confirmed mismatch triggers a proportional slash of the miner's stake.

**Multi-challenger Quorum** — No single validator can slash a miner unilaterally. A quorum of independent challengers must agree. This means framing a honest miner requires coordinating a majority of independent validators — economically irrational given slashing exposure for false challenges.

## What Is Live Today

The junctioning Layer-1 went live on 2026-06-18. The current testnet includes:

- Local block production via Ollama inference (Gemma 4 and compatible models)
- Full FLOP measurement from real model parameter counts
- Deterministic-replay challenge infrastructure
- Sampling scheduler with configurable challenge rate
- Multi-challenger quorum with configurable threshold
- Coinbase transaction flow with 16-decimal $JGC precision

The next milestone is P2P sync — connecting multiple junctioning nodes across machines into a shared chain.

## Why This Architecture

Every design decision in the JGC Layer-1 prioritizes deployability over theoretical perfection. Deterministic replay is weaker than a ZK proof — but it is implementable today, auditable, and provides strong economic disincentives against cheating. The sampling model reduces validator load to a manageable fraction of total blocks. The quorum model distributes trust without a trusted third party.

The architecture is designed to be upgraded: the replay verification layer can be replaced with ZKML circuits as that technology matures, without changing the economic or consensus layer.`,
  },
  {
    slug: "collusion-hardened-verification",
    title: "Collusion-Hardened Verification: How JGC Prevents Validator Cartels",
    dateISO: "2026-06-19",
    date: "June 19, 2026",
    readTime: "5 min read",
    excerpt: "A verification system where one validator can slash a miner is a verification system waiting to be extorted. Here is how JGC's quorum model closes that attack vector.",
    content: `## The Single-Validator Problem

Imagine a verification system where any one validator can accuse a miner of submitting false compute, and that accusation automatically triggers a slash. Now imagine you are that validator. You have financial leverage over every miner on the network.

You could demand payment in exchange for not challenging valid blocks. You could collude with a rival miner to slash honest competitors. You could be bribed by a bad actor to cover for genuinely fraudulent compute.

A useful-compute chain with a single-validator challenge model is not a trust-minimized system — it is an extortion machine with a token on top.

## The Quorum Design

JGC's multi-challenger quorum requires agreement from N-of-M independent validators before a slash is applied to a miner. No single validator can trigger a slash unilaterally.

The consequence: framing a honest miner requires coordinating a majority of independent validators who are each risking their own stake on a false challenge. If the challenge fails (because the miner's block is valid), the challengers are themselves slashed.

This creates a symmetric risk structure. Honest miners are protected not by trusting validators, but by making attacks on them economically irrational.

## Why This Matters for Grants and Adoption

Verifiable compute networks fail when they become attack surfaces. The history of oracle networks, staking pools, and validator sets in crypto is full of examples where a small number of colluding actors extracted value from a system that was technically decentralized but practically cartelized.

JGC's quorum model is designed from the start to resist this. The threshold is configurable — testnet runs at a lower quorum to reduce coordination overhead while the validator set is small. As the network grows, the quorum threshold rises, increasing collusion cost proportionally.

## The Slashing Symmetry

One design decision worth highlighting: false challengers are slashed on the same curve as fraudulent miners. A validator who raises a challenge that the quorum does not support loses stake in proportion to the severity of the false challenge.

This means bad-faith challenges are not free. Validators who spam challenges to harass miners, or who attempt to bootstrap a collusion attack, bleed stake in the process. The economic gradient points toward honest behavior for both miners and validators.

## Open Problems

The quorum model solves collusion under the assumption that a majority of validators remain independent. If a single entity controls a majority of validator stake, the quorum degenerates into a single point of failure. This is the standard 51% attack generalized to validators.

Mitigations include: mandatory stake diversity requirements, validator set rotation, and eventually integrating ZK proofs that make replay unnecessary — at which point validator collusion has nothing to collude on, because the proof is self-verifying.

These are active areas of development. The quorum model is not the endpoint; it is the security floor we can deploy today while the harder cryptography matures.`,
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
