// Versions du schéma de la base.
//
// Chaque script fait passer la base de la version N-1 à la version N. Une base
// en version 2 passe en version 6 en appliquant, dans l'ordre, les scripts 3,
// 4, 5 et 6 : chacun dans sa propre transaction (tout ou rien).
//
// Ajouter une version : ajouter un script en fin de liste, avec le numéro
// suivant. Ne jamais modifier un script déjà publié (des bases l'ont appliqué).
//
// Suivi : la table technique schema_migration garde une ligne par version
// appliquée (nom, version de l'outil, date). PRAGMA user_version est tenu à
// jour aussi : c'est lui qui permettait le suivi avant cette table.

import fs from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'projets et tâches',
    sql: `
      CREATE TABLE project (
        id          INTEGER PRIMARY KEY,
        name        TEXT    NOT NULL,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        archived_at TEXT
      );
      CREATE TABLE task (
        id          INTEGER PRIMARY KEY,
        project_id  INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        title       TEXT    NOT NULL,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        done_at     TEXT    -- 'YYYY-MM-DD', NULL = à faire
      );
      CREATE INDEX task_project ON task(project_id);
      CREATE INDEX task_done_at ON task(done_at);`,
  },
  {
    version: 2,
    name: 'tâche reportée (date du report)',
    sql: `ALTER TABLE task ADD COLUMN jira_at TEXT;`,
  },
  {
    version: 3,
    name: 'ordre des tâches (priorité)',
    sql: `
      ALTER TABLE task ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
      UPDATE task SET position = id;`,
  },
  {
    version: 4,
    name: 'report en deux temps et lien du ticket',
    sql: `
      ALTER TABLE task ADD COLUMN jira_wanted_at TEXT;
      ALTER TABLE task ADD COLUMN jira_url TEXT;
      UPDATE task SET jira_wanted_at = jira_at WHERE jira_at IS NOT NULL;`,
  },
  {
    version: 5,
    name: 'détails de la tâche, clé du ticket, réglages',
    sql: `
      ALTER TABLE task ADD COLUMN notes TEXT;
      ALTER TABLE task ADD COLUMN link TEXT;
      ALTER TABLE task ADD COLUMN jira_key TEXT;
      CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT);`,
  },
  {
    version: 6,
    name: 'le lien rejoint les notes',
    sql: `
      UPDATE task SET notes = COALESCE(notes || char(10) || char(10), '') || link WHERE link IS NOT NULL;
      ALTER TABLE task DROP COLUMN link;`,
  },
];

export const LATEST_VERSION = MIGRATIONS.at(-1)!.version;

// Version de l'outil enregistrée avec chaque migration (fournie par pnpm).
const APP_VERSION = process.env.npm_package_version ?? 'inconnue';

function hasMigrationTable(db: DatabaseSync): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migration'").get());
}

// Version actuelle du schéma : la table de suivi si elle existe, sinon
// PRAGMA user_version (bases créées avant la table).
export function schemaVersion(db: DatabaseSync): number {
  if (hasMigrationTable(db)) {
    const row = db.prepare('SELECT MAX(version) AS v FROM schema_migration').get() as { v: number | null };
    return row.v ?? 0;
  }
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
}

export interface MigrationReport {
  from: number;
  to: number;
  applied: Migration[];
  backup: string | null; // copie du fichier faite avant de migrer
}

// Amène la base à la dernière version. file : chemin du fichier, pour la
// sauvegarde préalable (aucune sauvegarde pour une base neuve ou en mémoire).
export function migrate(db: DatabaseSync, file?: string): MigrationReport {
  const from = schemaVersion(db);
  if (from > LATEST_VERSION) {
    throw new Error(`base en version ${from}, plus récente que l'outil (version ${LATEST_VERSION}) : mettre l'outil à jour`);
  }

  // Suivi : création de la table ; une base plus ancienne y inscrit les
  // versions déjà appliquées (date inconnue).
  if (!hasMigrationTable(db)) {
    db.exec(`CREATE TABLE schema_migration (
      version     INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      app_version TEXT,
      applied_at  TEXT
    )`);
    const known = db.prepare('INSERT INTO schema_migration (version, name) VALUES (?, ?)');
    for (const m of MIGRATIONS.filter((m) => m.version <= from)) known.run(m.version, m.name);
  }

  const pending = MIGRATIONS.filter((m) => m.version > from);
  let backup: string | null = null;
  if (pending.length && from > 0 && file && file !== ':memory:' && fs.existsSync(file)) {
    backup = `${file}.v${from}.bak`;
    db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
    fs.chmodSync(backup, 0o600);
  }

  const record = db.prepare(
    "INSERT INTO schema_migration (version, name, app_version, applied_at) VALUES (?, ?, ?, datetime('now'))",
  );
  for (const m of pending) {
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      record.run(m.version, m.name, APP_VERSION);
      db.exec(`PRAGMA user_version = ${m.version}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`migration ${m.version} (${m.name}) en échec : ${(err as Error).message}`);
    }
  }
  return { from, to: LATEST_VERSION, applied: pending, backup };
}

// Phrase de compte rendu d'une migration, ou null si rien n'a été appliqué.
export function describeMigration(file: string, m: MigrationReport): string | null {
  if (!m.applied.length) return null;
  const list = m.applied.map((x) => `${x.version} (${x.name})`).join(', ');
  const from = m.from === 0 ? 'base neuve' : `version ${m.from}`;
  return `${file} : ${from} → version ${m.to}, migrations appliquées : ${list}.${m.backup ? ` Sauvegarde : ${m.backup}` : ''}`;
}
