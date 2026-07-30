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

## Dependency baseline

- Next.js and its matching ESLint configuration are pinned to 16.2.11, the
  patched release identified by the repository alerts current on 2026-07-30.
- The unused RainbowKit/Wagmi/WalletConnect/Viem wallet surface was removed.
  It belonged to the retired JGT promotion path and was responsible for most
  of the production dependency alerts.
- Patched PostCSS, Sharp, WebSocket, js-yaml, and transitive utility versions
  are locked through package-manager overrides where upstream ranges lag.
- The JGC node production graph and the retained rescue tool each report zero
  known vulnerabilities through `npm audit`.
- Yarn still reports the brace-expansion advisory through ESLint's development
  dependency chain. The compatible patched 1.x release is locked. Forcing the
  advisory's 5.x branch into legacy Minimatch was tested and rejected because
  it breaks ESLint (`expand is not a function`). This is a build-tool-only
  exception pending an upstream ESLint/Minimatch migration; it is not bundled
  into the production application.

## Local-only fundraising material

The root fundraising, pitch, outreach, and validation files remain untracked.
Their disposition is recorded in
[`FUNDRAISING_PUBLICATION_PLAN.md`](FUNDRAISING_PUBLICATION_PLAN.md). They are
outside the public-testnet implementation branch unless separately reviewed
and approved for their intended audience.
