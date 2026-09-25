---
name: migration
description: Faire évoluer le schéma de la base SQLite (nouvelle colonne, table, donnée transformée) avec une migration numérotée. À utiliser pour tout changement de structure de la base.
---

# Migration de la base

1. `server/migrations.ts` : ajouter **en fin de liste**
   `{ version: N+1, name: '<nom en français>', sql: `...` }`.
   Ne **jamais** modifier une migration déjà publiée (des bases l'ont appliquée).
   Chaque migration tourne dans sa transaction ; une sauvegarde `.vN.bak` est
   faite automatiquement avant de migrer une base existante.
2. `server/db.ts` : type de ligne (`ProjectRow`, `TaskRow`…), requêtes `SELECT`
   explicites (ex. état de `state()`), écritures, et les fonctions de
   suppression / restauration (`deleteProject`, `restoreProject`, `restoreTask`)
   si la colonne doit survivre à une annulation.
3. `server/app.ts` : validation des entrées (`restoredTask`, `restoredProject`,
   routes PATCH) ; tout ce qui vient du client est revérifié.
4. `shared/types.ts` : types échangés avec le front.
5. `README.md` : section « Modèle de données ».
6. Test API dans `server/test/api.test.ts` : écriture, lecture, et si besoin
   annulation (DELETE puis restore à l'identique).
7. Vérifier `pnpm db:migrate` sur une copie de `data/tasks.db` si elle existe.
