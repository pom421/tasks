---
name: migration
description: Faire évoluer le schéma de la base SQLite (nouvelle colonne, table, donnée transformée) avec une migration numérotée. À utiliser pour tout changement de structure de la base.
---

# Migration de la base

1. `server/migrations.ts` : ajouter **en fin de liste**
   `{ version: N+1, name: '<nom en français>', sql: `...` }`. Ne **jamais**
   modifier une migration publiée. Transaction et sauvegarde `.vN.bak`
   automatiques.
2. `server/db.ts` : type de ligne (`TaskRow`…), `SELECT` explicites, écritures,
   et suppression / restauration (`deleteProject`, `restoreProject`,
   `restoreTask`) si la colonne doit survivre à une annulation.
3. `server/app.ts` : revalider les entrées (`restoredTask`, `restoredProject`,
   routes PATCH).
4. `shared/types.ts`, puis `README.md` (« Modèle de données »).
5. Test dans `server/test/api.test.ts` : écriture, lecture, annulation
   (DELETE puis restauration à l'identique).
6. `pnpm db:migrate` sur une copie de `data/tasks.db` si elle existe.
