---
name: raccourcis
description: Ajouter, changer ou retirer un raccourci clavier. État des lieux des touches prises, propositions à l'utilisateur, puis code, aide, README et tests. À utiliser dès qu'une demande touche au clavier.
---

# Raccourcis clavier

L'utilisateur choisit les touches : **état des lieux, propositions, puis code**.

## 1. État des lieux

- Liste officielle : `SECTIONS` dans `src/components/HelpDialog.tsx` (aide `?`).
- La vérifier dans le code (une touche peut manquer à l'aide) :
  ```sh
  grep -n "e.key\|e.code\|^\s*[A-Za-z'!/?]*: () =>" src/App.tsx src/lib/nav.ts src/components/*.tsx
  ```
  Globaux : `keys` dans `src/App.tsx` ; onglets : `TABS` (`key:`) du même
  fichier. Locaux : `TaskRow`, `ProjectList`, `Timer`, `TaskDialog`,
  `Editable`, `Jira`. Navigation : `src/lib/nav.ts`.
- Pour chaque touche envisagée : libre, prise (par quoi, où), ou prise
  localement seulement (un raccourci global y serait inactif : à éviter).

## 2. Propositions

Présenter 2 ou 3 options, la recommandée en premier, avec les conflits et ce
qu'il faudrait déplacer. Attendre le choix avant de coder.

Convention en place :
- minuscule = action sur l'élément courant (`f`, `a`, `r`, `t`, `c`, `x x`…) ;
- majuscule = onglet ou filtre (`P` `T` `S` `L` ; `R` `F` `A`) ;
- symbole = filtre spécial (`!`, `#` tags) ou champ (`/`) ;
- `Alt+flèches` = déplacer / changer d'onglet ; `Maj+flèches` = sauter de projet ;
- une touche = une seule action : pas de double appui qui bascule ailleurs,
  sauf destruction (`x x`) et `n n`.

## 3. Code

- Global : `keys` dans `src/App.tsx` (ignoré dans les champs de saisie et la
  fiche). Local : `onKeyDown` de l'élément + `preventDefault`.
- Destructif : 1er appui = message, 2e = exécution, `Échap` annule.
- Annulable par `u` : voir le skill `nouveau-controle`.

## 4. Partout où la touche apparaît

- Aide `?` (`SECTIONS`, bonne section), `README.md` (tableau des raccourcis),
  info-bulle `title="… (touche)"` du bouton, `docs/plan.md`.
- Ancienne touche retirée : chercher ses traces (`grep` dans `src`, `e2e`,
  `README.md`).
- Tests e2e : la touche marche, elle est ignorée dans un champ de saisie, et
  l'ancienne touche n'a plus d'effet (non-régression).
