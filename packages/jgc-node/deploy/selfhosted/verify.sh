#!/usr/bin/env bash
# Post-deployment verification. Fails closed: any missing check is an error.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
[[ -f "$HERE/.env" ]] && source "$HERE/.env"
: "${JGC_SEED_HOSTNAME:?}"
BASE="https://${JGC_SEED_HOSTNAME}"

check() {
  local label="$1"; shift
  if "$@" >/dev/null; then echo "PASS  $label"; else echo "FAIL  $label" >&2; return 1; fi
}

check "TLS healthz" curl --fail --silent --show-error "$BASE/healthz"
check "public explorer" curl --fail --silent --show-error "$BASE/explorer"
check "private status is not exposed" bash -c "test \"\$(curl --silent --output /dev/null --write-out '%{http_code}' '$BASE/status')\" = 404"
check "operator port 7777 is not public" bash -c "! curl --silent --max-time 3 http://${JGC_SEED_HOSTNAME}:7777/status"
check "CORS does not reflect an arbitrary origin" bash -c "! curl --silent --show-error --header 'Origin: https://evil.example' --output /dev/null --write-out '%{http_code}' '$BASE/healthz' | grep -q '^200$'"
check "TLS certificate is valid for at least 14 days" bash -c "echo | openssl s_client -connect ${JGC_SEED_HOSTNAME}:443 -servername ${JGC_SEED_HOSTNAME} 2>/dev/null | openssl x509 -noout -checkend 1209600"

if [[ -f "$HERE/inventory.json" ]]; then
  echo "PASS  inventory present"
  node "$HERE/monitor.mjs" --inventory "$HERE/inventory.json"
else
  echo "WARN  inventory.json not present; create it from inventory.example.json"
fi
echo "Verification complete. Record the output with your deployment evidence."
