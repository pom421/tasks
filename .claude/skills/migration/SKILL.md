---
name: migration
description: Faire évoluer le schéma de la base SQLite (nouvelle colonne, table, donnée transformée) avec une migration numérotée. À utiliser pour tout changement de structure de la base.
---

# Migration de la base

1. `server/schema.ts` : décrire la nouvelle structure (colonne, commentaire
   de son sens, index) ; conventions : skill `drizzle`.
2. `server/migrations.ts` : ajouter **en fin de liste**
   `{ version: N+1, name: '<nom en français>', sql: `...` }`. Ne **jamais**
   modifier une migration publiée. Transaction et sauvegarde `.vN.bak`
   automatiques. `server/test/schema.test.ts` échoue tant que les deux ne
   concordent pas.
3. `server/db.ts` : lectures (`TASK` = colonnes renvoyées au front), écritures ;
   suppression / restauration reprennent toutes les colonnes d'elles-mêmes.
4. `server/app.ts` : revalider les entrées (`restoredTask`, `restoredProject`,
   routes PATCH).
5. `shared/types.ts` (types dérivés du schéma : rien à recopier, sauf colonne
   à exclure de l'API), puis `README.md` (« Modèle de données »).
6. Test dans `server/test/api.test.ts` : écriture, lecture, annulation
   (DELETE puis restauration à l'identique).
7. `pnpm db:migrate` sur une copie de `data/tasks.db` si elle existe.
