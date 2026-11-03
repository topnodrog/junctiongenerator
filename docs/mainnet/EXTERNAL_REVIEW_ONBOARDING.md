# Bringing independent people on board for a real external review

**Problem:** three of the twelve mainnet gates cannot be closed by the owner alone: `independentSecurityReview`, the independent half of `soloSoak`, and `permissionlessProduction` (which needs non-owner block producers). The repository's solo policy is explicit: owner-run multi-node rehearsal is not decentralization evidence. Without outside participants, the terminal safe state is a zero-value canary.

**Goal:** recruit, equip, verify and compensate enough independent people that a *version-specific* external review is possible, then bind their conclusions to the signed gate evidence ledger in [`GATE_CLOSURE_PROTOCOL.md`](GATE_CLOSURE_PROTOCOL.md).

**Owner decisions (2026-11-02):** prepare only (no network started), mixed provider-neutral infrastructure, and a **low-friction public funnel first**. The concrete funnel, copy templates, metrics and issue templates are in [`OUTREACH_PLAN.md`](OUTREACH_PLAN.md); the single entry point is [`REVIEW_PACK.md`](REVIEW_PACK.md) and the forwardable public text is [`docs/public/JGC_INDEPENDENT_REVIEW_PROGRAM.md`](../public/JGC_INDEPENDENT_REVIEW_PROGRAM.md). The proposed premine is **not** a funding source for this program yet — see [`PREMINE_FUNDING_DECISION.md`](PREMINE_FUNDING_DECISION.md).

---

## 1. Four onboarding tracks

| Track | Minimum | Who | What they produce |
| --- | --- | --- | --- |
| A. Independent seed operators | 3 (owner may be 1 of 4, never >1) | Community members, small hosting co-ops, university labs, privacy/crypto meetup groups | Verified host, DNS + TLS, `inventory.json` entry, 30+ days availability evidence, restore drill, signed `soloSoak` evidence |
| B. Protocol / cryptography reviewers | 2, from different organizations | ZK/PQ/privacy researchers, audit firms, academic collaborators | Signed reports on `proofSystem`, `postQuantumSecurity`, `paymentPrivacy`, findings register, re-review after fixes |
| C. Consensus / network / economics reviewers | 2 | Distributed-systems engineers, blockchain auditors, mechanism-design reviewers | Signed reports on `permissionlessProduction`, `validatorEconomics`, `governance`, `deterministicConsensus`, adversarial test proposals |
| D. Independent release rebuilders | 2 | CI/build engineers on different OS/architectures | Two matching rebuilds, SBOM, signed artifact digests, `reproducibleArtifacts` evidence |

Reviewers in tracks B/C/D must not be the author of the code they review, must not be paid per "passed" finding, and must not share an organization with another signer of the same launch record.

## 2. Prerequisites before recruiting (owner work, no outside trust required)

1. Publish a reproducible release bundle: `RELEASE-MANIFEST.json`, checksums, SBOM, pinned compiler/toolchain versions, genesis manifest and a one-command build.
2. Publish a **review pack** per gate: threat model, exact spec, pinned test vectors, known limitations, adversarial test list, and the `GATE_EVIDENCE_REQUIREMENTS` contract. Explicitly mark simulation receipts, placeholder keys and unimplemented privacy.
3. Publish the safe-harbor policy (`SECURITY.md`), a public findings register template, and the disclosure timeline.
4. Stand up the provider-neutral three-seed testnet ([`deploy/selfhosted`](../../packages/jgc-node/deploy/selfhosted/README.md)). No Fly.io, no Google Cloud; each operator brings their own host/DNS/VPS.
5. Publish `launch-policy.json` with the reviewer key format and a `trustedKeys: []` default; verify `npm run infra:guard` and `npm run mainnet:launch -- --assert-blocked` in CI.
6. Freeze a review-specific commit and chain identity. Never ask reviewers to audit a moving target.

## 3. Funnel (weeks are planning windows, not promises)

### Week 1–2 — Publish and invite
- Announce the review program on the site, README, Discord/community channels, relevant academic/crypto mailing lists and direct outreach to 6–10 named reviewers.
- Ask for a short expression of interest: area, affiliation, conflict-of-interest declaration, prior work, availability.
- Publish an FAQ that states plainly: JGC is a zero-value testnet candidate, no token sale, no mainnet value, reviewer reports are public.

### Week 2–4 — Verify and equip
- Verify identity out of band (video call, institutional email, PGP/Web-of-Trust or existing published key). Record only a verification note, never private data.
- Each reviewer generates an offline Ed25519 key, shares the public PEM + fingerprint, and is added to `launch-policy.json` by PR.
- Ship the review pack, a reproducible bundle, `monitor.mjs`, the Compose kit and a scoped test wallet with **zero value**.
- Independent operators bring up seeds B/C; verify TLS, genesis hash, peer authentication, supply conservation and backup restore from `verify.sh`.

### Week 4–8 — Structured review
- Kick-off call: walk through the protocol, the ten open gates and the exact report format.
- Weekly 30-minute sync; all technical discussion in public issues/PRs so findings are auditable.
- Reviewers file findings with severity, reproduction steps, affected commit and suggested remediation. High/critical findings pause the milestone and require a re-review.
- Operators run restart, seed-loss, reorg and real-cadence soak drills; evidence goes to `gate-evidence.json` as signed envelopes.

