# Consignes pour Claude

App de tâches par projet + Log quotidien. Voir `README.md` (usage, architecture,
modèle de données) et `docs/plan.md` (tâches en cours, décisions attendues).

## Règles répétées par l'utilisateur

- **Simple avant tout** : petit code, facile à maintenir. Pas de dépendance ni
  d'abstraction sans besoin réel. En cas de doute, la solution la plus simple.
- **UX homogène** : un nouvel élément suit le comportement des éléments du même
  type (mêmes boutons bascule, mêmes raccourcis, mêmes messages). Avant de
  livrer, comparer avec l'existant.
- **Sobre** : pas de fond coloré pour marquer un état. Bouton à contour ; état
  actif = icône pleine (vide sinon) et texte normal (atténué sinon).
- **Afficher seulement ce qui sert** : un bouton de filtre n'apparaît que s'il a
  un effet, calculé sur **toutes** les données (jamais selon les autres
  filtres) ; un bouton actif reste visible pour pouvoir le couper.
- **Zones indépendantes** : les filtres du haut (à reporter, Archivés, Favoris)
  ne touchent que la zone des projets, combinés en ET. Le Log a ses propres
  filtres (recherche, journée, projet) sur la ligne de son titre.
- **Clavier d'abord** : toute action a un raccourci, affiché dans l'aide `?`, le
  README et l'info-bulle. Action destructive au clavier : 1er appui = message
  de ce qui va se passer, 2e appui = exécution (`Échap` annule). Actions
  annulables par `u`.
- **Accessible** : bouton icône = `aria-label` + `title` (info-bulle) + icône
  `aria-hidden` ; bouton bascule = nom fixe + `aria-pressed`.
- **Tout en français** : interface, messages, commentaires, commits.
- **Messages exacts** : un message (liste vide, compteur…) décrit précisément la
  situation, y compris quand plusieurs filtres sont combinés.

## Skills du projet (`.claude/skills/`)

- `livrer` : vérifications, documentation, commit, push, rappel CI (fin de chaque demande).
- `verifier-ci` : résultat de la CI, correction si rouge.
- `nouveau-controle` : liste de contrôle avant tout nouvel élément d'interface.
- `capture-ecran` : vérifier un rendu visuel avec des données choisies.
- `migration` : évolution du schéma de la base.

## Façon de travailler

- Pousser directement sur `main`, puis vérifier la CI (GitHub Actions) quelques
  minutes après ; corriger tout de suite si rouge.
- Chaque demande : code + tests e2e (dont non-régression) + README + aide `?`
  + `docs/plan.md` mis à jour.
- Avant de pousser : `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`.
- Base : ne jamais modifier une migration publiée ; ajouter la suivante dans
  `server/migrations.ts`.
- pnpm uniquement (version épinglée, pas de scripts d'installation).

## Pièges connus

- Conteneur cloud : dépendances installées par le hook `SessionStart`
  (`scripts/setup-cloud.sh`) ; Chromium du conteneur détecté par
  `playwright.config.ts`, `pnpm test:e2e` marche tel quel (ne pas lancer
  `playwright install`).
- Tests e2e : attendre ce qui est **affiché** (attribut, texte), pas l'état de la
  base, sinon course avec la mise à jour de l'interface (échec CI déjà vu).
- Boutons visibles au survol seulement (`invisible group-hover:visible`) :
  survoler avant `getByRole`, sinon absents de l'arbre d'accessibilité.
- Ne pas lancer `pkill -f` / `pgrep` avec un motif qui correspond à la commande
  elle-même : le shell se tue.

- Animations (AutoAnimate) : un élément retiré reste ~180 ms dans la page
  (marqué `__aa_del`) ; `navItems()` l'ignore. Les tests e2e tournent sans
  animation (`reducedMotion: 'reduce'`), sauf `e2e/animation.spec.ts`.

## Réponses à l'utilisateur

- En français, courtes, en listes à puces ; une phrase d'intro sur le rôle.
- Ton de mentor : expliquer le « pourquoi » et donner un point à retenir.
- Signaler les choix faits sans demande explicite et les points à trancher.
