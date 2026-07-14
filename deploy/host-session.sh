#!/usr/bin/env bash
# Démarre une session hôte VPS : tunnel MJ assuré + navigateur.
# Prérequis : LM Studio Running + modèle READY.
# Usage : npm run host

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC_URL="${RPG_CR_PUBLIC_URL:-https://vps-e09ed6db.vps.ovh.net/rpg-cr/}"

echo "==> Session hôte RPG-CR (VPS + LM Studio Mac)"
bash "${ROOT}/deploy/ensure-tunnel.sh"

echo "==> Ouverture du navigateur : ${PUBLIC_URL}"
if [[ "$(uname -s)" == "Darwin" ]]; then
  open "${PUBLIC_URL}"
else
  echo "    Ouvrez manuellement : ${PUBLIC_URL}"
fi

echo ""
echo "Laissez LM Studio Running. Le tunnel tourne en arrière-plan."
echo "Logs assistant : /tmp/rpg-cr-tunnel-helper.log"
