---
name: leaked-secrets-risk
description: Historical secret exposure, completed JGT wallet rescue, and current local credential hygiene
metadata: 
  node_type: memory
  type: project
  originSessionId: 18c714bb-bc71-4e56-913b-8b161e98ff26
---

**Historical exposure (audited 2026-06-16):** past chat transcripts contained
Anthropic API keys and GitHub personal-access tokens. A JGT deployer private key
also appeared in public git history. Treat every credential from those logs or
that history as permanently compromised; do not test, reuse, or copy it into a
new configuration.

**JGT wallet resolution (2026-06-17):** the rescue completed. All 100M JGT and
token ownership moved to the safe wallet, and the compromised wallet is empty.
The burned key remains public and must never be reused. See
[[compromised-wallet-7702-sweeper]] for the transaction record.

**Credential status:** the user reported the exposed Anthropic keys revoked.
The GitHub tokens' present validity is not assumed from their June status; any
token that appeared in a transcript must be revoked or allowed to expire.
History rewriting is optional hygiene and does not make an exposed credential
secret again.

**Local check — 2026-07-23:** `.gh_token`, `.curlrc-gh`, `.cf_token`, and
`.turso-token` exist in the working directory, are untracked, and are ignored
by git. Their contents were deliberately not inspected. `.curlrc-gh`
historically held a revoked PAT. Do not replace it with a fresh long-lived
token. Git push uses the authenticated Windows credential manager; other
services should use environment variables or their supported secret stores.

**Standing rules:**

1. Never paste keys, tokens, seed phrases, or private keys into chat or tracked
   files.
2. Rotate any credential whose exposure status is uncertain.
3. Keep local secret files ignored, narrowly scoped, and short-lived; prefer
   credential managers and deployment secret stores.
4. Public wallet addresses and transaction hashes are safe to document; private
   key material is not.
