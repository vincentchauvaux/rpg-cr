#!/usr/bin/env bash
# Sauvegarde SQLite + avatars du volume Docker rpg-data.
# Usage : bash deploy/backup.sh
# Cron exemple (tous les jours à 3h) :
#   0 3 * * * cd /home/user/rpg-cr && bash deploy/backup.sh >> /var/log/rpg-cr-backup.log 2>&1

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_ROOT="${ROOT}/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="${BACKUP_ROOT}/${STAMP}"

mkdir -p "${DEST}"

if ! docker compose -f "${COMPOSE_FILE}" ps -q api >/dev/null 2>&1; then
  echo "Conteneur api absent — lancez d'abord : bash deploy/deploy.sh"
  exit 1
fi

API_CID="$(docker compose -f "${COMPOSE_FILE}" ps -q api)"
if [[ -z "${API_CID}" ]]; then
  echo "Conteneur api non démarré."
  exit 1
fi

echo "==> Export base SQLite"
docker cp "${API_CID}:/data/rpg-cr.db" "${DEST}/rpg-cr.db"

if docker exec "${API_CID}" test -d /data/avatars 2>/dev/null; then
  echo "==> Export avatars"
  docker cp "${API_CID}:/data/avatars" "${DEST}/avatars"
fi

# Copie compressée
ARCHIVE="${BACKUP_ROOT}/rpg-cr-${STAMP}.tar.gz"
tar -czf "${ARCHIVE}" -C "${BACKUP_ROOT}" "${STAMP}"
rm -rf "${DEST}"

echo "==> Sauvegarde : ${ARCHIVE}"
ls -lh "${ARCHIVE}"

# Garder les 14 dernières archives
ls -1t "${BACKUP_ROOT}"/rpg-cr-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

echo "==> Terminé"
