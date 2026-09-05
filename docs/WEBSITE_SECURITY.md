# Website security and recovery

Updated 2026-09-05 UTC. Owner: James Gordon.

## Public forms

Newsletter, hire inquiry, community join, and activation check-in each require
a fresh Cloudflare Turnstile token. The Worker validates it with Siteverify
before any database write or owner notification. Acceptance requires success,
the expected form action, and an explicitly allowed hostname. Cloudflare
enforces token lifetime and single use; forms reset verification after an
attempt. Missing configuration and verification outages fail closed.
Each form initializes when the shared loader finishes, including multiple
forms mounted together and forms reached through client navigation.

Requests must be JSON objects of at most 16 KiB. Rate limiting runs before
parsing and verification. No token, secret, or contact detail is logged by the
verification helper. The existing owner-authenticated routes remain protected.
Legacy airdrop registration returns 410; reward dispensing is not reopened.

The public site key is configured in the root layout, with optional
`TURNSTILE_SITE_KEY` or `NEXT_PUBLIC_TURNSTILE_SITE_KEY` overrides. The secret
belongs only in the Worker's `TURNSTILE_SECRET_KEY` secret binding.
`TURNSTILE_HOSTNAMES` is `junctiongenerator.net,www.junctiongenerator.net`.
Preview domains need a separate test configuration; production does not accept
localhost tokens. Use Cloudflare's documented dummy keys only in local tests.

## Browser policy

`src/proxy.ts` creates a fresh nonce per document response. Next's hydration
scripts, the Turnstile loader, and the optional analytics script receive it.
The policy restricts scripts, connections, frames, fonts, and images to the
current site's dependencies. Script attributes, object embeds, base-URL
changes, and external framing are blocked. Existing React style attributes
are allowed separately from scripts.

Pages render dynamically because their nonces must be fresh. Development
allows its local tooling. Loopback node status and the public seed/API remain
allowed. There is no current RainbowKit or WalletConnect flow to support.

Set `CSP_REPORT_ONLY=true` to observe a proposed policy change before enforcing
it. Test every route, analytics, challenge loading, and client navigation before
removing that override. Do not add a blanket inline-script exception.

## Recovery and validation

Root and route error screens provide retry paths. Individual live-data panels,
forms, and lab demonstrations have section boundaries so a rendering failure
does not remove the rest of a page. Network failures remain handled by their
existing component messages.

Validation for this change: website lint and production build; Worker syntax,
five public-write security tests, and Wrangler dry-run; browser checks of home,
community, and live explorer with report-only followed by enforced CSP. Phone
checks at 375 and 320 CSS pixels found and corrected the template layout and
verification-widget overflow. Tests used a local dummy challenge and did not
create real signup records or send notification emails. Full assistive-device
or third-party security certification is not claimed.

Deploy the challenge-bearing frontend before enforcing the new Worker checks.
After deployment, verify production response headers, challenge rendering,
health and scoreboard reads, rejection of absent/forged tokens, and retired
airdrop behavior. Record the deployed Worker version in `api/DEPLOY.md`.
