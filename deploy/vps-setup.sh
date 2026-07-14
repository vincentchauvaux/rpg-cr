#!/usr/bin/env bash
# Préparation VPS OVH — Docker (+ UFW SSH). Nginx /rpg-cr : deploy/nginx-rpg-cr.conf.example
# Usage (sur le VPS, en root ou sudo) : bash deploy/vps-setup.sh

set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Relancez avec sudo : sudo bash deploy/vps-setup.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> Mise à jour des paquets"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git ufw

echo "==> Installation Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
else
  echo "Docker déjà installé : $(docker --version)"
fi

if ! docker compose version >/dev/null 2>&1; then
  apt-get install -y -qq docker-compose-plugin 2>/dev/null || true
fi

DEPLOY_USER="${SUDO_USER:-${USER}}"
if [[ -n "${DEPLOY_USER}" && "${DEPLOY_USER}" != "root" ]]; then
  usermod -aG docker "${DEPLOY_USER}" || true
  echo "Utilisateur ${DEPLOY_USER} ajouté au groupe docker (reconnectez la session SSH)."
fi

echo "==> Pare-feu UFW"
ufw allow OpenSSH
# Mode Nginx (/rpg-cr) : conteneurs sur 127.0.0.1 — pas d'ouverture 3000/4000 requise.
ufw --force enable
ufw status numbered

echo ""
echo "==> Terminé"
echo "1. Configurer Nginx : deploy/nginx-rpg-cr.conf.example (multi-sites /rpg-cr)."
echo "2. Puis : cp deploy/.env.production.example .env && nano .env"
echo "3. Puis : bash deploy/deploy.sh"
