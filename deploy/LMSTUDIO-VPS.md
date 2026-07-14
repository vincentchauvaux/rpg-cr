# LM Studio gratuit sur VPS (tunnel Mac)

Le MJ appelle le LLM **depuis l’API sur le VPS**, pas depuis le navigateur. Pour rester gratuit, LM Studio tourne sur **votre Mac** et un tunnel SSH inverse le rend accessible au conteneur Docker.

## Architecture

```
Joueurs (Internet) → Nginx VPS → API (réseau hôte) → 127.0.0.1:1234
                                                      ↓
                                            VPS localhost:1234
                                                      ↓
                                            tunnel SSH (-R)
                                                      ↓
                                            Mac LM Studio :1234
```

## Avant chaque partie (Mac)

1. Ouvrir **LM Studio** → serveur **Running** → charger un modèle **chat/instruct** jusqu’à **READY** (pas VL, pas embedding).
2. Lancer la session — **deux options simples** :

| Méthode | Commande |
|---------|----------|
| **Tout-en-un (recommandé)** | `npm run host` — démarre l’assistant si besoin, ouvre le tunnel et le navigateur |
| **Service auto (une fois)** | `npm run tunnel:helper:install` — l’assistant tourne à chaque connexion Mac ; ensuite bouton **Démarrer le tunnel** dans le wizard |

Autres options : `npm run tunnel:open` (Terminal), `bash deploy/lmstudio-tunnel.sh`, ou fichier `.command` depuis le wizard.

Le navigateur **ne peut pas** ouvrir Terminal tout seul (sécurité).

3. Vérifier depuis le **VPS** :

```bash
ssh root@vps-e09ed6db.vps.ovh.net 'curl -sf http://127.0.0.1:1234/v1/models | head -c 200'
```

## Configuration VPS (.env)

```bash
LM_STUDIO_BASE_URL=http://127.0.0.1:1234/v1
```

Pas besoin de `OPENAI_API_KEY` pour ce mode.

L’UI god mode peut afficher `http://127.0.0.1:1234/v1` — l’API utilise `LM_STUDIO_BASE_URL` côté serveur.

## Wizard hôte (première graine)

1. Fournisseur : **LM Studio (local)**
2. Modèle : id exact (ex. `google/gemma-4-e2b`) — statut **READY**
3. **Enregistrer** puis **Tester la connexion**

Voir aussi [HOST-SETUP.md](./HOST-SETUP.md).

## Dépannage

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| 502 « LM Studio injoignable » | Tunnel arrêté ou Mac éteint | Relancer `lmstudio-tunnel.sh` + LM Studio Running |
| Modèle introuvable | JIT pas fini | Attendre **READY** dans LM Studio |
| `curl` OK sur VPS, test MJ KO | Conteneur API pas redémarré après `.env` | `docker compose -f docker-compose.prod.yml restart api` |
| Crash / timeout long | Modèle VL ou trop lourd | Modèle chat plus petit (4B instruct) |

## Tunnel persistant (optionnel)

Sur Mac, `autossh` ou un agent `launchd` peut relancer le tunnel au démarrage. Exemple manuel :

```bash
brew install autossh
autossh -M 0 -N -o ServerAliveInterval=60 \
  -R 1234:127.0.0.1:1234 root@vps-e09ed6db.vps.ovh.net
```

## Limitations

- Le Mac doit rester allumé avec LM Studio + tunnel actifs pendant les parties.
- Latence plus élevée qu’un LLM cloud (Mac ↔ VPS ↔ joueurs).
- Les joueurs distants accèdent à l’app sur le VPS ; seul l’hôte maintient LM Studio.
