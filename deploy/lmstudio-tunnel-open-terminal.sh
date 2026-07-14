#!/usr/bin/env bash
# Ouvre une fenêtre Terminal macOS et lance le tunnel SSH (LM Studio → VPS).
# Usage : bash deploy/lmstudio-tunnel-open-terminal.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CMD="cd $(printf '%q' "$ROOT") && bash deploy/lmstudio-tunnel.sh"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Ce script ouvre Terminal.app (macOS uniquement)."
  echo "Sinon : bash deploy/lmstudio-tunnel.sh"
  exit 1
fi

osascript -e "tell application \"Terminal\" to do script \"${CMD//\"/\\\"}\""
