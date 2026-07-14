#!/usr/bin/env bash
# Installe Ollama sur le VPS et configure RPG-CR pour le MJ local (sans Mac).
# Usage (sur le VPS) : sudo bash deploy/ollama-setup.sh
# Option : OLLAMA_MODEL=gemma2:2b sudo bash deploy/ollama-setup.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:7b-instruct}"
OLLAMA_BASE="http://127.0.0.1:11434/v1"

echo "==> Installation Ollama (MJ local sur VPS)"
if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
else
  echo "    Ollama déjà installé"
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl enable ollama 2>/dev/null || true
  systemctl start ollama 2>/dev/null || true
fi

echo "==> Attente du service Ollama"
for i in $(seq 1 30); do
  if curl -sf --max-time 2 "http://127.0.0.1:11434/" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -sf --max-time 3 "http://127.0.0.1:11434/" >/dev/null 2>&1; then
  echo "!!  Ollama ne répond pas sur :11434"
  exit 1
fi
echo "    Ollama OK"

echo "==> Téléchargement modèle ${OLLAMA_MODEL} (peut prendre plusieurs minutes)"
ollama pull "${OLLAMA_MODEL}"

echo "==> Vérification API OpenAI-compatible"
curl -sf "http://127.0.0.1:11434/v1/models" | head -c 300
echo ""

if [[ ! -f .env ]]; then
  cp deploy/.env.production.example .env
  echo "    .env créé depuis deploy/.env.production.example"
fi

if grep -qE '^LM_STUDIO_BASE_URL=' .env 2>/dev/null; then
  sed -i.bak "s|^LM_STUDIO_BASE_URL=.*|LM_STUDIO_BASE_URL=${OLLAMA_BASE}|" .env
  rm -f .env.bak
else
  echo "LM_STUDIO_BASE_URL=${OLLAMA_BASE}" >> .env
fi

echo "==> LM_STUDIO_BASE_URL=${OLLAMA_BASE} (dans .env)"
echo ""
echo "Étapes suivantes :"
echo "  1. bash deploy/deploy.sh"
echo "  2. God mode / wizard MJ : provider Ollama, modèle ${OLLAMA_MODEL}"
echo "  3. Tester la connexion MJ"
echo ""
echo "Guide : deploy/OLLAMA-VPS.md"
