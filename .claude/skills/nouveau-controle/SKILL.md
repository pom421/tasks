---
name: nouveau-controle
description: Liste de contrôle pour ajouter ou modifier un bouton, un filtre ou une action dans l'interface, homogène avec l'existant. À utiliser avant d'écrire le code de tout nouvel élément d'interface (pour une touche : skill raccourcis).
---

# Nouveau bouton, filtre ou action

Copier un élément **existant du même type** : même composant, classes, comportement.

## Bouton
- Icône seule : `aria-label` + `title` (avec le raccourci entre parenthèses) +
  icône `aria-hidden`.
- Bascule : nom fixe + `aria-pressed` ; seul le `title` change.
- `variant="outline"`, jamais de fond coloré pour un état : actif = icône pleine
  (`fill="currentColor"`) et texte normal ; inactif = icône vide,
  `text-muted-foreground`.
- Visible seulement s'il sert, calculé sur **toutes** les données ; toujours
  visible s'il est actif.

## Filtre
- Projets (`ProjectFilters.tsx`) et Log (`Journal.tsx`) : chacun sa zone,
  combinés en ET, aucun effet croisé.
- Liste vide : message exact ; plusieurs filtres = « Aucune tâche / Aucun projet
  avec les filtres demandés. »

## Action
- Raccourci : skill `raccourcis`.
- Annulable (`u` / `U`) : `undoable({ label, focus, run, undo })` au lieu de
  `act` ; hors composant, `record()` de `src/lib/history.ts`.
- Focus clavier conservé (`act()` le restaure).

## À mettre à jour
- Aide `?`, `README.md`, `docs/plan.md`.
- Tests e2e : comportement, clavier, accessibilité (`getByRole` + nom) et
  **non-régression** (avant / après de ce qui ne doit pas changer).
