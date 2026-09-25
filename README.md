# Tâches

Tâches par projet + journal de ce qui a été fait, jour par jour.
SPA React + TypeScript (Vite, Tailwind, shadcn/ui), petit serveur Node + SQLite sans dépendance.

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

- Disposition : sur écran large, deux colonnes titrées « Projets » à gauche et « Log » à droite (Log toujours visible, il défile seul) ; sur écran étroit, le Log est sous les projets.
- Cocher une tâche → elle passe dans le Log, datée du jour, barrée. La décocher → elle revient dans son projet.
- Log (un cadre par jour) : fonctionne seul, les boutons de la zone des projets n'y touchent pas. Par défaut, aujourd'hui (même vide). Sur la ligne du titre, trois filtres :
  - recherche (`/`) : toutes les journées contenant une tâche dont le titre, le contenu ou le ticket contient le texte (sans tenir compte des majuscules ni des accents). `Échap` vide le champ ;
  - journée (`d`) : le Log de ce jour. Pendant une recherche, elle la limite à ce jour ; vide = toutes les journées ;
  - projet (`f`).
  - `<` / `>` passent au jour précédent / suivant qui a des entrées (désactivés en bout de liste et pendant une recherche) ; « Aujourd’hui », tout à droite, y ramène. Le nombre de résultats s'affiche au centre : « 5 tâches trouvées dans 2 journées ».
- Nouveau projet → curseur directement sur la saisie de sa première tâche.
- Projet : cœur ♡ = favori (plein et rouge quand actif, `f`). Au survol d'un projet : icônes archive (archiver / désarchiver, `a`) et corbeille (supprimer, `x` `x`), avec leur nom en info-bulle. Suppression toujours en deux temps, sans fenêtre de confirmation : 1er appui (`x` ou corbeille) = message de ce qui va être supprimé, 2e appui = suppression, `Échap` annule. Une tâche se supprime au clavier (`x` `x`). Tout est annulable (`u`), y compris la suppression : le projet revient avec toutes ses tâches, Log compris.
- Sous la barre d'outils, alignés à droite, trois filtres de la **zone des projets** (sans effet sur le Log), combinables : « N tâches à reporter » (`r`), « Archivés » (seulement les projets archivés), « Favoris » (seulement les favoris, `*`). Chacun n'apparaît que s'il sert (au moins une tâche à faire à reporter, un projet archivé, un favori) ; actif, son icône se remplit (pas de fond coloré).
- Souris : clic sur un nom pour le modifier (pour une tâche, n'importe où sur la ligne jusqu'aux icônes, alignées à droite). Titre trop long : coupé par « … », affiché en entier au survol (ou au focus clavier).
- Fiche d'une tâche (`Maj+Entrée`, `o` ou icône 🗒) : titre complet, identifiant du ticket (`PROJ-123`), puis contenu en Markdown. L'icône 🗒 signale une tâche qui a du contenu.
  - Lecture seule par défaut. `e` (comme GitLab) passe tout en édition : titre, puis `Tab` → ticket, puis `Tab` → contenu. Double-clic sur le contenu : édition directement dedans.
  - `Ctrl+Entrée` (ou `Entrée` dans le titre / le ticket) enregistre et repasse en lecture seule ; un second `Ctrl+Entrée` (ou `Échap`) ferme. Enregistrement automatique.
  - Ouverte par `L` (ou `J` → reporté), la fiche démarre en édition sur le ticket et `Entrée` la ferme.
