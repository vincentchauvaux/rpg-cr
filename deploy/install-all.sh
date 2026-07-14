#!/usr/bin/env bash
# Installation complète RPG-CR sur VPS OVH — à lancer APRÈS connexion SSH.
#
# Usage :
#   ssh root@vps-e09ed6db.vps.ovh.net
#   git clone https://github.com/vincentchauvaux/rpg-cr.git
#   cd rpg-cr
#   bash deploy/install-all.sh
#
# MJ gratuit : LM Studio sur le Mac + tunnel (deploy/LMSTUDIO-VPS.md).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

echo "=== RPG-CR — installation complète ==="

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker absent. Lancez d'abord : sudo bash deploy/vps-setup.sh"
  exit 1
fi

if [[ ! -f .env ]]; then
  cp deploy/.env.production.example .env
  echo ""
  echo ">>> Fichier .env créé. Vérifiez LM_STUDIO_BASE_URL (MJ gratuit via tunnel Mac)."
  echo "    nano .env"
  echo "    Puis relancez : bash deploy/install-all.sh"
  exit 1
fi

if ! grep -qE '^LM_STUDIO_BASE_URL=.+' .env 2>/dev/null; then
  echo ""
  echo ">>> LM_STUDIO_BASE_URL manquante dans .env"
  echo "    nano .env   # LM_STUDIO_BASE_URL=http://127.0.0.1:1234/v1"
  exit 1
fi

bash deploy/deploy.sh

echo ""
echo "=== Nginx ==="
if [[ ! -f /etc/nginx/snippets/rpg-cr.conf ]]; then
  echo "Installation du snippet (sudo requis)…"
  sudo cp deploy/nginx-rpg-cr.conf.example /etc/nginx/snippets/rpg-cr.conf
fi

if ! grep -rq 'snippets/rpg-cr.conf' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null; then
  echo ""
  echo ">>> ACTION MANUELLE Nginx (une fois) :"
  echo "    Ouvrez la config HTTPS de vps-e09ed6db.vps.ovh.net, par ex. :"
  echo "    sudo nano /etc/nginx/sites-enabled/streamtv"
  echo "    Dans le bloc server { listen 443 … }, ajoutez :"
  echo "      include snippets/rpg-cr.conf;"
  echo "    Puis : sudo nginx -t && sudo systemctl reload nginx"
  echo ""
  read -r -p "Appuyez sur Entrée quand c'est fait (ou Ctrl+C pour quitter)…"
fi

sudo nginx -t
sudo systemctl reload nginx

bash deploy/check-vps.sh

echo ""
echo "=== Terminé ==="
echo "Sur le Mac : bash deploy/lmstudio-tunnel.sh (LM Studio Running)"
echo "Ouvrez : https://vps-e09ed6db.vps.ovh.net/rpg-cr/"
echo "Puis : deploy/HOST-SETUP.md (créer une graine)"
