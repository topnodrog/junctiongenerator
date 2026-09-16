#!/usr/bin/env bash
# Removes desktop controls without removing testnet data or participant identity.
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="${XDG_DESKTOP_DIR:-$HOME/Desktop}"
APPLICATIONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
AUTOSTART_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
SERVICE_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/jgc-node.service"

"$SCRIPT_DIR/Toggle-JgcNode.sh" --off || true
if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
  systemctl --user disable --now jgc-node.service >/dev/null 2>&1 || true
  systemctl --user daemon-reload >/dev/null 2>&1 || true
fi
rm -f "$DESKTOP_DIR/JGC Node On-Off.desktop" \
  "$APPLICATIONS_DIR/jgc-node-toggle.desktop" \
  "$AUTOSTART_DIR/jgc-node.desktop" \
  "$SERVICE_FILE"

printf 'JGC Node Linux desktop switch and automatic startup were removed.\n'
printf 'Chain data and participant identity were preserved in the package data directory.\n'
