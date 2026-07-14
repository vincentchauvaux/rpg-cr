#!/usr/bin/env bash
# Tunnel SSH inverse : expose LM Studio du Mac sur le VPS (localhost:1234).
# Prérequis : LM Studio Running + modèle READY sur ce Mac.
#
# Usage (sur le Mac) :
#   bash deploy/lmstudio-tunnel.sh
#
# Vérification sur le VPS (autre terminal) :
#   curl -s http://127.0.0.1:1234/v1/models | head

set -euo pipefail

VPS_HOST="${VPS_HOST:-root@vps-e09ed6db.vps.ovh.net}"
LOCAL_LM_PORT="${LOCAL_LM_PORT:-1234}"
REMOTE_BIND_PORT="${REMOTE_BIND_PORT:-1234}"

echo "==> Tunnel LM Studio : Mac 127.0.0.1:${LOCAL_LM_PORT} → VPS 127.0.0.1:${REMOTE_BIND_PORT}"
echo "    Hôte : ${VPS_HOST}"
echo "    Laissez ce terminal ouvert pendant la partie."
echo "    Ctrl+C pour arrêter le tunnel."
echo ""

exec ssh -N \
  -o ServerAliveInterval=60 \
  -o ServerAliveCountMax=3 \
  -R "${REMOTE_BIND_PORT}:127.0.0.1:${LOCAL_LM_PORT}" \
  "${VPS_HOST}"
