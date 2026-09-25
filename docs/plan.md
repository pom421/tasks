# Plan de travail

Suivi des tâches de développement. Mis à jour à chaque demande : une ligne par
tâche, cochée quand elle est poussée sur `main` **et** que la CI est verte.

Légende : `[ ]` à faire · `[~]` en cours · `[x]` fait · `[?]` décision attendue

## En cours

Rien.

## Décisions attendues

- [?] Compteur « N tâches à reporter » : ne compte plus les tâches **faites** à
  reporter (elles gardent leur badge dans le Log). Ajouter un indicateur dans
  le Log pour ne pas les oublier ?
- [?] Filtre « Archivés » actif : icône archive pleine = bloc noir (le trait
  intérieur disparaît). Remplissage gris clair à la place ?

## Idées / plus tard

- [ ] Supprimer les branches distantes fusionnées `ui/taches-icones-a-droite` et `ui/disposition-deux-colonnes` (à faire sur GitHub)
- [ ] ~~Animations des listes~~ : AutoAnimate essayé puis retiré (rendu jugé pire). Ne pas reproposer sans nouvelle demande.
- [ ] Corbeille durable (table `trash` : JSON du projet + tâches) si l'annulation
  `u`, limitée à l'onglet et à une seule action, ne suffit plus
- [ ] Mémoriser les filtres (projets et Log) entre deux rechargements
- [ ] Actions GitHub en Node 20 dépréciées (`actions/checkout@v4`,
  `actions/setup-node@v4`) : passer aux versions suivantes

## Fait (récent)

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
