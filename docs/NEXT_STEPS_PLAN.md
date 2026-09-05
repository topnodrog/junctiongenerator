# Junction Generator Next-Steps Plan

**Status:** Execution approved; Phases 1–4 complete. Phase 5 is active. Google
Seed A and independent Fly.io Seed B are healthy on the repaired,
zero-premine `jgtc-testnet-v2` chain. The runner prerelease is published and
the pending node foundations are merged. Measured multi-host soak evidence
and independent-runner recruitment remain incomplete.

**Prepared:** 2026-07-30 · **Last updated:** 2026-09-05 UTC

**Target milestone:** A measured multi-day soak of the public JGTC testnet.

## Recommendation

The next project milestone should be **public-testnet readiness**, not new token,
marketplace, or promotional features.

Repository truth/security, versioned crash-safe storage, the local-model
evaluation, Google Seed A deployment, and independent Fly.io Seed B deployment
are complete. Neither installed model passed the operations safety gate. The
active milestone is Phase 5: recruit known runners and preserve evidence from
the multi-host soak.

## Verified starting point

**Review closeout (2026-09-05 UTC):** PR #46 merged the pending node work,
including release-bundle rehearsal corrections and preservation of the
published v2 difficulty policy. Its six ancestor PRs merged automatically;
duplicate PRs #38 and #43 were closed after implementation comparison.
All 44 node suites / 351 tests passed. PR #47 merged website protections and
truthful demonstration labels. See [website security](WEBSITE_SECURITY.md).
The reviewed public documents are in [docs/public](public/README.md), and the
25 original fundraising/operations revisions were hash-verified and uploaded
to the owner's explicitly approved private repository.

The owner reports two computers with nodes and a third downloading. No measured
soak result is inferred from installation, and three owner-run machines are
not three independent operators.

- Consensus V3, the designated producer, network compatibility checks,
  testnet wallet support, container packaging, and the two-node smoke
  test are merged into `main`.
- Node CI covers Node 20/22/24, Linux, Windows, macOS, the Rust/WASM verifier, and
  the Docker Compose testnet smoke path.
- Website/Worker CI, the production website build, and the Vercel deployment
  are green.
- The Cloudflare Worker and Turso-backed community funnel are deployed.
- The two obsolete draft pull requests are closed.
- GitHub secret scanning, push protection, vulnerability alerts, and Dependabot
  security updates are enabled. A fresh 2026-09-05 request to enable secret
  validity checks still read back disabled; that control remains unavailable.
- Original root drafts remain local and ignored; public copies must come from
  the reviewed canonical sources. See [the publication record](FUNDRAISING_PUBLICATION_PLAN.md).

## Resolved documentation drift

The root README and roadmap were corrected in Phase 1. They now describe
Consensus V3, the no-sale stance, the historical contracts, actual Worker cron
behavior, and the public-testnet gates. Use this file as the active work order.

## Phase 1 — Repository truth and safety baseline

**Completed 2026-07-30.** Repository documentation and public claims were
aligned, obsolete pull requests were closed, supported GitHub security controls
were enabled, and local fundraising artifacts were explicitly kept out of the
public commit.

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

**Completed 2026-07-30.** The node now uses a network-bound storage manifest,
versioned checksum-protected block records, atomic and flushed replacement
writes, deterministic torn-tail recovery, corrupt snapshot quarantine with
full replay, and explicit refusal of incompatible/unversioned state. Recovery,
reset, backup, and restore procedures are documented in
`packages/jgc-node/docs/STORAGE-RECOVERY.md`. The full 30-suite node test run
(286 tests), type-check, and production build pass on the implementation branch.

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
- Incompatible data cannot join the active public network identity.
- Recovery and reset procedures are documented and exercised in CI.

## Phase 3 — Public seed and transport operations

**Local-model decision (2026-08-03):** gemma4:e2b and gemma4:e4b were
benchmarked through Ollama on four sanitized operations scenarios. Both ran
CPU-only and neither passed the safety gate. They may produce non-authoritative
drafts and summaries, but may not receive secrets or decide, approve, execute,
or verify live infrastructure and recovery actions. See
docs/LOCAL_MODEL_BENCHMARK.md.

Do not expose a seed from the owner's laptop or treat a Cloudflare-only pair as
separate failure domains without an explicit owner-approved exception.

**Historical hosting update (2026-07-31):** The owner began creating a Google
Cloud account for the first seed. This planning checkpoint is superseded by the
2026-08-11 rollout update below. The second seed still belongs on a separate
provider or independently operated failure domain.