### Week 8–10 — Remediation and re-review
- Owner fixes findings; each fix carries a test and a linked findings-register entry.
- Reviewers re-review the **new commit** and sign a `no-unresolved-high-or-critical` attestation.
- Release rebuilders reproduce the final artifacts on two independent machines.

### Week 10–12 — Sign and publish
- Each gate gets a signed evidence record; the launch record is signed by ≥2 distinct keys including an independent reviewer.
- Publish reports, findings register, remediation notes, digests and the final `npm run gates:status` output.
- Only then may `independentSecurityReview` be proposed as `true` in a reviewed release.

## 4. What reviewers receive

| Artifact | Purpose |
| --- | --- |
| `RELEASE-MANIFEST.json` + `SHA256SUMS.txt` | Content-addressed file inventory |
| SBOM + pinned toolchain/compiler list | Supply-chain scope |
| Genesis manifest, chain identity, consensus version | Exact review target |
| `docs/mainnet/NODE_SECURITY_REVIEW.md` | Prior findings, fixed and open |
| `docs/mainnet/*DESIGN*.md`, `DETERMINISTIC_CONSENSUS.md`, `PEER_AUTHENTICATION.md` | Construction and acceptance evidence |
| `npm run gates:status` JSON | Machine-readable gate contract |
| `npm run solo-soak`, `release:check`, `proof:registry`, monitor and Compose kit | Reproducible verification |
| Zero-value test wallet + adversarial test checklist | Hands-on testing without funds |
| `SECURITY.md` + findings register template | Safe harbor and disclosure process |

## 5. Compensation and incentives (no pay-per-pass)

**Default for this pass: no-budget fallback.** The owner proposed premining 3–5 weeks of issuance to fund reviews and future bounties. That cannot fund this program today: a premine only has value after the value-bearing network it would help authorize, and paying reviewers in that asset is a conflict of interest. It is an open, reviewed decision, not an implemented allocation ([`PREMINE_FUNDING_DECISION.md`](PREMINE_FUNDING_DECISION.md)). Until separate funds exist, incentives are recognition-based and low-cost:

- A public rebuild/attestation leaderboard by organization (never personal data).
- Co-authored public findings and readiness notes, named with consent.
- A 20-minute "reproduce a chain" workshop and direct access to the protocol authors.
- First access to the review pack and a standing invitation to the weekly sync.
- Zero-friction participation: the [rebuild challenge](../../.github/ISSUE_TEMPLATE/reproducible-build.yml) takes about ten minutes and needs no permission.

If grants, sponsorship or owner funds become available:

- Fixed milestone grants for (1) review pack acknowledgement, (2) filed findings with reproductions, (3) re-review sign-off, (4) 30-day seed availability, (5) independent rebuild attestation.
- Payment is for time and evidence quality, never for a "clean" report. Findings of any severity are equally compensated.
- Publish the funding source before engaging any reviewer. Keep it separate from any token activity; JGT is legacy and not sold.
- A public bug bounty with a clear scope and safe harbor starts only after the reproducible bundle exists. No bounty on a moving, unreviewable target.
- A genesis allocation (premine) requires a new consensus version, new genesis, public disclosure, M-of-N custody and an independent economics review — never a silent balance edit.

## 6. Key management and anti-capture

- Private keys are generated offline, never in the repo, CI, cloud metadata or a hosted secret manager. `scripts/sign-envelope.mjs` signs a local payload file.
- `launch-policy.json` holds public keys + fingerprints only; `infra-guard.mjs` rejects private key material in the deployment kit.
- `threshold >= 2` with ≥1 `independent-reviewer`; no single key can authorize launch.
- Reviewer key IDs in gate evidence must be trusted independent keys in the policy; a self-signed record does not close a crypto gate.
- Key removal, compromise and re-signing procedures are in the gate closure protocol.
- The owner may operate one seed but cannot be the sole producer, sole reviewer, sole rebuilder or sole signer.

## 7. Communication and disclosure

- `SECURITY.md` at the repository root defines reporting channels, response windows, safe harbor and supported versions.
- Findings register: ID, severity, reporter, affected commit, status, fix commit, re-reviewer, disclosure date. Public by default; embargo only for actively exploitable issues with an agreed date.
- Every public claim must match evidence: "zero-value testnet candidate", "independent operator", "reviewed release" and "value-bearing mainnet" are distinct labels. No marketing ahead of evidence.
- After launch, keep the program: continuous bounty, rotating reviewers, annual protocol re-review and re-attestation after any consensus upgrade.

## 8. Definition of success

The onboarding program is complete when:

- [ ] ≥3 independent seeds in ≥3 failure domains have 30+ days of signed availability and restore evidence.
- [ ] ≥2 independent crypto reviewers and ≥2 consensus/network/economics reviewers have published signed, version-specific reports.
- [ ] ≥2 independent rebuilds match byte-for-byte with published SBOMs.
- [ ] All high/critical findings are fixed, re-reviewed and publicly disclosed.
- [ ] `deploy/selfhosted/gate-evidence.json` has signed, artifact-bound records for all 12 gates.
- [ ] `launch-policy.json` has ≥3 distinct trusted keys from ≥2 organizations, and a launch record with threshold signatures.
- [ ] `npm run mainnet:launch` reports `ready: true` for a published release commit.

If independent reviewers or operators cannot be recruited, do not rebrand the owner-only network. Keep it a zero-value canary and say so.
