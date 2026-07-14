# Première graine sur le VPS (hôte)

Après `bash deploy/deploy.sh` et configuration Nginx :

```
https://vps-e09ed6db.vps.ovh.net/rpg-cr/
```
(avec le **slash final**)

Si vous voyez **404 « This page could not be found »** : le déploiement n’est pas terminé. Sur le VPS : `bash deploy/check-vps.sh`

## Avant de commencer (Mac — MJ gratuit)

1. **LM Studio** : serveur **Running**, modèle **chat/instruct** en **READY** (ex. `google/gemma-4-e2b`).
2. **Tunnel SSH** (terminal ouvert pendant la partie) :

```bash
bash deploy/lmstudio-tunnel.sh
```

3. Vérification VPS : `curl -s http://127.0.0.1:1234/v1/models | head`

Guide complet : [LMSTUDIO-VPS.md](./LMSTUDIO-VPS.md)

## Étapes

1. **Créer un salon** — nom salon / hôte (ou suggestions aléatoires).
2. **Étape 1/2 — Configurer le MJ**
   - Fournisseur : **LM Studio (local)**.
   - URL affichée : `http://127.0.0.1:1234/v1` (normal — le serveur utilise `LM_STUDIO_BASE_URL` via le tunnel).
   - Modèle : id exact, statut **READY** dans LM Studio.
   - **Enregistrer la config MJ**.
   - **Tester la connexion**.
   - Si échec : tunnel actif ? LM Studio Running ? `docker compose -f docker-compose.prod.yml restart api`
3. **Continuer — créer mon personnage** (étape 2/2).
4. Finaliser la fiche → rejoindre le chat.

## Inviter des joueurs

- Lien : `https://vps-e09ed6db.vps.ovh.net/rpg-cr/salon/CODE`
- QR code : god mode → panneau admin → invitation.
- L’invité ouvre le lien → formulaire **Entrer dans le salon** (nom du personnage) — pas besoin de passer par l’accueil.

## Dépannage rapide

| Problème | Action |
|----------|--------|
| **404 `_next/*.js` / `.css` sur lien salon** | Nginx : `proxy_pass http://127.0.0.1:3010/rpg-cr/` (ne pas retirer le préfixe) ; `sudo cp deploy/nginx-rpg-cr.conf.example /etc/nginx/snippets/rpg-cr.conf && sudo nginx -t && sudo systemctl reload nginx` ; `bash deploy/deploy.sh` |
| **404 Next.js** | `bash deploy/check-vps.sh` — Docker + Nginx + `.env` manquants ; URL avec `/` final |
| 502 / page blanche | `docker compose -f docker-compose.prod.yml logs web api` ; `df -h` |
| API injoignable | `curl http://127.0.0.1:4010/health` puis Nginx `nginx -t` |
| WS coupé | Vérifier bloc `location /rpg-cr/ws` (Upgrade headers) |
| MJ ne répond pas | Tunnel Mac + LM Studio READY ; test connexion étape 1 ; [LMSTUDIO-VPS.md](./LMSTUDIO-VPS.md) |
| Perte de données | `bash deploy/backup.sh` |
