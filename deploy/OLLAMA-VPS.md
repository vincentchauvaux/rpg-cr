# Ollama sur le VPS (sans Mac / sans LM Studio)

Ollama expose une API **compatible OpenAI** (`/v1/chat/completions`, `/v1/models`). RPG-CR utilise le provider **Ollama (VPS / local)** dans le wizard MJ.

## Architecture

```
Joueurs (Internet) → Nginx VPS → API (host network) → 127.0.0.1:11434
                                                      ↓
                                              Ollama (même machine)
```

Plus de tunnel SSH, plus de Mac allumé pendant les parties.

## Prérequis VPS

| Ressource | Indicatif |
|-----------|-----------|
| RAM | ≥ 8 Go pour un 7B quantisé ; 4–6 Go pour un 3B/4B |
| CPU | Inférence CPU possible mais **lente** (30 s–3 min par tour MJ) |
| GPU | Optionnel — accélère fortement si disponible |

Les timeouts RPG-CR pour LLM local vont jusqu’à **240 s** ; un petit modèle instruct reste utilisable en CPU.

## Installation (Debian/Ubuntu sur le VPS)

```bash
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable ollama
sudo systemctl start ollama

# Modèle chat/instruct (adapter à la RAM)
ollama pull qwen2.5:7b-instruct
# Si 16 Go+ RAM (meilleur suivi d'instructions) :
# ollama pull qwen3:8b
# ollama pull qwen3:14b
# ou plus léger :
# ollama pull gemma2:2b
# ollama pull llama3.2:3b-instruct

curl -sf http://127.0.0.1:11434/v1/models | head -c 400
```

Ollama écoute par défaut sur `127.0.0.1:11434` — **ne pas** exposer ce port sur Internet.

## Configuration RPG-CR

### `.env` sur le VPS

```bash
LM_STUDIO_BASE_URL=http://127.0.0.1:11434/v1
```

(`LM_STUDIO_BASE_URL` est le nom de la variable serveur ; elle accepte toute base OpenAI-compatible, dont Ollama.)

```bash
# Sur le VPS (une fois)
sudo bash deploy/ollama-setup.sh

# Depuis le Mac (sync + deploy + Ollama si absent)
bash deploy/push-deploy.sh
```

### Wizard / god mode (Connexion MJ)

1. Fournisseur : **Ollama (VPS / local)**.
2. URL : `http://127.0.0.1:11434/v1` (le serveur utilise `LM_STUDIO_BASE_URL` dans `.env`).
3. Modèle : id Ollama — ex. `qwen2.5:7b-instruct` (`ollama list`). Extraction / traduction réutilisent **le même modèle** (température basse) — pas un second poids en RAM.
4. **Enregistrer** puis **Tester la connexion**.

Si la machine a **16 Go+** : `ollama pull qwen3:8b` ou `qwen3:14b` (meilleur suivi d'instructions). Ne pas lancer deux modèles en parallèle.

Éviter les modèles embedding ou vision (mêmes règles que LM Studio — rejetés par l’UI si l’id contient `embed`, `-vl-`, etc.).

## Comparaison

| | LM Studio + tunnel Mac | Ollama sur VPS | OpenAI cloud |
|--|------------------------|----------------|--------------|
| Coût | Gratuit | Gratuit (+ VPS déjà payé) | Payant |
| Mac requis | Oui, allumé | Non | Non |
| Latence | Mac ↔ VPS + Internet | Locale VPS | Faible |
| Perf | GPU Mac si dispo | CPU VPS souvent lent | Rapide |
| Setup | Tunnel à chaque session | Une fois sur le VPS | Clé API |

## Dépannage

| Symptôme | Action |
|----------|--------|
| 502 connexion refusée | `systemctl status ollama` ; `curl http://127.0.0.1:11434/v1/models` |
| Modèle introuvable | `ollama pull <nom>` ; id = nom `ollama list` |
| Timeout 504 | Modèle trop lourd pour la RAM/CPU → modèle plus petit (2B–4B) |
| Test OK, MJ lent | Normal en CPU ; Réclamer peut prendre 1–2 min |

## Alternative cloud

Sans LLM local : `OPENAI_API_KEY` dans `.env` + provider **OpenAI** en god mode (déjà supporté).
