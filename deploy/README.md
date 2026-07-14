# Déploiement VPS OVH — RPG-CR

## Mode multi-sites (recommandé)

RPG-CR cohabite avec **canopee.be** et **streamTv** sur le même VPS.

| Site | URL |
|------|-----|
| RPG-CR | `https://vps-e09ed6db.vps.ovh.net/rpg-cr` |

Conteneurs en **écoute locale** (`127.0.0.1:3010` / `4010`) — seul **Nginx** est public (443).

## MJ gratuit : LM Studio + tunnel Mac

Par défaut, le MJ utilise **LM Studio sur votre Mac** (gratuit), relié au VPS par un tunnel SSH inverse. Pas de clé OpenAI requise.

Guide détaillé : **[LMSTUDIO-VPS.md](./LMSTUDIO-VPS.md)**

```bash
# Sur le Mac, avant chaque partie (LM Studio Running + modèle READY) :
bash deploy/lmstudio-tunnel.sh
```

`.env` sur le VPS :

```bash
LM_STUDIO_BASE_URL=http://host.docker.internal:1234/v1
NEXT_PUBLIC_BASE_PATH=/rpg-cr
```

`OPENAI_API_KEY` reste **optionnelle** (MJ cloud uniquement).

### Checklist

```bash
# 1. Docker (si pas déjà fait)
sudo bash deploy/vps-setup.sh

# 2. Cloner ou rsync du repo
git clone https://github.com/vincentchauvaux/rpg-cr.git
cd rpg-cr

# 3. .env
cp deploy/.env.production.example .env
nano .env   # LM_STUDIO_BASE_URL, NEXT_PUBLIC_BASE_PATH=/rpg-cr

# 4. Docker
bash deploy/deploy.sh

# 5. Nginx (une fois)
sudo cp deploy/nginx-rpg-cr.conf.example /etc/nginx/snippets/rpg-cr.conf
# Dans le server HTTPS vps-e09ed6db.vps.ovh.net (ex. streamtv) :
#   include snippets/rpg-cr.conf;
sudo nginx -t && sudo systemctl reload nginx

# 6. Mac : tunnel LM Studio
bash deploy/lmstudio-tunnel.sh

# 7. Test public
curl -s https://vps-e09ed6db.vps.ovh.net/rpg-cr/health
# Navigateur : https://vps-e09ed6db.vps.ovh.net/rpg-cr/  (slash final !)

# Diagnostic :
bash deploy/check-vps.sh

# 8. Graine — deploy/HOST-SETUP.md

# 9. Sauvegarde
bash deploy/backup.sh
```

Installation guidée : `bash deploy/install-all.sh`

## Mode ports directs (dev / test)

Sans Nginx : ouvrir 3000/4000, utiliser `docker-compose.yml` et laisser `NEXT_PUBLIC_BASE_PATH` vide.

## Fichiers

| Fichier | Rôle |
|---------|------|
| [LMSTUDIO-VPS.md](./LMSTUDIO-VPS.md) | MJ gratuit — tunnel Mac |
| [lmstudio-tunnel.sh](./lmstudio-tunnel.sh) | Script tunnel SSH (Mac) |
| [nginx-rpg-cr.conf.example](./nginx-rpg-cr.conf.example) | Snippet Nginx `/rpg-cr` |
| [vps-setup.sh](./vps-setup.sh) | Docker + UFW |
| [.env.production.example](./.env.production.example) | `.env` modèle |
| [deploy.sh](./deploy.sh) | Build + healthchecks locaux |
| [install-all.sh](./install-all.sh) | Installation complète |
| [backup.sh](./backup.sh) | Archive SQLite + avatars |
| [HOST-SETUP.md](./HOST-SETUP.md) | Première graine |
| [../docker-compose.prod.yml](../docker-compose.prod.yml) | Prod Nginx (3010/4010) |

## Architecture

```
HTTPS :443 (Nginx)
  /rpg-cr/      → 127.0.0.1:3010/  (Next.js — Nginx retire le préfixe, basePath dans les assets)
  /rpg-cr/api/  → 127.0.0.1:4010  (Fastify)
  /rpg-cr/ws    → 127.0.0.1:4010  (WebSocket)
  /rpg-cr/health → 127.0.0.1:4010/health

API Docker → host.docker.internal:1234 → tunnel SSH → Mac LM Studio
```

Le client ([config.ts](../apps/web/src/lib/config.ts)) utilise le **même origin** quand `NEXT_PUBLIC_BASE_PATH` est défini.

Côté serveur, `resolveLmStudioServerBaseUrl` ([lmstudio-url.ts](../packages/shared/src/llm/lmstudio-url.ts)) utilise `LM_STUDIO_BASE_URL` pour les appels MJ même si l'UI affiche `127.0.0.1:1234`.

## Mise à jour

```bash
git pull   # ou rsync depuis le Mac
bash deploy/deploy.sh
sudo nginx -t && sudo systemctl reload nginx
```