- Report : une tâche passe « à reporter », puis « reporté » (badge après le titre, avec l'identifiant du ticket).
- Réglages (icône ⚙, page `/admin`, `Échap` pour revenir) : URL de base des tickets (ex. `https://entreprise.atlassian.net`), qui transforme les identifiants en liens (`URL/browse/PROJ-123`), conservée en base ; export / import des données.

Clavier (`?` affiche l'aide) :

| Touche | Action |
|---|---|
| `↑` `↓` ou `j` `k` | Passer d'un projet, d'une tâche ou d'un champ « + Ajouter » à l'autre (`Début` / `Fin` : premier / dernier) |
| `Entrée` | Modifier le nom sélectionné, puis `Entrée` pour enregistrer |
| `Échap` | Quitter l'édition sans enregistrer, retour à la navigation |
| `Espace` | Cocher / décocher la tâche |
| `Alt+↑` `Alt+↓` (ou `Alt+k` `Alt+j`) | Monter / descendre la tâche (priorité). En bord de projet, elle passe dans le projet voisin |
| `Alt+↑` `Alt+↓` sur un projet | Monter / descendre tout le projet (avant / après le projet voisin) |
| `Maj+Entrée` ou `o` | Ouvrir la fiche de la tâche (contenu Markdown, ticket) |
| `e` | Ouvrir la fiche directement en édition (titre, `Tab` → ticket, `Tab` → contenu) |
| `J` (majuscule) | Report : à reporter → reporté (fiche proposée pour le ticket) → rien |
| `L` (majuscule) | Ouvrir la fiche sur le champ « Ticket » |
| `r` | Projets : afficher seulement les tâches à reporter (ou clic sur « N tâches à reporter ») |
| `*` | Afficher seulement les projets favoris (ou clic sur « Favoris ») |
| `f` sur un projet | Favori / plus favori (ailleurs, `f` filtre le Log par projet) |
| `a` sur un projet | Archiver / désarchiver |
| `x` puis `x` | Supprimer la tâche ou le projet : le 1er appui affiche ce qui va être supprimé, le 2e supprime (`Échap` annule). `Suppr` marche aussi |
| `u` | Annuler la dernière action : sur une tâche cocher / décocher, renommer, supprimer ; sur un projet favori, archivage, suppression (une seule, pas les modifications faites dans la fiche). Le curseur revient sur l'élément |
| `p` / `n` | Nouveau projet / nouvelle tâche |
| `d` / `f` | Filtre du Log par journée / par projet (`f` hors projet sélectionné) |
| `/` | Rechercher dans le Log |

Import / export (page Réglages) :

- **Exporter** télécharge la base `.sqlite`. **Importer .sqlite** remplace toute la base.
- **Importer .md** ajoute des projets et tâches depuis un markdown : puce = projet, sous-puce = tâche, une ligne avec une date (`## 24/09/2026`) ouvre une journée de tâches faites.

## Sécurité

- Pas d'authentification : le serveur n'écoute que sur `127.0.0.1`, il n'est pas joignable depuis le réseau.
- Requêtes venant d'un autre site refusées (CSRF), en-tête `Host` vérifié (DNS rebinding), CSP stricte (scripts limités à l'app ; styles inline tolérés pour les dialogues shadcn).
- Contenu Markdown assaini avant affichage (DOMPurify) : ni script, ni gestionnaire d'événement, ni lien `javascript:`.
- Import `.sqlite` vérifié (intégrité, ni trigger ni vue). Base lisible par ton seul utilisateur (`600`).
- pnpm : version épinglée par hash, npm/yarn bloqués, versions de moins de 7 jours refusées, scripts d'installation interdits (voir `pnpm-workspace.yaml`).
- ⚠️ Exposer l'app sur un réseau (`HOST=0.0.0.0` + `ALLOWED_HOSTS=…`) la rend accessible sans mot de passe.

## Architecture

```
server/           Node exécute le TypeScript tel quel (pas d'étape de build)
  index.ts        point d'entrée : sert l'API et le front compilé (dist/)
  app.ts          routes API, fichiers statiques, sécurité
  db.ts           accès SQLite
  migrations.ts   scripts de migration numérotés et leur application
  migrate.ts      commande pnpm db:migrate
  markdown.ts     import du markdown
  test/           tests API (node:test)
shared/types.ts   types échangés entre serveur et front
src/              front React (Vite)
  App.tsx         état, chargement des données, raccourcis globaux
  components/     Toolbar, ProjectList, TaskRow, TaskDialog, ReportBadge, Journal, SettingsPage…
  lib/markdown.ts rendu Markdown assaini (marked + DOMPurify)
  components/ui/  composants shadcn/ui (copiés dans le projet, modifiables)
  lib/nav.ts      navigation clavier (focus, ↑/↓, restauration après re-rendu)
  lib/api.ts      appels au serveur, typés
e2e/              tests d'interface (Playwright), 1 serveur + 1 base vierge par test
```

En dev, l'API est branchée dans le serveur Vite (`vite.config.ts`) : une seule commande.

## Modèle de données

`project` (id, name, created_at, archived_at, favorite_at, position) : 1 projet a 0..n `task` (id, project_id, title, created_at, done_at, position, notes, jira_wanted_at, jira_at, jira_key, jira_url).
`setting` (key, value) : réglages de l'application (ex. `jira_base_url`).
`position` = ordre des projets, et ordre (priorité) des tâches dans leur projet.
`notes` = contenu en Markdown. Une tâche est faite quand `done_at` est rempli (le journal, ce sont ces tâches-là), à reporter quand `jira_wanted_at` l'est et pas `jira_at`, reportée quand `jira_at` l'est. Ticket : `jira_key` (lien construit avec `jira_base_url`, qui peut donc changer) ou `jira_url` (lien complet). Liens en http(s) uniquement.
### Versions du schéma

- Chaque évolution de la base est un **script numéroté** dans `server/migrations.ts` (version, nom, SQL). On ajoute une version en fin de liste, on ne modifie jamais un script publié.
- À l'ouverture (démarrage ou import d'une base), les scripts manquants sont appliqués **dans l'ordre**, chacun dans une transaction : une base en version 2 passe en version 6 via 3, 4, 5 et 6.
- Suivi dans la table technique `schema_migration` (version, nom, version de l'outil, date d'application).
- Avant de migrer une base existante, une **sauvegarde** est faite à côté : `tasks.db.v2.bak`.
- Une base plus récente que l'outil est refusée (mettre l'outil à jour).
- `pnpm db:migrate [fichier]` : affiche la version et l'historique, et migre si besoin.
