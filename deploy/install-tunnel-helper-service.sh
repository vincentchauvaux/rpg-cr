#!/usr/bin/env bash
# Installe l'assistant tunnel comme service macOS (démarrage automatique à la connexion).
# Usage (une fois) : npm run tunnel:helper:install
# Désinstaller : npm run tunnel:helper:uninstall

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Ce service auto est prévu pour macOS."
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node || true)"
if [[ -z "${NODE_BIN}" ]]; then
  echo "Node.js introuvable dans le PATH."
  exit 1
fi

LABEL="be.rpg-cr.tunnel-helper"
PLIST_DIR="${HOME}/Library/LaunchAgents"
PLIST_PATH="${PLIST_DIR}/${LABEL}.plist"
LOG_OUT="/tmp/rpg-cr-tunnel-helper.log"
LOG_ERR="/tmp/rpg-cr-tunnel-helper.err.log"

mkdir -p "${PLIST_DIR}"

cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${ROOT}/deploy/tunnel-helper.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_OUT}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_ERR}</string>
</dict>
</plist>
EOF

# Recharger si déjà chargé
launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "${PLIST_PATH}"
launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl kickstart -k "gui/$(id -u)/${LABEL}" 2>/dev/null || true

sleep 1
if curl -sf --max-time 2 "http://127.0.0.1:17434/status" >/dev/null 2>&1; then
  echo "OK — assistant tunnel actif (port 17434)."
  echo "    Logs : ${LOG_OUT}"
  echo "    Redémarre automatiquement à chaque connexion Mac."
else
  echo "Service installé mais pas encore joignable — vérifiez ${LOG_ERR}"
fi
