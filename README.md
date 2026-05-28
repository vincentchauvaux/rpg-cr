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

## Docker (VPS OVH)

```bash
docker compose up -d --build
```

Adapter `NEXT_PUBLIC_*` dans `docker-compose.yml` à l’IP ou au domaine du VPS.

## Structure

```
apps/api      — REST + WebSocket + SQLite
apps/web      — Next.js (admin, chat, QR)
packages/shared — types, carte, LLM, prompt MJ
```

Voir [agent.md](./agent.md) pour l’état du projet et la roadmap.
