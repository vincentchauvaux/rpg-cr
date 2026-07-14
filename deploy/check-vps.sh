#!/usr/bin/env bash
# Diagnostic rapide sur le VPS — pourquoi /rpg-cr renvoie 404 ?
# Usage : bash deploy/check-vps.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

API_PORT="${API_PORT:-4010}"
WEB_PORT="${WEB_PORT:-3010}"
BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-/rpg-cr}"
BASE_PATH="${BASE_PATH%/}"
PUBLIC_HOST="${NGINX_PUBLIC_HOST:-https://vps-e09ed6db.vps.ovh.net}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  API_PORT="${API_PORT:-4010}"
  WEB_PORT="${WEB_PORT:-3010}"
  BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-/rpg-cr}"
  BASE_PATH="${BASE_PATH%/}"
fi

echo "=== RPG-CR — diagnostic VPS ==="
echo ""

fail=0

check() {
  local label="$1"
  local cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    echo "OK   $label"
  else
    echo "KO   $label"
    fail=$((fail + 1))
  fi
}

if command -v docker >/dev/null 2>&1; then
  echo "OK   Docker installé"
else
  echo "KO   Docker absent — sudo bash deploy/vps-setup.sh"
  fail=$((fail + 1))
fi

if [[ -f .env ]]; then
  echo "OK   Fichier .env présent"
  if grep -qE '^LM_STUDIO_BASE_URL=.+' .env 2>/dev/null; then
    echo "OK   LM_STUDIO_BASE_URL renseignée"
    LM_URL="$(grep -E '^LM_STUDIO_BASE_URL=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")"
    # Tunnel Mac : LM Studio joignable sur l'hôte VPS (127.0.0.1:1234)
    if curl -sf --max-time 3 "http://127.0.0.1:1234/v1/models" >/dev/null 2>&1; then
      echo "OK   LM Studio joignable sur VPS (tunnel Mac actif)"
    else
      echo "!!   LM Studio injoignable sur VPS:1234 — lancez deploy/lmstudio-tunnel.sh sur le Mac"
    fi
  else
    echo "!!   LM_STUDIO_BASE_URL vide (MJ LM Studio bloqué)"
  fi
  if grep -qE '^OPENAI_API_KEY=.+' .env 2>/dev/null; then
    echo "OK   OPENAI_API_KEY renseignée (MJ cloud optionnel)"
  fi
else
  echo "KO   .env absent — cp deploy/.env.production.example .env"
  fail=$((fail + 1))
fi

if docker compose -f docker-compose.prod.yml ps -q api 2>/dev/null | grep -q .; then
  echo "OK   Conteneur api démarré"
else
  echo "KO   Conteneur api absent — bash deploy/deploy.sh"
  fail=$((fail + 1))
fi

if docker compose -f docker-compose.prod.yml ps -q web 2>/dev/null | grep -q .; then
  echo "OK   Conteneur web démarré"
else
  echo "KO   Conteneur web absent — bash deploy/deploy.sh"
  fail=$((fail + 1))
fi

check "API locale :${API_PORT}/health" "curl -sf http://127.0.0.1:${API_PORT}/health"
check "Web locale :${WEB_PORT}/ (conteneur)" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${WEB_PORT}/ | grep -qE '200|308'"

if [[ -f /etc/nginx/snippets/rpg-cr.conf ]]; then
  echo "OK   Snippet Nginx /etc/nginx/snippets/rpg-cr.conf"
else
  echo "KO   Snippet Nginx manquant :"
  echo "     sudo cp deploy/nginx-rpg-cr.conf.example /etc/nginx/snippets/rpg-cr.conf"
  echo "     + include snippets/rpg-cr.conf; dans le server HTTPS"
  fail=$((fail + 1))
fi

if grep -rq 'rpg-cr' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null; then
  echo "OK   Référence rpg-cr dans la config Nginx active"
else
  echo "!!   include snippets/rpg-cr.conf; peut-être pas activé dans le server HTTPS"
fi

echo ""
echo "--- Test public (si DNS/HTTPS OK) ---"
curl -sf -o /dev/null -w "health public : %{http_code}\n" "${PUBLIC_HOST}${BASE_PATH}/health" 2>/dev/null || echo "KO   ${PUBLIC_HOST}${BASE_PATH}/health injoignable"
curl -sf -o /dev/null -w "accueil public : %{http_code}\n" "${PUBLIC_HOST}${BASE_PATH}/" 2>/dev/null || echo "KO   ${PUBLIC_HOST}${BASE_PATH}/ injoignable"

echo ""
if [[ "$fail" -gt 0 ]]; then
  echo "=> ${fail} problème(s) bloquant(s). Suivez deploy/README.md étape par étape."
  echo "   URL à utiliser : ${PUBLIC_HOST}${BASE_PATH}/  (avec slash final)"
  exit 1
fi

echo "=> Stack locale OK. Si le navigateur affiche encore 404 :"
echo "   1. sudo nginx -t && sudo systemctl reload nginx"
echo "   2. Ouvrir ${PUBLIC_HOST}${BASE_PATH}/  (pas sans le / final)"
exit 0
