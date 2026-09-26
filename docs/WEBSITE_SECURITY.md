# Website security and recovery

Updated 2026-09-26 UTC — repository review only; these latest Worker changes have not been deployed. Owner: James Gordon.

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
parsing and verification; only loopback development bypasses a missing binding,
and production limiter errors fail closed. No token, secret, or contact detail
is logged by the verification helper. The existing owner-authenticated routes
remain protected. Both legacy `/api/airdrop/register` and `/api/airdrop/status`
return 410. The separate
`/jgt-faucet` page is an optional, direct-to-contract Base claim flow described
in [`JGT_FAUCET.md`](JGT_FAUCET.md); it is inactive until the reviewed minting
dispenser is deployed, authorized by the verified clean current token owner,
and configured with its reviewed runtime hash and expected clean-owner address.
The page compares the live owner with that exact address. It is not prefunded and does not reopen the legacy registration
or Worker reward pipeline. The original token-deployer wallet is compromised
and must not be used.

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
allowed. The optional JGT faucet uses only an injected EIP-1193 wallet through
the existing `ethers` dependency; it adds no WalletConnect/RainbowKit provider
or third-party relay origin. It refuses claim signatures/transactions from the
known compromised original deployer and disables claims if the token still has
that owner. It never asks for a recovery phrase or stores a private key. The
signed-claim file is a scoped, one-use authorization and should be shared only
with the chosen relayer.

Set `CSP_REPORT_ONLY=true` to observe a proposed policy change before enforcing
it. Test every route, analytics, challenge loading, and client navigation before
removing that override. Do not add a blanket inline-script exception.

## Recovery and validation

Root and route error screens provide retry paths. Individual live-data panels,
forms, and lab demonstrations have section boundaries so a rendering failure
does not remove the rest of a page. Network failures remain handled by their
existing component messages.

Previous website/CSP validation (2026-09-05) included website lint and
production build, Worker syntax, five public-write security tests, a Wrangler
dry-run, and browser checks of home, community, and live explorer with
report-only followed by enforced CSP. Phone checks at 375 and 320 CSS pixels
found and corrected template layout and verification-widget overflow. Those
historical checks do not cover the repository changes made on 2026-09-26.

Current repository validation: 25 Node tests passed across six suites, syntax
checks passed for the reviewed Worker/deployment/relayer/rescue JavaScript, and
`git diff --check` passed. Website lint/build and Solidity compilation were not
rerun because dependencies are unavailable locally; no Wrangler dry-run or live
Worker/deployment action was performed. The tests use local inputs and did not
create real signup records or send notification emails. Full assistive-device
or third-party security certification is not claimed.

Deploy the challenge-bearing frontend before enforcing the new Worker checks.
After deployment, verify production response headers, challenge rendering,
health and scoreboard reads, rejection of absent/forged tokens, and retired
airdrop behavior. Record the deployed Worker version in `api/DEPLOY.md`.
