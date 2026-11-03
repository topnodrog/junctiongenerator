#!/usr/bin/env bash
# Local encrypted-at-rest-independent backup of the seed data volume.
# Store the archive off-host and test a restore before relying on it.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${1:-/var/backups/jgc}"
mkdir -p "$DEST"
chmod 700 "$DEST"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="jgc-seed-${STAMP}.tar.gz"
VOLUME="$(docker compose -f "$HERE/compose.seed.yml" config --volumes | grep '^seed-data$' || true)"
SOURCE_VOLUME="jgc-seed_seed-data"
if [[ -z "$VOLUME" ]]; then echo "seed-data volume not declared" >&2; exit 2; fi

# Pause the writer so the append-only chain files are internally consistent.
docker compose -f "$HERE/compose.seed.yml" pause node
trap 'docker compose -f '"$HERE"'/compose.seed.yml unpause node || true' EXIT
docker run --rm \
  -v "${SOURCE_VOLUME}:/data:ro" \
  -v "$DEST:/backup" \
  alpine:3.20 tar -czf "/backup/$NAME" -C /data .
sha256sum "$DEST/$NAME" > "$DEST/$NAME.sha256"
chmod 600 "$DEST/$NAME" "$DEST/$NAME.sha256"
echo "Wrote $DEST/$NAME (verify with sha256sum -c)."
