# JGC Node v0.1.0 — JGTC v2 closed beta

This is the first pinned runner release for the early, valueless
`jgtc-testnet-v2` pilot. It is a GitHub prerelease, not mainnet software.

## What is included

- the frozen v2 chain identity and repaired settlement transaction IDs;
- outbound-only validator/back-checker and participant modes;
- two-provider WSS seed defaults;
- zero-premine 144-block JGTC settlement;
- versioned crash-safe storage and recoverable incompatible-state handling;
- compiled JavaScript, source, locked npm dependencies, Docker runner files,
  Windows startup helpers, and operator documentation.
- a deterministic `RELEASE-MANIFEST.json` inventory with per-file SHA-256
  hashes and a tree digest, verified before publication.

The release bundle deliberately excludes wallets, participant identities,
chain data, provider credentials, and local evidence.

## Verify and run

Download `jgc-node-v0.1.0.zip` and `SHA256SUMS.txt` from the release. Verify the
archive before extracting it:

```powershell
(Get-FileHash .\jgc-node-v0.1.0.zip -Algorithm SHA256).Hash.ToLower()
Get-Content .\SHA256SUMS.txt
```

The two hashes must match. On Linux or macOS, run
`sha256sum -c SHA256SUMS.txt`.

After extraction:

```text
cd jgc-node-v0.1.0
node scripts/verify-release-bundle.mjs
npm ci
npm run testnet:public
```

For a complete owner-only release rehearsal, run `npm run release:check` after
`npm ci`. It reruns the full consensus suite, rebuilds the node, confirms the
mainnet preflight is still blocked, stages the allowlisted bundle, and verifies
its content-addressed manifest.

Use `npm run testnet:participate` instead to submit signed, equal-weight pilot
receipts. Back up `data/testnet/participant-identity.json` privately. Never
publish that file or reuse the identity on a valuable network.

## Compatibility note

`jgtc-testnet-v2` has genesis
`da5c0c28e076211e13e75f8cd28fe98f81080dafefc5ad803620961d16ee1d77`.
Earlier `jgtc-testnet-v1` chain state is incompatible because v2 commits the
settlement boundary height into settlement transaction IDs. Preserve any old
state before resetting and follow `docs/STORAGE-RECOVERY.md` with the reviewed
v2 genesis token. The reset guard archives chain-specific files while
preserving the participant identity for continuity within this valueless pilot.
