# Tâches

Tâches par projet + journal de ce qui a été fait, jour par jour.
Front en HTML/CSS/JS vanilla, serveur Node + SQLite. Aucune dépendance à l’exécution (Playwright sert seulement aux tests).

## Lancer en local

1. Installer **Node.js 22.13 ou plus** (24 conseillé) : https://nodejs.org. Vérifier avec `node --version`.
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
4. Démarrer :
   ```sh
   pnpm start
   ```
5. Ouvrir http://localhost:3000

Arrêter : `Ctrl+C`. Les données sont dans `data/tasks.db`, qui est créé au premier lancement.

Options : `PORT=8080 pnpm start` pour changer de port, `TASKS_DB=~/taches.db pnpm start` pour un autre fichier de base.

Tests :
- `pnpm test` : API et import (Node, sans navigateur)
- `pnpm test:e2e` : interface dans Chromium. La première fois, installer le navigateur : `pnpm exec playwright install chromium`

## Utilisation

- Cocher une tâche → elle passe dans le journal, datée du jour. La décocher → elle revient dans son projet.
- Journal : par défaut, la dernière journée. Filtres par période (du… au…, bornes incluses) et par projet. Renseigner le début met la même date en fin : une journée entière.
- Nouveau projet → curseur directement sur la saisie de sa première tâche.
- Souris : clic sur un nom pour le modifier.

Clavier (`?` affiche l'aide) :

| Touche | Action |
|---|---|
| `↑` `↓` | Passer d'un projet, d'une tâche ou d'un champ « + Ajouter » à l'autre (`Début` / `Fin` : premier / dernier) |
| `Entrée` | Modifier le nom sélectionné, puis `Entrée` pour enregistrer |
| `Échap` | Quitter l'édition sans enregistrer, retour à la navigation |
| `Espace` | Cocher / décocher la tâche |
| `j` | Marquer / démarquer la tâche « reportée dans Jira » (icône après le texte) |
| `Suppr` | Supprimer la tâche |
| `p` / `n` | Nouveau projet / nouvelle tâche |
| `d` / `f` | Filtre du journal par période / par projet |
- **Exporter** télécharge la base `.sqlite`. **Importer .sqlite** remplace toute la base.
- **Importer .md** ajoute des projets et tâches depuis un markdown : puce = projet, sous-puce = tâche, une ligne avec une date (`## 24/09/2026`) ouvre une journée de tâches faites.

## Sécurité

- Pas d'authentification : le serveur n'écoute que sur `127.0.0.1`, il n'est pas joignable depuis le réseau.
- Requêtes venant d'un autre site refusées (CSRF), en-tête `Host` vérifié (DNS rebinding), CSP stricte.
- Import `.sqlite` vérifié (intégrité, ni trigger ni vue). Base lisible par ton seul utilisateur (`600`).
- pnpm : version épinglée par hash, npm/yarn bloqués, versions de moins de 7 jours refusées, scripts d'installation interdits (voir `pnpm-workspace.yaml`).
- ⚠️ Exposer l'app sur un réseau (`HOST=0.0.0.0` + `ALLOWED_HOSTS=…`) la rend accessible sans mot de passe.

## Architecture

```
src/server.js     serveur HTTP : routes API, fichiers statiques, sécurité
src/db.js         accès SQLite, migrations du schéma
src/markdown.js   import du markdown
public/app.js     rendu des projets et du journal
public/nav.js     navigation clavier (focus, ↑/↓, restauration après re-rendu)
public/dom.js     création d'éléments, noms éditables, champs d'ajout
public/api.js     appels au serveur
test/             tests API (node:test)
e2e/              tests d'interface (Playwright), 1 serveur + 1 base vierge par test
```

## Modèle de données

`project` (id, name, created_at, archived_at) : 1 projet a 0..n `task` (id, project_id, title, created_at, done_at, jira_at).
Une tâche est faite quand `done_at` est rempli (le journal, ce sont ces tâches-là), reportée dans Jira quand `jira_at` l'est.
Le schéma est versionné (`PRAGMA user_version`) : une base plus ancienne, importée ou non, est mise à niveau à l'ouverture.
