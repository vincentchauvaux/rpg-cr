#!/usr/bin/env bash
# Sync le repo local vers le VPS et redéploie (rsync + deploy.sh).
# Usage (depuis le Mac) : bash deploy/push-deploy.sh
# Prérequis : accès SSH root@vps-e09ed6db.vps.ovh.net

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

VPS_HOST="${VPS_HOST:-root@vps-e09ed6db.vps.ovh.net}"
VPS_DIR="${VPS_DIR:-/root/rpg-cr}"
INSTALL_OLLAMA="${INSTALL_OLLAMA:-1}"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:7b-instruct}"

echo "==> Sync vers ${VPS_HOST}:${VPS_DIR}"
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'apps/web/.next' \
  --exclude 'apps/web/node_modules' \
  --exclude 'apps/api/node_modules' \
  --exclude 'packages/shared/node_modules' \
  --exclude 'apps/api/data/*.db-shm' \
  --exclude 'apps/api/data/*.db-wal' \
  --exclude 'apps/api/data/avatars' \
  --exclude '.env' \
  "${ROOT}/" "${VPS_HOST}:${VPS_DIR}/"

echo "==> Déploiement distant"
ssh "${VPS_HOST}" bash -s <<EOF
set -euo pipefail
cd "${VPS_DIR}"

if [[ "${INSTALL_OLLAMA}" == "1" ]] && ! command -v ollama >/dev/null 2>&1; then
  echo "==> Première installation Ollama sur le VPS"
  OLLAMA_MODEL="${OLLAMA_MODEL}" bash deploy/ollama-setup.sh
elif [[ "${INSTALL_OLLAMA}" == "1" ]]; then
  echo "==> Ollama déjà installé — vérif modèle ${OLLAMA_MODEL}"
  ollama pull "${OLLAMA_MODEL}" || true
  if [[ -f .env ]] && grep -qE '^LM_STUDIO_BASE_URL=' .env; then
    sed -i.bak 's|^LM_STUDIO_BASE_URL=.*|LM_STUDIO_BASE_URL=http://127.0.0.1:11434/v1|' .env
    rm -f .env.bak
  fi
fi

bash deploy/deploy.sh
bash deploy/check-vps.sh || true
EOF

echo ""
echo "==> Déploiement terminé"
echo "    https://vps-e09ed6db.vps.ovh.net/rpg-cr/"
echo "    MJ : Ollama ${OLLAMA_MODEL} sur le VPS (pas de tunnel Mac)"
