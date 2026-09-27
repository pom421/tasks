---
name: capture-ecran
description: Faire une capture d'écran de l'app avec des données choisies, pour vérifier un rendu visuel (style, alignement, icônes) avant de livrer. À utiliser après toute modification visuelle.
---

# Capture d'écran

1. Copier `.claude/skills/capture-ecran/zz-shot.spec.ts` dans `e2e/` et
   l'adapter : données via `store` (`createProject`, `createTask`, `updateTask`,
   `updateProject` de `server/db.ts`), actions, captures. Module ES : `import`,
   jamais `require`.
2. `SHOT_DIR=<scratchpad> pnpm exec playwright test e2e/zz-shot.spec.ts`
   (après `vite build` si le code du front a changé).
3. **Supprimer** `e2e/zz-shot.spec.ts` (jamais commité).
4. Lire les images. `page.mouse.move(0, 0)` avant une capture (sinon état survol).
   Style calculé : l'écrire dans un fichier du scratchpad (`console.log`
   n'apparaît pas).

Pour que l'utilisateur voie lui-même : `pnpm demo` (base `data/demo.db`, 8 jours
de Log), configuration `tasks-demo` de `.claude/launch.json`.
