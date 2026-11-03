# Funding decision record: proposed 3–5 week premine

**Raised by owner:** 2026-11-02 — *"When the mainnet is deployed I am hoping about 3–5 weeks can be pre-mined; some of the premine will go for this [reviewer/operator onboarding] and some held in case future bug bounties need to be paid."*

**Decision for this pass:** **not implemented, not approved, not encoded in consensus.** This pass was explicitly scoped to *prepare only*, and a premine is a consensus/economics change with security, governance and disclosure consequences. It is recorded here as an open decision that must be resolved before `validatorEconomics` or `governance` can close.

---

## 1. What the proposal actually means

"3–5 weeks pre-mined" is not a period of mining before launch; it is a **genesis allocation equal to 3–5 weeks of era-0 issuance**. From `src/consensus/emission.ts`: 50 JGC/block × 144 blocks/day = **7,200 JGC/day** at era 0.

| Window | Blocks | Allocation | Share of 21,000,000 JGC cap |
| --- | --- | --- | --- |
| 3 weeks (21 days) | 3,024 | **151,200 JGC** | 0.72% |
| 4 weeks (28 days) | 4,032 | **201,600 JGC** | 0.96% |
| 5 weeks (35 days) | 5,040 | **252,000 JGC** | 1.20% |

Verified against `getCumulativeSupply()` on the current build.

## 2. Why this cannot be a silent change

The repository and the running pilot repeatedly state **zero premine**:

- `src/network/public-testnet-api.ts` reports `preminedJGTC: "0"` and `genesisSpendableSupplyJGTC: "0"`;
- `docs/mainnet/README.md`, `README.md`, `deploy/README.md` and the explorer UI all assert zero-premine, conserved supply;
- `src/tests/*` pin supply conservation and the genesis state;
- the `validatorEconomics` gate requires issuance, fees, bonds, rewards, slashing and activation heights to be *specified and tested*;
- the `governance` gate requires accountable proposals, budget controls and versioned upgrades.

A genesis allocation would make every one of those claims false until code, tests, docs, explorer, genesis manifest and external review are updated. Adding a balance to genesis without a versioned consensus change is exactly the kind of silent supply edit the launch guard exists to prevent.

**Launch rule (unchanged):** if a consensus defect is found before economic activation, abandon the chain ID and create a new reviewed genesis. After activation, use a versioned consensus upgrade; never rewrite history.

## 3. Circular-incentive problem

A premine only has value *after* a value-bearing network exists. Using it to pay for the independent review that authorizes the value-bearing network is circular and creates a conflict of interest: reviewers would be paid in an asset whose existence depends on their own sign-off. Reviewer grants, operator reimbursement and the reproducible-build challenge must be funded **before and independently of** the launch decision — from grants, donations, sponsorships, paid client work, or existing owner funds (fiat/stablecoin), as the project's funding stance already describes. JGT is legacy and is not sold or promoted.

A future **fee-funded** or **treasury-funded** bounty pool after activation is a separate, governable mechanism; it still needs a public policy, safe harbor and M-of-N custody.

## 4. Required conditions if the owner proceeds

1. **New consensus version + new genesis / chain ID.** Never edit `jgc-mainnet-v3` genesis in place. Publish a genesis manifest that includes the allocation and its hash.
2. **Public specification before implementation.** Exact amount, purpose split (review grants / bounty reserve), recipients or eligibility, vesting/timelock, custody, and what happens to unspent reserves.
3. **No discretionary owner control.** Threshold (M-of-N) custody with independent signers, on-chain timelock, and no mint/upgrade key that can create more supply. This is a `governance` acceptance test, not a promise.
4. **Conservation tests.** Update `preminedJGTC`, `genesisSpendableSupplyJGTC`, `expectedSupplyJGTC` and `supplyConserved` in `public-testnet-api.ts`, plus adversarial tests for double allocation, premature spend, timelock bypass and unexpected inflation. Add these to the `validatorEconomics` evidence contract.
5. **Independent economics and security review** of the allocation, custody and bounty governance, with no unresolved high/critical findings. Add to the `independentSecurityReview` evidence.
6. **Public disclosure before activation**: amount, allocation table, custody keys (public keys/fingerprints only), vesting schedule, bounty rules, tax/legal review for Ontario/Canada, and a plain-language statement that the network is **no longer zero-premine**.
7. **Re-run Phase 3 (resecure)** against the final release diff, including reproducible rebuilds with the new genesis manifest.
8. **Do not market the premine as "pre-mining" or imply it was earned through useful work.** It is an allocation.

## 5. Alternatives that preserve the zero-premine invariant

| Option | Pros | Cons |
| --- | --- | --- |
| Grants / sponsorships / client work (current funding stance) | No consensus change, no conflict of interest, available before launch | Requires fundraising effort |
| Milestone grants paid in fiat/stablecoin from owner funds | Simple, reviewers independent of JGC value | Owner-funded; disclose it |
| Post-activation fee-funded bounty reserve | Aligned with network usage, governable | Only exists after launch; needs governance spec |
| Public bug bounty funded by a sponsor, escrowed before launch | Independent, no premine | Needs a sponsor and safe-harbor policy |
| Premine (owner proposal) | Creates an immediate budget | Breaks zero-premine, needs new genesis, external review, disclosure, custody; highest risk |

## 6. Recommended path

1. Keep the `validatorEconomics` and `governance` gates blocked with an explicit open decision: *"genesis allocation: yes/no, amount, custody, disclosure"*.
2. Run the low-friction reviewer/operator funnel in [`OUTREACH_PLAN.md`](OUTREACH_PLAN.md) using the no-budget fallback in [`EXTERNAL_REVIEW_ONBOARDING.md`](EXTERNAL_REVIEW_ONBOARDING.md).
3. After independent reviewers are onboarded, put the premine question to them as a **versioned economics proposal**, with the amounts above and the eight conditions in §4.
4. Only a reviewed, publicly disclosed, separately signed governance proposal may change genesis — and it must ship with a new chain ID, new genesis manifest and re-signed gate evidence.

Until then, the correct public statement is: **JGC has no premine; a genesis allocation has been proposed and is under review.**
