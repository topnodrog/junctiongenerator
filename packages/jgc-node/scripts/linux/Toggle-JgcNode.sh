#!/usr/bin/env bash
# Toggles the Linux JGC node and its desktop-session autostart. When a user
# systemd session is available, the installed service supervises the runner and
# restarts it after an unexpected exit; otherwise a visible terminal is used.
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/junctiongenerator"
PID_FILE="$STATE_DIR/jgc-node.pid"
AUTOSTART_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/autostart/jgc-node.desktop"
AUTOSTART_TEMPLATE="$SCRIPT_DIR/jgc-node-autostart.desktop"
RUNNER="$SCRIPT_DIR/Run-JgcNode.sh"
SERVICE_NAME="jgc-node.service"
SERVICE_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/$SERVICE_NAME"
MODE="${1:-toggle}"

notify() {
  local message="$1"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send --app-name="JGC Node" "JGC Node" "$message" 2>/dev/null || true
  fi
  printf '%s\n' "$message"
}

die() {
  notify "$*"
  exit 1
}

runner_pid() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(<"$PID_FILE")"
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null || return 1
  printf '%s\n' "$pid"
}

clear_stale_pid() {
  if [[ -f "$PID_FILE" ]] && ! runner_pid >/dev/null; then
    rm -f "$PID_FILE"
  fi
}

systemd_user_available() {
  command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1
}

service_is_active() {
  systemd_user_available && [[ -f "$SERVICE_FILE" ]] && systemctl --user is-active --quiet "$SERVICE_NAME"
}

status_is_reachable() {
  curl --fail --silent --connect-timeout 2 --max-time 3 http://127.0.0.1:7777/status >/dev/null 2>&1
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
    if status_is_ready; then return 0; fi
    sleep 1
  done
  return 1
}

enable_autostart() {
  mkdir -p "$(dirname -- "$AUTOSTART_FILE")"
  awk -v toggle="$SCRIPT_DIR/Toggle-JgcNode.sh" \
    '{ gsub("@JGC_NODE_TOGGLE@", toggle); print }' \
    "$AUTOSTART_TEMPLATE" > "$AUTOSTART_FILE"
  chmod 644 "$AUTOSTART_FILE"
}

disable_autostart() {
  rm -f "$AUTOSTART_FILE"
}

start_node() {
  clear_stale_pid
  if service_is_active; then
    notify "JGC Node is already ON under $SERVICE_NAME."
    return 0
  fi
  if pid="$(runner_pid)"; then
    notify "JGC Node is already ON (runner PID $pid)."
    return 0
  fi
  if status_is_reachable; then
    die "A JGC Node is already using port 7777 but is not managed by this switch. Stop it from its terminal first."
  fi

  enable_autostart
  if systemd_user_available && [[ -f "$SERVICE_FILE" ]]; then
    systemctl --user daemon-reload
    systemctl --user enable "$SERVICE_NAME" >/dev/null
    if systemctl --user start "$SERVICE_NAME" && wait_for_ready; then
      notify "JGC Node is ON under $SERVICE_NAME: participant, validator, and back-checker are monitor-ready."
      return 0
    fi
    systemctl --user stop "$SERVICE_NAME" >/dev/null 2>&1 || true
    systemctl --user reset-failed "$SERVICE_NAME" >/dev/null 2>&1 || true
    die "The $SERVICE_NAME supervisor started, but the participant did not become ready within 45 seconds."
  fi

  if command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal --title="JGC Node — Participant / Validator / Back-checker" -- "$RUNNER" >/dev/null 2>&1 &
  elif command -v x-terminal-emulator >/dev/null 2>&1; then
    x-terminal-emulator -T "JGC Node — Participant / Validator / Back-checker" -e "$RUNNER" >/dev/null 2>&1 &
  else
    disable_autostart
    die "No supported graphical terminal was found. Install GNOME Terminal or x-terminal-emulator."
  fi

  for _ in $(seq 1 45); do
    if status_is_ready; then
      notify "JGC Node is ON: PR55 participant, validator, and back-checker are monitor-ready."
      return 0
    fi
    sleep 1
  done
  die "The terminal was launched, but the JGC Node did not become ready within 45 seconds."
}

stop_node() {
  clear_stale_pid
  if systemd_user_available && [[ -f "$SERVICE_FILE" ]] && (service_is_active || systemctl --user is-enabled --quiet "$SERVICE_NAME"); then
    systemctl --user stop "$SERVICE_NAME" >/dev/null 2>&1 || true
    systemctl --user disable "$SERVICE_NAME" >/dev/null 2>&1 || true
    for _ in $(seq 1 15); do
      if ! status_is_reachable; then
        disable_autostart
        notify "JGC Node is OFF. Automatic startup and service supervision are disabled."
        return 0
      fi
      sleep 1
    done
    die "The $SERVICE_NAME supervisor did not stop the JGC Node cleanly."
  fi

  if pid="$(runner_pid)"; then
    kill -TERM "$pid"
    for _ in $(seq 1 15); do
      if ! kill -0 "$pid" 2>/dev/null && ! status_is_reachable; then
        disable_autostart
        notify "JGC Node is OFF. Automatic startup is disabled."
        return 0
      fi
      sleep 1
    done
    die "The JGC Node runner did not stop cleanly."
  fi

  if status_is_reachable; then
    die "A JGC Node is running but is not managed by this switch. Stop it from its terminal first."
  fi
  disable_autostart
  notify "JGC Node is already OFF. Automatic startup is disabled."
}

case "$MODE" in
  --on|on) start_node ;;
  --off|off) stop_node ;;
  toggle)
    if service_is_active || runner_pid >/dev/null 2>&1 || status_is_reachable; then stop_node; else start_node; fi
    ;;
  *) die "Usage: $0 [--on|--off]" ;;
esac
