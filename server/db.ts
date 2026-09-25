import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type {
  DoneTask,
  ImportResult,
  JiraState,
  Journal,
  JournalDay,
  JournalFilter,
  Project,
  Settings,
  State,
  Task,
} from '../shared/types.ts';

export interface TaskPatch {
  title?: string;
  doneAt?: string | null;
  jira?: JiraState;
  jiraKey?: string | null;
  jiraUrl?: string | null;
  notes?: string | null;
}
import type { ImportItem } from './markdown.ts';

// Schéma versionné via PRAGMA user_version : chaque entrée = une migration.
const MIGRATIONS = [
  `
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
  CREATE INDEX task_done_at ON task(done_at);
  `,
  // 2 : tâche reportée dans Jira (horodatage du report, NULL = non reportée).
  `ALTER TABLE task ADD COLUMN jira_at TEXT;`,
  // 3 : ordre des tâches dans leur projet (priorité), initialisé sur l'ordre de création.
  `ALTER TABLE task ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
   UPDATE task SET position = id;`,
  // 4 : suivi Jira en deux temps (à reporter, puis reportée) et lien du ticket.
  `ALTER TABLE task ADD COLUMN jira_wanted_at TEXT;
   ALTER TABLE task ADD COLUMN jira_url TEXT;
   UPDATE task SET jira_wanted_at = jira_at WHERE jira_at IS NOT NULL;`,
  // 5 : détails de la tâche (notes, lien), clé du ticket Jira, réglages de l'application.
  `ALTER TABLE task ADD COLUMN notes TEXT;
   ALTER TABLE task ADD COLUMN link TEXT;
   ALTER TABLE task ADD COLUMN jira_key TEXT;
   CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT);`,
  // 6 : le lien de la tâche rejoint ses notes (Markdown), la colonne disparaît.
  `UPDATE task SET notes = COALESCE(notes || char(10) || char(10), '') || link WHERE link IS NOT NULL;
   ALTER TABLE task DROP COLUMN link;`,
];

// À reporter dans Jira : marquée mais pas encore reportée.
const JIRA_PENDING = 'jira_wanted_at IS NOT NULL AND jira_at IS NULL';

// Lignes brutes renvoyées par SQLite (toutes les colonnes).
export interface ProjectRow {
  id: number;
  name: string;
  created_at: string;
  archived_at: string | null;
}

export interface TaskRow extends Task {
  created_at: string;
  done_at: string | null;
  position: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(s: unknown): s is string {
  return typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(s));
}

export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function userVersion(db: DatabaseSync): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
}

function migrate(db: DatabaseSync) {
  for (let v = userVersion(db); v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

function openDb(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  // Ne pas exécuter de fonctions SQL appelées depuis le schéma (vues, triggers) d'une base importée.
  db.exec('PRAGMA trusted_schema = OFF');
  migrate(db);
  return db;
}

// Vérifie qu'un fichier est une base SQLite compatible avant de l'importer.
export function validateDbFile(file: string) {
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
      (r) => r.name,
    );
    if (!tables.includes('project') || !tables.includes('task')) {
      throw new Error('tables project/task absentes');
    }
    // Seuls tables et index sont attendus : un trigger ou une vue injecté
    // s'exécuterait ensuite à chaque écriture.
    const extra = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type IN ('trigger', 'view')").get() as {
      n: number;
    };
    if (extra.n) throw new Error('triggers ou vues non autorisés');
    const { quick_check: check } = db.prepare('PRAGMA quick_check').get() as { quick_check: string };
    if (check !== 'ok') throw new Error('base corrompue');
    if (userVersion(db) > MIGRATIONS.length) throw new Error('base créée par une version plus récente');
  } catch (err) {
    throw new Error(`Fichier invalide : ${(err as Error).message}`);
  } finally {
    db?.close();
  }
}

export class Store {
  readonly file: string;
  db: DatabaseSync;

  constructor(file: string) {
    this.file = file;
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    this.db = openDb(file);
    if (file !== ':memory:') fs.chmodSync(file, 0o600);
  }

  close() {
    this.db.close();
  }

  // --- Lecture -------------------------------------------------------------

