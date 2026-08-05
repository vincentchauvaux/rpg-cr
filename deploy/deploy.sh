#!/usr/bin/env bash
# Déploiement ou mise à jour RPG-CR sur le VPS (Nginx /rpg-cr).
# Prérequis : Docker, .env, snippet Nginx (deploy/nginx-rpg-cr.conf.example)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

COMPOSE_FILE="docker-compose.prod.yml"

if [[ ! -f .env ]]; then
  echo "Fichier .env manquant."
  echo "  cp deploy/.env.production.example .env"
  echo "  nano .env   # LM_STUDIO_BASE_URL (Ollama VPS ou tunnel Mac) ou OPENAI_API_KEY (cloud)"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

API_PORT="${API_PORT:-4010}"
WEB_PORT="${WEB_PORT:-3010}"
BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-/rpg-cr}"
BASE_PATH="${BASE_PATH%/}"

if ! grep -qE '^OPENAI_API_KEY=.+' .env 2>/dev/null; then
  if grep -qE '^LM_STUDIO_BASE_URL=.+' .env 2>/dev/null; then
    LM_URL="$(grep -E '^LM_STUDIO_BASE_URL=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")"
    if echo "${LM_URL}" | grep -q ':11434'; then
      echo "MJ : Ollama sur le VPS (${LM_URL}). Voir deploy/OLLAMA-VPS.md"
    else
      echo "MJ : LM Studio via tunnel Mac (${LM_URL}). Voir deploy/LMSTUDIO-VPS.md"
    fi
  else
    echo "Attention : ni OPENAI_API_KEY ni LM_STUDIO_BASE_URL — MJ bloqué."
  fi
fi

echo "==> Build et démarrage (web ${WEB_PORT}, api ${API_PORT}, basePath ${BASE_PATH})"
docker compose -f "${COMPOSE_FILE}" up -d --build

# Rafraîchir le snippet Nginx si déjà installé (en-têtes sécurité, etc.)
if [[ -f /etc/nginx/snippets/rpg-cr.conf ]] && [[ -f deploy/nginx-rpg-cr.conf.example ]]; then
  echo "==> Mise à jour snippet Nginx /etc/nginx/snippets/rpg-cr.conf"
  cp deploy/nginx-rpg-cr.conf.example /etc/nginx/snippets/rpg-cr.conf
  if nginx -t 2>/dev/null; then
    systemctl reload nginx || true
  else
    echo "Attention : nginx -t a échoué — snippet copié mais Nginx non rechargé."
  fi
fi

echo "==> Attente santé API (127.0.0.1:${API_PORT})"
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> Attente santé Web (127.0.0.1:${WEB_PORT}/)"
for i in $(seq 1 30); do
  HTTP_WEB="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${WEB_PORT}/" 2>/dev/null || echo "000")"
  if [[ "${HTTP_WEB}" == "200" || "${HTTP_WEB}" == "308" ]]; then
    break
  fi
  sleep 2
done

echo "==> Vérifications locales"
curl -sf "http://127.0.0.1:${API_PORT}/health" | head -c 80
echo ""
WEB_PATH="${BASE_PATH}/"
HTTP_WEB="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${WEB_PORT}${WEB_PATH}" 2>/dev/null || echo "000")"
echo "Web HTTP ${HTTP_WEB} (http://127.0.0.1:${WEB_PORT}${WEB_PATH})"

if [[ "${HTTP_WEB}" != "200" && "${HTTP_WEB}" != "308" ]]; then
  echo "Échec : le front ne répond pas. Logs :"
  docker compose -f "${COMPOSE_FILE}" logs --tail=40 web api
  exit 1
fi

PUBLIC_HOST="${NGINX_PUBLIC_HOST:-https://vps-e09ed6db.vps.ovh.net}"

echo ""
echo "==> Déploiement Docker OK"
echo "  Local API  : http://127.0.0.1:${API_PORT}/health"
echo "  Local web  : http://127.0.0.1:${WEB_PORT}${WEB_PATH}"
echo ""
echo "Si Nginx est configuré (deploy/nginx-rpg-cr.conf.example) :"
echo "  Public     : ${PUBLIC_HOST}${BASE_PATH}"
echo "  Health     : ${PUBLIC_HOST}${BASE_PATH}/health"
echo ""
echo "Nginx pas encore installé ?"
echo "  sudo cp deploy/nginx-rpg-cr.conf.example /etc/nginx/snippets/rpg-cr.conf"
echo "  # include snippets/rpg-cr.conf; dans le server HTTPS"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "Étape suivante : deploy/HOST-SETUP.md + deploy/OLLAMA-VPS.md (Ollama) ou deploy/LMSTUDIO-VPS.md (tunnel Mac)"
