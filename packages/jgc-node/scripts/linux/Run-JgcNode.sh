#!/usr/bin/env bash
# Runs a participating JGC testnet node from the Linux desktop switch or its
# per-user service. The PID file belongs to this wrapper, so the switch can stop
# the node cleanly without matching or killing unrelated Node processes.
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/junctiongenerator"
PID_FILE="$STATE_DIR/jgc-node.pid"
CHECK_ONLY=false

if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=true
elif [[ $# -gt 0 ]]; then
  printf 'Usage: %s [--check]\n' "$0" >&2
  exit 2
fi

die() {
  printf 'JGC Node: %s\n' "$*" >&2
  exit 1
}

status_is_ready() {
  local payload
  payload="$(curl --fail --silent --connect-timeout 2 --max-time 3 http://127.0.0.1:7777/status)" || return 1
  [[ "$payload" == *'"running":true'* ]] || return 1
  [[ "$payload" == *'"network":"jgtc-testnet-v2"'* ]] || return 1
  [[ "$payload" == *'"role":"participant"'* ]] || return 1
  [[ "$payload" == *'"participating":true'* ]] || return 1
  [[ "$payload" == *'"address":"1QGC'* ]] || return 1
  [[ "$payload" =~ "peerCount":[1-9][0-9]* ]] || return 1
}

wait_for_ready() {
  for _ in $(seq 1 45); do
    if status_is_ready; then
      return 0
    fi
    if [[ -n "${node_pid:-}" ]] && ! kill -0 "$node_pid" 2>/dev/null; then
      return 1
    fi
    sleep 1
  done
  return 1
}

prepare_node() {
  local nvm_script="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  if [[ -s "$nvm_script" ]]; then
    # Desktop launchers do not inherit an interactive shell's NVM setup.
    # Prefer the supported Node 24 line when it is installed.
    # shellcheck disable=SC1090
    . "$nvm_script"
    nvm use --silent 24 >/dev/null 2>&1 || true
  fi

  command -v node >/dev/null 2>&1 || die "Node.js 20.19+, 22.x, or 24.x is required."
  command -v npm >/dev/null 2>&1 || die "npm was not found next to the active Node.js runtime."

  local version major minor
  version="$(node --version)"
  if [[ ! "$version" =~ ^v([0-9]+)\.([0-9]+)\. ]]; then
    die "could not read the active Node.js version ($version)."
  fi
  major="${BASH_REMATCH[1]}"
  minor="${BASH_REMATCH[2]}"
  if ! { [[ "$major" == "20" && "$minor" -ge 19 ]] || [[ "$major" == "22" ]] || [[ "$major" == "24" ]]; }; then
    die "Node.js 20.19+, 22.x, or 24.x is required; found $version."
  fi
}

mkdir -p "$STATE_DIR"
prepare_node

if [[ -f "$PID_FILE" ]]; then
  previous_pid="$(<"$PID_FILE")"
  if [[ "$previous_pid" =~ ^[0-9]+$ ]] && kill -0 "$previous_pid" 2>/dev/null; then
    die "a JGC Node switch runner is already active (PID $previous_pid)."
  fi
  rm -f "$PID_FILE"
fi

cleanup() {
  local status=$?
  if [[ -n "${node_pid:-}" ]] && kill -0 "$node_pid" 2>/dev/null; then
    kill -TERM "$node_pid" 2>/dev/null || true
    wait "$node_pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  exit "$status"
}
trap cleanup EXIT INT TERM

cd "$PACKAGE_ROOT"
printf 'Building JGC Node with Node.js %s...\n' "$(node --version)"
npm run build

if [[ "$CHECK_ONLY" == true ]]; then
  printf 'JGC Node build and runtime check passed.\n'
  exit 0
fi

printf '%s\n' "$$" > "$PID_FILE"
printf '\nStarting PR55 participant / validator / back-checker...\n'
node dist/scripts/testnet-node.js --participate \
  --seed wss://seed-a.junctiongenerator.net \
  --seed wss://jgc-testnet-seed-b.fly.dev &
node_pid=$!

if ! wait_for_ready; then
  die "the participant did not become monitor-ready (expected jgtc-testnet-v2, participant role, signed participation, an address, and at least one peer)."
fi
printf 'JGC participant is monitor-ready on both public seeds.\n'

set +e
wait "$node_pid"
node_status=$?
set -e
exit "$node_status"