  state(): State {
    const projects = this.db.prepare('SELECT id, name, archived_at FROM project ORDER BY id').all() as Omit<
      Project,
      'tasks'
    >[];
    const tasks = this.db
      .prepare('SELECT id, project_id, title, jira_wanted_at, jira_at, jira_key, jira_url, notes FROM task WHERE done_at IS NULL ORDER BY position, id')
      .all() as unknown as Task[];
    const byProject = new Map<number, Project>(projects.map((p) => [p.id, { ...p, tasks: [] }]));
    for (const t of tasks) byProject.get(t.project_id)?.tasks.push({ ...t });
    const { n } = this.db.prepare(`SELECT count(*) AS n FROM task WHERE ${JIRA_PENDING}`).get() as { n: number };
    return { projects: [...byProject.values()], jiraPending: n, settings: this.settings() };
  }

  // Période [from, to] incluse, bornes facultatives ('YYYY-MM-DD').
  // done_at n'a pas d'heure : from = to couvre toute la journée.
  // Sans aucun filtre : la dernière journée travaillée.
  journal({ from, to, projectId, jiraPending }: JournalFilter = {}): Journal {
    const where = ['t.done_at IS NOT NULL'];
    const params: (string | number)[] = [];
    if (from) {
      where.push('t.done_at >= ?');
      params.push(from);
    }
    if (to) {
      where.push('t.done_at <= ?');
      params.push(to);
    }
    if (projectId) {
      where.push('t.project_id = ?');
      params.push(projectId);
    }
    if (jiraPending) where.push(JIRA_PENDING.replaceAll('jira_', 't.jira_'));
    if (!from && !to && !projectId && !jiraPending) {
      const last = (this.db.prepare('SELECT MAX(done_at) AS d FROM task').get() as { d: string | null }).d;
      if (!last) return { days: [] };
      where.push('t.done_at = ?');
      params.push(last);
    }
    const rows = this.db
      .prepare(
        `SELECT t.id, t.title, t.done_at, t.jira_wanted_at, t.jira_at, t.jira_key, t.jira_url, t.notes,
                t.project_id, p.name AS project_name
         FROM task t JOIN project p ON p.id = t.project_id
         WHERE ${where.join(' AND ')}
         ORDER BY t.done_at DESC, p.id, t.id`,
      )
      .all(...params) as unknown as DoneTask[];
    const days: JournalDay[] = [];
    for (const r of rows) {
      let day = days.at(-1);
      if (day?.date !== r.done_at) days.push((day = { date: r.done_at, tasks: [] }));
      day.tasks.push({ ...r });
    }
    return { days };
  }

  // --- Projets -------------------------------------------------------------

  private project(id: number | bigint): ProjectRow | undefined {
    return this.db.prepare('SELECT * FROM project WHERE id = ?').get(id) as ProjectRow | undefined;
  }

  private task(id: number | bigint): TaskRow | undefined {
    return this.db.prepare('SELECT * FROM task WHERE id = ?').get(id) as TaskRow | undefined;
  }

  hasProject(id: number): boolean {
    return this.project(id) !== undefined;
  }

  createProject(name: string): ProjectRow {
    const { lastInsertRowid } = this.db.prepare('INSERT INTO project (name) VALUES (?)').run(name);
    return this.project(lastInsertRowid)!;
  }

  updateProject(id: number, { name, archived }: { name?: string; archived?: boolean }) {
    if (name !== undefined) this.db.prepare('UPDATE project SET name = ? WHERE id = ?').run(name, id);
    if (archived !== undefined) {
      this.db
        .prepare(`UPDATE project SET archived_at = ${archived ? "datetime('now')" : 'NULL'} WHERE id = ?`)
        .run(id);
    }
    return this.project(id);
  }

  deleteProject(id: number): boolean {
    return this.db.prepare('DELETE FROM project WHERE id = ?').run(id).changes > 0;
  }

  // --- Tâches --------------------------------------------------------------

