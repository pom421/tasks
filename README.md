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

## Utilisation

- Cocher une tâche → elle passe dans le journal, datée du jour. La décocher → elle revient dans son projet.
- Journal : par défaut, la dernière journée. Filtres par période (du… au…, bornes incluses) et par projet. Renseigner le début met la même date en fin : une journée entière.
- Nouveau projet → curseur directement sur la saisie de sa première tâche.
- Souris : clic sur un nom pour le modifier. Titre trop long : coupé par « … », affiché en entier au survol (ou au focus clavier).
- Fiche d'une tâche (`Maj+Entrée`, `o` ou icône 🗒) : titre complet, identifiant du ticket (`PROJ-123`), puis contenu en Markdown. L'icône 🗒 signale une tâche qui a du contenu.
  - Lecture seule par défaut ; `e` (comme GitLab) ou double-clic pour modifier ; `Ctrl+Entrée` repasse en lecture seule, un second `Ctrl+Entrée` (ou `Échap`) ferme. Enregistrement automatique.
- Report : une tâche passe « à reporter », puis « reporté » (badge après le titre, avec l'identifiant du ticket). Le bouton « N tâches à reporter », sous la barre d'outils, n'apparaît que s'il en reste et filtre la liste.
- Réglages (icône ⚙, page `/admin`) : URL de base des tickets (ex. `https://entreprise.atlassian.net`), qui transforme les identifiants en liens (`URL/browse/PROJ-123`). Conservée en base.

Clavier (`?` affiche l'aide) :

| Touche | Action |
|---|---|
| `↑` `↓` ou `j` `k` | Passer d'un projet, d'une tâche ou d'un champ « + Ajouter » à l'autre (`Début` / `Fin` : premier / dernier) |
| `Entrée` | Modifier le nom sélectionné, puis `Entrée` pour enregistrer |
| `Échap` | Quitter l'édition sans enregistrer, retour à la navigation |
| `Espace` | Cocher / décocher la tâche |
| `Alt+↑` `Alt+↓` (ou `Alt+k` `Alt+j`) | Monter / descendre la tâche (priorité). En bord de projet, elle passe dans le projet voisin |
| `Maj+Entrée` ou `o` | Ouvrir la fiche de la tâche (contenu Markdown, ticket) |
| `J` (majuscule) | Report : à reporter → reporté (fiche proposée pour le ticket) → rien |
| `L` (majuscule) | Ouvrir la fiche sur le champ « Ticket » |
| `r` | Afficher seulement les tâches à reporter (ou clic sur « N tâches à reporter ») |
| `x` puis `x` | Supprimer la tâche : le 1er appui demande confirmation, le 2e supprime (`Échap` annule). `Suppr` marche aussi |
| `p` / `n` | Nouveau projet / nouvelle tâche |
| `d` / `f` | Filtre du journal par période / par projet |

Import / export :

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
  db.ts           accès SQLite, migrations du schéma
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

`project` (id, name, created_at, archived_at) : 1 projet a 0..n `task` (id, project_id, title, created_at, done_at, position, notes, jira_wanted_at, jira_at, jira_key, jira_url).
`setting` (key, value) : réglages de l'application (ex. `jira_base_url`).
`position` = ordre (priorité) des tâches dans leur projet.
`notes` = contenu en Markdown. Une tâche est faite quand `done_at` est rempli (le journal, ce sont ces tâches-là), à reporter quand `jira_wanted_at` l'est et pas `jira_at`, reportée quand `jira_at` l'est. Ticket : `jira_key` (lien construit avec `jira_base_url`, qui peut donc changer) ou `jira_url` (lien complet). Liens en http(s) uniquement.
Le schéma est versionné (`PRAGMA user_version`) : une base plus ancienne, importée ou non, est mise à niveau à l'ouverture.
