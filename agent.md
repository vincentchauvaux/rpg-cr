# Agent — RPG-CR

> Dernière mise à jour : 2026-09-10 (**DD adapté difficulté action** ; **interface chat libérée** ; sync auto graines Google ; scroll début message MJ ; choix cliquables persistants ; cohérence spatiale)

## Vision

Application SaaS de salons JDR rejoinables, avec MJ IA (LLM marché + fallback LM Studio), carte procédurale, journal/quêtes/propositions, interface admin (god mode), déployable sur VPS.

## Stack

| Couche | Techno |
|--------|--------|
| Monorepo | npm workspaces |
| Partagé | `@rpg-cr/shared` (TypeScript) |
| API | Fastify 5, WebSocket, better-sqlite3 |
| Web | Next.js **15.5.18** (pin), React **19.2.6** (pin) |
| Données | SQLite (`apps/api/data/rpg-cr.db`) |
| Déploiement | Docker multi-stage + `docker-compose.yml` (dev) + `docker-compose.prod.yml` (VPS) ; scripts `deploy/` |

## MVP livré (v0.1)

1. **Structure** — racine : `package.json`, `package-lock.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `Dockerfile`, `docker-compose.yml`, README ; workspaces `apps/*`, `packages/*` ; ce fichier
2. **API salons** — `POST /api/rooms`, `GET /api/rooms/:code`, `POST /api/rooms/:id/join`, liste joueurs
3. **WebSocket** — `/ws?roomId&playerId&playerName`, broadcast messages, joueurs, scène, **épreuves de table** (`scene_check`) ; ping/pong ; reconnexion client + resync API
4. **Interface** — accueil créer/rejoindre, page `/salon/[code]`, QR + lien, switch god mode (admin) ; **favicon** dé D20 or (`apps/web/src/app/icon.svg` + `apple-icon.tsx`)
   - **Création salon** : noms salon/hôte proposés aléatoirement (utilisables sans saisie) ; clic efface pour taper ; bouton 🎲 par champ + « Tout relancer » ; `markHostLlmSetupPending(roomId)` à la création
   - **Onboarding hôte (graine)** : après création/reprise salon, tant que la fiche n'est pas `ready` — `HostSetupWizard` (**étape 1/2**) bloque le chat et le wizard PJ : `AdminLlmForm` (`collapseOnSave={false}`, `configPersisted={hasLlmConfig}`) — **un seul** bouton **Tester la connexion** (dans le formulaire, pas de doublon sous le wizard) ; enregistrement `PUT /api/rooms/:id/llm` puis **test** `POST …/llm/test` obligatoire avant « Continuer » ; `localStorage` `rpg-cr-host-llm-setup:{roomId}=done` + `CharacterCreationWizard` (**étape 2/2**). Joueurs non-hôte : inchangés. Pendant l'étape 1, le formulaire LLM du god mode est masqué (évite doublon).
   - **God mode** : panneau admin = `localStorage` `rpg-cr-admin-panel:{playerId}` via `useSyncExternalStore` — **jamais** resync depuis refresh/WS/DB ; PATCH serveur fire-and-forget au toggle. Switch **sans titre dupliqué** (le titre d’onglet « Administration » suffit) pour éviter le débordement « God mo… » sur mobile.
   - **Layout salon** (`room-shell` + `room-layout`) : **une colonne** centrée ; **dock** (`RoomDockNav`) — sticky **haut** (bureau), fixe **bas** (mobile ≤640px) : **Fiche** + **Cercle** | **Accueil** (chat + scène + aide inline) | **Aide** + **Réglages** ; chaque onglet n’affiche **que** son panneau (plus de fiche/compagnons/réglages empilés sous Accueil). Masqué en plein écran récit / onboarding LLM. `sessionStorage` `rpg-cr-room-tab:{roomId}` (ancien `scene` → `main`). **Mentions @** : `ChatMentionInput` dans le **chat** et l’**aide personnelle** (`HeroAssistantPanel`) — joueurs à la table + PNJ du canon ; sous-titre **Lieu · …** (rencontre déduite des messages / scène, pas « Récit »). API `GET …/mention-suggestions`. **Compagnons** : `.companions-block` — `margin-top` 1rem (bureau) / 0,75rem (≤640px).
   - **En-tête salon** (`RoomView`) : titre + **code seul** (sans préfixe « Code : ») — clic copie le code (`navigator.clipboard`) + retour visuel « Copié ! » + `aria-live` ; bouton **Sauvegarder et quitter** : libellé complet au bureau, **icône seule** (sortie) en `position: fixed` haut droite mobile (`≤640px`, `title` / `aria-label`).
   - **Carte + chroniques .md** : visibles **uniquement** en god mode (UI + API `GET /graine`)
### Fiche personnage — stats, canon narratif & verrou histoire

**JSON `character_sheet`** (SQLite, PATCH existant) — champs texte + sections structurées.

**Histoire (figée après finalisation wizard)** — `players.story_locked = 1` :
- Texte : `rank`, `background`, `family`, `secret`, `ambition`
- Structuré : `stats`, `spells`, `attackTypes`, `actions`

**Biens matériels (modifiables en jeu)** :
- Texte : `inventory`, `equipment`, `possessions`, `habitat`, `servants`, `money`, `mount`, `notes`
- Structuré : `usableItems`

Helpers : `packages/shared/src/character-sheet.ts` — `STORY_TEXT_FIELDS`, `MATERIAL_TEXT_FIELDS`, `isCharacterSheetFilled()`, `isStoryLocked()`, `mergeSheetRespectingStoryLock()`, `STORY_LOCK_MESSAGE`.

| Comportement | Détail |
|--------------|--------|
| Finalisation wizard | `POST …/character/finalize` → `character_status = ready` + `story_locked = 1` ; ouverture campagne hôte si admin (pas d'intégration auto sur messages) |
| PATCH fiche | Rejette changements histoire si verrouillé (403 + message FR) ; god mode peut tout éditer |
| IA generate-field/section | Bloquée sur champs histoire si verrouillé |
| IA generate-all | Masquée si fiche remplie, `story_locked` ou `ready` |
| UI | Badge « Histoire fixée », onglets Histoire / Biens / Stats ; ✨ IA masqué sur histoire verrouillée |

| Section | Type |
|---------|------|
| `stats` | `{ force, dexterite, constitution, intelligence, sagesse, charisme }` (1–20) |
| `spells[]` | `{ name, description, uses? }` |
| `attackTypes[]` | `{ name, damage?, range?, description }` |
| `actions[]` | `{ name, description, type: combat\|social\|exploration\|other }` |
| `usableItems[]` | `{ name, description, quantity?, fromInventory? }` |
| `skills` | `Record<skillId, { level, progress 0–100, unlockedFrom? }>` — migration auto : niveau 0, 0 % |

### Progression des compétences

- **Modèle** : `packages/shared/src/character-progression.ts` — `applySkillProgress`, `applySkillPractice`, `tryUnlockRelatedSkill`, constantes `PROGRESS_PER_EVENING` (8 %), `PROGRESS_PER_ACTION` (3 %), table `RELATED_SKILL_UNLOCKS` (ex. natation + lecture → crawl/nage).
- **API** : `POST /api/players/:playerId/progress` — corps `{ actorPlayerId, skillId, delta?, intensity?, reason?, unlockTags? }` ; validation `KNOWN_SKILL_IDS` ou compétence déjà sur la fiche ; `broadcastPlayers` (WS).
- **UI** : `CharacterSheetSkills` dans l’onglet Stats & capacités — barres %, niveau, boutons soirée/action ; god mode peut cibler un autre PJ.
- **MJ** : consigne dans `system-prompt.ts` — bloc optionnel `<!--progress:{"skillId":"…","delta":8}-->` après apprentissage narratif (pas de parsing serveur auto en MVP).
- **Export** : ligne compétences dans `joueurs.md`.

**UI** : onglets Histoire / Biens matériels / Stats & capacités dans `CharacterSheetPanel` ; wizard multi-étapes ; ✨ par section (`POST …/character/generate-section`).

**Scène (lieu + ambiance + tension)** :

### Lieu de scène

- **Affichage** : `getSceneLocationDisplayLabel` (`scene-extract-prompt.ts`) — libellé du lieu archivé si plausible (`isLikelyPlaceLocation`) ; **« Lieu inconnu »** seulement sans lieu valide (ex. prénom PJ filtré, archive vide) ; **« Scène non établie »** si ni lieu ni ambiance.
- **Bootstrap** : si `scene_location` vide ou invalide, `bootstrapSceneLocationFromHistory` (`room-scene.ts`) scanne jusqu’à **30** messages MJ — ordre **ancien → récent** à l’ouverture, **récent → ancien** après Réclamer/récap — via `extractPlaceLocationFromText` / `findSceneLocationInTexts` (taverne, **bar**, auberge, marché, etc.).
- **Collant** : un lieu établi n’est **pas** effacé par un patch sans `location` ou un lieu rejeté par `scrubScenePatchLocation` ; pas de « Lieu indéterminé » en base.
- **Ouverture campagne** : plan JSON + récit MJ ; si le bloc `<!--scene:…-->` est absent ou invalide (ex. prénom), repli plan puis bootstrap sur le récit.
- **Réclamer / indice / récap** : pas d’extraction LLM lourde (`skipSceneExtract`) mais **bootstrap léger** en arrière-plan si le lieu manque encore.
- **GET salon** : `attachSceneToRoom` tente un bootstrap silencieux (réponse API à jour, pas de WS).

### Tension / ambiance

- **Affichage** : `getSceneMoodDisplayLabel(scene, { recentTexts })` + `shouldShowPerilMoodLabel` — « danger imminent » **uniquement** si tension ≤ −50 **et** menace explicite dans les ~30 derniers messages MJ/PJ ; sinon remappage (`tensionToDefaultMoodLabel`). Contexte social calme (taverne, banter) → jamais de libellé périlleux à l'écran.
- **Bootstrap** : `bootstrapSceneMoodFromHistory` au `GET` salon (`attachSceneToRoom`) et après Réclamer — corrige une ambiance périlleuse **persistée en SQLite** si textes calmes ou sans combat ; scanne **30** messages MJ + PJ ; banter / taverne → `calme relatif`, tension modérée (~15–45).
- **Collant** : hors bloc `<!--scene:…-->` explicite, |Δ tension| max **15** par patch auto ; extraction LLM + heuristique passent par `scrubScenePatchMoodAndTension` si contexte social calme (`textsLookLikeCasualSocial`).
- **Bloc MJ explicite** : `applySceneUpdate(…, { explicitScene: true })` — le MJ peut imposer une bascule nette ; le scrub casual reste actif sauf `force: true` (god mode).
- **Extraction LLM** : prompt `buildSceneExtractMessages` — pas de « danger imminent » sans combat/menace dans le récit ; conversation en taverne sans attaque → `unchanged` ou tension modérée.
- **Heuristique** : `MOOD_HINTS` calme/convivial avant péril ; `PERIL_NARRATIVE_RE` pour danger réel uniquement.

- Colonnes `rooms` : `scene_location`, `scene_mood`, `scene_tension` (−100…+100), `scene_updated_at`
- Table `room_scene_log` — timeline des changements (export `scene.md`) ; **aucune entrée** si patch ignoré (inchangé)
- **Stabilité** : lieu/ambiance/tension ne bougent que si déplacement, nouveau cadre, ou événement narratif majeur (combat, danger, révélation, détente marquée)
  - `mergeScenePatch` : lieu normalisé équivalent → pas de MAJ ; ambiance peut évoluer sans déplacement ; tension seulement si |Δ| ≥ 15
  - Extraction LLM peut répondre `{"unchanged": true}` ; prompt MJ : bloc `<!--scene:…-->` **optionnel** et omis si rien ne change
- Extraction **auto** après réponse MJ si `autoExtractFacts !== false`, sauf message joueur ≤ 32 car. ; `reclaim` / `indice` / `session_recap` → bootstrap léger seulement
  - Priorité : bloc MJ `<!--scene:…-->` → LLM extract (avec archive courante) → heuristique → bootstrap historique
  - Garde-fous : `scrubScenePatchLocation` (noms joueurs + `isLikelyPlaceLocation`) — **jamais** un prénom PJ comme lieu (ex. « Thorin »)
- UI : header chat — lieu (`getSceneLocationDisplayLabel`) + ambiance (`getSceneMoodDisplayLabel`) | cadran tension (`SceneIndicator` + `SceneTensionGauge`)
- God mode : ✎ édition manuelle, ⟳ extraction du dernier récit MJ
- API : `GET/PATCH /api/rooms/:roomId/scene`, `POST …/scene/extract` ; WS `{ type: "scene", scene }`

**Trame narrative** :
- Colonne `rooms.narrative_arc` (JSON : `mainPlot`, `currentBeat`, `introducedAt`)
- Module `apps/api/src/room-narrative-arc.ts` — lecture, mise à jour, extraction LLM
- Bloc `<!--arc:{"mainPlot","currentBeat"}-->` optionnel en fin de récit MJ
- Prompt MJ : « Trame de campagne » ; règles narration (intro, rebondissements, WTF parcimonieux, retour au fil) dans `system-prompt.ts`
- `Commencer` / `reclaim` sans scène ni trame : consignes renforcées dans `player-mj-prompts.ts`
- Export campagne : `trame.md`

**Alignement moral (grille 3×3 D&D)** :
- Champ `character_sheet.alignment` : 9 valeurs (`lawful_good` … `chaotic_evil`)
- UI : `AlignmentGrid` — wizard étape 1 + onglet Histoire fiche
- Grille : **lignes** = Bon / Neutre / Mauvais ; **colonnes** = Légal / Neutre / Chaotique ; chaque cellule affiche le libellé complet (ex. « Loyal Bon », « Neutre Pur ») — `ALIGNMENT_GRID`, `ALIGNMENT_ROW_LABELS`, `ALIGNMENT_COL_LABELS` dans `packages/shared/src/alignment.ts`
- Export : ligne dans `joueurs.md` / `pnj.md` ; injecté dans `formatCharacterSheetForMj`

**Canon narratif** : table `narrative_facts` — faits établis par le MJ deviennent persistants.

| Colonne | Rôle |
|---------|------|
| `room_id`, `source_message_id` | Lien salon + message MJ source |
| `fact_type` | `spell_granted`, `item_found`, `stat_change`, `rule_established`, `ability_unlocked`, `other` |
| `summary`, `payload` JSON | Fait lisible + détails |

- Extraction **auto** après chaque réponse MJ si `llmConfig.autoExtractFacts !== false` (défaut true).
- God mode : bouton « Extraire faits du dernier récit » + panneau `NarrativeCanonPanel`.
- API : `GET /api/rooms/:roomId/narrative-facts`, `POST …/narrative-facts/extract` (god).
- Prompt MJ : injecte fiche du joueur actif + 20 derniers faits + consignes canon (`system-prompt.ts`).

### Aide personnelle du héros

- **Rôle** : conseiller intime du PJ (pas le MJ public de table) — réponses privées, **non** diffusées dans le fil de récit.
- **API** : `POST /api/players/:playerId/hero-assistant` — `{ actorPlayerId, question, mode?: "creation" | "play" }` ; le joueur ne peut interroger que **sa propre** fiche.
- **Contexte** : fiche complète ; en jeu (`play`) : canon établi + **12** derniers messages publics du salon ; prompt `hero-assistant-prompt.ts` — n’invente pas ; si info inconnue, indique **comment la obtenir en jeu**.
- **UI** : `HeroAssistantPanel` — wizard (étape fiche) + **onglet Aide du dock** en partie (`mode=play`, tous les joueurs avec fiche prête) ; **réduit par défaut** (bouton « Afficher ») ; **Entrée** envoie ; mentions **@** comme le chat ; bordure animée pendant la réponse ; markdown sur les réponses. **Plus d'affichage inline** sous le chat (libère l'espace de saisie).
- **Legacy** : `POST …/character/ask-mj` délègue au même moteur (`mode=creation`).

### Continuité narrative / canon (anti-invention MJ)

**Problème visé** : le MJ ne doit pas inventer titres (princesse, roi…), PNJ nommés, quêtes ou relations absents des messages, faits ou ouverture.

| Couche | Fichier | Rôle |
|--------|---------|------|
| Prompt système | `packages/shared/src/mj/system-prompt.ts` | Section « Continuité narrative (priorité haute) » |
| Règles narration | `packages/shared/src/mj/canon-continuity.ts` | `MJ_CANON_CONTINUITY_RULES` + footer dans tous les builders `narration/builders/*` |
| Contexte tour | `apps/api/src/established-canon.ts` | `buildEstablishedCanonSummary(roomId)` → bloc **« Éléments établis (ne pas inventer au-delà) »** dans `runMjTurn` (`mj.ts`) |
| Sources agrégées | idem | 80 derniers messages MJ/PJ, faits `narrative_facts`, scène, trame, quêtes, journal, carte/POI, fiches PJ, export `.md` si ouverture faite |
| Historique table | `mj.ts` | 20 derniers échanges dans le prompt utilisateur |
| Post-contrôle dev | `warnCanonContinuityDrift` | Log `[canon-drift]` si titre médiéval dans la réponse sans occurrence dans les sources (hors `NODE_ENV=production`) |

**Exemple** : « ils attendent ta réponse » ✓ — « la princesse attend ta réponse » ✗ si aucune princesse établie.
- Mode Action : menu « Utiliser… » (sorts/objets/actions de la fiche + **jet de dé** auto si le dernier message MJ demande un lancer — ex. bouton `🎲 d20 dex` ; détection `jet de DEXTERITÉ` / `(CHAIR)` avec normalisation Unicode (`action-quick-suggestions.ts`). Au clic, tirage aléatoire + message `Je lance un d20 sur ma dextérité : 14 +2 = 16.` (`dice-roll.ts`). Hint UI : les **+2/0/−2** du MJ = trois **issues** narratives ; le **(+X)** sur le jet = bonus de caractéristique (DEX 15 → +2). Si le message action contient un résultat chiffré, `mj-auto.ts` passe `pendingRollRequest` au prompt MJ (`builders/player-action.ts`) pour **résolution obligatoire** de l'issue annoncée.

### Choix de scène cliquables (épreuves D&D 5e)

Les listes markdown (`- …`) du **dernier** récit MJ encore **en vigueur** (2–8 items) sont des **boutons**. Un clic n'envoie pas un Dire : le serveur ouvre un **tour de table** (dés côté API, équité).

| Élément | Détail |
|---------|--------|
| Parse + inférence | `packages/shared/src/scene-choice.ts` — dernière liste ; carac/compétence selon le libellé (chercher → INT Investigation, explorer → SAG Perception, convaincre → CHA Persuasion contesté, etc.) ; DD 10–15 selon la tension de scène |
| Pile / tour | 1er clic ouvre le tour ; les autres PJ **choisissent aussi** (autre option, même option = aide), **aident**, **s'opposent** ou **laissent faire** (défaut / timeout). Résolution quand **tout le monde a répondu**, timeout **25 s**, ou **On y va**. Un seul message Action agrégé + un tour MJ |
| Laisser faire | Pas d'opposition automatique entre PJ. Timeout = laisser faire. L'aide / l'opposition restent optionnelles |
| Périmé | Dès qu'un tour se résout, **toute** la liste source est consommée (les options non cliquées n'ont pas eu lieu). Un nouveau récit MJ ou une Action hors liste invalide l'ancienne liste. `liveChoiceMessageId` (GET + WS) |
| Jets | `packages/shared/src/scene-check.ts` — d20 + modificateur de fiche `(score-10)/2` ; 20/1 = saveur, pas d'auto-réussite RAW |
| Aide | Autres PJ : **Aider** (jet, souvent Perception) ; total ≥ 10 → **avantage** à l'acteur (2d20, le plus haut) — l'avantage ne se cumule pas |
| Opposition | **S'opposer** = jet contesté (Persuasion vs Perspicacité, Discrétion vs Perception, sinon même carac). Mode « opposed » (social/combat) : le **monde** jette aussi `d20 + worldMod` — ce n'est pas une opposition entre PJ |
| Fenêtre | 1 humain à la table → résolution **immédiate** ; sinon **25 s** |
| API | `POST /api/rooms/:roomId/scene-checks` `{ actorPlayerId, sourceMessageId, choice }` ; `…/:checkId/join` `{ stance: help\|oppose\|pass\|choice }` ; `…/:checkId/resolve` ; `GET /api/rooms/:code` expose `sceneCheck` + `liveChoiceMessageId` ; WS `{ type: "scene_check", sceneCheck, liveChoiceMessageId }` |
| Mémoire | In-memory par salon (comme le verrou fill-all) — pas de SQLite |
| MJ | Un seul message **Action** (`Tour de table` si plusieurs avis) puis **un** `scheduleActionMj`. Voix **2e personne** (tu / vous) : les PJ ne sont jamais narrés comme des PNJ, y compris quand un nouveau joueur arrive |
| UI | `MjMessageMarkdown` (li cliquables tant que la liste est live et que le joueur n'a pas répondu) ; `SceneCheckBanner` (Laisser faire / Aider / S'opposer / On y va) ; **scroll figé sur le jet** |
| Prompt | `system-prompt.ts` + `MJ_PLAYER_VOICE_RULES` : 2e personne, pile de table, options non retenues ignorées. `player-action.ts` : narre le beat unique selon les totaux |

- Export : `recit-canon.md` + `scene.md` + `trame.md` + stats/sorts/alignement dans `joueurs.md`.

   - **Ollama (VPS)** : provider dédié, URL `http://127.0.0.1:11434/v1`, modèle ex. `qwen2.5:7b-instruct` (RAM-safe) — optionnel `qwen3:8b` / `qwen3:14b` si 16 Go+ ; install `deploy/ollama-setup.sh`, pas de tunnel Mac
   - **LM Studio (Mac + tunnel)** : URL `http://127.0.0.1:1234/v1`, modèle saisi à la main ; « Enregistrer la config MJ » = sauvegarde SQLite uniquement
   - **OpenRouter** : URL `https://openrouter.ai/api/v1`, ids `openai/gpt-4o` (MJ) + `openai/gpt-4o-mini` (outils) ; clé `sk-or-…` **jamais en git**
   - **Groq / Gemini (gratuit, serveur)** : `AI_PROVIDER=gemini|groq|openrouter`, `AI_MODEL`, `AI_FALLBACK_PROVIDER=groq` ; clés `GROQ_API_KEY` / `GEMINI_API_KEY` / `OPENROUTER_API_KEY` **uniquement `process.env`** (jamais frontend, jamais SQLite, jamais logs) ; même `completeChat` ; dernier fallback LM Studio / Ollama conservé. **VPS OVH** : l’API Gemini Google refuse souvent l’IP datacenter (`location is not supported`) → MJ Flash via OpenRouter (`google/gemini-3.8-flash`).
5. **LLM** — catalogue avec rôles `narration` / `tool` / `both` ; config par salon (`modelId` MJ + `toolModelId` optionnel cloud) ; `completeChat` + profils (`task-profile.ts`) ; **MJ auto Dire** désactivé (`AUTO_MJ_ON_PLAYER_MESSAGES`) sauf **Dire + @PNJ** (`scheduleSayNpcMj`) ; **MJ auto Action** actif (`scheduleActionMj`) ; Réclamer / routes hôte ; endpoint `POST /api/rooms/:id/mj` conservé (API interne / v2)
6. **Carte** — génération procédurale (simplex noise, biomes, effets toxic/fog/evil/buff, POI, territoires, SVG)
7. **Modèles** — tables SQLite : messages, quêtes, journal, propositions archivées (+ endpoints REST)
8. **Prompt MJ** — `packages/shared/src/mj/system-prompt.ts` + contexte monde + éléments établis (`established-canon.ts`)
9. **Docker** — `Dockerfile`, `docker-compose.yml`
10. **Graines / campagnes** — quitter sans supprimer le salon ; export Markdown fractionné ; liste « Mes graines » sur l'accueil ; reprise avec autre LLM via fichiers .md

## Architecture données campagne

### SQLite (source transactionnelle)

| Table | Rôle |
|-------|------|
| `rooms` | Salon = campagne ; `last_activity_at` ; `last_preamble_at` (préambule hôte) ; `last_recap_at` (récap reprise hôte) |
| `messages` | Chat DIRE/ACTION/MJ |
| `quests`, `journal_entries`, `archived_proposals` | Narratif structuré |
| `player_meta` | Karma, parcours, notes par PJ |
| `npcs` | PNJ (MVP table prête, alimentée manuellement ou v2) |

### Fichiers Markdown (source de vérité long terme)

Chemin : `apps/api/data/campaigns/{CODE}/` (override : `CAMPAIGN_DATA_DIR`).

```
{CODE}/
  README.md           # index + métadonnées
  journal.md
  lore.md             # heuristique snapshot (+ notes conservées)
  quetes.md
  joueurs.md          # karma, parcours, stats, sorts
  recit-canon.md      # faits établis par le MJ (canon persistant)
  scene.md            # lieu, ambiance, tension (timeline)
  pnj.md
  anecdotes.md
  choix.md            # propositions archivées
  carte.md
  chat-archive.md
```

**API** :
- `GET /api/campaigns?codes=A,B` — métadonnées pour graines locales
- `GET /api/rooms/:roomId/export` — régénère les .md
- `POST /api/rooms/:roomId/snapshot` — idem (appelé au « Sauvegarder et quitter »)
- `PATCH /api/players/:playerId/meta` — karma/parcours (god mode)

**Client** : `localStorage` clé `rpg-cr-grains` — liste des campagnes visitées (code, nom, playerId pour reprise).

### Joueur simple — session, déconnexion, reprise

| Mécanisme | Comportement |
|-----------|--------------|
| **Session** | `localStorage` `rpg-cr-session` : `roomId`, `roomCode`, `playerId`, `playerName`, `role` |
| **Graines** | `rpg-cr-grains` — même `playerId` ; mis à jour à chaque visite salon |
| **WS** | `use-room-websocket.ts` : reconnexion backoff, ping 25 s, focus/visibility → resync, polling 30 s si WS mort |
| **Présence** | Mémoire serveur (`presence.ts`) : `connected` via WS ; `leaving` si message WS `presence: leaving` ou « Sauvegarder et quitter » |
| **Doublon WS** | `registerClient` ferme l’ancien socket du même `playerId` ; `unregisterClient` ne marque offline que s’il n’y a plus d’autre socket ouvert |
| **Tab close / veille / réseau** | WS `close` → offline côté liste compagnons ; reprise : même URL `/salon/:code` + session intacte → reconnect + `GET /api/rooms/:code` |
| **Rejoindre (accueil)** | Si graine ou session locale pour ce code → **reprise** (`playerId` existant), pas de `INSERT` joueur ; sinon `POST …/join` crée un humain `draft` |
| **Rejoindre (lien / QR)** | `/salon/:code` → `SalonRoomClient` : session ou graine locale → `RoomView` ; sinon formulaire **Entrer dans le salon** (nom + `POST …/join`) — indispensable pour invités externes sans session |
| **API rejoin** | `POST …/join` body optionnel `{ playerId }` → reprend le joueur (pas de message système « a rejoint ») |
| **Joueur fantôme** | Évité : ne pas refaire « Rejoindre » sans graine ; préférer **Mes graines → Reprendre** ou lien direct salon |
| **Session invalide** | `RoomView` : si `playerId` absent de la liste après `GET` → message + `clearSession()` ; sans session/graine, `SalonRoomClient` affiche le formulaire d’entrée (pas d’erreur « rejoignez depuis l’accueil ») |
| **MJ bloqué** | Snapshot `mj_status` à la reconnexion WS + **`mjStatus` dans GET salon** ; garde-fou client 3 min ; heuristique ouverture campagne si prep sans récit ; `syncRoomFromApi` ne force plus `thinking: false` hors resync |
| **Quitter vs déconnect** | Déconnect = WS coupé, campagne intacte, session conservée. **Sauvegarder et quitter** = snapshot `.md` + `presence: leaving` + `clearSession()` + accueil |

### Reprendre avec un autre LLM

1. Accueil → **Mes graines** → **Reprendre** (restaure session locale).
2. God mode → reconfigurer provider/modèle (`room.llmConfig` en SQLite).
3. Le prompt MJ injecte `lore.md` + `journal.md` (si export existant) + DB récente.
4. Les .md restent la mémoire de campagne ; le LLM est interchangeable.

### v2 (documenté, non implémenté)

- MJ enrichit les .md via LLM après chaque session
- UI édition karma/PNJ in-game
- Sync cloud des exports

## Lancer en dev

```bash
cd /Users/hakou/rpg-cr
npm install
npm run dev
```

- Web : `0.0.0.0:3000` — LAN : `http://<IP-du-Mac>:3000` (ex. `http://192.168.0.210:3000`)
- API : `0.0.0.0:4000` — le front appelle `http://<même-host>:4000` automatiquement
- QR / liens d’invitation : `window.location.origin` (pas localhost)
- CORS API : `origin: true` (toutes origines en dev)

### Réseau local (LAN)

1. Mac et téléphone sur le **même Wi‑Fi**.
2. `npm run dev` (écoute déjà sur toutes les interfaces).
3. Ouvrir `http://192.168.0.210:3000` (remplacer par l’IP locale affichée dans Réglages Système → Réseau).
4. Salon existant : `http://192.168.0.210:3000/salon/TP9UBT` — pas besoin de `NEXT_PUBLIC_*` localhost.
5. Pare-feu macOS : autoriser Node sur les ports 3000 et 4000 si bloqué.

### Port déjà utilisé (`EADDRINUSE` 3000 / 4000)

**Cause** : une ancienne instance API ou web tourne encore (terminal fermé sans Ctrl+C).

```bash
cd /Users/hakou/rpg-cr
npm run dev:kill   # libère 3000 et 4000
npm run dev
```

### Dépannage Next.js (`denormalizePagePath is not a function`)

**Cause** : cache `.next` corrompu ou obsolète (souvent après `npm install` / montée de version Next sans redémarrage propre).

```bash
cd /Users/hakou/rpg-cr
npm run dev:clean   # dev:kill + clean .next + dev
```

Versions épinglées dans `package.json` : `next@15.5.18`, `react@19.2.6`.

### Dépannage — disque plein (`ENOSPC: no space left on device`)

**Symptômes** : `localhost:3000` en **500**, API qui ne démarre pas, erreurs `Cannot find module './997.js'`, Next qui n’écrit plus dans `.next`.

**Cause** : disque Mac quasi saturé (souvent &lt; 500 Mo libres) — les compilations Next/tsx échouent à mi-chemin.

```bash
df -h /
# Libérer de l’espace (Corbeille, Xcode DerivedData, gros téléchargements…)
cd /Users/hakou/rpg-cr
npm run dev:kill
npm run clean:cache
npm run dev
```

Vérifier **≥ 2–3 Go libres** avant de développer confortablement.

### Dépannage Next.js (`Cannot find module './997.js'`)

**Cause** : chunk Webpack manquant dans `.next` (cache partiel après hot reload, build interrompu, `next dev` + `next build` en parallèle, `next start` sur un build périmé, ou **disque plein**).

```bash
cd /Users/hakou/rpg-cr
# 1. Arrêter tous les serveurs (Ctrl+C), puis :
npm run dev:clean
```

Ne pas lancer `npm run build` pendant que `npm run dev` tourne. Si le disque est plein, corriger **ENOSPC** avant de chercher un bug de chunks.

### VPS OVH (prod)

Guide : **[deploy/README.md](deploy/README.md)** — cohabitation **canopee.be**, **streamTv** (`/app`), **RPG-CR** (`/rpg-cr`).

| Étape | Commande / fichier |
|-------|-------------------|
| Prérequis VPS | `sudo bash deploy/vps-setup.sh` |
| Nginx | `deploy/nginx-rpg-cr.conf.example` → `include` dans server HTTPS `vps-e09ed6db.vps.ovh.net` |
| MJ gratuit (VPS) | [deploy/OLLAMA-VPS.md](deploy/OLLAMA-VPS.md) — Ollama sur le VPS (`LM_STUDIO_BASE_URL=http://127.0.0.1:11434/v1`), sans Mac |
| MJ gratuit (Mac) | [deploy/LMSTUDIO-VPS.md](deploy/LMSTUDIO-VPS.md) — LM Studio + tunnel ; `npm run tunnel:helper` + bouton wizard **Démarrer le tunnel** |
| Secrets | `.env` : `LM_STUDIO_BASE_URL=http://127.0.0.1:11434/v1`, `NEXT_PUBLIC_BASE_PATH=/rpg-cr` ; `OPENAI_API_KEY` / `OPENROUTER_API_KEY` optionnels |
| Déploiement | `bash deploy/deploy.sh` — Docker `127.0.0.1:3010` / `4010`, `extra_hosts` host-gateway |
| Compose | `docker-compose.prod.yml` — build `NEXT_PUBLIC_BASE_PATH`, volume `rpg-data` |
| Première graine | [deploy/HOST-SETUP.md](deploy/HOST-SETUP.md) |
| Sauvegarde | `bash deploy/backup.sh` |

**URL publique** : `https://vps-e09ed6db.vps.ovh.net/rpg-cr` — same-origin API/WS via [config.ts](apps/web/src/lib/config.ts) + `basePath` Next.js.

**MJ local (gratuit)** : l'API appelle un endpoint OpenAI-compatible via `LM_STUDIO_BASE_URL` (nom historique — **Ollama** `http://127.0.0.1:11434/v1` ou **LM Studio** `http://127.0.0.1:1234/v1`). Providers UI distincts : **Ollama (VPS / local)** et **LM Studio (Mac + tunnel)**. `resolveLmStudioServerBaseUrl` ([lmstudio-url.ts](packages/shared/src/llm/lmstudio-url.ts)) prime sur l'URL affichée dans l'UI. **Sans Mac** : installer Ollama sur le VPS ([deploy/OLLAMA-VPS.md](deploy/OLLAMA-VPS.md)). **Avec GPU Mac** : tunnel SSH `-R 1234:127.0.0.1:1234` ([deploy/LMSTUDIO-VPS.md](deploy/LMSTUDIO-VPS.md)).

**État VPS (2026-07-14)** : Docker actif ; **MJ via Ollama sur le VPS** (`LM_STUDIO_BASE_URL=http://127.0.0.1:11434/v1`) — plus de tunnel Mac requis. Déploiement : `bash deploy/push-deploy.sh` (Mac) ou `bash deploy/deploy.sh` (VPS). Public : `https://vps-e09ed6db.vps.ovh.net/rpg-cr/`.

**Suite sur le VPS** :
```bash
ssh root@vps-e09ed6db.vps.ovh.net
cd /root/rpg-cr
sudo bash deploy/vps-setup.sh
cp deploy/.env.production.example .env
bash deploy/deploy.sh
sudo cp deploy/nginx-rpg-cr.conf.example /etc/nginx/snippets/rpg-cr.conf
# include snippets/rpg-cr.conf; dans streamtv (443)
sudo nginx -t && sudo systemctl reload nginx
```

**Sur le Mac** : `npm run tunnel:helper:install` (une fois, assistant au login) ; tunnel auto à la **création** ou **reprise** de partie hôte (navigateur → `127.0.0.1:17434`). Secours CLI : `npm run tunnel:ensure` ou `npm run host` (tunnel + navigateur). Scripts : `ensure-tunnel.sh`, `host-session.sh`, `tunnel-helper.mjs`.

**Dev local** : sans `NEXT_PUBLIC_BASE_PATH` → ports `:3000` / `:4000` inchangés.

## Fichiers clés

- `packages/shared/src/map/procedural.ts` — carte
- `packages/shared/src/llm/providers.ts` — `completeChat` (OpenAI-compatible) ; alias `completeAsMj` = kind narration ; overlay `AI_PROVIDER` + fallback `AI_FALLBACK_PROVIDER` puis LM Studio
- `packages/shared/src/llm/env-ai.ts` — Groq/Gemini : clés `process.env` uniquement, jamais le frontend
- `packages/shared/src/llm/character-json.ts` — parse JSON fiche (fill-all)
- `packages/shared/src/llm/task-profile.ts` — profils `narration` (temp 0,85) / `tool` (temp 0,15) ; `resolveTaskModelId`
- `packages/shared/src/llm/catalog.ts` — openai, anthropic, ollama, lmstudio, openrouter, **groq**, **gemini**
- `apps/api/src/character-all-guard.ts` — mutex fill-all par joueur + TTL **4 min** (pas le timeout HTTP)
- `apps/api/src/llm-cloud-providers.test.ts` — tests Groq/Gemini/JSON/erreur/timeout (`npm run test:ai`)
- `apps/api/src/character-all-progress.ts` — état progression fill-all (%, phase, fiche partielle)
- `apps/api/src/room-llm-queue.ts` — **file LLM globale par salon** (1 appel modèle à la fois) ; priorités `narrative` > `interactive` > `background` ; FIFO au sein d'une priorité
- `apps/api/src/index.ts` — routes + WS
- `apps/web/src/components/RoomView.tsx` — UI salon (plein écran récit, toolbar chat)
- `apps/web/src/components/ChatMessageRow.tsx` — ligne message (MJ markdown)
- `apps/web/src/components/MjMessageMarkdown.tsx` — rendu markdown récit MJ
- `packages/shared/src/mj/mj-response-prep.ts` — préparation réponse MJ (`[VJ]`, scène, arc)
- `apps/web/src/hooks/use-room-websocket.ts` — WS salon (reconnexion, ping, focus, polling 30 s)
- `apps/web/src/lib/message-vibrate.ts` — opt-in + vibration mobile sur nouveau message WS
- `apps/web/src/lib/message-notifications.ts` — opt-in + notifications Web sur nouveau message WS (onglet caché)
- `apps/web/src/lib/message-alerts-prompt.ts` — affichage bannière opt-in combinée
- `apps/web/src/components/MessageAlertsPrompt.tsx` — bannière opt-in vibrations + notifications
- `apps/web/src/lib/chat-messages.ts` — fusion messages sans doublon d'id
- `apps/web/src/components/SceneTensionGauge.tsx` — cadran tension
- `apps/web/src/components/SceneIndicator.tsx` — lieu + ambiance + édition god
- `packages/shared/src/mj/trivial-player-message.ts` — skip MJ auto (accusés de réception)
- `apps/web/src/components/ScribIndicator.tsx` — plume discrète (notes chronique en arrière-plan)
- `apps/web/src/components/AlignmentGrid.tsx` — sélecteur 3×3 alignement
- `apps/api/src/room-scene.ts` — scène SQLite + extraction LLM
- `packages/shared/src/alignment.ts` — types et labels alignement
- `packages/shared/src/scene.ts` — `SceneState`, `clampTension`
- `packages/shared/src/mj/scene-extract-prompt.ts` — prompt extraction scène
- `apps/web/src/components/HomePageClient.tsx` — accueil sans SSR (`dynamic` `ssr: false`)
- `apps/web/src/components/HomePageContent.tsx` — formulaires créer / rejoindre / graines
- `apps/web/src/components/PlaceholderInput.tsx` — champs à suggestion cliquable (input après mount)
- `apps/web/src/lib/random-names.ts` — générateurs de noms médiévalo-humoristiques

## God mode — fix définitif (v2)

- **Cause reswitch auto** (`RoomView.tsx` ~L104-107 + L127-144) :
  1. `useEffect([code, refresh])` rappelait `setAdminOpen(savedGod)` à chaque remount → écrasait le choix utilisateur.
  2. Hydration SSR : `useState` initialisé à `false` côté serveur, puis effet remettait la valeur localStorage → flip visible.
  3. `handleGodModeChange` **revertait** le switch si PATCH échouait (`setAdminOpen(previous)`).
  4. WS `players` / `refresh()` réinjectaient `isGodMode` depuis la DB, désalignant UI et état local.
- **Fix Option A** :
  - `useSyncExternalStore` + `rpg-cr-admin-panel:{playerId}` (`god-mode-ui.ts`) — **aucun** `setAdminOpen` React.
  - Toggle = `saveAdminPanel()` uniquement ; PATCH serveur fire-and-forget (pas de revert).
  - WS / refresh : `isGodMode` du joueur local forcé depuis `adminOpenRef`, jamais depuis DB.
  - `isAdminGod = isAdmin && adminOpen` (plus de triple condition DB).

### Dépannage switch god mode

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| Switch revient seul après chat/MJ | Ancien code resync | Vérifier pas de `setAdminOpen` hors handler ; rebuild web |
| Switch ON au chargement alors que OFF | Clé localStorage `rpg-cr-admin-panel:{playerId}` | DevTools → Application → localStorage → mettre `false` |
| Panneau god invisible mais switch ON | OK en mode joueur UI — endpoints API exigent PATCH DB | Réessayer toggle ; vérifier erreur réseau |
| Migration depuis ancienne clé | `rpg-cr-god-ui:*` migrée auto vers `rpg-cr-admin-panel:*` | — |

**Test manuel** : Toggle OFF → envoyer chat → MJ répond → switch reste OFF. Refresh page → reste OFF. Toggle ON → panneau visible.

## Présence joueurs (3 états)

- Type `PresenceStatus` : `arriving` | `active` | `leaving` | `offline` (`packages/shared`, enrichi côté API).
- **arriving** : fiche `draft`/`creating`, humain `ready` mais `introduced_in_story = 0`, cercle IA `pending`, ou pas encore prêt.
- **active** : prêt + introduit (humain) ou cercle `active` (IA) + WebSocket connecté.
- **leaving** : intention quit (`WS { type: "presence", status: "leaving" }`) ou cercle `withdrawn`.
- **offline** : déconnecté sans intention de quitter.
- Tracking : `apps/api/src/presence.ts` + `ws-hub.ts` ; diffusion enrichie dans `broadcastPlayers` et `GET /api/rooms/:code`.
- UI : `PlayerCompanionList` — pastilles ambre/vert/gris + tooltips FR ; **MJ** entrée séparée (♔ violet, même taille que joueurs) ; badge **god** visible seulement si `adminOpen`
- **États visuels compagnons** (`packages/shared/src/companion-active.ts`) :
  - **Couleur pleine** : humain `character_status === ready` **et** `introducedInStory` ; marionnette `circle_status === active`
  - **Grisé** (`companion-row--dimmed`, opacité ~0,45) : sinon — tooltips « Fiche incomplète » / « Présentez-vous pour rejoindre la table » / IA en attente
  - Badge **moi** sur la ligne du joueur de session ; conserver **hôte**, **god** (`adminOpen`), **IA**
- **Chat** : `canHumanParticipateInChat` — même condition que couleur pleine pour humains ; WS `/ws` ignore les messages si non éligible ; fiche visible dès `ready` ; si `ready` et pas `introducedInStory` → panneau **Se présenter** / **Présentation automatique** à la place de Dire/Action

## Couleurs locuteur (AAC)

- Palette `PLAYER_PALETTE` — contrastes **≥ 4.5:1** sur fond `#1a1f2e` (WCAG AA).
- Attribution **automatique unique par salon** (`pickUnusedColor` à la création ; `ensureUniquePlayerColors` corrige les doublons en DB au `listPlayers`).
- **Pas de picker UI** — couleur fixée à la création, visible chat + liste compagnons.
- `PATCH /api/players/:id/display-color` conservé (API seulement).

## Création personnage

| Acteur | Flow |
|--------|------|
| Humain rejoignant | `character_status: draft` → wizard 3 étapes + interview MJ optionnelle → `ready` → chat |
| Admin créateur (hôte) | Même flux : `draft` à la création salon → wizard obligatoire → `ready` + intégration MJ ; god mode (LLM) accessible pendant le wizard, chat bloqué jusqu'à finalisation |
| Marionnette IA (+) | LLM génère fiche anti-héros → intro MJ → `active` ; formulaire **+** : champ nom + 🎲 (`randomPlayerName`) |

API : `GET/PATCH /api/players/:id/character`, `POST …/finalize`, `POST …/introduce` (`{ mode: 'manual'|'auto', text? }` — entrée en scène sans MJ obligatoire), `POST …/ask-mj`, `POST …/generate-field` (remplissage IA par champ ✨), `POST …/generate-all` (fiche complète en **4 phases** avec progression 0–100 %)

### Génération IA par champ (fiche perso)

- Bouton **✨** en bas à droite de chaque zone texte (wizard + édition fiche).
- Endpoint `POST /api/players/:id/character/generate-field` — body `{ field, currentSheet, actorPlayerId }`.
- Endpoint `POST /api/players/:id/character/generate-all` — body `{ actorPlayerId, roomId, currentSheet?, hints? }` ; **4 phases LLM** séquentielles : histoire (0→40 %) → stats (55 %) → capacités (80 %) → biens (100 %) ; `GET …/generate-all-progress` (poll client ~450 ms) + WS `{ type: "character_gen_progress", playerId, percent, label, sheet }` ; timeout **120 s** par phase ; client **240 s** ; verrou **4 min** ; prompts `character-all-phases-prompt.ts`. Pipeline : LLM (`jsonMode`) → `parseCharacterSheetJson` → `normalizeCharacterSheet` / `mergeCharacterSheet` (pas de texte libre).
- **Mutex par joueur** : une seule génération fill-all par `playerId` (cible) à la fois → **429** si doublon (double-clic, autre appareil) ; TTL verrou **4 min** ; libération par **jeton** (une requête lente ne libère pas le verrou d'une relance) ; `finally` libère toujours ; `DELETE …/generate-all-lock?actorPlayerId=…` (propriétaire ou admin god) ; `GET …/generate-all-lock` pour polling.
- **HTTP** : timeout LM Studio → **504** `{ error }` (message « Délai dépassé… ») ; autres erreurs LLM → **502**.
- UI : bouton **« ✨ Remplir la fiche »** (`CharacterSheetFillAllButton`) — overlay avec **barre 0–100 %** + **spinner** + libellé de phase (`AiGenerationOverlay`) ; **heartbeat** toutes les 4 s pendant chaque phase LLM (« MJ en réflexion… », +2 % jusqu'à la fin de phase — gemma ~30–90 s en phase histoire) ; bouton **Annuler la génération** sur l'overlay chargement ; annulation **AbortController** serveur + client ; champs wizard/fiche mis à jour **en direct** via `onProgress` ; snapshot local avant appel ; `inFlightRef` + `disabled` pendant l’appel ; en **erreur** : brouillon inchangé + overlay `variant="error"` ; **429** : annuler verrou / réessayer (`ensureLockClear` libère auto si propriétaire) ; **409** annulation silencieuse côté client ; en succès : fiche finale mergée.
- **Overlay IA** (`AiGenerationOverlay.tsx`) : portail `document.body`, chargement **ou** erreur ; fill-all fiche PJ uniquement. En jeu (dont préambule/récap hôte), `mj_status` `thinking` → bordure animée + `.chat-mj-status` ; `background` → `ScribIndicator` uniquement.
- Logs : API `req.log.error` + `console.error` `[character-all]` (LLM vide, JSON invalide) ; navigateur `[fetchJson] generate-all HTTP` sur 4xx/5xx **sauf 403/429** (réponses métier attendues — fiche scellée, verrou).
- **Garde client fill-all** : `shouldShowFillAllButton` rechecké au clic ; wizard passe `playerState` (pas le prop initial) ; pas de `console.error` sur 403 « fiche scellée ».
- **Extension navigateur** : `chrome-extension://invalid/` (ERR_FAILED) et `A listener indicated an asynchronous response…` = extensions (traducteur, adblock, gestionnaire mots de passe) — **hors app** ; promesses fill-all terminées en `try/catch` + `.catch` sur le clic.
- Prompt : `packages/shared/src/mj/character-field-prompt.ts` — injecte champs déjà remplis + lore monde.
- **Locale** : `actorPlayerId` → `players.preferred_locale` passé aux builders (`buildGenerationLocaleRules` dans `locale.ts`) ; génération **en français** si `fr` (consigne stricte, pas de titres anglais type « Wanderer of the Crossroads ») ; libellés UI via `getCharacterFieldLabels` (`background` → **Historique**). Contenu déjà enregistré **non migré** — seules les nouvelles générations suivent la locale.
- Cohérence : ex. historique « riche marchand » → inventaire/argent/monture déduits logiquement.
- Sans `room.llmConfig` : texte d’aide (pas de bouton grisé) — « configurez le MJ en god mode ».
- Wizard hôte : overlay **colonne chat** uniquement (`char-wizard-overlay--section`) — panneau admin / god mode / LLM restent utilisables ; champs texte toujours éditables à la main.
- Remplacement direct du champ (MVP, pas de confirmation).
- **Panneau fiche** : replié après enregistrement confirmé (PATCH + GET refetch) ; erreur rouge locale si échec ; permissions : propriétaire ou admin du salon (`canAccessCharacter`, plus de `isGodMode` DB requis pour PATCH).

### Dépannage enregistrement fiche personnage

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| « La requête vers l'API a échoué (…/character) alors que le serveur répond » | **CORS** : preflight OPTIONS OK mais `PATCH` absent de `Access-Control-Allow-Methods` (défaut Fastify = GET,HEAD,POST) — curl OK, navigateur bloqué | Fix API : `methods` inclut PATCH/PUT/DELETE ; redémarrer `npm run dev` ; vérifier OPTIONS → `allow-methods` contient PATCH |
| Clic « Enregistrer » → panneau se replie mais rechargement vide | Ancien check API `isGodMode` DB → 403 silencieux | Rebuild API + web ; message rouge sous le formulaire |
| « Fiche enregistrée » mais données absentes au refresh | PATCH OK sans refetch confirmé (ancien code) | Nouveau flux : succès uniquement si GET refetch `sheetsMatch` |
| Champs vides après « Modifier » | Draft partiel (`startEdit` ne copiait que clés existantes) | `buildDraft()` initialise tous les champs `SHEET_FIELDS` |
| Admin ne peut pas éditer fiche d'un autre joueur | `canAccessCharacter` : admin du salon suffit (pas god mode UI) | PATCH avec `actorPlayerId` = admin, `playerId` = cible |
| « ✨ Remplir la fiche » grisé, champs inéditables | `room.llmConfig` null (bouton IA désactivé) **ou** wizard dans `chat-blocked` (`pointer-events: none`) | Saisie manuelle via champs + « Suite » ; hôte : god mode à droite pour LLM ; hint texte si pas de MJ |
| Fill-all → fiche vide / tout effacé | Bug corrigé : API fusionnait sur `{}` ; succès avec JSON vide → champs normalisés vides | Rebuild ; erreur 502 + overlay si LLM échoue ; brouillon local conservé |
| Fill-all ne finit jamais / timeout | LLM > 180 s → API **504** ; client abort 240 s ; message « gemma / READY / qwen 7b » (pas CORS si `/health` OK) | Vérifier LM Studio READY ; modèle plus léger ; logs API `[character-all]` |
| **« Suite » inactif après fill-all** (wizard) | Phase histoire remplit `rank`+`background` → bouton fill masqué + overlay retiré alors que génération continue ; `char-sheet-generating` bloquait tout le panneau | Rebuild web ; attendre fin overlay 100 % ; correctif : overlay tant que `busy`, actions hors zone `pointer-events:none` |
| Fill-all « CORS PATCH » alors que l’API répond | Ancien `formatFetchError` sur `Failed to fetch` (abort client = même symptôme) | Rebuild web ; erreur generate-all dédiée dans `api-errors.ts` |
| **429** fill-all / « déjà en cours » | Verrou actif (autre onglet, double-clic, requête lente) | **Annuler la génération** puis réessayer ; relance auto-libère le verrou si propriétaire ; TTL 4 min ; admin god peut libérer le verrou d’un PJ |
| Annuler génération → **400** | `DELETE` lock avec `Content-Type: application/json` mais corps vide (Fastify `FST_ERR_CTP_EMPTY_JSON_BODY`) | Rebuild web : `fetchJson` n’envoie le header JSON que si `body` présent |
| Deux fill-all en parallèle (LAN, même PJ) | Deux appels LLM lourds sur le même personnage | **429** mutex par `playerId` ; deux PJ différents **sérialisés** via la file salon (plus de collision LM Studio) |
| **502** test LLM Ollama « Modèle introuvable » (ex. `qwen/qwen3.5-9b`) | Id **LM Studio** conservé après changement de provider — Ollama utilise un autre format (`qwen2.5:7b-instruct`) | God mode → **Ollama** → liste auto au chargement + correction id → **Enregistrer** puis **Tester** (le test lit la config **en base**, pas le champ non enregistré) |
| Select Groq « Modèle » toujours rouge (20B et 120B) | La liste Ollama/LM Studio restait en mémoire et invalidait l’id cloud | Rebuild web ; Llama 70B / GPT-OSS sont valides |
| MJ erreur « encore en chargement » puis répond | Préflight Ollama : sonde 14s trop courte sur CPU VPS | Préflight Ollama = liste modèles seule (pas sonde chat) ; voyant `MjLlmStatusIndicator` (prêt / en cours / erreur) |

**Test curl** (remplacer `{playerId}`, `{roomId}` ; API + `llmConfig` requis pour generate-all) :

```bash
curl -X PATCH "http://127.0.0.1:4000/api/players/{playerId}/character" \
  -H "Content-Type: application/json" \
  -d '{"actorPlayerId":"{playerId}","characterSheet":{"rank":"Test"}}'
curl "http://127.0.0.1:4000/api/players/{playerId}/character?actorPlayerId={playerId}"
curl "http://127.0.0.1:4000/api/rooms/{code}"
curl -X POST "http://127.0.0.1:4000/api/players/{playerId}/character/generate-all" \
  -H "Content-Type: application/json" \
  -d '{"actorPlayerId":"{playerId}","roomId":"{roomId}","currentSheet":{}}'
```

### Portrait / token joueur

- Colonne SQLite `players.avatar_path` ; fichiers `apps/api/data/avatars/{playerId}.{jpg|png|webp}` (override `AVATARS_DIR`).
- `POST /api/players/:id/avatar` (multipart, max 2 Mo) · `GET …/avatar` · `DELETE …/avatar`.
- Upload : propriétaire ou admin god ; preview ronde dans wizard + fiche ; token 32px liste compagnons ; 22px chat.
- Placeholder silhouette 🧑 si pas d'image ; bordure dorée (`--accent-dim`).

## Marionnettes IA et couleurs

- **+** (admin) : `POST /api/rooms/:roomId/ai-players` → `character_status: creating`, message système, puis `scheduleAiPuppetGeneration` :
  - **LLM configuré** : génération JSON fiche via `runMjTurn` → `ready` + fiche remplie → `scheduleCircleMj` (intro cercle) → `active`
  - **Sans LLM** : message système discret + fiche minimale (`background` / `notes`) → intro cercle quand même
- **−** (admin, IA active) : `PATCH …/ai-players/:id` → `withdrawn`, MJ auto sortie narrative

## Ouverture de campagne (nouvelle graine)

- Colonnes `rooms.world_seed` (UUID unique) et `rooms.campaign_opening_done` (0/1).
- `createRoom` : monde vierge — scène/trame null, `campaign_opening_done = 0` ; carte procédurale via `map_seed` dérivé de `world_seed`.
- **Noms de royaumes** : générés de façon déterministe par `world_seed` / `map_seed` dans `packages/shared/src/map/world-names.ts` → stockés dans `rooms.map_json` (`countries`, `territories`, POI). Plus de liste figée Aldermar / Brumes / Khar-Vos pour les **nouveaux** salons.
- **Déclenchement unique** quand l'**hôte** (admin humain) finalise sa fiche (`POST …/character/finalize`) ou passe `ready` + `story_locked` : `scheduleCampaignOpening` → `bootstrapCampaignOpening` (`apps/api/src/campaign-opening.ts`).
- Deux appels LLM : plan JSON (`packages/shared/src/mj/campaign-opening-prompt.ts`) puis récit MJ long (Acte I, hook, enjeu) intégrant la fiche hôte — **pas** de second message d'intégration pour l'hôte. Le prompt d'ouverture injecte les pays / territoires / POI de la carte et interdit les noms legacy sauf s'ils sont déjà dans `map_json` (anciennes parties).
- WS `mj_status` phase `opening` → placeholder barre de chat « Le MJ prépare le monde… » ; message système discret au démarrage.
- **Resync client** : `GET /api/rooms/:code` expose `mjStatus` (refcount serveur) ; `RoomView.refresh` réapplique l'état MJ si WS manqué ; heuristique messages (« Le MJ prépare le monde… » sans récit MJ ni échec) → statut occupé ; si échec ouverture déjà dans le fil → **clear** du spinner bloqué (WS `message` + refresh).
- **Échec ouverture visible joueurs** : message `L'ouverture de campagne a échoué…` n'est plus filtré comme message technique admin ; pendant l'ouverture, panneau « Se présenter » remplacé par attente.
- **`POST …/introduce` (auto)** : timeout client **270 s** (comme MJ) — évite l'erreur générique « requête échouée alors que le serveur répond » à 30 s.
- `lore.md` / journal export : injectés dans le prompt MJ **seulement** si `campaign_opening_done` et export existant (évite le biais des anciennes intros sur une nouvelle partie).
- Prompt système + heuristiques scène : interdiction des clichés ruines/forteresse par défaut ; « Commencer » après ouverture = reprise sans re-intro complète.

## Entrée en scène (joueur humain)

- **`introduced_in_story = 1`** uniquement via :
  - `POST /api/players/:id/introduce` (`player-introduce.ts`) — **manual** (texte → `say`) ou **auto** (LLM, `room.llmConfig` requis) ;
  - `bootstrapCampaignOpening` : **hôte admin** seulement (pas les autres PJ `ready`) ;
  - pas de marquage sur scellement fiche, join salon, ni messages système.
- Finalisation fiche : système « X a scellé sa fiche — présentez-vous pour rejoindre l'aventure » ; `RoomView` : panneau **Se présenter** / **Présentation automatique** tant que `ready && !introducedInStory` (`canHumanParticipateInChat` bloque Dire/Action/WS).
- **Manuel** : le MJ ne complète pas la présentation (même pour « salut » seul) — voir `player-intro-followup-prompt.ts` + section prompt système.
- **Accusés de réception** (`: bien`, `ok`, `merci`, `👍`, etc.) : filtrés par `isTrivialPlayerMessage` sur **Action** (pas de tour MJ) et sur Dire si `AUTO_MJ_ON_PLAYER_MESSAGES` est réactivé.
- **Banter entre PJ** : heuristique `shouldSkipAutoMjForPlayerBanter` (`packages/shared/src/mj/player-banter.ts`) — s'applique au Dire auto uniquement (pas aux actions).
- Join : « X a rejoint le salon — complétez votre fiche… » (ne marque pas introduit).
- Réparation données : `repairStaleIntroductionFlags` au `GET /api/rooms/:code` — remet `introduced_in_story=0` si humain marqué sans message `say`/`action` (sauf hôte après ouverture campagne).
- Test : `POST /api/players/:id/reset-introduction` `{ actorPlayerId }` (soi ou admin salon).
- Après introduce : **pas** de tour MJ auto tant que `AUTO_MJ_ON_PLAYER_MESSAGES` est `false` (`schedulePlayerIntroFollowUpMj` no-op) — présentation joueur seule ; réaction MJ via **Réclamer** si besoin.

## Préambule et récap hôte (Réclamer)

- **`POST /api/rooms/:roomId/mj/prompt`** — types joueur : `start` | `continue` | `hint` | `reclaim` (`player-mj-prompts.ts`) ; types **hôte admin** : `preamble` | `session_recap` (`host-mj-prompts.ts`, `requestHostMjTrigger` dans `mj-auto.ts`).
- **UI** (`RoomView`) : l'hôte a un seul bouton **Réclamer** (champ vide, chat actif). Le type est choisi côté client via `pickHostMjPromptType` (`host-mj-prompts.ts`) :
  - **`preamble`** si `!campaignOpeningDone` (avant ouverture de campagne)
  - **`session_recap`** si ouverture faite, `lastPreambleAt` renseigné (ou après ouverture auto), au moins un message, et pas encore de récap dans l'onglet (`sessionStorage` clé `rpg-cr-recap-done:{roomId}`)
  - sinon **`reclaim`** (continuer le récit) — y compris après ouverture de campagne sans `last_preamble_at` (l'ouverture compte comme préambule via `touchLastPreambleAt`)
- **Réclamer (joueur)** : `mjPromptBusy` reste actif jusqu'au message MJ ou échec WS ; **`reclaimError`** sous le bouton + bannière rouge (tous les joueurs) ; garde-fou client **280 s** (aligné timeout fetch MJ **270 s**) ; échec rapide **5 s** si aucun `mj_status` thinking serveur après POST ok ; reset client si dernière sollicitation **> 2 min** (`localStorage` `rpg-cr-mj-prompt-at:{roomId}`) ; `mjThinkingBegin` côté API dès acceptation du `POST …/mj/prompt`.
- **Bugs corrigés (2026-05-28)** :
  - Préambule hôte : `narrativePhase` + `endNarrativeMjThinking` (évite `openingRefs` bloqué → Réclamer grisé à vie).
  - Échec LLM silencieux : message « Le MJ n'a pas pu répondre… » **visible par tous** (`message-visibility.ts` — plus filtré comme erreur technique admin).
  - File `room-llm-queue` : un appel modèle à la fois par salon ; `runImmediateMj` annule le debounce action en cours (`cancelPendingMjSchedule`).
  - **Action** : `mjThinkingBegin` dès planification (debounce 4 s) + feedback client optimiste à l'envoi ; pas de double `mjThinkingBegin` au tour LLM (`narrativeThinkingShown` si thinking action déjà actif).
  - Contexte LLM : budget `runMjTurn` (mode **full** ~24k car. monde / 16 messages ; retry **slim** ~12k / 8 messages) ; préflight LM Studio (~20 s max) avant le tour lourd ; timeout adaptatif LM Studio **180–240 s** (`resolveLlmTimeoutMs`).
- Les autres joueurs gardent **Réclamer** → `reclaim` seul.
- **Préambule** : MJ pose monde, lieu, intrigue, présente chaque PJ prêt (fiches) ; peut archiver scène/trame ; **ne** marque pas `introduced_in_story`. Horodatage `rooms.last_preamble_at` à la fin du tour.
- **Récap** : synthèse de reprise à partir du chat récent, journal DB, trame archivée, export `lore.md` / `journal.md` si présent ; pas d’extraction LLM scène (`skipSceneExtract`) mais bootstrap lieu léger si archive vide ; horodatage `rooms.last_recap_at` à la fin du tour.
- Préambule / récap hôte : même feedback discret que le MJ en jeu (bordure `.chat-log-wrap--mj-thinking` + `.chat-mj-status` sous le fil) — **pas** d'overlay plein écran.

## Intégration narrative joueur humain (MJ)

- **Présentation manuelle** (`POST …/introduce` mode `manual`) : le MJ réagit uniquement via `buildPlayerIntroFollowUpPrompt` — pas de biographie inventée, pas de scène d'arrivée si le joueur n'a dit qu'un salut ; fiche du locuteur **non** injectée dans le tour (`omitSpeakingPlayerSheet`). Consignes aussi dans `system-prompt.ts`.
- **Présentation auto** : texte généré par LLM puis accueil MJ bref (`mode: auto` dans le même prompt) — pas de second récit d'intégration.
- `tryIntegrateHumanPlayerInStory` (récit long depuis la fiche) **n'est plus** appelé après `introduce` ; réservé à d'éventuels flux futurs hors entrée volontaire.
- Pas de re-déclenchement sur PATCH biens matériels.
- **Couleur** : auto `pickUnusedColor` ; palette `@rpg-cr/shared` (`PLAYER_PALETTE`, `MJ_DISPLAY_COLOR`)
- Export : humains → `joueurs.md` ; marionnettes → `pnj.md`

## Mécanique de narration (`packages/shared/src/mj/narration/`)

Module réutilisable : `NarrationKind` + `NarrationContext` + `buildNarrationPrompt(ctx)` (dispatcher vers builders FR par kind). Chaque prompt se termine par les règles `MJ_CANON_CONTINUITY_RULES` (`canon-continuity.ts`).

| Kind | Déclenchement |
|------|----------------|
| `player_action` | WS message `kind: action` → `scheduleActionMj` (debounce 4 s) |
| `player_say` | WS `say` si `AUTO_MJ_ON_PLAYER_MESSAGES` → `scheduleAutoMj` |
| `player_say_npc` | WS `say` + `@PNJ` (canon / marionnette, pas un autre PJ) → `scheduleSayNpcMj` |
| `reclaim_continue` | Joueur **Réclamer** (`POST …/mj/prompt` type `reclaim`) |
| `player_start` / `player_continue` | Commencer / Continuer (joueur) |
| `hint` | Indice (joueur) |
| `host_preamble` / `host_recap` | Hôte **Réclamer** (`pickHostMjPromptType` → préambule ou récap) |
| `player_intro_manual` / `player_intro_auto` | Après `POST …/introduce` si auto MJ réactivé |
| `circle_introduce` / `circle_withdraw` | Marionnette IA cercle narratif |
| `set_piece` | Réservé (séquences longues explicites, v2) |

Les anciens `buildPlayerMjPrompt` / `buildHostPreamblePrompt` / `buildSessionRecapPrompt` / `buildPlayerIntroFollowUpPrompt` délèguent à ce module.

**Action** : le MJ interprète l'action, l'intègre à la scène et aux compagnons présents, calibre la longueur (court vs dramatique), propose un jet si besoin — voir `builders/player-action.ts`. Si le joueur annonce un jet chiffré après une demande MJ, le prompt inclut la demande précédente et impose de narrer l'issue (+2 critique / 0 simple / −2 échec) correspondante.

## MJ automatique

- **Supprimé** : textarea « Consigne pour le MJ » + bouton « Faire parler le MJ » (redondant avec Dire/Action).
- **Dire** : `AUTO_MJ_ON_PLAYER_MESSAGES = false` → `scheduleAutoMj` no-op ; pas de MJ sur banter **entre PJ**. Exception : un `@` vers un **PNJ** du canon ou une marionnette (`scheduleSayNpcMj`, kind `player_say_npc`) — le PNJ réagit selon son rôle (peut ignorer, grogner, mentir). Un `@` vers un autre PJ ne déclenche rien.
- **Action** : `scheduleActionMj` **actif** même si `AUTO_MJ_ON_PLAYER_MESSAGES` est false ; trivial (`isTrivialPlayerMessage`) ignoré ; WS `kind: action` obligatoire côté client (`speechMode`) ; `mjThinkingBegin` au debounce + `executeAutoMj` avec `NarrationKind.player_action` ; handler WS `apps/api/src/index.ts` appelle `scheduleActionMj` / `scheduleSayNpcMj` puis `scheduleAutoMj` (second no-op).
- **Désactivé** (même flag) : `schedulePlayerIntroFollowUpMj`, `tryIntegrateHumanPlayerInStory`.
- **Toujours actifs** : `requestPlayerMjTrigger` / `requestHostMjTrigger` (Réclamer, indice, préambule, récap), `scheduleCampaignOpening`, `scheduleCircleMj`, `scheduleAiPuppetGeneration`, routes god mode / `promptMj` HTTP.
- Réactiver le MJ auto sur **Dire** : `AUTO_MJ_ON_PLAYER_MESSAGES = true` (heuristiques triviaux + banter dans `scheduleAutoMj` ; les actions passent par `scheduleActionMj` ou `scheduleAutoMj` selon le flag, sans double tour).
- **UI statut MJ** : voyant compact `MjLlmStatusIndicator` (à côté scène) — prêt / vérification / en cours / erreur / injoignable ; poll `GET /api/llm/tunnel-status` ; WS `{ type: "mj_status", thinking, background?, phase? }` — `thinking` = récit narratif : bordure animée sur `.chat-log-wrap--mj-thinking` + ligne `.chat-mj-status` sous le fil (préambule, récap, reclaim inclus) ; `background` = `ScribIndicator` (plume, pas de bordure chat). Envoi / Réclamer bloqués pendant `thinking` narratif (pas pendant `background`). Overlay plein écran : **génération fiche** uniquement (`AiGenerationOverlay` dans `CharacterSheetFillAllButton`). Serveur : `mjThinkingBegin` / `mjThinkingEnd` (`ws-hub.ts`) ; `executeAutoMj` appelle `mjThinkingEnd` **après** `broadcastMessage` (message ou erreur système), pas dans un `finally` qui précéderait le WS `message`. File d'attente si salon `busy` émet quand même `mjThinkingBegin` avant le retry. Client : feedback optimiste au clic Réclamer (`mjPromptPendingRef` + `setMjThinking` + libellé « Réclamer… ») ; tant que `mjPromptPendingRef`, tout `mj_status` avec `thinking: false` est **ignoré** pour l'overlay narratif (seul un message `mj` ou système « Le MJ n'a pas pu répondre… » / erreur HTTP / garde-fou 3 min termine l'attente) ; `refresh` après reconnexion compare les messages depuis le décompte au clic. Garde-fou 3 min si `thinking` bloqué.
- **Erreur** : `broadcastMjFailure` dans le chat (tous les joueurs) + bannière / `reclaimError` côté client ; `console.error` serveur avec `source` (`player:reclaim`, `action`, `host:preamble`, …).
- **Sanitisation réponses** : `prepareMjResponse()` / `formatMjMessageForDisplay()` — retire blocs `<!--scene:…-->` / `<!--arc:…-->` (y compris **tronqués** sans `-->`), parse JSON par accolades équilibrées, variantes `**[MJ] <!--scene:…` ; préfixe écho `[MJ]` / `[VJ]` / `[DIRE]` ; `collapseTrailingPhraseLoop` (fin « Il reste. Il reste. … »). Messages déjà en base : filtre à l'affichage.
- **Ton MJ** : `system-prompt.ts` — calibration intensité (scène calme = prose sobre, 1–3 ¶ ; pas de pathos ni répétitions) ; builders Réclamer / préambule / ouverture alignés.
- **Tag `[VJ]` (voix joueur)** : réservé au format historique des messages PJ — le MJ ne doit **pas** le produire. Si fuite modèle : `transformVjSegmentsForDisplay()` convertit les segments en citation markdown (`> *…*`, guillemets en italique). Consignes dans `system-prompt.ts` (pas de monologue PJ inventé).
- **Affichage MJ** : `ChatMessageRow` + `MjMessageMarkdown` (`react-markdown`, pas de HTML brut) — paragraphes, `**gras**`, `##` titres, listes `-`. Styles `.chat-msg-mj` dans `globals.css`. Prompt MJ : paragraphes courts + markdown léger.
- **Plein écran récit** : bouton unique ⛶/⊟ en haut à droite de `.chat-log-wrap` (`RoomView`, `aria-label` « Fermer » en étendu) — `.chat-panel--log-expanded` = overlay `100dvh` en **colonne flex** ; `sessionStorage` `rpg-cr-chat-expanded:{roomId}`. Scrollbar du fil (`.chat-log`) : piste sombre, curseur or/bronze (`globals.css`), discrète sur mobile jusqu’au scroll.
- **Scroll chat** (`RoomView`) : scroll **dans** `.chat-log` uniquement (`scrollTop`, pas `scrollIntoView` — évite les sauts de page sur mobile) ; auto-bas si proche du bas ; resync API (`refresh`, focus, poll 30 s) **conserve** la position si l'utilisateur lit l'historique ; ignore le resync si la liste de messages est inchangée.
- **Clé API** : jamais persistée en SQLite. Groq / Gemini : **uniquement** `GROQ_API_KEY` / `GEMINI_API_KEY` côté serveur (le champ god mode est masqué). OpenAI / OpenRouter : champ god mode (session) puis `OPENROUTER_API_KEY` / `OPENAI_API_KEY`. Prod VPS : lignes dans `.env` (pas dans le chat). Tester = bouton god mode ; Groq/Gemini n’envoient aucune clé au navigateur.

## Comptes joueurs (Google OAuth — MVP)

- **Table** `users` (SQLite) : `google_sub`, `email`, `display_name`, `avatar_url` ; colonne `players.user_id` optionnelle.
- **Auth** : NextAuth v5 (`apps/web/src/auth.ts`) — provider Google ; sync API `POST /api/auth/sync` (secret interne `AUTH_INTERNAL_SECRET`).
- **UI accueil** : `GoogleAuthPanel` — connexion / déconnexion ; graines fusionnées local + `GET /api/users/:id/grains`.
- **Création / join** : body optionnel `userId` sur `POST /api/rooms` et `POST …/join` ; reprise graine → `POST …/link-user`.
- **Sync automatique graines** : dès la connexion Google, toutes les graines localStorage sont automatiquement liées au compte (`linkPlayerToUserApi`) — les campagnes deviennent accessibles sur tous les appareils. Un `useRef` évite le re-linking à chaque render. Le refresh des graines est déclenché après le linking pour afficher l'état à jour.
- **Tunnel auto hôte** : `ensureHostTunnel()` — à la création salon, reprise graine (admin), entrée salon hôte et wizard MJ (mode VPS). Appelle l'assistant local `POST http://127.0.0.1:17434/start`, puis poll `GET /api/llm/tunnel-status` jusqu'à `reachable:true`. CLI : `npm run tunnel:ensure`.
- **Auth.js** : `basePath` = `/rpg-cr/api/auth` en prod ; handler route réinjecte `/rpg-cr` (Next.js le retire). `AUTH_URL` = origine HTTPS **sans** `/rpg-cr`. Nginx conserve le préfixe vers le conteneur web.
- **Nginx** : `location /rpg-cr/api/auth/` → conteneur **web** (3010) ; repli `location /api/auth/` pour le callback OAuth sans préfixe — voir `deploy/nginx-rpg-cr.conf.example`.
- **Google Cloud Console** : URI de redirection autorisée :
  - `https://vps-e09ed6db.vps.ovh.net/api/auth/callback/google` (canonique — généré par Auth.js)
  - `https://vps-e09ed6db.vps.ovh.net/rpg-cr/api/auth/callback/google` (optionnel — même backend via Nginx)
- **Variables** (`.env` VPS, **jamais commitées**) : `AUTH_SECRET`, `AUTH_URL=https://…/rpg-cr` (racine app, pas `/api/auth`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_INTERNAL_SECRET`, `API_INTERNAL_URL=http://127.0.0.1:4010`.
- **Anonyme** : créer/rejoindre sans compte reste possible.

## Sécurité & légal (MVP)

### Sécurité API / front
- **CORS** : `resolveCorsOrigins()` (`apps/api/src/security.ts`) — en prod, allowlist `CORS_ORIGINS` ou `AUTH_URL` / `NEXT_PUBLIC_APP_URL` ; en dev, reflet d'origine.
- **Rate limit** : `@fastify/rate-limit` global (défaut 240/min, `RATE_LIMIT_MAX`) + plafonds plus bas sur create/join/LLM models/export/auth sync.
- **Headers** : API (`X-Content-Type-Options`, `X-Frame-Options DENY`, `Referrer-Policy`, `Permissions-Policy`) ; Next.js `headers()` + CSP basique ; Nginx snippet HSTS + mêmes garde-fous (`deploy/nginx-rpg-cr.conf.example`, recopié au `deploy.sh`).
- **SSRF** : `assertSafeLocalLlmFetchUrl` — liste modèles LLM limitée au loopback / Docker.
- **PUT `/llm`** : `playerId` **obligatoire** + `canConfigureRoomLlm`.
- **Export / snapshot** : `actorPlayerId` membre du salon requis.
- **Users** : GET profil sans e-mail ; `link-user` refuse de réassigner un PJ déjà lié ailleurs.
- **WebSocket** : le `playerId` doit appartenir au `roomId` ; nom pris en base (pas de spoofing query).

### Pages légales
- Routes : `/mentions-legales/`, `/confidentialite/`, `/cgu/` (+ footer accueil, bandeau cookies informatif).
- Identité éditeur via env : `LEGAL_PUBLISHER_NAME`, `LEGAL_PUBLISHER_ADDRESS`, `LEGAL_CONTACT_EMAIL`, etc. (`apps/web/src/lib/legal.ts`) — **à renseigner** avant ouverture publique.
- Cookies Auth.js documentés comme strictement nécessaires (pas d'analytics tiers).

## Roadmap v2

- Auth persistante / comptes SaaS et facturation LLM *(MVP Google OAuth livré — voir section Comptes joueurs)*
- Flag « MJ auto OFF » par salon (au lieu du booléen global `AUTO_MJ_ON_PLAYER_MESSAGES`) ou debounce configurable
- Tours de combat, file d’interruptions, incarnation PJ absents
- Édition carte + journal côté MJ dans l’UI
- Postgres, Redis pour scale multi-instances
- HTTPS / reverse proxy Nginx (Traefik) documenté pour OVH
- Token salon signé (API/WS), chiffrement clés API cloud, suppression compte self-service, codes salon plus longs / anti brute-force
- Tests e2e

## Conventions

- UI : variables CSS, ton médiéval-moderne, humour discret dans les labels
- Répondre et documenter en français
- Ne pas commit sans demande explicite

## Notes agent

- La clé API LLM OpenAI/OpenRouter peut être saisie côté client (god mode) et transmise à l’appel MJ ; non persistée en base. **Groq / Gemini : jamais le frontend** — `GROQ_API_KEY` / `GEMINI_API_KEY` + `AI_PROVIDER` / `AI_MODEL` / `AI_FALLBACK_PROVIDER` dans `.env` (docker-compose.prod.yml).
- **Routage LLM** : `completeChat` + `taskKind` `narration` | `tool` ; si `AI_PROVIDER=groq|gemini` le serveur surcharge la config salon ; fallback `AI_FALLBACK_PROVIDER` puis LM Studio / Ollama (`LM_STUDIO_BASE_URL`). Cloud défaut hors VPS sans env = GPT-4o (MJ) + GPT-4o mini ; local = un seul modèle chargé.
- **Réclamer hôte** : `pickHostMjPromptType` + `handleHostReclaim` dans `RoomView` (préambule / récap / reclaim) — déjà en place ; pas de travail dupliqué côté sous-agent `3dd156bd` si non retrouvé dans l'historique.
- `getRoomByCode` compare en NOCASE (codes 6 caractères).
- Pour LM Studio dans Docker : `host.docker.internal:1234`.
- **URLs client** : `apps/web/src/lib/config.ts` — `getApiUrl()` / `getWsBase()` utilisent `window.location.hostname` + ports `NEXT_PUBLIC_API_PORT` (4000).
- **Hydratation React (mobile / QR salon / accueil)** :
  - Overlay dev Next.js : « A tree hydrated but some attributes… didn't match » — en **production** l’overlay peut être absent ; corriger quand même la cause.
  - **Extensions navigateur / Cursor Glass (Chrome iOS, bureau)** : injection d’attributs non présents dans le HTML serveur → mismatch à l’hydratation.
    - `__gcrremoteframetoken` sur `<html>` (remote preview Cursor)
    - `__gcruniqueid` sur `<input>` (Chrome mobile, assistant Google, ou outils Cursor) — typiquement formulaire **Créer un salon** à l’accueil
  - `suppressHydrationWarning` sur `<html>` et `<body>` : `apps/web/src/app/layout.tsx`.
  - **Salon** `/salon/[code]` : `SalonPageShell` (AuthProvider) → `SalonRoomClient` — porte d’entrée invité ; `RoomView` en `dynamic(..., { ssr: false })`.
  - **Prod Nginx** : `proxy_pass …/rpg-cr/` (conserver le préfixe) — sinon routes dynamiques salon émettent `/_next/…` au lieu de `/rpg-cr/_next/…` → 404 assets pour les invités.
  - **Accueil** `/` : `page.tsx` (RSC) → `HomePageClient.tsx` → `HomePageContent` en `dynamic` `ssr: false` ; formulaires créer/rejoindre aussi `suppressHydrationWarning` ; `PlaceholderInput` ne rend le vrai `<input>` qu’après `mounted` (`useEffect`).
  - Noms aléatoires : `use-random-suggestions.ts` (`useEffect`), jamais `Math.random` au premier rendu SSR.
  - **QR** : `InviteQrPanel` + `qrcode.react` en `dynamic` `ssr: false` ; URL via `roomJoinLink` dans `useEffect` uniquement.
  - **Avatars** : `cacheBust` portrait initialisé dans `useEffect`, pas `Date.now()` dans `useState`.
  - **God mode UI** : `useSyncExternalStore` + snapshot serveur `false` (`god-mode-ui.ts`).
  - **Utilisateur** : en prod sans extension, pas d’erreur ; si overlay persiste → désactiver extensions (Password Manager, Cursor, Google) ou ignorer en dev ; rafraîchissement forcé iPhone après déploiement ; `npm run dev:clean` si bundle périmé.
  - **Console salon** : `chrome-extension://invalid/` et `listener … asynchronous response` = extensions Chrome — pas d’action côté RPG-CR ; avertissement `[DOM] autocomplete` sur `#llm-api-key` corrigé (`new-password`).

## Config LLM local (Ollama / LM Studio)

### Groq / Gemini (cloud gratuit, serveur)

`AI_PROVIDER` **surcharge** la config salon (god mode) tant qu’il vaut `groq` ou `gemini`. Clés uniquement dans `.env` / Docker — jamais `NEXT_PUBLIC_*`.

```
GROQ_API_KEY=…
GEMINI_API_KEY=…
OPENROUTER_API_KEY=…
AI_PROVIDER=openrouter
AI_MODEL=google/gemini-3.8-flash
AI_FALLBACK_PROVIDER=groq
```

- **Défaut soirée (prod VPS)** : Gemini Flash **via OpenRouter** (`google/gemini-3.8-flash`). L’API Gemini Google (`generativelanguage.googleapis.com`) renvoie souvent `User location is not supported` depuis une IP datacenter OVH. Si OpenRouter échoue → Groq.
- **Local Mac** : `AI_PROVIDER=gemini` + `GEMINI_API_KEY` peut marcher (hors datacenter).
- Groq **free** compte les jetons **par minute** (TPM) **et** la réservation `max_tokens`. `openai/gpt-oss-20b` = **8k TPM**. Sur Groq : prompt **slim**, `max_tokens` ~1536, extraits auto **sans LLM**, retry 429.
- Groq : API `https://api.groq.com/openai/v1` ; si un id disparaît : `GET /openai/v1/models`.
- Gemini : API officielle OpenAI-compatible Google ; défaut Flash `gemini-3.8-flash` (ou `AI_MODEL=gemini-flash-latest`).
- Chaîne : provider env → `AI_FALLBACK_PROVIDER` → LM Studio/Ollama (`LM_STUDIO_BASE_URL`) si `useFallbackLmStudio`.
- Revenir au local : commenter `AI_PROVIDER` (ou `AI_PROVIDER=lmstudio` / `ollama`) puis god mode comme ci-dessous.
- Tests : `npm run test:ai` (mocks + live si les clés sont dans l’env).

### Architecture

```
Navigateur (:3000) → API (:4000) → Ollama (127.0.0.1:11434) ou LM Studio (127.0.0.1:1234)
```

Le navigateur **ne contacte jamais** Ollama ni LM Studio directement. CORS local = sans effet.

### Ollama (VPS)

1. `sudo bash deploy/ollama-setup.sh` (ou `ollama pull qwen2.5:7b-instruct` ; optionnel `qwen3:8b` / `qwen3:14b` si 16 Go+).
2. God mode → **Ollama (VPS / local)**, URL `http://127.0.0.1:11434/v1`, modèle ex. `qwen2.5:7b-instruct` (id **exact** de `ollama list` — pas un id LM Studio du type `qwen/qwen3.5-9b`). Outils = même modèle (profil déterministe).
3. **Enregistrer** puis **Tester la connexion** — bouton **Lister modèles Ollama (chat)** pour choisir l'id.

### Réglages LM Studio

| Réglage | Valeur | Note |
|---------|--------|------|
| Enable CORS | OFF | OK — inutile (proxy API) |
| Serve on Local Network | OFF | OK si API sur le même Mac |
| Require Authentication | OFF | OK |
| JIT Loading | ON | Attendre modèle **READY** |

### Étapes

1. Serveur LM Studio **Running**, modèle **READY** (id exact ex. `google/gemma-4-e4b`).
2. God mode → LM Studio, URL `http://127.0.0.1:1234/v1`, **Enregistrer** puis **Tester la connexion**.
3. Jouer : Dire ou Action dans le chat — le MJ répond automatiquement.

### « Failed to fetch » ≠ LM Studio

Erreur navigateur = souvent **requête longue ou route spécifique** alors que `/health` répond. Le client ping `/health` avant le message alarmiste. Si health OK : message route ciblée (MJ jusqu'à 2 min). Si health KO : vérifier `npm run dev`, pare-feu port 4000, `http://<IP>:4000/health` → `{"ok":true}`. Erreur JSON 502 = problème LM Studio côté serveur.

### Modèles LM Studio — particularités

| Modèle | Comportement | Action |
|--------|--------------|--------|
| **Embedding** (`text-embedding-nomic-embed-text-v1.5`, `bge-`, etc.) | **Ne supporte pas** `/v1/chat/completions` — réponse vide ou erreur | Choisir un modèle **chat/instruct** ; bouton « Lister modèles LM Studio (chat) » en god mode ; rejet **avant** l'appel API (`assertMjSuitableModelId`) |
| **Vision / VL** (`qwen3-vl-4b`, `-vl-`, `vision`, etc.) | Crash LM Studio fréquent (`The model has crashed…`) ou contexte inadapté au MJ texte | **Interdit** en god mode (`isUnsuitableMjModelId`) ; exclus de la liste chat ; message `formatLlmModelCrashRecoveryHint` dans le chat (Réclamer) |
| **Gemma** (`google/gemma-4-e4b`, etc.) | Peut répondre dans `reasoning_content` plutôt que `content` | Le provider lit `content`, `reasoning_content`, `reasoning` |
| **Qwen** (`qwen2.5-7b-instruct-1m`, etc.) | Répond en `content` ; gros contexte 1M → tours lents ; `reasoning_content` souvent vide | Attendre **READY** ; id exact via sidebar ou `GET /v1/models` ; si timeout → retry auto contexte **slim** |
| Tous (JIT) | HTTP 200 + `content: ""` ou préflight timeout (~14 s) | Préflight avant tour MJ (`preflightLmStudioForMj`) ; retry vide (6 s) ; retry timeout (+8 s) ; message « modèle en chargement » sans attendre 240 s |

Variables dev : `LLM_DEBUG=1` logue un extrait JSON des réponses vides (terminal API, pas l'UI).

Après changement API, **redémarrer** `npm run dev`. Tester : god mode → **Enregistrer la config** → **Tester la connexion**.

## God mode — correctif switch (définitif)

- **Cause API** : `Boolean("0") === true` → `parseGodMode()` dans `apps/api/src/rooms.ts`.
- **Cause UI (récidive)** : `refresh()` resynchronisait god mode après save LLM, etc.
- **Fix** : état **`adminOpen`** dédié à l’affichage du panneau ; initialisé une seule fois au chargement ; **jamais** resynchronisé dans `refresh()` ; PATCH `patchGodMode` met à jour `adminOpen` + liste joueurs locale.

## Sync chat multi-appareils (iPhone + bureau)

**Symptôme** : message ou réponse MJ visible sur le téléphone, pas sur l’ordinateur (même code salon).

**Cause** : le client bureau gardait une connexion WebSocket **morte ou suspendue** (onglet en arrière-plan, veille, proxy Wi‑Fi) sans reconnexion ni rafraîchissement ; les `broadcastMessage` serveur atteignent uniquement les sockets `readyState === OPEN`. Le broadcast côté API était déjà correct pour tous les abonnés du `roomId`.

**Correctif** (`use-room-websocket.ts` + `RoomView.tsx`) :
- Reconnexion automatique avec backoff
- À l’ouverture WS + `focus` / `visibilitychange` visible → `GET /api/rooms/:code` (messages à jour)
- Ping client toutes les 25 s → `pong` serveur (`index.ts`)
- Polling de secours toutes les 30 s si WS déconnecté
- Ajout message WS dédupliqué par `id` (`appendChatMessage`)

**Test** : deux navigateurs, même code salon (URLs LAN identiques, ex. `http://192.168.0.210:3000/salon/XXXXXX`) ; envoyer depuis l’un → l’autre à jour en &lt; 2 s. Bureau : revenir sur l’onglet ou rafraîchir si cache ancien bundle.

**LAN** : WS = `ws://<même-hostname>:4000/ws` (`config.ts`) — pas de proxy Next sur `/ws` ; API doit écouter sur `0.0.0.0:4000`.

## Alertes salon — vibrations et notifications (nouveau message WS)

Deux canaux distincts, opt-in séparés, déclenchés uniquement sur événement WS `{ type: "message" }` dans `RoomView.handleWsEvent` (**pas** au `refresh()` / reconnexion / sync bulk).

### Bannière (`MessageAlertsPrompt`)

- Affichée au premier passage salon si au moins une option reste à proposer (`shouldShowAlertsPrompt`).
- **Vibrations** (ligne mobile uniquement) : `localStorage` `rpg-cr-vibrate-enabled` ; report `sessionStorage` `rpg-cr-vibrate-prompt:{roomId}`.
- **Notifications** (tous appareils avec API) : bouton **Notifications** → `Notification.requestPermission()` sur geste utilisateur puis `rpg-cr-notify-enabled` ; report `rpg-cr-notify-prompt:{roomId}`. Si permission **denied**, pas de bannière intrusive.
- **Plus tard** : reporte les deux prompts pour la session / le salon.
- `prefers-reduced-motion` : masque la ligne vibrations, **pas** les notifications.

### Vibrations (`message-vibrate.ts`)

- API **Vibration** (`navigator.vibrate`) — pas de permission Notifications requise.
- Cible mobile : `max-width: 640px` ou `pointer: coarse`.
- MJ : `[30, 50, 30]` ; autre joueur : `[50]` ; pas ses propres messages ni `system`.
- iOS : vibrer souvent impossible sans geste préalable ; arrière-plan limité sans push.

### Notifications Web (`message-notifications.ts`)

- API **Notifications** du navigateur (`new Notification`) — alerte OS quand l’onglet est en arrière-plan (`document.visibilityState === 'hidden'`), sauf `rpg-cr-notify-always: true` (option avancée, défaut arrière-plan seulement).
- Permission `granted` + `rpg-cr-notify-enabled` requis.
- Titre : nom joueur ou « Maître du jeu » ; corps : extrait ~120 car., markdown/metadata retirés (`formatMjMessageForDisplay` pour MJ, préfixe « Le MJ : »).
- `tag` = `roomId`, `renotify: true` pour regrouper par salon.
- **Limites** : pas de push si le navigateur est **complètement fermé** (hors Service Worker + VAPID — hors scope). Pas de SW dédié pour l’instant.
- **iOS** : notifications Web souvent limitées ; sur certaines versions il faut ajouter le site à l’écran d’accueil (PWA). Tester sur l’appareil cible.

## API client — robustesse LAN

- `apps/web/src/lib/api.ts` : retries réseau uniquement (pas sur HTTP 4xx/5xx) ; timeout **30 s** (défaut) / **270 s** (routes MJ, fill-all) ; cache health 30 s (`api-health.ts`).
- `formatFetchError` : si `/health` récent OK → message ciblé route (pas « API injoignable » global) ; sinon message pare-feu + `curl …/health`.
- `getApiUrl()` : même hostname que la page + port 4000 (`config.ts`).

## Formulaires admin

- Bordures **vertes** / **rouges** (`--valid` / `--invalid`) au blur ou à la soumission.
- Section **Connexion MJ (LLM)** : repliée avec titre vert + ✓ après enregistrement réussi ; clic pour rouvrir.
- **Test LLM** : endpoint `POST /api/rooms/:roomId/llm/test` (god mode) — mini completion `max_tokens` 24 (128 si modèle *reasoning* `gpt-oss` / o-series) ; rejet HTTP **400** si modèle embedding ou **VL** ; liste modèles chat : `GET /api/llm/lmstudio/models?baseUrl=…` (VL filtrés) → appelle **`GET {baseUrl}/models`** avec base normalisée **`/v1`** obligatoire ; messages d'erreur test adaptés au backend (Ollama vs LM Studio via `formatLlmTestError` + `resolveLocalLlmBackend`) ; changement de provider local réinitialise le modèle par défaut (`qwen2.5:7b-instruct` pour Ollama). Cloud : second select **Modèle outils** (`toolModelId`) ; local : même modèle, sampling déterministe. Env prod : **OpenRouter `google/gemini-3.8-flash`** (Gemini Google direct est souvent refusé depuis l’IP OVH) ; Groq `gpt-oss-20b` en secours.
- **Clé API (god mode)** : champ `#llm-api-key` — `autoComplete="new-password"` (évite l’avertissement Chrome DOM sur les champs `type=password` hors formulaire de connexion).

## LLM local — timeouts, contexte, préflight

| Couche | Comportement |
|--------|----------------|
| **Budget contexte** | `context-budget.ts` + `model-context-tier.ts` — modes `full` / `slim` / **`micro`** (4b, VL, etc.) ; prompt système **compact** (`MJ_SYSTEM_PROMPT_COMPACT`) en micro ; `resolveMjMaxTokens` selon taille modèle |
| **Tour MJ** | `apps/api/src/mj.ts` — départ selon `initialMjContextModeForModel` (petit modèle → **micro**) ; si erreur **context length** → retry **micro** ; si timeout en **full** → retry **slim** ; message `formatSmallContextModelHint` si échec final |
| **Préflight** | `lmstudio-preflight.ts` — LM Studio : sonde chat ~14 s ; **Ollama** : liste modèles seule (pas de sonde — CPU VPS trop lent) |
| **Timeout HTTP** | `resolveLlmTimeoutMs` : LM Studio **180–240 s** selon taille prompt ; cloud **90–120 s** ; défaut `completeChat` si `timeoutMs` omis |
| **Profils tâche** | `narration` : temp 0,85 (tours MJ, ✨ champ, intro auto, récit ouverture) ; `tool` : temp 0,15 (extraction, fill-all JSON, traduction, aide héros, test) ; `jsonMode` + retry sans `response_format` si HTTP 400 ; cloud `toolModelId` (défaut GPT-4o mini) ; local = même `modelId` |
| **Fallback LM Studio** | Uniquement si l’id n’est **pas** un id marché (`gpt-`, `claude-`, …) — sinon l’erreur cloud est renvoyée telle quelle |
| **JIT / vide** | `providers.ts` : retry réponse vide (6 s) ; retry timeout LM Studio (+8 s backoff, 2e tentative même prompt) |
| **Client** | `api.ts` : routes MJ **270 s** ; `RoomView` garde-fou Réclamer **280 s** |
| **File d'attente** | `room-llm-queue.ts` — **un seul appel LLM à la fois par salon** ; priorités : **narrative** (MJ Réclamer/Action/ouverture) > **interactive** (fill-all, ✨ champ, aide héros, présentation auto, traduction) > **background** (extraction scène/faits/trame) ; remplace l'ancien `busyRooms` + retries ; fill-all garde le mutex **par joueur** (429 doublon même PJ) |
| **Erreur chat** | `broadcastMjFailure` + `formatMjFailureDetail` — crash LM Studio / VL → `formatLlmModelCrashRecoveryHint` (instruct 7B+, READY, Tester) ; timeout → hint Réclamer + retry slim |

Variables : `LLM_DEBUG=1` (extrait JSON vide + taille contexte MJ).

## Vue joueur vs god mode

En **mode joueur** (`adminOpen === false` ou rôle `player`) :

| Visible | Masqué |
|---------|--------|
| Chat (original ; traduction **sur clic** 🌐 si langue joueur ≠ hôte) | Panneau LLM, carte, `GraineReader`, `NarrativeCanonPanel` |
| Sa fiche personnage | Fiches détaillées des autres PJ |
| Compagnons (colonne droite, sous Préférences/Admin) | Badges hôte/god, contrôles IA admin |
| Messages système narratifs (entrée taverne) | Messages système techniques (erreurs LLM/config) |
| Sélecteur langue 🌐 (panneau latéral, sous le switch god mode ; select sans bordure/soulignement, chevron SVG) | Erreurs API admin (config MJ, god mode) |

La carte n'est chargée en state client **que** si god mode actif.

## Traduction multilingue (MVP)

- **Langues** : `fr`, `en`, `es`, `de`, `it`, `pt`, `nl`, `pl`, `ja`, `ko`, `zh`, `ru` (`packages/shared/src/locale.ts`).
- **Persistance** : `players.preferred_locale` (SQLite) + backup `localStorage` `rpg-cr-locale:{playerId}`.
- **Changement immédiat** : `LocaleSelector` → `onChange` + `PATCH …/locale` (pas de bouton Enregistrer) ; labels fiche (`getCharacterFieldLabels`) et traductions chat (`ChatMessageRow`) suivent `viewerLocale` ; wizard création inclut le sélecteur.
- **Resync** : `resolveViewerLocale` — si backup local ≠ serveur (PATCH en vol), le backup gagne jusqu’à resync ; re-PATCH automatique au `refresh()` si besoin.
- **API** : `PATCH /api/players/:id/locale` ; `POST /api/rooms/:roomId/translate` `{ text, targetLocale, sourceLocale?, messageId? }`.
- **Cache** : table `message_translations` (`message_id`, `target_locale`, `translated_text`).
- **Messages** : stockés en langue source (`content` + `source_locale` optionnel) ; traduction **passive** (`ChatMessageRow`) — bouton **initiales langue source** (ex. `FR`) dans l'en-tête si `shouldOfferChatTranslation(viewer, host)` ; clic → `POST …/translate` (animation légère badge + texte `.msg--translating`) ; après succès → icône **🌐** pour basculer original / traduction (`localeInitials`, `resolveMessageSourceLocale`).
- **MJ** : répond dans la langue du joueur qui a déclenché le tour (`preferredLocale` du dernier locuteur debounce).
- **Fiche PJ (IA)** : `generate-field` / `generate-section` / `generate-all` / `ask-mj` utilisent la locale de l'**acteur** (`actorPlayerId`), pas celle de la cible.
- Pas de traduction de ses propres messages ; sans LLM : clic 🌐 → tooltip « MJ non configuré » (pas d'appel auto au chargement).

## Correctifs 2026-09-10

### DD adapté à la difficulté de l'action

**Problème** : Les jets de caractéristique utilisaient toujours le même DD (généralement 12) basé uniquement sur la tension de scène, sans tenir compte de la difficulté intrinsèque de l'action décrite par le MJ.

**Solution** : Ajout d'une fonction `detectDifficultyModifier` qui analyse le texte du choix et détecte les mots-clés indiquant la difficulté :

- **Très difficile** (+3 au DD) : "très difficile", "extrêmement difficile", "quasi impossible", "presque impossible", "hautement dangereux"
- **Difficile** (+2 au DD) : "difficile", "compliqué", "risqué", "dangereux", "périlleux", "délicat", "ardu"
- **Un peu difficile** (+1 au DD) : "un peu difficile", "légèrement difficile", "pas évident", "pas simple", "assez compliqué"
- **Facile** (-2 au DD) : "facile", "simple", "aisé", "évident", "sans problème"
- **Très facile** (-3 au DD) : "très facile", "extrêmement facile", "trivial", "enfantin"

Le DD final est calculé ainsi : `DD = baseDc (selon tension) + modificateur difficulté`, avec un minimum de 8 et un maximum de 20.

**Fichier modifié** : `packages/shared/src/scene-choice.ts`

```typescript
function detectDifficultyModifier(text: string): number {
  // Détecte "difficile", "compliqué", "risqué", etc.
  // et retourne un modificateur de -3 à +3
}

export function inferSceneCheck(choice: string, tension = 0): SceneCheckSpec {
  const { dc: baseDc, worldMod } = tensionToDcAndWorldMod(tension);
  const difficultyMod = detectDifficultyModifier(choice);
  const dc = Math.max(8, Math.min(20, baseDc + difficultyMod));
  // ...
}
```

### Interface chat comprimée par l'aide personnelle

**Problème** : L'aide personnelle du héros s'affichait inline sous le compositeur de chat, comprimant l'espace de saisie même quand elle était repliée. Cela rendait la zone de texte minuscule sur mobile.

**Solution** : Suppression de l'affichage inline de l'aide personnelle. Elle reste accessible via l'**onglet "Aide"** du dock de navigation en bas/haut de l'écran. Cela libère complètement l'espace du chat pour la saisie.

**Changement** :
- Avant : `showAssistantInline = isMainView && Boolean(session && hasLlmConfig && me && chatReady && !chatLogExpanded)`
- Après : `showAssistantInline = false` (désactivé définitivement)

L'aide personnelle reste pleinement fonctionnelle dans son onglet dédié du dock.

**Fichier modifié** : `apps/web/src/components/RoomView.tsx`

### Format messages scene checks amélioré (choix cliquables)

**Problème** : Les messages générés automatiquement par les choix cliquables avaient un format très technique qui pouvait parfois confondre le MJ ou causer des erreurs d'authentification.

**Solution** : Amélioration du format des messages pour qu'ils soient plus clairs et narratifs :

**Avant** :
```
[Timothy] tente : « Poursuivre l'inspection... ».
Jet D&D 5e — Intelligence (Investigation) contre DD 12.
[Timothy] lance un d20 sur intelligence : 6 +0 = 6.
Résultat : échec (6 < DD 12).
```

**Après** :
```
**Timothy** tente : *« Poursuivre l'inspection... »*

**Épreuve** : Intelligence (Investigation) contre DD 12.
• **Jet** : d20(6) +0 = **6**

**→ échec (6 < DD 12)**
```

Le nouveau format utilise le markdown pour la lisibilité et un symbole `**→**` clair pour le résultat final.

**Prompt MJ amélioré** : Instructions simplifiées et plus directes :
- "Le résultat est déjà donné — pars de ce résultat"
- "Raconte immédiatement les conséquences"
- "Ne lance pas d'autre dé"

**Note importante sur l'erreur "Missing Authentication header"** : Si vous voyez cette erreur avec les choix cliquables, cela signifie que la clé API OpenRouter n'est pas configurée sur le VPS. Vérifiez :

```bash
# Sur le VPS
cat /root/rpg-cr/.env | grep OPENROUTER_API_KEY
# Doit afficher : OPENROUTER_API_KEY=sk-or-v1-...
```

Si absente, ajoutez-la dans `/root/rpg-cr/.env` puis redéployez (`bash deploy/deploy.sh`).

**Fichiers modifiés** : 
- `packages/shared/src/scene-check.ts` (format message)
- `packages/shared/src/mj/narration/builders/player-action.ts` (prompt)

## Correctifs 2026-09-09

### Scroll vers début message MJ (non vers la fin)

**Problème** : après une réponse MJ, le chat scrollait vers le bas (fin du message) au lieu du début du nouveau texte.

**Correctif** (`RoomView.tsx` L528+) : quand un message MJ arrive ET que `stickToBottomRef.current` est true (utilisateur proche du bas), on définit `pendingScrollToMessageIdRef.current = msg.id` et désactive stickToBottom. Le `useLayoutEffect` scroll alors vers le **début** du message MJ via `scrollChatLogToMessage`.

```typescript
} else if (msg.kind === "mj" && stickToBottomRef.current) {
  // Scroll vers le début du nouveau message MJ, pas vers le bas
  pendingScrollToMessageIdRef.current = msg.id;
  stickToBottomRef.current = false;
}
```

### Choix cliquables persistants après résolution

**Problème** : les 3 dernières propositions MJ devenaient non cliquables dès qu'un premier sceneCheck se résolvait, même si d'autres choix de la même liste restaient valides.

**Cause** : `resolveInternal` consommait le message source immédiatement (`consumeSource(roomId, check.sourceMessageId)`), empêchant d'autres joueurs de cliquer sur les choix restants.

**Correctif** (`apps/api/src/scene-check.ts` L491+) : ne plus consommer le message source lors de la résolution d'un sceneCheck. Le message n'est consommé que :
- Quand un nouveau message MJ arrive (`onNewMjMessage`)
- Quand une action libre (non sceneCheck) arrive (`onFreePlayerAction`)

```typescript
function resolveInternal(...) {
  // ...
  byRoom.delete(roomId);
  // Ne pas consommer le message source ici - les autres choix restent cliquables
  // consumeSource(roomId, check.sourceMessageId);
  emit(roomId, null);
```

### Cohérence spatiale et temporelle renforcée

**Problème** : incohérences narratives (ex. « le bard te suit dehors » puis « le bard reste à l'auberge »).

**Correctif** (`packages/shared/src/mj/canon-continuity.ts`) : ajout d'une section **« Cohérence spatiale et temporelle »** dans `MJ_CANON_CONTINUITY_RULES` qui exige :
- Respect des positions des personnages établies dans les messages récents
- Cohérence avec le lieu de scène actuel
- Interdiction de contredire les 3-5 derniers messages sans justification narrative

```typescript
## Cohérence spatiale et temporelle (obligatoire)
- **Positions des personnages** : si un PJ ou PNJ est explicitement sorti, parti, 
  entré ou déplacé dans les messages récents, **respecte ce fait**.
- **Lieu de scène** : le contexte indique où se déroule l'action en cours.
- **Actions récentes** : les 3-5 derniers messages établissent l'état actuel.
```

### Synchronisation automatique des graines avec compte Google

**Problème** : Les graines (campagnes sauvegardées) étaient stockées uniquement en localStorage et n'étaient pas automatiquement liées au compte Google. Un utilisateur connecté depuis un nouvel appareil ne voyait pas ses anciennes campagnes.

**Solution** : Ajout d'un système de synchronisation automatique dans `HomePageContent` qui, dès la détection d'une connexion Google (`appUserId` non-null), lie automatiquement toutes les graines localStorage au compte utilisateur via `linkPlayerToUserApi`. 

**Comportement** :
- À la première connexion Google, toutes les graines localStorage existantes sont liées au compte
- Un `useRef` (`autoLinkedUserIdRef`) évite le re-linking à chaque render
- Le refresh des graines est déclenché après linking pour afficher l'état à jour
- Les erreurs de linking sont ignorées silencieusement (player déjà lié, invalide, etc.)

**Fichier modifié** : `apps/web/src/components/HomePageContent.tsx`

```typescript
// Auto-link local grains to user account on login
useEffect(() => {
  if (!appUserId) return;
  if (autoLinkedUserIdRef.current === appUserId) return;
  
  const local = listGrains();
  if (local.length === 0) return;
  
  autoLinkedUserIdRef.current = appUserId;
  
  void (async () => {
    for (const grain of local) {
      try {
        await linkPlayerToUserApi(grain.playerId, appUserId);
      } catch {
        // Silently ignore errors
      }
    }
    void refreshGrains();
  })();
}, [appUserId, refreshGrains]);
```
