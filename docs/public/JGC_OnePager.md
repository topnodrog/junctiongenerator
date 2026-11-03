> **Historical public brief (2026-09-05; reviewed 2026-11-03).** Retained as
> background only. It describes the retired Google/Fly pilot and an old test
> count; do not quote it as current status. The current shareable one-pager is
> [`JGC_INDEPENDENT_REVIEW_PROGRAM.md`](JGC_INDEPENDENT_REVIEW_PROGRAM.md), and
> current launch state is in
> [`../mainnet/README.md`](../mainnet/README.md). No value-bearing mainnet
> exists; JGTC is valueless; no premine is implemented.

# Junction Generator — project brief

Updated 2026-09-05 UTC. Document owner: James Gordon.

Junction Generator is an open-source research and engineering project exploring
whether useful AI inference can support independently verifiable network work.
The intended product is JGC, a sovereign Proof-of-Useful-Compute network.

## What exists

- A node implementation with local Ollama inference, deterministic reference
  replay, delayed-beacon audit selection, signed quorum evidence, persistent
  chain storage, and post-quantum identity/signature components.
- The early, valueless `jgtc-testnet-v2` pilot (Google Cloud / Fly.io seeds,
  **retired 2026-11-02**), which started with zero spendable supply and created
  JGTC through 144-block settlements. Its signed test receipts recorded
  participation; they were not production proofs of useful computation. The
  current path is provider-neutral and has not been deployed.
- A published [v0.1.0 runner prerelease](https://github.com/topnodrog/junctiongenerator/releases/tag/jgc-node-v0.1.0),
  [node guide](../../packages/jgc-node/docs/RUN-A-NODE.md), and
  [live explorer](https://junctiongenerator.net/testnet).
- On 2026-09-05 UTC, all 44 node test suites / 351 tests passed locally
  (historical). As of 2026-11-03 the suite is 57 suites / 496 tests;
  automated tests are distinct from a measured multi-day field soak and from
  an independent security review.

## Next evidence

The next milestone is a measured multi-host soak with preserved identity,
settlement, convergence, restart, and recovery evidence. Multiple owner-run
computers can support that rehearsal; independent operation must be recorded
separately. Mainnet proof soundness, cross-build determinism, permissionless
production, validator economics, reproducible signed artifacts, and external
security review remain gates. No mainnet date is committed.

## Support the work

Grants, donations, sponsorship of defined work, and paid website/AI-assistant
projects sustain development. There is no token sale and no promise of tokens,
investment returns, equity, or future value for participating or donating.
Legacy JGT contracts are separate from this JGC research and are not promoted.

Contact: [jgordon5240@gmail.com](mailto:jgordon5240@gmail.com)
· [Source](https://github.com/topnodrog/junctiongenerator)
· [Join the community](https://junctiongenerator.net/community)
