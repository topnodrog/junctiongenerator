# Security policy

**Last updated:** 2026-11-02
**Project status:** JGC is a **zero-value testnet candidate**. No value-bearing JGC mainnet has been launched. JGT is a legacy Base token; its original deployer wallet is compromised and must never be used.

## Supported scope

| Surface | In scope | Notes |
| --- | --- | --- |
| `packages/jgc-node` | Yes | Consensus, P2P transport/sessions, storage, wallet, proof verification, launcher and release tooling. |
| `api/` (Cloudflare Worker), `src/proxy.ts` | Yes | Public forms, Turnstile, rate limiting, CORS, CSP and owner/automation bearer routes. |
| `contracts/` | Reference only | Known-broken market/staking/dispenser sources are explicitly do-not-deploy. Report only if they are accidentally deployed or funded. |
| Public website content | Yes | XSS/CSP bypasses, misleading live claims, exposed secrets. |
| Deployment kit `packages/jgc-node/deploy/selfhosted` | Yes | Exposed private status, TLS/firewall mistakes, credential leaks. |
| Legacy `deploy/google`, `deploy/fly`, `deploy/monitor` | Archived | No longer used for new deployments; report only if an active workflow still depends on them. |

## Reporting

Report vulnerabilities through a private GitHub security advisory on `topnodrog/junctiongenerator` (Security → Advisories → Report a vulnerability). If that is unavailable, open a minimal issue asking for a private channel — do **not** include exploit details, secrets or personal data in a public issue.

Include: affected commit/tag, component, reproduction steps, impact, and a suggested severity. Do not include private keys, wallet keystores, bearer tokens, Turnstile secrets, database credentials or live user data.

## Response

- Acknowledgement: within 5 business days.
- Triage and severity: within 10 business days.
- Fix + regression test + public disclosure record: before the affected code is promoted to a reviewed release.
- High/critical consensus, cryptography or key-management findings block the affected mainnet gate and require re-review by an independent reviewer.

## Safe harbor

We will not pursue legal action against researchers who:

- act in good faith and avoid privacy violations, destruction of data, or service degradation;
- test only against the zero-value testnet/canary or their own local node;
- do not access, exfiltrate or retain data belonging to other people;
- report findings privately first and allow a reasonable coordinated disclosure window;
- do not use a finding to trade, promote or claim value for JGT/JGC.

This is a commitment of intent, not legal advice. Independent reviewers additionally sign the scope and conflict-of-interest terms in [`docs/mainnet/EXTERNAL_REVIEW_ONBOARDING.md`](docs/mainnet/EXTERNAL_REVIEW_ONBOARDING.md).

## Hard rules

- Never commit a private key, seed phrase, keystore, bearer token, Turnstile secret, database credential or cloud token.
- Never expose `/status` (node status port 7777) to the public internet; only `/healthz`, `/explorer`, `/balance` and the P2P WebSocket may be routed.
- Never waive a mainnet gate. Gate evidence must be signed and reproducible ([`docs/mainnet/GATE_CLOSURE_PROTOCOL.md`](docs/mainnet/GATE_CLOSURE_PROTOCOL.md)).
- Never rewrite chain history. Before economic activation, abandon the chain ID and create a new reviewed genesis; after activation, use a versioned consensus upgrade.
