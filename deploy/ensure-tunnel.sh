#!/usr/bin/env bash
# Assure assistant tunnel + tunnel SSH + joignabilité LM Studio depuis le VPS.
# Prérequis Mac : LM Studio Running + modèle READY.
#
# Usage :
#   npm run tunnel:ensure
#   bash deploy/ensure-tunnel.sh
#
# Appelé aussi par deploy/host-session.sh avant d'ouvrir le navigateur.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HELPER_URL="${TUNNEL_HELPER_URL:-http://127.0.0.1:17434}"
LOCAL_LM_URL="${LOCAL_LM_URL:-http://127.0.0.1:1234/v1/models}"
VPS_TUNNEL_STATUS="${VPS_TUNNEL_STATUS_URL:-https://vps-e09ed6db.vps.ovh.net/rpg-cr/api/llm/tunnel-status}"
MAX_WAIT_SEC="${TUNNEL_ENSURE_MAX_WAIT_SEC:-25}"

helper_ok() {
  curl -sf --max-time 2 "${HELPER_URL}/status" >/dev/null 2>&1
}

echo "==> Vérification LM Studio local (${LOCAL_LM_URL})"
if ! curl -sf --max-time 5 "${LOCAL_LM_URL}" >/dev/null; then
  echo "!!  LM Studio injoignable sur ce Mac."
  echo "    Démarrez LM Studio (Running) et attendez READY sur le modèle."
  exit 1
fi
echo "    LM Studio OK"

if ! helper_ok; then
  echo "==> Assistant tunnel absent — démarrage…"
  nohup node "${ROOT}/deploy/tunnel-helper.mjs" >> /tmp/rpg-cr-tunnel-helper.log 2>&1 &
  for _ in $(seq 1 20); do
    if helper_ok; then break; fi
    sleep 0.3
  done
fi

if ! helper_ok; then
  echo "!!  Assistant tunnel injoignable (port 17434)."
  echo "    Installez-le une fois : npm run tunnel:helper:install"
  echo "    Ou lancez : npm run tunnel:helper"
  exit 1
fi

echo "==> Démarrage tunnel SSH Mac → VPS"
START_JSON="$(curl -sf -X POST "${HELPER_URL}/start" || echo '{}')"
if ! echo "${START_JSON}" | grep -q '"ok":true'; then
  echo "!!  Échec démarrage tunnel : ${START_JSON}"
  exit 1
fi
if echo "${START_JSON}" | grep -q '"already":true'; then
  echo "    Tunnel déjà actif"
else
  echo "    Tunnel démarré"
fi

echo "==> Vérification côté VPS (${VPS_TUNNEL_STATUS})"
for _ in $(seq 1 "${MAX_WAIT_SEC}"); do
  if curl -sf --max-time 5 "${VPS_TUNNEL_STATUS}" | grep -q '"reachable":true'; then
    echo "    LM Studio joignable depuis le VPS"
    echo ""
    echo "Tunnel prêt — le MJ peut appeler LM Studio."
    exit 0
  fi
  sleep 1
done

echo "!!  Timeout : le VPS ne voit pas encore LM Studio."
echo "    Vérifiez la clé SSH vers le VPS et que le port 1234 n'est pas bloqué."
exit 1
