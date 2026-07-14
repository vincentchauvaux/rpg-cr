#!/usr/bin/env bash
# Désinstalle le service macOS de l'assistant tunnel.
# Usage : npm run tunnel:helper:uninstall

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Rien à désinstaller (macOS uniquement)."
  exit 0
fi

LABEL="be.rpg-cr.tunnel-helper"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
rm -f "${PLIST_PATH}"

echo "Service ${LABEL} désinstallé."
