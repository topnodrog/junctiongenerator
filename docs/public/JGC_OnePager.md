# Junction Generator — project brief

Updated 2026-09-05 UTC. Document owner: James Gordon.

Junction Generator is an open-source research and engineering project exploring
whether useful AI inference can support independently verifiable network work.
The intended product is JGC, a sovereign Proof-of-Useful-Compute network.

## What exists

- A node implementation with local Ollama inference, deterministic reference
  replay, delayed-beacon audit selection, signed quorum evidence, persistent
  chain storage, and post-quantum identity/signature components.
- The early, valueless `jgtc-testnet-v2` public pilot, served by Google Cloud
  and Fly.io seeds. It starts with zero spendable supply and creates JGTC
  through 144-block settlements. Its signed test receipts record participation;
  they are not production proofs of useful computation.
- A published [v0.1.0 runner prerelease](https://github.com/topnodrog/junctiongenerator/releases/tag/jgc-node-v0.1.0),
  [node guide](../../packages/jgc-node/docs/RUN-A-NODE.md), and
  [live explorer](https://junctiongenerator.net/testnet).
- On 2026-09-05 UTC, all 44 node test suites / 351 tests passed locally.
  Automated tests are distinct from a measured multi-day field soak.

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

Contact: [james_gordon@junctiongenerator.net](mailto:james_gordon@junctiongenerator.net)
· [Source](https://github.com/topnodrog/junctiongenerator)
· [Join the community](https://junctiongenerator.net/community)