**Readiness update (2026-08-03):** The project is linked to the intended
free-trial billing account, a CA$25 monthly budget alert is active, the Compute
Engine API is enabled, and the VM/disk/address inventory is empty. Toronto quota
is ample and unused, but Toronto is outside the published Always Free VM
regions. The `us-central1` quota spot-check passed with 200 standard CPUs,
4,096 GB standard disk, 500 GB SSD disk, and eight regional external IPv4
addresses available at zero usage. The auto-mode default VPC has 42 subnets and
broad public ICMP, SSH, and RDP rules, so it will remain unused; the seed design
uses a dedicated custom VPC with public 443 only and OS Login through IAP. A
startup producer probe used 55.8 MiB working set, supporting a monitored
non-preemptible `e2-micro` pilot. The cloud seed coordinates remote compute and
must not host the 6.73-9.43 GB Ollama models. IAM is sufficient, and inherited
policies do not restrict regions or VM external IPv4 addresses. The proposed
two-seed shape, recovery boundary, verified quota, pricing caveats, and
remaining approval gates are recorded in
[`PUBLIC_SEED_DEPLOYMENT.md`](PUBLIC_SEED_DEPLOYMENT.md).

**Rollout update (2026-08-13):** Seed A is deployed in `us-east1-b` and
reachable at `wss://seed-a.junctiongenerator.net`; its HTTPS health check
answers and a fresh external validator/back-checker completed the compatibility
handshake. Seed B is deployed on Fly.io in Toronto (`yyz`) at
`wss://jgc-testnet-seed-b.fly.dev` with an encrypted 10 GB volume. Its Fly
health check passes, private status reports `peerCount: 2` and
`producer.enabled: false`, and a fresh external runner completed the public WSS
compatibility handshake.

**Operations-tooling update (2026-08-13):** A public WSS transport probe, a
structured two-seed readiness evaluator, JSONL evidence history, and explicit
seed-loss/recovery drill instructions are implemented. Authenticated provider
collection confirmed both seeds on `jgc-testnet-v3` at height 0 with two peers
and 1% disk use, the intended producer roles, and valid certificates. Fresh
backups completed on both providers, a bounded log review found no
corruption signatures or peer-guard rejections, and Google's CAD 25 monthly
budget was verified. The remaining work at that checkpoint was the two restore
drills and an external Fly safeguard because Fly does not currently offer
native billing alerts.

**Recovery update (2026-08-13):** Both provider snapshots were restored into
disposable infrastructure and booted as healthy `jgc-testnet-v3` nodes at
height 0 with two peers and the intended producer roles. The Fly temporary
Machine, volume, and app were deleted. The Google drill used a separate
temporary VPC with IAP-only SSH and outbound NAT; its VM, restored disk, NAT,
router, firewall rule, subnet, and VPC were deleted. Both live seeds remained
healthy afterward. A daily GitHub resource-cost guard now enforces Fly's
approved one-Machine, one-volume footprint. Its 90-day read-only repository
secret and scheduled-path workflow were verified, including automatic alert
recovery. The final authenticated readiness result is 23 passes, zero warnings,
and zero failures, completing the Phase 3 gate.

**Purpose:** Deploy the minimum safe network edge after storage is trustworthy.

Planned work:

1. [x] Benchmark the installed local models for repository-aware deployment
   assistance and record their limits. Result: no-go for operations authority;
   sanitized drafting only.
2. [x] Provision the first persistent seed on Google Cloud after verifying quota,
   billing safeguards, region, static address, and persistent disk.
3. [x] Select and provision the second seed in a separate provider or
   independently operated failure domain; record expected recurring cost.
4. [x] Define the two-seed topology and rebuild procedure.
5. [x] Put TLS/WSS ingress in front of Seed A's node transport; keep status
   endpoints private or authenticated.
6. Document firewall rules, advertised addresses, peer limits, upgrades, and
   emergency reset procedures.
7. Add uptime, height, peer-count, producer-health, disk, and error monitoring.
8. Add encrypted backups and a tested restoration procedure.
9. Run adversarial transport tests before publishing seed addresses.

Rollout update (2026-08-13): Seed A's health endpoint answers, and fresh
external validator/back-checkers connected successfully over WSS to both Seed A
and Seed B. The public runner path now dials both seeds by default and is
documented in
[`../packages/jgc-node/docs/RUN-A-NODE.md`](../packages/jgc-node/docs/RUN-A-NODE.md).

Exit criteria:

- At least two monitored seeds can be rebuilt from documentation.
- External nodes connect only through the intended TLS/WSS path.
- Operators can detect stalls, divergence, storage pressure, and repeated peer
  bans without reading raw process logs.

## Phase 4 — Runner visibility and onboarding

**Purpose:** Let a tester understand the network without privileged access.

Planned work:

1. [x] Build an explorer-lite view for height, recent blocks, network identity,
   producer state, and peer-safe aggregate health.
2. [x] Use zero-premine JGTC and direct 144-block epoch settlement instead of
   a genesis-funded faucet. Public balance queries remain read-only.