  createTask(projectId: number, title: string): TaskRow {
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO task (project_id, title, position) VALUES (?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM task WHERE project_id = ?))')
      .run(projectId, title, projectId);
    return this.task(lastInsertRowid)!;
  }

  // doneAt : 'YYYY-MM-DD' pour marquer faite, null pour remettre à faire.
  // jira : état du suivi Jira ('none' efface aussi le ticket) ;
  // jiraKey / jiraUrl : ticket (clé ou lien complet) ; notes : détails (Markdown).
  updateTask(id: number, patch: TaskPatch) {
    const { title, doneAt, jira, jiraKey, jiraUrl, notes } = patch;
    if (title !== undefined) this.db.prepare('UPDATE task SET title = ? WHERE id = ?').run(title, id);
    if (doneAt !== undefined) this.db.prepare('UPDATE task SET done_at = ? WHERE id = ?').run(doneAt, id);
    if (jira !== undefined) {
      const set = {
        none: 'jira_wanted_at = NULL, jira_at = NULL, jira_key = NULL, jira_url = NULL',
        wanted: "jira_wanted_at = COALESCE(jira_wanted_at, datetime('now')), jira_at = NULL",
        done: "jira_wanted_at = COALESCE(jira_wanted_at, datetime('now')), jira_at = COALESCE(jira_at, datetime('now'))",
      }[jira];
      this.db.prepare(`UPDATE task SET ${set} WHERE id = ?`).run(id);
    }
    if (jiraKey !== undefined) this.db.prepare('UPDATE task SET jira_key = ? WHERE id = ?').run(jiraKey, id);
    if (jiraUrl !== undefined) this.db.prepare('UPDATE task SET jira_url = ? WHERE id = ?').run(jiraUrl, id);
    if (notes !== undefined) this.db.prepare('UPDATE task SET notes = ? WHERE id = ?').run(notes, id);
    return this.task(id);
  }

  // Place une tâche à faire à l'index donné parmi les tâches à faire du projet
  // cible (qui peut être un autre projet). Renvoie false si la tâche n'existe
  // pas ou est déjà faite. Les positions du projet cible sont renumérotées.
  moveTask(id: number, projectId: number, index: number): boolean {
    const task = this.task(id);
    if (!task || task.done_at !== null) return false;
    const ids = (
      this.db
        .prepare('SELECT id FROM task WHERE project_id = ? AND done_at IS NULL AND id != ? ORDER BY position, id')
        .all(projectId, id) as { id: number }[]
    ).map((r) => r.id);
    ids.splice(Math.min(Math.max(index, 0), ids.length), 0, id);
    const update = this.db.prepare('UPDATE task SET project_id = ?, position = ? WHERE id = ?');
    this.db.exec('BEGIN');
    try {
      ids.forEach((taskId, position) => update.run(projectId, position, taskId));
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return true;
  }

  deleteTask(id: number): boolean {
    return this.db.prepare('DELETE FROM task WHERE id = ?').run(id).changes > 0;
  }

  // --- Import markdown -----------------------------------------------------

  // title null = projet seul. Réutilise les projets existants de même nom.
  importItems(items: ImportItem[]): ImportResult {
    const find = this.db.prepare('SELECT id FROM project WHERE lower(name) = lower(?)');
    const insertProject = this.db.prepare('INSERT INTO project (name) VALUES (?)');
    const insertTask = this.db.prepare(
      'INSERT INTO task (project_id, title, done_at, position) VALUES (?, ?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM task WHERE project_id = ?))',
    );
    const ids = new Map<string, number | bigint>();
    let projects = 0;
    let tasks = 0;
    this.db.exec('BEGIN');
    try {
      for (const { project, title, doneAt } of items) {
        const key = project.toLowerCase();
        if (!ids.has(key)) {
          let id = (find.get(project) as { id: number } | undefined)?.id as number | bigint | undefined;
          if (!id) {
            id = insertProject.run(project).lastInsertRowid;
            projects++;
          }
          ids.set(key, id);
        }
        if (title) {
          insertTask.run(ids.get(key)!, title, doneAt ?? null, ids.get(key)!);
          tasks++;
        }
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return { projects, tasks };
  }

  // --- Réglages ------------------------------------------------------------

  settings(): Settings {
    const rows = this.db.prepare('SELECT key, value FROM setting').all() as { key: string; value: string | null }[];
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return { jira_base_url: map.get('jira_base_url') ?? null };
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const upsert = this.db.prepare(
      'INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    );
    for (const [key, value] of Object.entries(patch)) upsert.run(key, value ?? null);
    return this.settings();
  }

  // --- Export / import de la base -----------------------------------------

  exportTo(file: string) {
    this.db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  }

  replaceWith(file: string) {
    validateDbFile(file);
    this.db.close();
    for (const suffix of ['-wal', '-shm']) fs.rmSync(this.file + suffix, { force: true });
    fs.copyFileSync(file, this.file);
    fs.chmodSync(this.file, 0o600);
    this.db = openDb(this.file);
  }
}
