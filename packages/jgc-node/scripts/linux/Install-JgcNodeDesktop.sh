#!/usr/bin/env bash
# Installs a per-user Cinnamon/GNOME desktop switch and autostart entry.
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
DESKTOP_DIR="${XDG_DESKTOP_DIR:-$HOME/Desktop}"
APPLICATIONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
AUTOSTART_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
DESKTOP_FILE="$DESKTOP_DIR/JGC Node On-Off.desktop"
APPLICATION_FILE="$APPLICATIONS_DIR/jgc-node-toggle.desktop"
AUTOSTART_FILE="$AUTOSTART_DIR/jgc-node.desktop"
TOGGLE="$SCRIPT_DIR/Toggle-JgcNode.sh"
RUNNER="$SCRIPT_DIR/Run-JgcNode.sh"
SERVICE_TEMPLATE="$SCRIPT_DIR/jgc-node.service"
SERVICE_FILE="$SYSTEMD_USER_DIR/jgc-node.service"
AUTOSTART_TEMPLATE="$SCRIPT_DIR/jgc-node-autostart.desktop"
NO_START=false

if [[ "${1:-}" == "--no-start" ]]; then
  NO_START=true
elif [[ $# -gt 0 ]]; then
  printf 'Usage: %s [--no-start]\n' "$0" >&2
  exit 2
fi

write_launcher() {
  local path="$1"
  cat > "$path" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=JGC Node On-Off
Comment=Turn the PR55 JGC participant, validator, and back-checker on or off
Exec=$TOGGLE
TryExec=$TOGGLE
Icon=utilities-terminal
Terminal=false
Categories=Network;Utility;
StartupNotify=true
EOF
  chmod 755 "$path"
}

write_autostart() {
  awk -v toggle="$TOGGLE" '{ gsub("@JGC_NODE_TOGGLE@", toggle); print }' \
    "$AUTOSTART_TEMPLATE" > "$AUTOSTART_FILE"
  chmod 644 "$AUTOSTART_FILE"
}

write_service() {
  mkdir -p "$SYSTEMD_USER_DIR"
  awk -v package_root="$PACKAGE_ROOT" -v runner="$RUNNER" \
    '{ gsub("@PACKAGE_ROOT@", package_root); gsub("@JGC_NODE_RUNNER@", runner); print }' \
    "$SERVICE_TEMPLATE" > "$SERVICE_FILE"
  chmod 644 "$SERVICE_FILE"
}

mkdir -p "$DESKTOP_DIR" "$APPLICATIONS_DIR" "$AUTOSTART_DIR" "$SYSTEMD_USER_DIR"
write_launcher "$DESKTOP_FILE"
write_launcher "$APPLICATION_FILE"
write_autostart
write_service

if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
  systemctl --user daemon-reload
fi

if command -v desktop-file-validate >/dev/null 2>&1; then
  desktop-file-validate "$DESKTOP_FILE" "$APPLICATION_FILE" "$AUTOSTART_FILE"
fi

printf 'Building JGC Node before enabling the Linux desktop switch...\n'
cd "$PACKAGE_ROOT"
"$SCRIPT_DIR/Run-JgcNode.sh" --check

if [[ "$NO_START" == true ]]; then
  printf 'Desktop switch installed: %s\n' "$DESKTOP_FILE"
  printf 'Automatic startup enabled: %s\n' "$AUTOSTART_FILE"
  printf 'Per-user supervisor installed: %s\n' "$SERVICE_FILE"
  printf 'Start it from the desktop switch when you are in the graphical session.\n'
  exit 0
fi

exec "$TOGGLE" --on