3. [x] Publish a node-runner guide with supported platforms, hardware
   expectations, Node.js and Docker quick starts, live-seed status checks,
   upgrades, safe defaults, troubleshooting, and recovery links. Ollama is not
   required for the current validator/back-checker role.
4. [x] Clearly document native ARM64 as unsupported until verified in CI.
5. [x] Publish `jgc-node-v0.1.0` with SHA-256 checksum and release notes.
   Published 2026-09-02; later rehearsal hardening merged in PR #46.

Implementation update (2026-08-15): the explorer reads canonical node state,
reports JGTC pending issuance and settlement height, and participant mode
persists an ML-DSA identity whose equal-weight pilot receipts
are committed to blocks and settled by the existing epoch rules. Seed A runs
one anchor participant so the chain advances without external runners. These
receipts record testnet presence, not useful-compute proof. JGTC has a distinct
zero-value genesis, a ten-minute block target, no faucet allocation, and no
spendable supply before settlement. The coordinated seed reset and site
deployment completed on 2026-08-15; block 1 synchronized across both seeds and
an ordinary workstation participant.

Recovery update (2026-08-26): the v1 soak detected repeated settlement
transaction IDs that replaced earlier unspent settlement outpoints. The repair
commits each settlement boundary height into its transaction ID and isolates
the corrected chain as `jgtc-testnet-v2`; both providers retain the v1 data in
recoverable archives. On 2026-09-02 UTC, a fresh public snapshot at height 878
passed ten checks with zero warnings or failures: six settlements, 600-second
recent cadence, contiguous blocks, healthy connectivity, and exact 43,950 JGTC
accounted and expected supply. The only current-epoch participant was the Seed
A anchor, so this is baseline evidence rather than a completed multi-host soak.

Exit criteria:

- A new tester can install, earn JGTC through participation, sync, and diagnose basic
  failures from public documentation.
- Explorer and balance traffic cannot mutate node state.
- Supported operating systems and architectures are evidenced by CI.

**Protocol experiment (2026-08-13):** The repository includes a repeatable,
valueless ten-day ledger prototype with 144-block earning windows and a fixed
24-block settlement delay (nominally 04:00 UTC at the ten-minute target). It
exercises ten ML-DSA wallets, signed UTXO transfers, coinbase maturity, supply
conservation, and final two-wallet consolidation. Block height alone activates
distribution; UTC timestamps are audit labels, so daylight-saving changes
cannot affect consensus. It is not deployed and requires a versioned consensus
decision before replacing the current immediate height-epoch settlement.

## Phase 5 — Closed beta and soak

**Purpose:** Produce operational evidence before a broad public announcement.

Planned work:

1. Recruit a small group of known node runners using the pinned release.
2. Run two junctioning contributors and an independent back-checker across
   real networks for at least 72 hours and three complete settlement cycles.
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

Implemented and merged in PR #47; deployment evidence is recorded in
`api/DEPLOY.md`. The tested current site has no wallet connection flow.

1. [x] Add action/hostname-bound Turnstile checks before public writes.
2. [x] Exercise report-only CSP, then enforce fresh nonces and the tested allowlist.
3. [x] Add route/section retry boundaries.
4. [x] Check desktop navigation and 375/320px phone layouts; correct demo/widget
   overflow and keep form labels and keyboard controls accessible. This is not
   a full assistive-device certification.
5. [x] Keep reward promotion retired; new airdrop enrollment returns 410.
   The midnight cron still sends the digest and does not submit on-chain batches.

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

Historical checkpoints below guided the original rollout. The owner authorized
the remaining engineering, website, documentation work and GitHub merges on
2026-09-05 UTC, and explicitly approved the private document upload. New paid
infrastructure, external outreach, and acceptance of unmeasured soak results
are not implied by that authorization.

1. **Checkpoint A:** repository truth/security changes and disposition of the
   two stale draft PRs;
2. **Checkpoint B:** storage format and recovery design before code changes;
3. **Checkpoint C:** local-model benchmark plus seed-provider, recurring-cost,
   DNS, TLS, monitoring, and backup choices;
4. **Checkpoint D:** closed-beta participants and test window;
5. **Checkpoint E:** evidence review before any public-testnet announcement.

## Next task

Use the already published, checksummed runner release for the 72-hour
multi-host soak on `jgtc-testnet-v2`. Confirm three complete 144-block
settlements, exact balance conservation, seed height convergence, participant
identity continuity, restart recovery, and approved one-seed-loss drills.
Preserve measured evidence so valueless JGTC participation is attributable.
Record owner-controlled hosts accurately and recruit independent participants
and a back-checker before claiming independent operation. Review real incidents
before expansion. The production proof, permissionless production, validator
economics, reproducible signed-artifact, and external-review work remains
tracked in [mainnet readiness](mainnet/README.md); no gate is set true by these
preparatory merges.
