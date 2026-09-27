---
name: drizzle
description: Conventions d'accès à la base avec Drizzle ORM (schéma dans server/schema.ts, types déduits, requêtes typées). À utiliser avant d'écrire ou de modifier une requête, un type de données ou le schéma.
---

# Base de données avec Drizzle

`server/schema.ts` est **la** description de la base : tables, colonnes, sens
de chaque colonne, index, clés étrangères. Tout le reste en découle.

## Types : déduits du schéma, jamais recopiés

- Lignes complètes : `ProjectRow`, `TaskRow` (`typeof table.$inferSelect`),
  exportés par `schema.ts`.
- Types de l'API (`shared/types.ts`) : dérivés par `Omit` / `Pick` (ex.
  `Task = Omit<TaskRow, 'done_at' | 'position' | 'created_at'>`), avec
  `import type` seulement : rien de Drizzle ne doit arriver dans le front
  (`grep -rl drizzle dist` après `pnpm build` : vide).
- Valeur restreinte (priorité 1 à 3…) : `integer().$type<Priority>()`.
- Pas d'interface écrite à la main qui répète des colonnes, pas de `as` sur un
  résultat de requête (sauf à préciser un non-NULL garanti par le `WHERE`,
  commentaire à l'appui).

## Schéma

- Noms de colonnes en snake_case, clé = nom SQL (`project_id: integer()`) : le
  JSON de l'API reprend les colonnes telles quelles.
- Dates en `text()` (jamais le mode `timestamp`) : `'YYYY-MM-DD HH:MM:SS'` UTC
  par `datetime('now')`, ou `'YYYY-MM-DD'` pour une journée. Le front les lit
  sous ce format.
- Un commentaire par colonne dont le nom ne suffit pas (unité, NULL = …).

## Requêtes (`server/db.ts`)

- `store.orm` (Drizzle) pour les requêtes ; `store.db` (`node:sqlite` brut)
  seulement pour PRAGMA, `VACUUM INTO`, migrations et tests.
- Pilote `drizzle-orm/node-sqlite` **synchrone** : `.all()`, `.get()`,
  `.run()`, `.returning().get()` ; `orm.transaction((tx) => …)` sans `async`.
- Colonnes renvoyées par l'API : `select(TASK)` (colonnes de `Task`), pas
  `select()` qui renverrait tout.
- Expressions SQL propres à SQLite : `` sql`...${colonne}...${valeur}` `` (valeurs
  toujours en paramètres ; jamais `sql.raw` avec une donnée). Exemples :
  `fold(...) LIKE` (recherche sans accents), chrono (`julianday`), position
  suivante (`COALESCE(MAX(position) + 1, 0)`).
- Mise à jour conditionnelle : objet `SQLiteUpdateSetSource<typeof table>`
  rempli champ par champ, une seule écriture.

## Changer le schéma

Skill `migration` : modifier `schema.ts` **et** ajouter une migration SQL
numérotée dans `migrations.ts`. `server/test/schema.test.ts` vérifie qu'une base
migrée correspond exactement au schéma (colonnes, types, NOT NULL, défauts,
index, clés étrangères).

## À ne pas faire

- `drizzle-kit` (generate, push, studio) : écarté, bogué ailleurs ; les
  migrations restent écrites à la main (sauvegarde, suivi, vieilles bases).
- Changer de version de `drizzle-orm` (1.0 RC, épinglée) sans relancer
  `pnpm test` et `pnpm test:e2e`.
