# Junction Generator Next-Steps Plan

**Status:** Planning only — no implementation work in this plan has started.  
**Prepared:** 2026-07-30  
**Target milestone:** A small, observable, recoverable public JGC testnet.

## Recommendation

The next project milestone should be **public-testnet readiness**, not new token,
marketplace, or promotional features.

The first substantial engineering epic should be **versioned, crash-safe node
storage and recovery**. Before that epic begins, complete a short repository
truth-and-security pass so contributors are working from accurate documentation
and protected defaults.

## Verified starting point

- Consensus V3, the designated producer, network compatibility checks,
  testnet wallet/faucet support, container packaging, and the two-node smoke
  test are merged into `main`.
- Node CI covers Node 20/22, Linux, Windows, macOS, the Rust/WASM verifier, and
  the Docker Compose testnet smoke path.
- Website/Worker CI, the production website build, and the Vercel deployment
  are green.
- The Cloudflare Worker and Turso-backed community funnel are deployed.
- There are no open GitHub issues. Two older draft pull requests remain open.
- GitHub secret scanning, push protection, and Dependabot security updates are
  currently disabled.
- Root-level fundraising and outreach drafts remain untracked and must not be
  added to the public repository without a deliberate publication review.

## Known documentation drift

The root README is not a reliable work queue yet. It still describes the site
refresh as unmerged, reports the older Consensus V2 milestone, recommends
deploying contracts that are now explicitly marked `DO NOT DEPLOY`, references
a removed Bitmedia component, suggests ignoring files that belong under source
control, and describes the midnight cron as though it performs on-chain reward
dispensing. These items must be corrected before using the README for planning.

## Phase 1 — Repository truth and safety baseline

**Purpose:** Remove ambiguity before public-testnet engineering begins.

Planned work:

1. Update the README to match `main`, Consensus V3, the current grant/donation
   strategy, the deployed Worker behavior, and the actual public-testnet gates.
2. Remove obsolete JGT Market, staking, Bitmedia, and configuration TODOs.
   Preserve the contracts as clearly labeled historical/reference code.
3. Review the two open draft pull requests:
   - PR #11 is based on `junctioning` and appears superseded by the merged
     Consensus V3 work;
   - PR #7 is an older Vercel Analytics proposal and should be compared with
     the analytics support already present on `main`.
   Close or supersede them with a short explanation if confirmed obsolete.
4. Enable GitHub secret scanning, push protection, validity checks, and
   Dependabot security updates where the repository plan supports them.
5. Decide where the untracked fundraising package belongs:
   - approved public facts and brand material may move to `docs/public/`;
   - financial projections and the pitch deck belong in controlled sharing;
   - outreach tactics and operating notes belong in a private repository.
6. Confirm the production values for the public API URL, Discord invite, and
   analytics token in the deployment platform without copying secrets into the
   repository.

Exit criteria:

- README and roadmap agree with the merged implementation.
- No obsolete draft PR remains unexplained.
- Repository security settings are recorded and enabled where available.
- Every local fundraising artifact has an explicit public/private/discard
  disposition; no sensitive material is accidentally staged.

## Phase 2 — Storage hardening

**Purpose:** Make persistent nodes recoverable before exposing them to public
traffic or asking external operators to keep chain state.

Planned work:

1. Specify a versioned on-disk format and a network/consensus compatibility
   manifest.
2. Reject V2 and early-V3 data explicitly with an actionable reset or migration
   message.
3. Make block, UTXO, wallet metadata, and producer-state writes atomic; define
   where flush/fsync guarantees are required.
4. Detect and recover from partial tail writes without accepting ambiguous
   state.
5. Define migration, backup, restore, and rollback rules.
6. Add fault-injection tests for interruption during each persistence stage.
7. Test restart, reorg, corrupted tail, truncated file, incompatible version,
   and backup restoration on Windows and Linux.

Exit criteria:

- A killed node restarts to the last fully committed state.
- Corruption is detected deterministically and never silently accepted.
- Incompatible data cannot join `jgc-testnet-v3`.
- Recovery and reset procedures are documented and exercised in CI.

## Phase 3 — Public seed and transport operations

