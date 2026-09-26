# Legacy JGT attention-mining backend — retired reference

> **Do not follow this file to deploy a reward pipeline.** It previously
> described an automatic JGT ad-reward and batch-payout flow that is not active.
> The current Worker deployment record is [`api/DEPLOY.md`](api/DEPLOY.md).
> Repository behavior was reviewed 2026-09-26; no live deployment changes were
> made during that review.

## Current behavior

- Public newsletter, hire, community-join, and activation writes require
  server-verified Turnstile tokens and are rate-limited.
- The legacy `POST /api/ad-view` route is owner-authenticated. It records rows;
  it is not a public ad-reward endpoint.
- `POST /api/dispense` requires the automation bearer token and returns a
  read-only legacy preview. It does **not** modify pending rows, sign, submit,
  or confirm a blockchain transaction.
- Legacy `POST /api/airdrop/register` and `GET /api/airdrop/status` return HTTP 410.
- No automatic ad or referral JGT payout should be represented as active.

For endpoint authentication, current Worker bindings, and deployment evidence,
see [`api/DEPLOY.md`](api/DEPLOY.md) and
[`docs/WEBSITE_SECURITY.md`](docs/WEBSITE_SECURITY.md).

## Separate legacy-token faucet draft

The optional `/jgt-faucet` is a separate, inactive minting-contract draft—not a
continuation of the old Worker batch pipeline. It must not be deployed or
activated until its contract is reviewed and tested, the token's current owner
and minter state are verified, and the owner is confirmed clean. The original
JGT deployer wallet is compromised and must never be reused. See
[`docs/JGT_FAUCET.md`](docs/JGT_FAUCET.md).
