# Repository and Deployment Safety Baseline

**Verified:** 2026-07-30

## GitHub

- Repository visibility: public.
- Default branch: `main`.
- Secret scanning: enabled.
- Push protection: enabled.
- Vulnerability alerts: enabled.
- Dependabot security updates: enabled.
- Secret validity checks: reported as disabled after the enable request; treat
  this as unavailable until the repository settings page offers it.
- Open pull requests: none after the superseded analytics and post-quantum
  prototype drafts were closed with explanatory comments.

## Production-facing configuration

No secret or token value was copied into this audit.

- `https://junctiongenerator.net/` returned HTTP 200 with the current
  local/private-testnet copy.
- The former “Layer-1 Testnet Live” copy was not present.
- The Cloudflare Web Analytics beacon was present in the rendered production
  HTML.
- `https://junctiongenerator.net/community` returned HTTP 200 and rendered the
  configured Discord invitation.
- The deployed community scoreboard endpoint returned HTTP 200 and restricted
  its CORS response to `https://junctiongenerator.net`.
- Public frontend components retain the deployed Worker URL as a safe fallback;
  deployment variables should be managed in the hosting dashboard and never
  copied into git.

## Local-only fundraising material

The root fundraising, pitch, outreach, and validation files remain untracked.
Their disposition is recorded in
[`FUNDRAISING_PUBLICATION_PLAN.md`](FUNDRAISING_PUBLICATION_PLAN.md). They are
outside the public-testnet implementation branch unless separately reviewed
and approved for their intended audience.

