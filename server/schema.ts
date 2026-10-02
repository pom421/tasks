// Schéma de la base : tables, colonnes et leur sens. Source de vérité des
// types (TaskRow, ProjectRow, Task… en sont déduits).
//
// Ce fichier décrit la base telle que la laissent les migrations
// (migrations.ts), qui restent seules à la modifier : un test vérifie que les
// deux concordent. Changer le schéma = modifier ce fichier ET ajouter une
// migration (skill `migration`).
//
// Dates : texte UTC 'YYYY-MM-DD HH:MM:SS' (datetime('now')), sauf mention
// 'YYYY-MM-DD' (journée). NULL = pas de date (état inactif).

import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { Priority } from '../shared/types.ts';

const now = sql`(datetime('now'))`;

export const project = sqliteTable('project', {
  id: integer().primaryKey(),
  name: text().notNull(),
  created_at: text().notNull().default(now),
  archived_at: text(), // archivé depuis
  favorite_at: text(), // favori depuis
  position: integer().notNull().default(0), // ordre d'affichage des projets
  bugtracker_key: text(), // ticket du projet (epic, PROJ-123), lien construit avec bugtracker_base_url
});

export const task = sqliteTable(
  'task',
  {
    id: integer().primaryKey(),
    project_id: integer()
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    created_at: text().notNull().default(now),
    done_at: text(), // 'YYYY-MM-DD' : faite ce jour-là (le Log), NULL = à faire
    position: integer().notNull().default(0), // ordre (priorité) dans le projet
    notes: text(), // contenu, en Markdown
    priority: integer().$type<Priority>(), // 1 (P1, la plus haute) à 3, NULL = aucune
    // Date prévue (intention) : 'YYYY-MM-DD'. Aujourd'hui montre celles du jour
    // et celles passées de tâches pas faites (en retard).
    day_at: text(),
    due_at: text(), // échéance (contrainte extérieure) : 'YYYY-MM-DD'
    tags: text({ mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`), // tags, JSON : ["client", "urgent"]
    // Report : à reporter = bugtracker_wanted_at sans bugtracker_at, reportée = bugtracker_at
    // (toujours avec un ticket : bugtracker_key).
    bugtracker_wanted_at: text(),
    bugtracker_at: text(),
    bugtracker_key: text(), // clé du ticket (PROJ-123), lien construit avec le réglage bugtracker_base_url
    // Chrono : temps passé = time_spent + durée depuis timer_started_at.
    time_spent: integer().notNull().default(0), // secondes cumulées (hors période en cours)
    timer_started_at: text(), // en marche depuis, NULL = arrêté
  },
  (t) => [index('task_project').on(t.project_id), index('task_done_at').on(t.done_at)],
);

// Réglages de l'application : bugtracker_base_url, day_capacity (maximum de tâches
// par jour dans Aujourd'hui).
export const setting = sqliteTable('setting', {
  key: text().primaryKey(),
  value: text(),
});

// Table technique : une ligne par migration appliquée (voir migrations.ts).
export const schemaMigration = sqliteTable('schema_migration', {
  version: integer().primaryKey(),
  name: text().notNull(),
  app_version: text(), // version de l'outil qui l'a appliquée
  applied_at: text(), // NULL = appliquée avant l'existence de cette table
});

export const tables = [project, task, setting, schemaMigration];

export type ProjectRow = typeof project.$inferSelect;
export type TaskRow = typeof task.$inferSelect;
