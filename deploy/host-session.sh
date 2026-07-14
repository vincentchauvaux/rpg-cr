#!/usr/bin/env bash
# Démarre une session hôte VPS : assistant tunnel + tunnel SSH + navigateur.
# Prérequis : LM Studio Running + modèle READY.
# Usage : npm run host

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HELPER_URL="${TUNNEL_HELPER_URL:-http://127.0.0.1:17434}"
PUBLIC_URL="${RPG_CR_PUBLIC_URL:-https://vps-e09ed6db.vps.ovh.net/rpg-cr/}"

helper_ok() {
  curl -sf --max-time 2 "${HELPER_URL}/status" >/dev/null 2>&1
}

echo "==> Session hôte RPG-CR (VPS + LM Studio Mac)"

if ! helper_ok; then
  echo "    Assistant tunnel absent — démarrage en arrière-plan…"
  nohup node "${ROOT}/deploy/tunnel-helper.mjs" >> /tmp/rpg-cr-tunnel-helper.log 2>&1 &
  for _ in $(seq 1 15); do
    if helper_ok; then break; fi
    sleep 0.4
  done
fi

if ! helper_ok; then
  echo "!!  Impossible de joindre l'assistant (port 17434)."
  echo "    Installez le service auto : npm run tunnel:helper:install"
  echo "    Ou lancez : npm run tunnel:helper"
  exit 1
fi

echo "==> Démarrage du tunnel SSH…"
START_JSON="$(curl -sf -X POST "${HELPER_URL}/start" || echo '{}')"
if echo "${START_JSON}" | grep -q '"ok":true'; then
  if echo "${START_JSON}" | grep -q '"already":true'; then
    echo "    Tunnel déjà actif."
  else
    echo "    Tunnel démarré."
  fi
else
  echo "!!  Échec démarrage tunnel : ${START_JSON}"
  exit 1
fi

echo "==> Ouverture du navigateur : ${PUBLIC_URL}"
if [[ "$(uname -s)" == "Darwin" ]]; then
  open "${PUBLIC_URL}"
else
  echo "    Ouvrez manuellement : ${PUBLIC_URL}"
fi

echo ""
echo "Laissez LM Studio Running. Le tunnel tourne en arrière-plan."
echo "Logs assistant : /tmp/rpg-cr-tunnel-helper.log"
