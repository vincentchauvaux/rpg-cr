# RPG-CR

Salons de jeu de rôle en ligne, administrés par un MJ IA. Monorepo TypeScript : API Fastify + WebSocket, frontend Next.js, logique partagée (carte procédurale, catalogue LLM, prompt MJ).

## Prérequis

- Node.js 20+
- npm 10+

## Développement local

```bash
npm install
npm run dev
```

- Web : http://localhost:3000
- API : http://localhost:4000
- WebSocket : `ws://localhost:4000/ws`

Variables optionnelles (voir `.env.example`) :

- `OPENAI_API_KEY` — pour le MJ via OpenAI
- `LM_STUDIO_BASE_URL` — fallback local (défaut `http://127.0.0.1:1234/v1`)
- `NEXT_PUBLIC_API_PORT` / `NEXT_PUBLIC_WS_PORT` — ports API/WS (défaut 4000)

**Réseau local** : ouvrir `http://<IP-LAN>:3000` (ex. `192.168.0.210`). L’API est appelée sur le même host, port 4000 — pas besoin de configurer localhost dans `.env`.

## Docker / VPS OVH

Guide complet : **[deploy/README.md](./deploy/README.md)**

**Multi-sites Nginx** (canopee.be + streamTv `/app` + RPG-CR) :

```
https://vps-e09ed6db.vps.ovh.net/rpg-cr
```

```bash
cp deploy/.env.production.example .env
bash deploy/deploy.sh
# + snippet deploy/nginx-rpg-cr.conf.example dans Nginx
```

## Structure

```
apps/api      — REST + WebSocket + SQLite
apps/web      — Next.js (admin, chat, QR)
packages/shared — types, carte, LLM, prompt MJ
deploy/       — Nginx, scripts VPS
```

Voir [agent.md](./agent.md) pour l’état du projet et la roadmap.
