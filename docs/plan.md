# Plan de travail

Suivi des tâches de développement. Mis à jour à chaque demande : une ligne par
tâche, cochée quand la CI de sa PR est verte (lien de la PR) ; fusion par
l'utilisateur.

Légende : `[ ]` à faire · `[~]` en cours · `[x]` fait · `[?]` décision attendue

## En cours

## Décisions attendues

## Idées / plus tard

- [ ] Vue d'ensemble de tous les projets : vue horizontale, un tiers de largeur par projet (sa synthèse), défilement horizontal
- [ ] Lien d'un ticket : modèle d'URL réglable (`https://…/browse/{clé}`) pour GitLab ou GitHub (« pour l'instant, non » ; aujourd'hui `URL/browse/CLÉ`, format Jira)
- [ ] Jira : convertir Markdown ↔ wiki (refusé pour l'instant : contenu envoyé tel quel)
- [ ] Drizzle : passer à la 1.0 stable quand elle sort (épinglée en `1.0.0-rc.4`)
- [ ] Supprimer les branches distantes fusionnées `ui/taches-icones-a-droite` et `ui/disposition-deux-colonnes` (à faire sur GitHub)
- [ ] ~~Animations des listes~~ : AutoAnimate essayé puis retiré (rendu jugé pire). Ne pas reproposer sans nouvelle demande.
- [ ] Corbeille durable (table `trash` : JSON du projet + tâches) si l'annulation
      `u`, limitée à l'onglet et à une seule action, ne suffit plus
- [ ] Mémoriser les filtres (projets et Log) entre deux rechargements

## Fait (récent)

- [x] Formatage à 120 colonnes, comme csp-cli
- [x] Vite+ (comme csp-cli) : `vp dev` / `vp build`, tests unitaires sous Vitest (`vp test`), `vp check` (formatage oxfmt, lint oxlint avec les types, TypeScript) ; code reformaté ; `pnpm ready` en local et en CI
- [x] README : installer pnpm sans corepack (absent de Node 25 et plus) : `npm install -g pnpm@12.19.0` (PR #20)
- [x] Synthèse d'un projet (remplace son contenu) : Markdown libre (le projet et ses liens, fait récemment, prochaines étapes), une version par jour consultable et restaurable ; boutons « Tâches faites » (depuis la version d'avant) et « Priorités 1 » qui insèrent des liens vers les fiches ; cercle à droite du projet les jours où une tâche est faite (vide, plein une fois la synthèse mise à jour) ; `s` ; migration 19 ([PR #19](https://github.com/pom421/tasks/pull/19))
- [x] Jira : créer le ticket depuis une tâche sans identifiant (icône « ticket + », seulement si le projet a un ticket, l'epic, et que l'URL et le PAT sont réglés) : tâche enfant de l'epic après confirmation ; ☁↑ / ☁↓ n'apparaissent plus tant qu'ils sont inutilisables ; `+` dans la fiche ; délier une tâche de son ticket en deux temps, avec avertissement (`r r`, ✕ ✕) ([PR #17](https://github.com/pom421/tasks/pull/17))
- [x] Projet : bouton « Trier par priorité » (flèche + 0 1, au survol, souris seulement) : 1, 2, 3 puis sans priorité, stable, annulable ; remplace le tri automatique refusé ([PR #16](https://github.com/pom421/tasks/pull/16))
- [x] Log : bouton « N tâches à reporter » (drapeau, `R` dans l'onglet Log) : seulement les tâches faites à reporter, que le compteur des projets ne compte plus ([PR #15](https://github.com/pom421/tasks/pull/15))
- [x] Décisions tranchées : Log sans entrée non réaffiché ; chrono unique, retard compté dans « 3/5 », `Tab` natif dans les dates, tri automatique par priorité refusé (remplacé par un bouton) ; filtre « Archivés » actif en remplissage gris clair ; compteur du plan orange à 5/5, rouge au-delà ([PR #14](https://github.com/pom421/tasks/pull/14))
- [x] Audit : faille `picomatch` (GHSA-fc5q-39xc-vjpf, haute, sans correctif) ignorée avec sa raison : dépendance de développement (Vite), motifs jamais saisis par un utilisateur ; à retirer quand un correctif sort ([PR #18](https://github.com/pom421/tasks/pull/18))
- [x] Dépendances : cooldown 7 jours avec exceptions par version précise (skill `dependances-securite`), `pnpm audit` en CI (PR + chaque jour, seuil `high`), 12 failles corrigées, toutes les dépendances, pnpm 12.19.0 et Node 26 et actions GitHub (`checkout` / `setup-node` v7) mis à jour dans le respect du cooldown ([PR #13](https://github.com/pom421/tasks/pull/13))
- [x] Fiche d'un projet (`o`, `Maj+Entrée`, `e`, icône 🗒) : nom, ticket (cliquable en lecture, comme la pastille rose de la ligne), contenu Markdown ; pas de tags ni de dates pour l'instant ([PR #6](https://github.com/pom421/tasks/pull/6))
- [x] Modification d'un nom : la saisie et la sélection restent quand la fenêtre perd le focus (`Alt+Tab` ; Firefox sous Linux en RDP, où `Ctrl` faisait perdre le focus : copier-coller impossible). Un clic ailleurs dans la page annule toujours ([PR #12](https://github.com/pom421/tasks/pull/12))
- [x] Déplacer une tâche / un projet : `Ctrl+Maj+↑/↓` (ou `⌘+Maj+↑/↓`, macOS réservant `Ctrl+Maj+↑/↓` à Mission Control) au lieu de `Alt+↑/↓`, pris par Ubuntu ; `Alt+k/j` retirés (`Ctrl+Maj+J` ouvre la console de Chrome) ; onglet voisin de même : `Ctrl+Maj+←/→` (ou `⌘+Maj`) au lieu de `Alt+←/→` ([PR #11](https://github.com/pom421/tasks/pull/11))
- [x] Ligne de tâche moins dense, sur deux lignes (Projets, Aujourd’hui, Suivant) : titre, ticket et icônes en haut ; tags à gauche, date prévue, échéance et temps passé à droite en dessous ; 2e ligne toujours là (chrono ▷ au bout). ☀ et priorité tout à droite de la 1re ligne, 🗒 juste après le titre. Log : une seule ligne, comme avant ([PR #8](https://github.com/pom421/tasks/pull/8))
- [x] Fiche : champ Sprint avec les sprints actifs puis à venir de Jira proposés (API Agile : tableaux Scrum du projet, puis leurs sprints ; 100 premiers par tableau, suffisant : validé) ([PR #9](https://github.com/pom421/tasks/pull/9))
- [x] Fiche : mêmes champs au pixel près en lecture (bloqués) et en édition ; ligne 1 ticket + sprint (nouveau, synchronisé avec Jira, migration 17), ligne 2 dates + temps passé et chrono, ligne 3 tags ; en lecture, calendrier des dates et ✕ des tags cachés (validé) ([PR #7](https://github.com/pom421/tasks/pull/7))
- [x] Pastille « reporté » supprimée : reportée = un identifiant ; `r` sur une tâche à reporter demande l'identifiant, saisie abandonnée (Échap, vide, invalide, clic ailleurs) = retour à rien ; fiche : ticket en un seul contrôle (aucun → à reporter → identifiant ; ✕ le retire ; `r` comme sur la ligne), en lecture et en édition ; ticket = identifiant seul (tâche et projet), plus de lien complet ; migrations 15 et 16 ([PR #5](https://github.com/pom421/tasks/pull/5))
- [x] Info-bulles uniformes : toutes rapides (150 ms) et du même style, par un seul composant (`TitleTooltips`) qui affiche l'attribut `title` à la place de l'info-bulle native
- [x] Échéance de la ligne : info-bulle de l'app, rapide (150 ms), « Échéance : mardi 6 octobre 2026 » (l'info-bulle native, lente, ne s'affichait pas toujours)
- [x] Dates de la ligne toujours en jj/mm (« 30/12 », plus de « demain » ni « lun. 6 »), étiquette plus étroite
- [x] Échéance au-delà de la semaine en jj/mm (sans l'année, date complète au survol) ; rouge « dépassée » plus visible en thème sombre
- [x] Ligne : date prévue retirée (fiche seulement) ; échéance de largeur fixe, juste avant le temps passé et les icônes, places gardées même vides (alignées d'une ligne à l'autre)
- [x] Ligne : temps passé de nouveau affiché (sablier, « 3 min ») au bout du titre, projets et Log, comme dans la fiche
- [x] Fiche plus soignée : « · à faire » retiré (reste « · faite le … »), ↻ du chrono à gauche de ▷ (▷ ne bouge plus, aussi sur la ligne), libellés sans « : » en colonne alignée (valeurs absentes atténuées), « Aucun contenu » centré, plus gros, sans italique
- [x] Défilement anticipé au clavier : 5 éléments visibles avant / après l’élément courant, blocs de l’en-tête comptés ([#4](https://github.com/pom421/tasks/pull/4))
- [x] Projet : pastille et champ du ticket à droite, juste avant l'icône d'archive ; icône ticket retirée (`r` seulement, comme le report d'une tâche) (`49602a1`)
- [x] Projet : champ du ticket après le cœur (favori), la pastille reste après le nom (`c2e995c`)
- [x] Livraison par PR (plus de push direct sur `main`) : `CLAUDE.md`, skills `livrer` et `verifier-ci`
- [x] Ticket d'un projet (epic…) : `r` sur le projet ou icône 🎫, pastille après le nom (onglet Projets), lien vers le ticket ; migration 14 (`392a7ec`)
- [x] Jira (Data Center, PAT) : fiche, ☁↑ pousser (`>`) / ☁↓ récupérer (`<`) titre, contenu et échéance, après une fenêtre de comparaison ; désactivés sans identifiant, URL ou PAT ; annulable (`u`) ; PAT masqué dans les Réglages, jamais relu ni exporté (`78f1275`)
- [x] `r r` (reporté) : ticket saisi dans la ligne au lieu de la fiche ; `Entrée` enregistre, `Échap` passe, `u` retire le ticket (`bc006ac`)
- [x] Onglet « Prochainement » renommé « Suivant » (`S`, `/suivant`) ; icônes d'une tâche toujours à la même place (étiquettes d'abord, tags coupés) ; un cadre rouge par jour d'échéance dépassée ; icônes distinctes (calendrier prévue, réveil échéance, sablier durée) ; placeholder « Tags… » sans « (#) » ; démo enrichie (`4e9b2e1`, `39e4504`)
- [x] Date prévue (fusionnée avec ☀ / `day_at`), échéance et tags (migration 13) : fiche (`e`), étiquettes sur la ligne, « Aujourd’hui » avec les tâches en retard, onglet « Prochainement » (agenda), filtre `#` avec autocomplétion dans Projets et dans le Log (`81045b0`)
- [x] « Jira » renommé « bugtracker » partout (base, API, types, interface, tests, docs) : colonnes `bugtracker_*` et réglage `bugtracker_base_url` par la migration 12 (`e6648ce`)
- [x] Persistance avec Drizzle ORM (1.0 RC, pilote `node:sqlite`) : schéma visible dans `server/schema.ts`, types déduits, test de cohérence schéma / migrations, skill `drizzle` ; migrations SQL gardées, `drizzle-kit` écarté (`3e8ca97`)
- [x] Log en onglet (« Projets » / « Aujourd’hui » / « Log », une colonne) : `P` / `T` / `L` vont à leur onglet, `Alt+←` / `Alt+→` onglet voisin, curseur gardé par onglet ; filtre priorité sur `!` ; `L` n'ouvre plus la fiche sur le ticket (`03e404a`)
- [x] Log sur les 5 derniers jours ayant des entrées : pagination `<` / `>` (ou `←` / `→`), bouton « Courant », filtres = jours qui correspondent, date = fin de la période, recherche soulignée en jaune, projet toujours affiché ; `pnpm demo` (`03e404a`)
- [x] Skill `raccourcis` ; consignes `.md` resserrées (`03e404a`)
- [x] Titre coupé : info-bulle au focus clavier après un court délai (500 ms), rien si on passe vite dessus avec j / k
- [x] Filtres des projets sous les onglets, alignés à droite (plus d'espace sur mobile, ligne réservée même vide) ; onglet « Plan journée » renommé « Aujourd’hui » (☀ : « Pour aujourd’hui », adresse `/plan` gardée) ; `?` une 2e fois ferme l'aide
- [x] Filtres des projets déplacés dans l'onglet « Projets », sur la ligne des onglets à droite (comme le Log), à la hauteur des champs du Log ; l'en-tête ne garde que le titre, l'aide et les réglages
- [x] Historique d'annulation en mémoire dans le navigateur (zustand, sans limite de nombre) : `u` annule une à une, `U` rejoue ; créations, déplacements, report, date et fiche désormais annulables
- [x] `Maj+j` / `Maj+k` (`J` / `K`) : projet suivant / précédent, comme `Maj+↓` / `Maj+↑` ; port du serveur de dev réglable par `PORT` (aperçu d'un worktree)
- [x] « + Ajouter » en écriture : `Échap` vide le champ et le repasse en lecture (au lieu d'en sortir vers l'élément au-dessus)
- [x] Aide `?` : raccourcis groupés par thème, en colonnes, tout visible sur un écran courant (la liste défile sinon), sans texte d’explication ; ménage : doublon `e` retiré, ajout de `Alt+↑` / `Alt+↓` sur un projet, `Suppr`, `Échap` du Log, `Ctrl+Entrée` qui ferme la fiche
- [x] Place de la barre de défilement réservée : plus de décalage quand un filtre la fait apparaître ou disparaître
- [x] « + Ajouter » atteint par `j` / `k` : en lecture, `Entrée` pour écrire (`n`, `n` `n` ou clic : écriture directe)
- [x] `Échap` `Échap` : retire tous les filtres (projets et Log) (`f9c64f3`)
- [x] Fiche : temps passé affiché à gauche des icônes du chrono (`791d23b`)
- [x] Priorité absente : « 1 » dans un carré à contour (`ad8068d`)
- [x] Filtre priorité : `P` ou clic sur « Priorités », 1 → 2 → 3 → toutes ; zone des projets, combiné en ET avec les autres filtres (`86ab470`)
- [x] Raccourcis, minuscule = action / majuscule = filtre : `f` favori (projet) / `F` filtre Favoris (remplace `*`) ; `r` report (remplace `J`) / `R` filtre à reporter → reportées → tous (remplace `r`) ; priorité `1` `2` `3` (remplace `p`) ; plus de `f` pour le Log (`/` puis `Tab`) ; `A` filtre Archivés ; `n` `n` nouveau projet (remplace `p`) (`7d022da`, `aa07421`)
- [x] Raccourcis `t` / `T` plan journée, `c` / `C` chrono, `Maj+↑` / `Maj+↓` entre projets ; fiche : même disposition en lecture et en édition (`052a963`)
- [x] Priorité des tâches : icônes 1 2 3 à droite, `p` ou clic ; migration 11 (`26e1975`)
- [x] Chrono par tâche : ▷ / pause pleine (`t`), ↻ remise à zéro (`T`), temps passé en info-bulle, ligne et fiche ; migration 9 (`bb31dad`)
- [x] Plan journée : ☀ / `s` (ligne et fiche), onglet « Plan journée » (`v`, `/plan`), compteur « 3/5 tâches » rouge au-delà du maximum ; migration 10 (`bb31dad`)
- [x] Migration : une sauvegarde `.vN.bak` déjà présente n'est plus écrasée ni bloquante (`output file already exists` après restauration par copie) ; la nouvelle devient `.vN.2.bak`
- [x] Badge « reporté » : l’identifiant du ticket seul quand il y en a un (« reporté » pour les lecteurs d’écran et en info-bulle)
- [x] `gg` / `G` (à la manière de vim) : premier / dernier élément, comme `Début` / `Fin`
- [x] `n` ouvre le champ d’ajout du projet où est le curseur (plus le dernier utilisé) ; `Échap` dans un champ « + Ajouter » le vide et en sort (`p` ne s’y écrit plus)
- [x] Deux colonnes sur écran large : « Projets » à gauche, « Log » à droite (toujours visible) ; tâches cochées barrées dans le Log (`35ce5d4`)
- [x] Boutons homogènes : à contour et petite taille par défaut ; Réglages : champ à 32 px, Importer .sqlite en deux temps, la valeur chargée n'écrase plus une saisie (`35ce5d4`)
- [x] Tests e2e verts en local sur Mac (Chromium de Playwright installé, raccourci « fin du texte » selon le système)
- [x] Curseur sur le premier projet : retour en haut de page, en-tête visible
- [x] Tâche : icônes (report, détails) à droite, titre cliquable sur toute la largeur (branche fusionnée)
- [x] Suppression homogène : plus de ✕ ni de fenêtre de confirmation, corbeille du projet en deux temps
- [x] Installation automatique des dépendances en session web (hook SessionStart + setup script)
- [x] Skills du projet : livrer, verifier-ci, nouveau-controle, capture-ecran, migration
- [x] Filtres sobres : contour, icône vide / pleine selon l'état (`87f5ede`)
- [x] Message de liste vide avec plusieurs filtres (`4358d0b`)
- [x] Filtres combinables en ET, boutons toujours présents ; export / import
      dans les Réglages (`5341617`)
- [x] Log indépendant des filtres de projets ; une seule date ; filtres sur la
      ligne du titre ; Archivés = seulement les archivés (`4796d35`, `a0856ec`)
- [x] Raccourcis projet `f` / `a` / `x x`, annulables par `u` ; `Échap` quitte
      les Réglages (`7068d17`)
- [x] Projets favoris ; archiver / supprimer en icônes (`58ab6eb`)
- [x] Déplacer un projet, recherche dans le Log, compteur (`a8039f6`)
