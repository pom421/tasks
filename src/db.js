import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

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
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(s) {
  return typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(s));
}

export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function migrate(db) {
  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  for (let v = version; v < MIGRATIONS.length; v++) {
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

function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  // Ne pas exécuter de fonctions SQL appelées depuis le schéma (vues, triggers) d'une base importée.
  db.exec('PRAGMA trusted_schema = OFF');
  migrate(db);
  return db;
}

// Vérifie qu'un fichier est une base SQLite compatible avant de l'importer.
export function validateDbFile(file) {
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => r.name);
    if (!tables.includes('project') || !tables.includes('task')) {
      throw new Error('tables project/task absentes');
    }
    // Seuls tables et index sont attendus : un trigger ou une vue injecté
    // s'exécuterait ensuite à chaque écriture.
    const extra = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type IN ('trigger', 'view')").get();
    if (extra.n) throw new Error('triggers ou vues non autorisés');
    const { quick_check: check } = db.prepare('PRAGMA quick_check').get();
    if (check !== 'ok') throw new Error('base corrompue');
    const { user_version: v } = db.prepare('PRAGMA user_version').get();
    if (v > MIGRATIONS.length) throw new Error('base créée par une version plus récente');
  } catch (err) {
    throw new Error(`Fichier invalide : ${err.message}`);
  } finally {
    db?.close();
  }
}

export class Store {
  constructor(file) {
    this.file = file;
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    this.db = openDb(file);
    if (file !== ':memory:') fs.chmodSync(file, 0o600);
  }

  close() {
    this.db.close();
  }

  // --- Lecture -------------------------------------------------------------

  state() {
    const projects = this.db
      .prepare('SELECT id, name, archived_at FROM project ORDER BY id')
      .all();
    const tasks = this.db
      .prepare('SELECT id, project_id, title, jira_at FROM task WHERE done_at IS NULL ORDER BY id')
      .all();
    const byProject = new Map(projects.map((p) => [p.id, { ...p, tasks: [] }]));
    for (const t of tasks) byProject.get(t.project_id)?.tasks.push({ ...t });
    return { projects: [...byProject.values()] };
  }

  // Période [from, to] incluse, bornes facultatives ('YYYY-MM-DD').
  // done_at n'a pas d'heure : from = to couvre toute la journée.
  // Sans aucun filtre : la dernière journée travaillée.
  journal({ from, to, projectId } = {}) {
    const where = ['t.done_at IS NOT NULL'];
    const params = [];
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
    if (!from && !to && !projectId) {
      const last = this.db.prepare('SELECT MAX(done_at) AS d FROM task').get().d;
      if (!last) return { days: [] };
      where.push('t.done_at = ?');
      params.push(last);
    }
    const rows = this.db
      .prepare(
        `SELECT t.id, t.title, t.done_at, t.jira_at, t.project_id, p.name AS project_name
         FROM task t JOIN project p ON p.id = t.project_id
         WHERE ${where.join(' AND ')}
         ORDER BY t.done_at DESC, p.id, t.id`,
      )
      .all(...params);
    const days = [];
    for (const r of rows) {
      let day = days.at(-1);
      if (day?.date !== r.done_at) days.push((day = { date: r.done_at, tasks: [] }));
      day.tasks.push({ ...r });
    }
    return { days };
  }

  // --- Projets -------------------------------------------------------------

  createProject(name) {
    const { lastInsertRowid } = this.db.prepare('INSERT INTO project (name) VALUES (?)').run(name);
    return this.db.prepare('SELECT * FROM project WHERE id = ?').get(lastInsertRowid);
  }

  updateProject(id, { name, archived }) {
    if (name !== undefined) this.db.prepare('UPDATE project SET name = ? WHERE id = ?').run(name, id);
    if (archived !== undefined) {
      this.db
        .prepare(`UPDATE project SET archived_at = ${archived ? "datetime('now')" : 'NULL'} WHERE id = ?`)
        .run(id);
    }
    return this.db.prepare('SELECT * FROM project WHERE id = ?').get(id);
  }

  deleteProject(id) {
    return this.db.prepare('DELETE FROM project WHERE id = ?').run(id).changes > 0;
  }

  // --- Tâches --------------------------------------------------------------

  createTask(projectId, title) {
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO task (project_id, title) VALUES (?, ?)')
      .run(projectId, title);
    return this.db.prepare('SELECT * FROM task WHERE id = ?').get(lastInsertRowid);
  }

  // doneAt : 'YYYY-MM-DD' pour marquer faite, null pour remettre à faire.
  // jira : true = reportée dans Jira (horodatée), false = retirée.
  updateTask(id, { title, doneAt, jira }) {
    if (title !== undefined) this.db.prepare('UPDATE task SET title = ? WHERE id = ?').run(title, id);
    if (doneAt !== undefined) this.db.prepare('UPDATE task SET done_at = ? WHERE id = ?').run(doneAt, id);
    if (jira !== undefined) {
      this.db
        .prepare(`UPDATE task SET jira_at = ${jira ? "datetime('now')" : 'NULL'} WHERE id = ?`)
        .run(id);
    }
    return this.db.prepare('SELECT * FROM task WHERE id = ?').get(id);
  }

  deleteTask(id) {
    return this.db.prepare('DELETE FROM task WHERE id = ?').run(id).changes > 0;
  }

  // --- Import markdown -----------------------------------------------------

  // items : [{ project, title|null, doneAt|null }] ; title null = projet seul.
  // Réutilise les projets existants de même nom.
  importItems(items) {
    const find = this.db.prepare('SELECT id FROM project WHERE lower(name) = lower(?)');
    const insertProject = this.db.prepare('INSERT INTO project (name) VALUES (?)');
    const insertTask = this.db.prepare('INSERT INTO task (project_id, title, done_at) VALUES (?, ?, ?)');
    const ids = new Map();
    let projects = 0;
    let tasks = 0;
    this.db.exec('BEGIN');
    try {
      for (const { project, title, doneAt } of items) {
        const key = project.toLowerCase();
        if (!ids.has(key)) {
          let id = find.get(project)?.id;
          if (!id) {
            id = insertProject.run(project).lastInsertRowid;
            projects++;
          }
          ids.set(key, id);
        }
        if (title) {
          insertTask.run(ids.get(key), title, doneAt ?? null);
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

  // --- Export / import de la base -----------------------------------------

  exportTo(file) {
    this.db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  }

  replaceWith(file) {
    validateDbFile(file);
    this.db.close();
    for (const suffix of ['-wal', '-shm']) fs.rmSync(this.file + suffix, { force: true });
    fs.copyFileSync(file, this.file);
    fs.chmodSync(this.file, 0o600);
    this.db = openDb(this.file);
  }
}
