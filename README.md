# Tâches

Tâches par projet + journal de ce qui a été fait, jour par jour.
SPA React + TypeScript (Vite, Tailwind, shadcn/ui), petit serveur Node + SQLite (`node:sqlite`, requêtes par Drizzle ORM).

## Lancer en local

1. Installer **Node.js 22.18 ou plus** (24 conseillé) : https://nodejs.org. Vérifier avec `node --version`.
2. Activer pnpm (livré avec Node via corepack) :
   ```sh
   corepack enable
   ```
3. Récupérer le code et installer :
   ```sh
   git clone https://github.com/pom421/tasks.git
   cd tasks
   pnpm install
   ```
4. Démarrer (compile le front puis lance le serveur) :
   ```sh
   pnpm start
   ```
5. Ouvrir http://localhost:3000

Développement : `pnpm dev` → http://localhost:5173 (rechargement à chaud, API incluse, même base `data/tasks.db`).

Arrêter : `Ctrl+C`. Les données sont dans `data/tasks.db`, qui est créé au premier lancement.

Démo : `pnpm demo` recrée `data/demo.db` (3 projets, 8 jours ouvrés de Log jusqu'à hier) et lance l'app dessus, sans toucher à `data/tasks.db`.

Options : `PORT=8080 pnpm start` pour changer de port, `TASKS_DB=~/taches.db pnpm start` pour un autre fichier de base.

Vérifications :
- `pnpm typecheck` : TypeScript
- `pnpm test` : API et import (Node, sans navigateur)
- `pnpm test:e2e` : interface dans Chromium. La première fois, installer le navigateur : `pnpm exec playwright install chromium`

## Claude Code sur le web (environnement cloud)

Chaque session démarre dans un conteneur neuf : les dépendances doivent y être installées.

- **Automatique (rien à configurer)** : le hook `.claude/hooks/session-start.sh`, déclaré dans `.claude/settings.json`, lance `scripts/setup-cloud.sh` au démarrage de chaque session web (`corepack enable` + `pnpm install --frozen-lockfile`). Rapide quand le store pnpm est déjà en cache.
- **Optionnel, « Setup script » de l'environnement** : menu de l'environnement cloud (barre de titre de la session) → *Edit* → champ *Setup script*. Il tourne à la création du conteneur, avant Claude. À coller :
  ```bash
  #!/bin/bash
  set -euo pipefail
  # Dépôt tasks : à la racine de la session, ou cloné à côté.
  for dir in "${CLAUDE_PROJECT_DIR:-$PWD}" /home/user/tasks; do
    if [ -x "$dir/scripts/setup-cloud.sh" ]; then exec "$dir/scripts/setup-cloud.sh"; fi
  done
  echo "tasks introuvable : rien à installer"
  ```
- Navigateur des tests : pas de téléchargement, le Chromium du conteneur (`/opt/pw-browsers/chromium`) est détecté par `playwright.config.ts`. `pnpm test:e2e` marche tel quel.

## Utilisation

- Disposition : une colonne, quatre onglets : « Projets » (`P`, `/`), « Aujourd’hui » (`T`, `/plan`), « Suivant » (`S`, `/suivant`) et « Log » (`L`, `/log`) ; `Alt+←` / `Alt+→` passent à l'onglet précédent / suivant (en boucle). Chaque onglet garde la position du curseur : en y revenant, il est sur le même élément.
- Cocher une tâche → elle passe dans le Log, datée du jour, barrée. La décocher → elle revient dans son projet.
- Log (un cadre par jour) : fonctionne seul, les boutons de la zone des projets n'y touchent pas. Il montre les 5 derniers jours ayant des entrées (une semaine de travail ; jours vides sautés). Sous les onglets, alignés à droite, quatre filtres, combinés : seuls restent les jours qui ont une tâche correspondante :
  - tags (`#` dans l'onglet Log) : tâches portant tous les tags choisis (autocomplétion parmi les tags des tâches faites ; ✕ sur une pastille la retire). N'apparaît que si une tâche faite a un tag ;
  - recherche (`/`) : tâches dont le titre, le contenu ou le ticket contient le texte (sans tenir compte des majuscules ni des accents), le texte trouvé souligné dans les titres. `Échap` vide le champ ;
  - date « jusqu’au » (`d`) : les 5 jours jusqu’à cette date ; vide = période courante ;
  - projet (le nom du projet reste affiché au-dessus de ses tâches).
  - Au clavier : `/` place le curseur dans la recherche, `Tab` passe aux tags (s'il y en a), à la date puis au projet.
  - `<` / `>` (ou `←` / `→`) passent aux 5 jours précédents / suivants (désactivés en bout de liste) ; « Courant », tout à droite, ramène aux 5 derniers jours. Le nombre de résultats s'affiche au centre : « 6 tâches trouvées dans 5 journées ».
- Nouveau projet → curseur directement sur la saisie de sa première tâche.
- Projet : cœur ♡ = favori (plein et rouge quand actif, `f`). Ticket du projet (un epic par exemple) : `r` (pas d'icône, comme le report d'une tâche) ouvre un petit champ « Ticket » à droite, juste avant les icônes archive et corbeille (clé `PROJ-123` ou lien complet ; `Entrée` enregistre, vidé il retire le ticket, `Échap` abandonne). Il s'affiche ensuite au même endroit, dans l'onglet Projets seulement, en pastille rose (bleue pour une tâche reportée), et ouvre le ticket au clic (URL de base des Réglages). Annulable (`u`). Au survol d'un projet : icônes archive (archiver / désarchiver, `a`) et corbeille (supprimer, `x` `x`), avec leur nom en info-bulle. Suppression toujours en deux temps, sans fenêtre de confirmation : 1er appui (`x` ou corbeille) = message de ce qui va être supprimé, 2e appui = suppression, `Échap` annule. Une tâche se supprime au clavier (`x` `x`). Tout est annulable (`u`), y compris la suppression : le projet revient avec toutes ses tâches, Log compris.
- Dans l'onglet « Projets », sous les onglets et alignés à droite, quatre filtres de la **zone des projets** (sans effet sur le Log), combinables : report (`R` ou clic : « N tâches à reporter » → « N tâches reportées » → toutes), priorité (`!` ou clic : « Priorité 1 » → 2 → 3 → toutes), « Archivés » (seulement les projets archivés, `A`), « Favoris » (seulement les favoris, `F`), et à gauche les tags (`#` : champ avec autocomplétion, `↑` / `↓` et `Entrée` pour choisir, `Retour arrière` retire le dernier, ✕ sur une pastille la retire ; seulement les tâches portant tous les tags choisis). Chacun n'apparaît que s'il sert (au moins une tâche à faire à reporter ou reportée, une tâche à faire avec une priorité, un projet archivé, un favori, une tâche à faire avec un tag) ; actif, son icône se remplit (pas de fond coloré).
- Souris : clic sur un nom pour le modifier (pour une tâche, n'importe où sur la ligne jusqu'aux icônes, alignées à droite). Titre trop long : coupé par « … », affiché en entier au survol (ou au focus clavier, après un court délai : parcourir la liste ne l'affiche pas à chaque ligne).
- Fiche d'une tâche (`Maj+Entrée`, `o` ou icône 🗒) : titre complet, identifiant du ticket (`PROJ-123`, lien vers le ticket comme le badge de la ligne), date prévue, échéance, tags, puis contenu en Markdown. L'icône 🗒 signale une tâche qui a du contenu.
  - Lecture seule par défaut. `e` (comme GitLab) passe tout en édition : titre, puis `Tab` → ticket, date prévue, échéance, tags (autocomplétion ; `Entrée` ou `,` ajoute, ✕ retire), contenu. Double-clic sur le contenu : édition directement dedans.
  - `Ctrl+Entrée` (ou `Entrée` dans le titre / le ticket) enregistre et repasse en lecture seule ; un second `Ctrl+Entrée` (ou `Échap`) ferme. Enregistrement automatique.
  - Jira (Data Center / Server) : icônes ☁↑ « Pousser vers Jira » (`>`) et ☁↓ « Récupérer depuis Jira » (`<`), à droite. Champs synchronisés : titre ↔ résumé, contenu ↔ description (texte tel quel, sans conversion Markdown ↔ wiki Jira), échéance ↔ date d'échéance. Désactivées (raison en info-bulle) tant que le ticket n'est pas un identifiant (`PROJ-123`) ou que l'URL des tickets et le PAT manquent dans les Réglages. Un appui lit le ticket et ouvre une fenêtre de comparaison (tâche / Jira côte à côte, champs identiques atténués) : `Entrée`, la même touche ou le bouton confirme, `Échap` annule ; rien à changer : « Déjà identique dans Jira. ». Annulable (`u`) : pousser remet dans Jira les valeurs lues avant, récupérer rend à la tâche les siennes.
- Chrono d'une tâche à faire : au survol de la ligne (et dans la fiche), ▷ lance le chrono (`c`) ; en marche, l'icône devient une pause pleine, toujours visible. Temps passé dans l'info-bulle de l'icône (« 12 min », puis « 2h34 ») ; dans la fiche, affiché à gauche des icônes (texte normal chrono en marche, atténué sinon ; aussi pour une tâche faite). ↻ remet à zéro (`C`, sans confirmation, annulable par `u`). Un seul chrono en marche à la fois. Cocher la tâche arrête son chrono.
- Dates d'une tâche (fiche, `e`) : **date prévue** (quand je compte la faire) et **échéance** (date limite imposée de l'extérieur). Sur la ligne d'une tâche à faire, en étiquettes courtes (« demain », « lun. 29 », « 12 oct. », date complète en info-bulle) : date prévue sur fond gris (rouge si passée), échéance sur fond ambré (rouge si dépassée). Tags en `#tag` atténués.
- Aujourd’hui (plan du jour) : au survol d'une tâche à faire (et dans la fiche), ☀ l'ajoute à Aujourd’hui (`t`) : sa date prévue devient aujourd'hui ; une fois ajoutée, le soleil est plein et reste visible. L'onglet « Aujourd’hui » (`T`, adresse `/plan`) montre les tâches prévues aujourd'hui et, en tête sous « En retard », celles prévues avant et pas faites, par projet, sous un compteur « 3/5 tâches » (tâches du plan, en retard et faites comprises, sur le maximum par jour), en rouge au-delà du maximum. Une tâche cochée part dans le Log et reste comptée. ☀ sur une tâche en retard ou prévue plus tard la ramène à aujourd'hui. Maximum réglable dans les Réglages (5 par défaut). Filtres de la zone des projets masqués dans cet onglet. Annulable (`u`).
- Suivant (`S`, adresse `/suivant`) : agenda des tâches à faire datées, un cadre par jour à partir d'aujourd'hui ; une tâche apparaît à sa date prévue et à son échéance. Avant, un cadre par jour d'échéance dépassée, titre en rouge suivi de « (échéance dépassée) ». Icônes : calendrier = date prévue, réveil = échéance, sablier = durée (temps passé, dans la fiche). Filtres de la zone des projets masqués dans cet onglet.
- Priorité d'une tâche : icône chiffre à droite, pleine et colorée (1 rouge, 2 orange, 3 bleu), sinon « 1 » dans un carré à contour, au survol (ce que donne un clic). `1` `2` `3` sur la tâche donnent la priorité, le même chiffre la retire ; clic sur l'icône : aucune → 1 → 2 → 3 → aucune. Même icône et mêmes touches dans la fiche. Annulable (`u`).
- Icônes d'une tâche : toutes à droite, même style (atténuées et vides ; pleines quand actives, et alors toujours visibles).
- Report : une tâche passe « à reporter », puis « reporté » (badge après le titre : l'identifiant du ticket s'il y en a un, « reporté » sinon ; date du report en info-bulle). Passée « reporté » sans ticket, un petit champ « Ticket » s'ouvre dans la ligne, à la place du badge : `Entrée` enregistre l'identifiant (`PROJ-123`) ou le lien, `Échap` (ou `Entrée` à vide, ou un clic ailleurs) passe ; le ticket se renseigne plus tard dans la fiche.
- Réglages (icône ⚙, page `/admin`, `Échap` pour revenir) : URL de base des tickets (ex. `https://entreprise.tickets.fr`), qui transforme les identifiants en liens (`URL/browse/PROJ-123`), conservée en base, qui sert aussi d'adresse Jira ; PAT Jira (jeton d'accès personnel : champ masqué, jamais réaffiché, gardé en base mais retiré du fichier exporté, « Retirer » l'efface) ; nombre de tâches maximum par jour (Aujourd’hui) ; export / import des données.

Clavier (`?` affiche l'aide, un 2e `?` ou `Échap` la ferme ; groupée par thème : navigation, fiche, tâche, projet, filtres des projets, Log, général ; sur un petit écran, la liste défile sous le titre) :

| Touche | Action |
|---|---|
| `↑` `↓` ou `j` `k` | Passer d'un projet, d'une tâche ou d'un champ « + Ajouter » à l'autre (`Début` / `Fin` ou `g` `g` / `G` : premier / dernier). La page défile en avance : 5 éléments restent visibles après l'élément courant en descendant, avant en remontant, les 3 blocs de l'en-tête (barre, onglets, filtres) comptant comme des éléments (au clavier seulement, pas au clic). Un champ « + Ajouter » atteint ainsi reste en lecture : `Entrée` pour écrire (par `n`, `n` `n` ou un clic : écriture directe) |
| `Maj+↑` `Maj+↓` ou `K` `J` (`Maj+k` `Maj+j`) | En-tête du projet précédent / suivant |
| `Entrée` | Modifier le nom sélectionné, puis `Entrée` pour enregistrer |
| `Échap` | Quitter l'édition sans enregistrer, retour à la navigation ; dans un champ « + Ajouter » en écriture : le vide et le repasse en lecture (curseur sur le champ, `j` / `k` et `n` utilisables) |
| `Échap` puis `Échap` | Retirer tous les filtres : report, priorité, Archivés, Favoris, tags et ceux du Log (deux appuis rapprochés, hors champ de saisie) |
| `Espace` | Cocher / décocher la tâche |
| `Alt+↑` `Alt+↓` (ou `Alt+k` `Alt+j`) | Monter / descendre la tâche (priorité). En bord de projet, elle passe dans le projet voisin |
| `Alt+↑` `Alt+↓` sur un projet | Monter / descendre tout le projet (avant / après le projet voisin) |
| `Maj+Entrée` ou `o` | Ouvrir la fiche de la tâche (contenu Markdown, ticket) |
| `e` | Ouvrir la fiche directement en édition (titre, `Tab` → ticket, `Tab` → contenu) |
| `r` | Report : à reporter → reporté (champ du ticket dans la ligne : `Entrée` enregistre, `Échap` passe) → rien |
| `c` | Chrono de la tâche : lancer / mettre en pause (aussi dans la fiche) |
| `C` (majuscule) | Remettre le chrono à zéro (annulable par `u`) |
| `t` | Ajouter la tâche à Aujourd’hui / l'en retirer (aussi dans la fiche) |
| `P` / `T` / `S` / `L` (majuscules) | Onglet « Projets » / « Aujourd’hui » / « Suivant » / « Log » |
| `Alt+←` / `Alt+→` | Onglet précédent / suivant (en boucle) |
| `>` / `<` dans la fiche | Pousser vers Jira / récupérer depuis Jira : fenêtre de comparaison, puis `Entrée` (ou la même touche) confirme, `Échap` annule |
| `1` `2` `3` | Priorité 1, 2 ou 3 ; le même chiffre la retire (aussi dans la fiche) |
| `R` (majuscule) | Projets : seulement les tâches à reporter → reportées → toutes (ou clic sur le bouton du report) |
| `!` | Projets : seulement les tâches de priorité 1 → 2 → 3 → toutes (ou clic sur « Priorités ») |
| `f` sur un projet | Favori / plus favori |
| `F` (majuscule) | Afficher seulement les projets favoris (ou clic sur « Favoris ») |
| `a` sur un projet | Archiver / désarchiver |
| `r` sur un projet | Ticket du projet (epic…) : champ dans la ligne, `Entrée` enregistre (vide : retire), `Échap` abandonne |
| `A` (majuscule) | Afficher seulement les projets archivés (ou clic sur « Archivés ») |
| `x` puis `x` | Supprimer la tâche ou le projet : le 1er appui affiche ce qui va être supprimé, le 2e supprime (`Échap` annule). `Suppr` marche aussi |
| `u` | Annuler la dernière action, puis celle d'avant, aussi loin que l'historique remonte : créer, renommer, cocher / décocher, supprimer, déplacer, report, chrono, Aujourd’hui, priorité, date, ticket, modifications de la fiche ; sur un projet favori, archivage. Le curseur revient sur l'élément |
| `U` (majuscule) | Rétablir (rejouer) l'action annulée, dans l'ordre. Une nouvelle action efface ce qui restait à rétablir |
| `n` | Nouvelle tâche (dans le projet où est le curseur, sinon le dernier utilisé) |
| `n` puis `n` | Nouveau projet (deux appuis rapprochés, comme `g` `g`) |
| `d` | Date de fin de la période du Log (passe dans l'onglet Log) |
| `#` | Filtre par tags : celui du Log dans l'onglet Log, sinon celui des projets (passe dans l'onglet Projets) |
| `←` / `→` | Log : 5 jours précédents / suivants |
| `/` | Rechercher dans le Log (passe dans l'onglet Log) |

L'historique d'annulation est gardé en mémoire vive, dans l'onglet : on peut annuler autant d'actions que cette mémoire le permet, sans autre limite. Il se vide au rechargement de la page ; chaque `u` / `U`, lui, est enregistré en base comme toute modification.

Import / export (page Réglages) :

- **Exporter** télécharge la base `.sqlite`. **Importer .sqlite** remplace toute la base, en deux temps sans fenêtre de confirmation : 1er clic = message, 2e clic = choix du fichier, `Échap` annule (sans quitter les Réglages).
- **Importer .md** ajoute des projets et tâches depuis un markdown : puce = projet, sous-puce = tâche, une ligne avec une date (`## 24/09/2026`) ouvre une journée de tâches faites.

## Sécurité

- Pas d'authentification : le serveur n'écoute que sur `127.0.0.1`, il n'est pas joignable depuis le réseau.
- Requêtes venant d'un autre site refusées (CSRF), en-tête `Host` vérifié (DNS rebinding), CSP stricte (scripts limités à l'app ; styles inline tolérés pour les dialogues shadcn).
- Contenu Markdown assaini avant affichage (DOMPurify) : ni script, ni gestionnaire d'événement, ni lien `javascript:`.
- PAT Jira : envoyé seulement à l'URL des tickets, par le serveur ; jamais renvoyé au navigateur ni exporté.
- Import `.sqlite` vérifié (intégrité, ni trigger ni vue). Base lisible par ton seul utilisateur (`600`).
- pnpm : version épinglée par hash, npm/yarn bloqués, versions de moins de 7 jours refusées, scripts d'installation interdits (voir `pnpm-workspace.yaml`).
- ⚠️ Exposer l'app sur un réseau (`HOST=0.0.0.0` + `ALLOWED_HOSTS=…`) la rend accessible sans mot de passe.

## Architecture

```
server/           Node exécute le TypeScript tel quel (pas d'étape de build)
  index.ts        point d'entrée : sert l'API et le front compilé (dist/)
  app.ts          routes API, fichiers statiques, sécurité
  schema.ts       schéma de la base (Drizzle) : tables, colonnes, sens ; types déduits
  db.ts           accès SQLite (requêtes Drizzle)
  migrations.ts   scripts de migration numérotés et leur application
  migrate.ts      commande pnpm db:migrate
  markdown.ts     import du markdown
  jira.ts         lecture / écriture d'un ticket Jira (API REST v2, PAT)
  test/           tests API (node:test)
shared/types.ts   types échangés entre serveur et front (dérivés du schéma)
src/              front React (Vite)
  App.tsx         état, chargement des données, raccourcis globaux
  components/     Toolbar, ProjectFilters, ProjectList, TaskRow, TaskDialog, Jira, ReportBadge, Journal, SettingsPage…
  lib/markdown.ts rendu Markdown assaini (marked + DOMPurify)
  components/ui/  composants shadcn/ui (copiés dans le projet, modifiables)
  lib/nav.ts      navigation clavier (focus, ↑/↓, restauration après re-rendu)
  lib/api.ts      appels au serveur, typés
  lib/history.ts  historique u / U (store zustand, en mémoire dans le navigateur)
e2e/              tests d'interface (Playwright), 1 serveur + 1 base vierge par test
```

En dev, l'API est branchée dans le serveur Vite (`vite.config.ts`) : une seule commande.

## Modèle de données

Description complète et commentée : [`server/schema.ts`](server/schema.ts) (une base migrée doit lui correspondre exactement, `server/test/schema.test.ts`). En bref :

`project` (id, name, created_at, archived_at, favorite_at, position, bugtracker_key, bugtracker_url) : 1 projet a 0..n `task` (id, project_id, title, created_at, done_at, position, notes, bugtracker_wanted_at, bugtracker_at, bugtracker_key, bugtracker_url, time_spent, timer_started_at, day_at, due_at, tags, priority).
`setting` (key, value) : réglages de l'application (ex. `bugtracker_base_url`, `day_capacity` = maximum de tâches par jour, 5 par défaut, `jira_pat` = PAT Jira, lu par le serveur seulement).
`position` = ordre des projets, et ordre (priorité) des tâches dans leur projet.
`notes` = contenu en Markdown. Chrono : `time_spent` = secondes cumulées, `timer_started_at` = chrono en marche depuis (UTC) ; temps passé = les deux additionnés. `day_at` = date prévue ('YYYY-MM-DD') : aujourd'hui = au plan (Aujourd’hui), avant = en retard. `due_at` = échéance ('YYYY-MM-DD'). `tags` = liste JSON de tags normalisés (minuscules, sans `#`, espaces en `-`), `[]` = aucun. `priority` = 1 (P1, la plus haute) à 3, NULL = aucune. Une tâche est faite quand `done_at` est rempli (le journal, ce sont ces tâches-là), à reporter quand `bugtracker_wanted_at` l'est et pas `bugtracker_at`, reportée quand `bugtracker_at` l'est. Ticket (d'une tâche ou d'un projet) : `bugtracker_key` (lien construit avec `bugtracker_base_url`, qui peut donc changer) ou `bugtracker_url` (lien complet). Liens en http(s) uniquement.
### Versions du schéma

- Chaque évolution de la base est un **script numéroté** dans `server/migrations.ts` (version, nom, SQL), reportée dans `server/schema.ts`. On ajoute une version en fin de liste, on ne modifie jamais un script publié.
- À l'ouverture (démarrage ou import d'une base), les scripts manquants sont appliqués **dans l'ordre**, chacun dans une transaction : une base en version 2 passe en version 6 via 3, 4, 5 et 6.
- Suivi dans la table technique `schema_migration` (version, nom, version de l'outil, date d'application).
- Avant de migrer une base existante, une **sauvegarde** est faite à côté : `tasks.db.v2.bak` (si elle existe déjà, elle n'est pas écrasée : `tasks.db.v2.2.bak`, etc.).
- Une base plus récente que l'outil est refusée (mettre l'outil à jour).
- `pnpm db:migrate [fichier]` : affiche la version et l'historique, et migre si besoin.
