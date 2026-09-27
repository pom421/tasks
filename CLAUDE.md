# Consignes pour Claude

App de tâches par projet + Log quotidien. Usage, architecture et modèle de
données : `README.md` ; tâches et décisions attendues : `docs/plan.md`.

## Règles de l'utilisateur

- **Simple avant tout** : petit code, pas de dépendance ni d'abstraction sans
  besoin réel. En cas de doute, le plus simple.
- **UX homogène** : un nouvel élément copie le comportement de ceux du même type
  (boutons, raccourcis, messages). Comparer avec l'existant avant de livrer.
- **Sobre** : pas de fond coloré pour un état ; bouton à contour, actif = icône
  pleine et texte normal.
- **Afficher seulement ce qui sert** : un filtre n'apparaît que s'il a un effet
  sur **toutes** les données ; actif, il reste visible.
- **Zones indépendantes** : filtres de l'onglet Projets (report, priorité,
  Archivés, Favoris) et du Log (recherche, date, projet), chacun dans sa zone.
- **Icônes, pas de texte** : l'info complémentaire va dans l'info-bulle. Icônes
  d'une tâche à droite (`ghost` `icon-xs`, vide et atténuée, pleine et colorée
  si active).
- **Clavier d'abord** : toute action a un raccourci (aide `?`, README,
  info-bulle). L'utilisateur choisit les touches : skill `raccourcis`.
- **Annulable, pas confirmé** : action directe, annulable par `u` ; destructif
  au clavier en deux appuis (`Échap` annule).
- **Accessible** : bouton icône = `aria-label` + `title` + icône `aria-hidden` ;
  bascule = nom fixe + `aria-pressed`.
- **Messages exacts**, y compris avec plusieurs filtres combinés.
- **Tout en français** : interface, messages, commentaires, commits.

## Skills (`.claude/skills/`)

- `livrer` : fin de chaque demande (vérifications, docs, commit, push, CI).
- `verifier-ci` : résultat de la CI, correction si rouge.
- `nouveau-controle` : avant tout bouton, filtre ou action.
- `raccourcis` : avant toute touche ajoutée, changée ou retirée.
- `capture-ecran` : vérifier un rendu visuel (`pnpm demo` : base de démo).
- `migration` : évolution du schéma de la base.

## Façon de travailler

- Chaque demande : code + tests e2e (dont non-régression) + README + aide `?` +
  `docs/plan.md`.
- Pousser sur `main` après `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, puis
  vérifier la CI.
- pnpm uniquement (version épinglée, pas de scripts d'installation).

## Pièges connus

- Tests e2e : attendre ce qui est **affiché** (attribut, texte), pas l'état de
  la base (course avec l'interface, échec CI déjà vu).
- Boutons visibles au survol (`invisible group-hover:visible`) : survoler avant
  `getByRole`.
- Conteneur cloud : dépendances par le hook `SessionStart`, Chromium détecté par
  `playwright.config.ts` (ne pas lancer `playwright install`).
- `pkill -f` / `pgrep` : jamais avec un motif qui correspond à la commande
  elle-même (le shell se tue).

## Réponses

- En français, courtes, en puces ; une phrase d'intro.
- Ton de mentor : le « pourquoi » et un point à retenir.
- Signaler les choix faits sans demande et les points à trancher.
