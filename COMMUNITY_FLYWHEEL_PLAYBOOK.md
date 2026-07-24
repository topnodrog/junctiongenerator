# JunctionGenerator Community Flywheel

This is the operating manual for the 90-day founding-community campaign.

## The outcome

By day 90:

- 500 people have joined by Discord or email and completed at least one meaningful action.
- USD 25,000 has been received or contractually committed.
- Five community members can independently welcome, host, test, publish, or coordinate.

Do not count Discord joins alone as activation. Do not count meetings, verbal
interest, token speculation, or unsigned pledges as funding.

## Before launch

### Discord

Create a Discord community and a long-lived invite. Set the invite as
`NEXT_PUBLIC_DISCORD_INVITE_URL` in Vercel. Until it is configured, the
community page truthfully uses email as the joining path.

Create these channels:

| Channel | Purpose |
|---|---|
| `start-here` | Mission, honest network status, code of conduct, and three activation choices |
| `introductions` | Skills, interests, and desired involvement |
| `weekly-junction` | Event announcements, recordings, and summaries |
| `build-and-research` | Protocol, AI, verification, and node discussion |
| `contributor-board` | Small tasks with an owner, outcome, and expected effort |
| `show-and-tell` | Member work and recognition |
| `support-jg` | Transparent support, sponsorship, grant, client, and aligned-capital paths |

Create behavior-based roles: Explorer, Builder, Researcher, Operator Candidate,
Connector, Sponsor, and Founding Contributor. Roles and recognition never imply
token value or a financial return.

Pin this introduction prompt:

> What should we call you? Which role fits today? What can you help with—or
> what do you want to learn? Choose one first action you can complete this week.

### Attribution links

Use `/community?utm_source=CHANNEL&utm_campaign=CAMPAIGN`. Give partners and
members a stable `ref` value, for example:

`https://junctiongenerator.net/community?utm_source=member&utm_campaign=week-03&ref=HANDLE`

Use non-sensitive, URL-safe referral labels. Recognition happens only after the
referred person records an activation.

### Backend release

1. Apply `db/schema_community_flywheel.sql` to the existing Turso database.
2. Dry-run and deploy the Worker in `api`.
3. Verify community join, activation, scoreboard, and owner-only endpoints.
4. Deploy the Next.js site after setting the Discord invite.

The public scoreboard contains aggregates only. Email, Discord identity, notes,
and relationship details are never returned publicly.

## The weekly loop (10–15 founder hours)

### Monday — proof and offer (3 hours)

- Choose one proof, open problem, milestone, or contributor story.
- Publish one source asset with a beginner action, builder action, and funding action.
- Update the scoreboard and name one experiment.

### Tuesday — distribution (2 hours)

- Adapt the asset into one X/Farcaster thread.
- Create one short visual or video explanation.
- Submit one native post to Reddit, Hacker News, or a relevant technical community.
- Send the weekly field note.
- Add a GitHub update when technically relevant.

Every link uses source and campaign attribution.

### Wednesday — ten matched outreaches (2–3 hours)

- Four community, podcast, newsletter, meetup, university, or open-source partners.
- Three sponsors, grant programs, or potential customers.
- Three connectors, angels, or aligned investors.

Each request asks for one concrete action: co-host, exchange mentions, review a
demo, sponsor a challenge, commission work, introduce one person, or take a
short call.

### Thursday — Weekly Junction (2 hours)

Run a 45-minute Discord session:

1. 10 minutes: honest build update.
2. 15 minutes: demo or technical discussion.
3. 10 minutes: member showcase.
4. 5 minutes: contributor tasks.
5. 5 minutes: invitation to share, support, sponsor, or introduce.

Publish the recording or summary within 24 hours. Welcome each new member and
point them to one action.

### Friday — improve the system (1–2 hours)

Review joins, seven-day activation, four-week retention, referral activation,
event attendance, funding, founder hours, and cost per activated member by
source. Keep or stop channels based on activated members per founder hour.

If activation is below 40%, simplify onboarding before increasing promotion.
If retention is below 25%, improve recurring activities and contributor paths
before buying reach.

## Weekly operator checklist

Copy this section into the week’s issue:

```text
Week:
Source asset:
Beginner action:
Builder action:
Funding action:
Experiment:

Reach:
Joins:
Activated:
Activation rate:
Four-week retained:
Referral activations:
Contributions:
Partner collaborations:
Funding received:
Funding committed:
Open pipeline:
Growth spend:
Founder hours:
Activated members per founder hour:

Three people/contributions to recognize:
1.
2.
3.

Keep:
Change:
Stop:
Next week’s proof:
Current needs:
```

## Targets by phase

| Period | Cumulative activation target | Weekly emphasis |
|---|---:|---|
| Weeks 1–2 | 40 | Infrastructure and founding cohort |
| Weeks 3–6 | 180 | Weekly publishing and events |
| Weeks 7–10 | 380 | Partners and member referrals |
| Weeks 11–13 | 500 | Best channels and public showcase |

Day 30 requires 100 activated members and first funding. Day 60 requires 280
activated members, three credible funding opportunities, and USD 10,000
received or committed.

## Funding discipline

Guide people through: contribute/share, community support, sponsorship,
client work, defined grants, then aligned investment. Keep each route distinct.

Target mix:

- USD 10,000 client work.
- USD 7,500 sponsorships and grants.
- USD 2,500 community support.
- USD 5,000 from the best validated route.

Reinvest 50% of received funding: 30% content, 25% community operations, 20%
partner collaborations, 15% tools and automation, and 10% controlled acquisition
tests. Never fund a second paid test until the first produces activated members
at a sustainable cost and those members retain.

## Owner API examples

The owner endpoints require `Authorization: Bearer <API_SECRET>`.

Record the weekly scoreboard context:

```json
POST /api/community/weekly-metrics
{
  "weekStart": "2026-07-27",
  "weekLabel": "Week 1 · Founding cohort",
  "reach": 0,
  "founderHours": 0,
  "growthSpendUsd": 0,
  "experiment": "Three-minute onboarding",
  "currentNeeds": ["Builders", "Researchers", "Operator candidates", "Connectors"]
}
```

Record funding without personal details:

```json
POST /api/community/funding
{
  "route": "sponsorship",
  "stage": "committed",
  "amountUsd": 1000,
  "sourceLabel": "Weekly Junction sponsor",
  "nextFollowUp": "2026-08-03"
}
```

Allowed funding stages are `pipeline`, `committed`, and `received`. The public
scoreboard displays only committed and received totals.
