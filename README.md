# Tâches

Tâches par projet + journal de ce qui a été fait, jour par jour.
Front en HTML/CSS/JS vanilla, serveur Node + SQLite. Aucune dépendance à installer.

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
Tests : `pnpm test`.

## Utilisation

- Clic sur un nom → modifier, `Entrée` valide, `Échap` annule
- Cocher une tâche → elle passe dans le journal, datée du jour. La décocher → elle revient dans son projet.
- Journal : par défaut, la dernière journée. Filtres par date ou par projet.
- Raccourcis : `p` projet, `n` tâche, `d` / `f` filtres, `?` aide
- **Exporter** télécharge la base `.sqlite`. **Importer .sqlite** remplace toute la base.
- **Importer .md** ajoute des projets et tâches depuis un markdown : puce = projet, sous-puce = tâche, une ligne avec une date (`## 24/09/2026`) ouvre une journée de tâches faites.

## Sécurité

- Pas d'authentification : le serveur n'écoute que sur `127.0.0.1`, il n'est pas joignable depuis le réseau.
- Requêtes venant d'un autre site refusées (CSRF), en-tête `Host` vérifié (DNS rebinding), CSP stricte.
- Import `.sqlite` vérifié (intégrité, ni trigger ni vue). Base lisible par ton seul utilisateur (`600`).
- pnpm : version épinglée par hash, npm/yarn bloqués, versions de moins de 7 jours refusées, scripts d'installation interdits (voir `pnpm-workspace.yaml`).
- ⚠️ Exposer l'app sur un réseau (`HOST=0.0.0.0` + `ALLOWED_HOSTS=…`) la rend accessible sans mot de passe.

## Modèle de données

`project` (id, name, created_at, archived_at) : 1 projet a 0..n `task` (id, project_id, title, created_at, done_at).
Une tâche est faite quand `done_at` est rempli. Le journal, ce sont ces tâches-là.