**Purpose:** Deploy the minimum safe network edge after storage is trustworthy.

Planned work:

1. Define a two-seed topology with separate failure domains.
2. Put TLS/WSS ingress in front of the node transport; keep status endpoints
   private or authenticated.
3. Document firewall rules, advertised addresses, peer limits, upgrades, and
   emergency reset procedures.
4. Add uptime, height, peer-count, producer-health, disk, and error monitoring.
5. Add encrypted backups and a tested restoration procedure.
6. Run adversarial transport tests before publishing seed addresses.

Exit criteria:

- At least two monitored seeds can be rebuilt from documentation.
- External nodes connect only through the intended TLS/WSS path.
- Operators can detect stalls, divergence, storage pressure, and repeated peer
  bans without reading raw process logs.

## Phase 4 — Runner visibility and onboarding

**Purpose:** Let a tester understand the network without privileged access.

Planned work:

1. Build an explorer-lite view for height, recent blocks, network identity,
   producer state, and peer-safe aggregate health.
2. Add a rate-limited testnet faucet service with clear valueless-testnet
   labeling and abuse controls.
3. Expand the node-runner guide with model/Ollama prerequisites, hardware
   expectations, upgrades, backups, recovery, and reset instructions.
4. Add native ARM64 CI or clearly document it as unsupported until verified.
5. Publish a release artifact with checksums and a concise changelog.

Exit criteria:

- A new tester can install, fund a test wallet, sync, and diagnose basic
  failures from public documentation.
- Faucet and explorer traffic cannot mutate privileged node state.
- Supported operating systems and architectures are evidenced by CI.

## Phase 5 — Closed beta and soak

**Purpose:** Produce operational evidence before a broad public announcement.

Planned work:

1. Recruit a small group of known node runners.
2. Run two junctioning contributors and an independent back-checker across
   real networks for multiple days.
3. Exercise restarts, seed loss, reorgs, malformed traffic, slow peers,
   incompatible execution profiles, and backup restoration.
4. Record incidents, resource use, proof/replay outcomes, and operator friction.
5. Fix all consensus, corruption, or recovery failures before expanding access.

Exit criteria:

- The network completes a multi-day run without unexplained divergence or
  unrecoverable state.
- Every observed failure has a documented detection and recovery path.
- Public claims are limited to measured results from the soak.

## Parallel website security track

This work may proceed alongside Phases 2–4, but must not displace the
public-testnet critical path:

1. Add Turnstile to public write forms and verify tokens in the Worker.
2. Introduce Content Security Policy in report-only mode, exercise
   RainbowKit/WalletConnect and analytics, then enforce a tested allowlist.
3. Add route/section error boundaries where a client failure can blank a page.
4. Verify responsive navigation and accessibility against the current site;
   do not carry forward the obsolete “eight-link overflow” TODO without
   reproducing it.
5. Decide whether reward dispensing remains retired with the JGT promotion
   strategy or needs a separate, authenticated operator workflow. The existing
   midnight cron sends the digest; it does not submit on-chain batches.

## Explicitly deferred

- JGT Market deployment or funding.
- JGT staking deployment.
- JGT sales or Bitmedia-driven reward promotion.
- Consensus rewards or slashing before mandatory bonded-validator activation
  and an economics/security review.
- Mainnet planning before public-testnet storage, operations, and soak gates
  pass.
- Broad fundraising publication before the factual, privacy, and audience
  review is complete.

## Approval checkpoints

Implementation should begin only after the owner approves each checkpoint:

1. **Checkpoint A:** repository truth/security changes and disposition of the
   two stale draft PRs;
2. **Checkpoint B:** storage format and recovery design before code changes;
3. **Checkpoint C:** seed-provider, DNS, TLS, monitoring, and backup choices;
4. **Checkpoint D:** closed-beta participants and test window;
5. **Checkpoint E:** evidence review before any public-testnet announcement.

## First task to authorize

When implementation is approved, start with **Phase 1: Repository truth and
safety baseline**. Its output should be one focused documentation/settings PR.
After it merges, begin Phase 2 with a storage-format and recovery design note
plus failing fault-injection tests; implementation follows only after that
design checkpoint is accepted.
