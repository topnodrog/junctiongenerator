#!/usr/bin/env bash
# Provider-neutral seed installation for a Debian/Ubuntu host the operator owns.
# No cloud CLI, instance metadata, managed IAM or hosted scheduler is used.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${HERE}/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Copy env.example to .env and fill in your own DNS names and seed URLs first." >&2
  exit 2
fi
# shellcheck disable=SC1090
source "$ENV_FILE"
: "${JGC_SEED_HOSTNAME:?}" "${JGC_ADVERTISE_URL:?}" "${JGC_SEEDS:?}" "${JGC_ACME_EMAIL:?}"

for command in docker ufw curl; do
  command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 2; }
done

case "$JGC_ADVERTISE_URL" in wss://*) ;; *) echo "JGC_ADVERTISE_URL must use wss://" >&2; exit 2;; esac
IFS=',' read -ra SEEDS <<< "$JGC_SEEDS"
for seed in "${SEEDS[@]}"; do
  case "$seed" in wss://*) ;; *) echo "Every JGC_SEEDS entry must use wss://: $seed" >&2; exit 2;; esac
done

chmod 600 "$ENV_FILE"
# Public edge only. P2P, private status and the narrow public API stay on
# loopback; Caddy is the only service listening on 0.0.0.0.
ufw allow 80/tcp comment 'ACME HTTP-01'
ufw allow 443/tcp comment 'JGC WSS + public read API'
ufw deny 19444/tcp comment 'P2P loopback only'
ufw deny 7777/tcp comment 'operator status never public'
ufw deny 7778/tcp comment 'public API loopback only'

docker compose -f "$HERE/compose.seed.yml" --env-file "$ENV_FILE" up -d --build
echo "Seed started. Run ./verify.sh after DNS propagation."
