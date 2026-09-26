---
name: nouveau-controle
description: Liste de contrôle pour ajouter ou modifier un bouton, un filtre, un raccourci clavier ou une action dans l'interface, afin de rester homogène avec l'existant. À utiliser avant d'écrire le code de tout nouvel élément d'interface.
---

# Nouveau bouton, filtre, raccourci ou action

Partir d'un élément **existant du même type** et le copier : même composant,
mêmes classes, même comportement. L'utilisateur veut une UX homogène.

## Bouton
- Icône seule : `aria-label` (nom lu) + `title` (info-bulle, avec le raccourci
  entre parenthèses) + icône `aria-hidden`.
- Bascule (filtre, favori) : nom fixe + `aria-pressed` ; seul le `title` change.
- Style sobre : `variant="outline"`, jamais de fond coloré pour un état ; actif =
  icône pleine (`fill="currentColor"`) et texte normal, inactif = icône vide et
  `text-muted-foreground`.
- Visible seulement s'il sert, calculé sur **toutes** les données (jamais selon
  les autres filtres) ; toujours visible s'il est actif (pour pouvoir le couper).

## Filtre
- Filtres du haut (à reporter, Archivés, Favoris) : zone des projets seulement,
  combinés en ET. Le Log a ses propres filtres ; aucun effet croisé.
- Liste vide : message exact. Un seul filtre = son message propre ; plusieurs =
  « Aucune tâche / Aucun projet avec les filtres demandés. »

## Raccourci / action
- Raccourci sur l'élément sélectionné (`onKeyDown` local + `preventDefault`) ou
  global (`src/App.tsx`, hors champs de saisie).
- Destructif : 1er appui = message de ce qui va se passer, 2e = exécution,
  `Échap` annule ; souris = `confirm()`.
- Annulable par `u` : `setUndo({ label, run, focus })` après succès.
- Focus clavier conservé après l'action (`act()` restaure le focus).

## À mettre à jour
- Aide `?` (`SECTIONS` dans `HelpDialog.tsx`, dans la bonne section), `README.md`, `docs/plan.md`.
- Tests e2e : le comportement, le clavier, l'accessibilité (`getByRole` + nom),
  plus un test de **non-régression** (photo avant / après de ce qui ne doit pas
  changer).
