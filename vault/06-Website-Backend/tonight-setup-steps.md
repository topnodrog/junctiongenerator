---
name: tonight-setup-steps
description: "Archived checklist — Cloudflare owner notifications completed and verified"
metadata:
  node_type: memory
  type: project
---

# Cloudflare notification setup — complete

This checklist is archived. The work was completed and verified on
**2026-07-24**.

- Worker `jgt-mining-api` is live at
  `jgt-mining-api.james-gordon.workers.dev`.
- Current deployment version:
  `27376d87-c982-46c1-b089-04ace3e01651`.
- Newsletter signups and hire leads are written to Turso before any email is
  attempted.
- Each new submission immediately emails
  `james_gordon@junctiongenerator.net`.
- If an immediate send fails, the stored record remains available to the
  midnight-UTC digest.
- The scheduled digest is running; `digest_state.last_sent_at` advanced to
  `2026-07-24 00:00:01`.
- A labeled synthetic hire lead was submitted against the live API while
  Cloudflare tailing was active. The request succeeded and the Worker logged
  `owner notification sent`. All synthetic rows were deleted afterward.
- Cloudflare shows the destination address as verified. Zone-level inbound
  Email Routing is currently unconfigured/disabled, but that is separate from
  the working fixed-destination Worker send binding.
- Wrangler uses the valid Cloudflare OAuth session. The old `.cf_token` used
  by separate scripts is not required for Worker deployment.

Use `api/DEPLOY.md` for the current deployment and verification record.
