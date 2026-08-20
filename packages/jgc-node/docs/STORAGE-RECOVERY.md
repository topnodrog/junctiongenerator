# Storage Format and Recovery

JGC data directories are bound to one chain and one storage format by
`storage-manifest.json`. A node refuses to open a directory when the chain ID,
genesis hash, consensus version, network magic, proof mode, or storage version
does not match its current configuration.

## Files

- `storage-manifest.json` — version and network identity; atomically replaced
  and flushed.
- `blocks.dat` — authoritative linear active-chain log. It has a versioned
  header; each record has a bounded length and SHA3-256 checksum.
- `chainstate.snapshot` — optional UTXO/epoch acceleration snapshot. The block
  log remains authoritative.
- `audits.json` — derived audit lifecycle evidence, revalidated against the
  active chain on restart.
- wallet keystores — encrypted key material, written through an atomic flushed
  replacement by the wallet CLI.

Temporary `.tmp` files are never authoritative.

## Crash behavior

An accepted block append is flushed before the storage call returns. If a crash
leaves an incomplete final block frame, restart:

1. copies the incomplete bytes to `blocks.torn.<timestamp>.tail`;
2. truncates `blocks.dat` to the last checksum-verified record;
3. flushes the repaired file; and
4. replays the remaining chain normally.

A checksum failure or decode failure inside a complete record is not treated as
a torn tail. Startup fails closed because silently discarding a complete record
could hide tampering or disk corruption.

A malformed chainstate snapshot is renamed to
`chainstate.corrupt.<timestamp>.snapshot`, then the node rebuilds state from the
checksummed block log. Malformed audit evidence is similarly quarantined and
reconstructed from committed chain evidence where possible.

## Compatibility and migration

Consensus V2, early Consensus V3, and unversioned block stores are deliberately
unsupported. There is no automatic migration because those development stores
may use a different genesis or commitment interpretation.

Before starting `jgtc-testnet-v1` with an old or `jgc-testnet-v3` data directory,
the public-seed deployment uses an explicit reset token:

1. stop every process using the directory;
2. set `JGC_RESET_TO_GENESIS` to the reviewed JGTC genesis hash;
3. for a later approved reset to the same genesis, also set a new reviewed
   `JGC_RESET_ID` containing only letters, numbers, dot, underscore, or hyphen;
4. start the node, which moves only chain state into a reset-specific directory
   under `archive/`, preserves
   `participant-identity.json`, and writes an idempotent reset marker; and
5. resync and earn valueless JGTC only through the 144-block settlement path.

The node refuses a reset token that does not exactly match its compiled genesis.
It also refuses an unsafe reset ID or a reset ID without the genesis token.
Reusing a completed reset ID is a no-op, and archive files are never overwritten.
Without the token it retains the normal fail-closed manifest behavior.

Never copy a manifest from another directory to bypass a mismatch.

## Backup and restore

Use a cold backup for this testnet milestone:

1. stop the node cleanly;
2. copy the complete data directory, including the manifest and block log;
3. record the node release/commit and the SHA3-256 digest of `blocks.dat`;
4. restart the original node;
5. periodically restore the copy to a separate path and start the same release
   against it to prove the backup is usable.

Do not copy only `chainstate.snapshot`; it is an acceleration artifact, not the
authoritative chain. Do not restore a backup into a directory for a different
chain identity.

## Operator response

- **Torn-tail recovery message:** inspect and retain the `.tail` file until the
  cause is understood; the node may continue after replay.
- **Checksum/integrity failure:** stop, preserve the directory, compare disk and
  backup health, and restore/resync. Do not delete the failing record in place.
- **Manifest mismatch:** verify command-line network settings and use the
  correct directory. Reset only after preserving anything needed for analysis.
- **Quarantined snapshot:** allow full replay, then confirm the resulting tip
  against an independent node before deleting the quarantined artifact.
