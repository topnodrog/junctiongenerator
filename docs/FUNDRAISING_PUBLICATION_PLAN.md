# Fundraising Content Publication Plan

**Status:** Classification decision recorded 2026-07-30; no fundraising files
have been moved, published, or deleted by this plan.

The repository currently contains tracked fundraising material under `vault/`
and newer, untracked revisions at the repository root. The root revisions are
not byte-for-byte duplicates of the vault copies. The root files remain local
and untracked. Before consolidating them, review the newer text for factual
accuracy and apply the audience decision below.

## Public repository and website

These documents support building in public and can become canonical public
materials after a factual and claims review:

- `JGC_OnePager.md`
- `JGC_TeamBios.md`
- `JGC_UseCases.md`
- `JG_Logo_Guidelines.md`

Proposed canonical source location: `docs/public/`. Website downloads should be
generated from or link to those canonical sources instead of keeping another
editable copy under `public/`.

Review gates before publication:

- distinguish deployed software, local demonstrations, and future targets;
- verify every testnet, pilot, performance, partner, and traction claim;
- ensure the funding ask matches the current grants/donations strategy;
- remove personal contact details that are not intentionally public;
- add an updated date and document owner.

## Controlled sharing or data room

These are useful to grant reviewers or serious funding conversations, but they
need assumptions and context and should not be treated as general website copy:

- `JGC_FinancialProjections.md`
- `JGC_Funding_Pitch.pptx`

Proposed canonical location: a private fundraising repository or data room.
Publish a summarized funding-use section on the website only after the full
model has been reviewed.

## Internal operating material

These documents describe outreach tactics, investor handling, internal
workflows, or revenue operations. Keep their canonical copies in a private
operations repository:

- `FUNDRAISING_ACTION_PLAN.md`
- `OUTREACH_EMAIL_TEMPLATES.md`
- `PITCH_NARRATIVES_BY_INVESTOR.md`
- `VISIBLE_SETUP_GUIDE.md`
- `WEEK1_QUICK_REFERENCE.md`
- `WEBSITE_GROWTH_PLAN.md`

Some versions of these documents are already tracked in the public `vault/`.
Moving future canonical copies to a private repository does not erase their Git
history; decide separately whether historical cleanup is warranted.

## Consolidation sequence

1. Review the root revision against its corresponding `vault/` copy.
2. Select the root revision, vault revision, or a merged revision as canonical.
3. Complete the factual and privacy review appropriate to its audience.
4. Move public sources to `docs/public/` and private sources to a separate
   private repository or data room.
5. Remove duplicate working copies only after the canonical versions are safely
   stored and reviewed.
