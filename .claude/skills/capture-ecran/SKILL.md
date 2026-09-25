---
name: capture-ecran
description: Faire une capture d'écran de l'app avec des données choisies, pour vérifier un rendu visuel (style, alignement, icônes) avant de livrer. À utiliser après toute modification visuelle.
---

# Capture d'écran

1. Copier `.claude/skills/capture-ecran/zz-shot.spec.ts` dans `e2e/` et
   l'adapter : données créées via `store` (voir `server/db.ts` : `createProject`,
   `createTask`, `updateTask`, `updateProject`), actions à faire (clics,
   touches), une ou plusieurs captures.
   Le fichier est un module ES : `import fs from 'node:fs'`, jamais `require`.
2. Lancer :
   ```sh
   SHOT_DIR=<scratchpad> pnpm exec playwright test e2e/zz-shot.spec.ts
   ```
3. **Supprimer** `e2e/zz-shot.spec.ts` (ne jamais le commiter).
4. Lire les images (outil Read) et vérifier le rendu. Attention : la souris reste
   sur le dernier élément cliqué (état survol) ; `page.mouse.move(0, 0)` avant la
   capture.
5. Pour vérifier un style calculé, écrire la valeur dans un fichier du scratchpad
   (`getComputedStyle`), car `console.log` n'apparaît pas dans la sortie.
