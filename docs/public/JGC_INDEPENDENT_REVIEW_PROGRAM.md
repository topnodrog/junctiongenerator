# Join the JGC independent review program

*Short version you can forward. Last updated 2026-11-02.*

**Junction Generator is building a proof-of-useful-compute network. Today it is a zero-value testnet candidate.** There is no value-bearing JGC mainnet, no token sale, and no claims of decentralization. JGT is a legacy Base token we do not sell or promote. We publish exactly what is blocked and why.

We are looking for independent people to help make an external security review possible. You do not need permission, an account with us, or a large time commitment to start.

## Three ways to help

1. **Reproduce the release (about 10 minutes).** Build the pinned `jgc-node` release on your own machine and post two SHA-256 digests using our rebuild issue template. A mismatch is a useful finding, not a failure. Two independent matching rebuilds are required before we can call our artifacts reproducible.
2. **Run one independent seed.** Bring your own host, DNS name and TLS certificate — own hardware, a home lab, or any VPS provider you choose. We do not use Google Cloud or Fly.io, and no shared cloud token or credential is needed. Config, firewall rules, a backup script, a verification script and a dependency-free monitor are in the repository. Thirty days of availability evidence is a real contribution.
3. **Review one specific gate.** Consensus determinism, peer authentication, post-quantum proofs, shielded payments, validator economics, governance and useful-work settlement each have a published, machine-readable acceptance contract. Pick one, reproduce an assumption, and file a finding with a reproduction.

## What you get

- A reproducible release bundle with a content-addressed manifest and checksums.
- A published threat model and a security review listing both fixed and open findings.
- A zero-value test wallet and adversarial test checklist — no real funds, no private keys, no other people's data.
- A safe-harbor policy and a public findings register. Findings of every severity are welcome.
- Your signed attestation recorded as verifiable gate evidence, if you choose to provide one.

## What we will not do

- Ask you to sign anything before you have reproduced something.
- Pay for a "clean" report or tie any compensation to a conclusion.
- Call the network "launched", "secure" or "decentralized" before independent evidence exists.
- Use a hosted model, cloud IAM role or owner-only attestation as evidence.
- Add a genesis allocation (premine) silently. The current chain has no premine; a 3–5 week allocation has been proposed and is explicitly under review, not implemented.

## Start here

- Repository: `topnodrog/junctiongenerator`
- Review pack: `docs/mainnet/REVIEW_PACK.md`
- Current gate status (JSON): `docs/mainnet/gate-status.json`
- Launch plan: `docs/mainnet/LAUNCH_PLAN.md`
- Gate closure protocol: `docs/mainnet/GATE_CLOSURE_PROTOCOL.md`
- Security policy / safe harbor: `SECURITY.md`
- Provider-neutral deployment: `packages/jgc-node/deploy/selfhosted/README.md`

Open a GitHub issue using **"Join the independent review program"** or **"Reproducible build challenge"**, or report a vulnerability privately through a GitHub security advisory.

Our terminal safe state, if independent reviewers and operators do not materialize, is a clearly labeled zero-value canary — not a value-bearing mainnet. We would rather say that honestly than launch something unsafe.
