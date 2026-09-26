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
  TimerAction,
} from '../shared/types.ts';

export interface TaskPatch {
  title?: string;
  doneAt?: string | null;
  jira?: JiraState;
  jiraKey?: string | null;
  jiraUrl?: string | null;
  notes?: string | null;
  timer?: TimerAction;
  timeSpent?: number; // annulation : valeurs du chrono remises telles quelles
  timerStartedAt?: string | null;
}
import type { ImportItem } from './markdown.ts';
import { LATEST_VERSION, migrate, schemaVersion, type MigrationReport } from './migrations.ts';

// À reporter dans Jira : marquée mais pas encore reportée.
const JIRA_PENDING = 'jira_wanted_at IS NOT NULL AND jira_at IS NULL';

// Chrono : secondes écoulées depuis le lancement (jamais négatif).
const ELAPSED = "MAX(0, CAST(ROUND((julianday('now') - julianday(timer_started_at)) * 86400) AS INTEGER))";
// Chrono mis en pause : la période en cours rejoint le temps cumulé.
const PAUSE = `time_spent = time_spent + ${ELAPSED}, timer_started_at = NULL`;

// Lignes brutes renvoyées par SQLite (toutes les colonnes).
export interface ProjectRow {
  id: number;
  name: string;
  created_at: string;
  archived_at: string | null;
  favorite_at: string | null;
  position: number;
}

// Projet supprimé avec toutes ses tâches (faites comprises), pour pouvoir l'annuler.
export interface DeletedProject {
  project: ProjectRow;
  tasks: TaskRow[];
}

export interface ProjectPatch {
  name?: string;
  archived?: boolean;
  favorite?: boolean;
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

// Texte ramené en minuscules sans accents, pour la recherche.
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Ouvre la base et l'amène à la dernière version du schéma (voir migrations.ts).
function openDb(file: string): { db: DatabaseSync; migration: MigrationReport } {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  // Ne pas exécuter de fonctions SQL appelées depuis le schéma (vues, triggers) d'une base importée.
  db.exec('PRAGMA trusted_schema = OFF');
  // Recherche sans tenir compte de la casse ni des accents (« reunion » trouve « Réunion »).
  db.function('fold', { deterministic: true }, (value) => (typeof value === 'string' ? fold(value) : null));
  try {
    return { db, migration: migrate(db, file) };
  } catch (err) {
    db.close();
    throw err;
  }
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
    if (schemaVersion(db) > LATEST_VERSION) throw new Error('base créée par une version plus récente');
  } catch (err) {
    throw new Error(`Fichier invalide : ${(err as Error).message}`);
  } finally {
    db?.close();
  }
}

export class Store {
  readonly file: string;
  db: DatabaseSync;
  // Migrations appliquées à l'ouverture (vide si la base était à jour).
  migration: MigrationReport;

  constructor(file: string) {
    this.file = file;
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    ({ db: this.db, migration: this.migration } = openDb(file));
    if (file !== ':memory:') fs.chmodSync(file, 0o600);
  }

  close() {
    this.db.close();
  }

  // --- Lecture -------------------------------------------------------------

  state(): State {
    const projects = this.db.prepare('SELECT id, name, archived_at, favorite_at FROM project ORDER BY position, id').all() as Omit<
      Project,
      'tasks'
    >[];
    const tasks = this.db
      .prepare('SELECT id, project_id, title, jira_wanted_at, jira_at, jira_key, jira_url, notes, time_spent, timer_started_at FROM task WHERE done_at IS NULL ORDER BY position, id')
      .all() as unknown as Task[];
    const byProject = new Map<number, Project>(projects.map((p) => [p.id, { ...p, tasks: [] }]));
    for (const t of tasks) byProject.get(t.project_id)?.tasks.push({ ...t });
    const { n } = this.db.prepare(`SELECT count(*) AS n FROM task WHERE ${JIRA_PENDING}`).get() as { n: number };
    return { projects: [...byProject.values()], jiraPending: n, settings: this.settings() };
  }

  // Période [from, to] incluse, bornes facultatives ('YYYY-MM-DD').
  // done_at n'a pas d'heure : from = to couvre toute la journée.
  // Sans aucun filtre : la dernière journée travaillée.
  // dates : tous les jours ayant des tâches faites (du projet filtré s'il y en
  // a un), pour naviguer d'un jour à l'autre.
  // q : recherche dans le titre, le contenu et le ticket (casse et accents ignorés).
  journal({ from, to, projectId, jiraPending, q }: JournalFilter = {}): Journal {
    const dates = (
      this.db
        .prepare(
          `SELECT DISTINCT done_at AS d FROM task WHERE done_at IS NOT NULL ${projectId ? 'AND project_id = ?' : ''} ORDER BY d`,
        )
        .all(...(projectId ? [projectId] : [])) as { d: string }[]
    ).map((r) => r.d);
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
    if (q) {
      // % et _ saisis sont cherchés tels quels, pas comme jokers SQL.
      const pattern = '%' + fold(q).replace(/[\\%_]/g, (c) => '\\' + c) + '%';
      const cols = ['t.title', 't.notes', 't.jira_key', 't.jira_url'];
      where.push('(' + cols.map((c) => `fold(${c}) LIKE ? ESCAPE '\\'`).join(' OR ') + ')');
      params.push(...cols.map(() => pattern));
    }
    if (!from && !to && !projectId && !jiraPending && !q) {
      const last = (this.db.prepare('SELECT MAX(done_at) AS d FROM task').get() as { d: string | null }).d;
      if (!last) return { days: [], dates };
      where.push('t.done_at = ?');
      params.push(last);
    }
    const rows = this.db
      .prepare(
        `SELECT t.id, t.title, t.done_at, t.jira_wanted_at, t.jira_at, t.jira_key, t.jira_url, t.notes,
                t.time_spent, t.timer_started_at, t.project_id, p.name AS project_name
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
    return { days, dates };
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
    const { lastInsertRowid } = this.db.prepare('INSERT INTO project (name, position) VALUES (?, (SELECT COALESCE(MAX(position) + 1, 0) FROM project))').run(name);
    return this.project(lastInsertRowid)!;
  }

  updateProject(id: number, { name, archived, favorite }: ProjectPatch) {
    if (name !== undefined) this.db.prepare('UPDATE project SET name = ? WHERE id = ?').run(name, id);
    if (archived !== undefined) {
      this.db
        .prepare(`UPDATE project SET archived_at = ${archived ? "datetime('now')" : 'NULL'} WHERE id = ?`)
        .run(id);
    }
    if (favorite !== undefined) {
      this.db
        .prepare(`UPDATE project SET favorite_at = ${favorite ? "datetime('now')" : 'NULL'} WHERE id = ?`)
        .run(id);
    }
    return this.project(id);
  }

  // Renvoie le projet supprimé et ses tâches, pour pouvoir l'annuler.
  deleteProject(id: number): DeletedProject | undefined {
    const project = this.project(id);
    if (!project) return undefined;
    const tasks = this.db.prepare('SELECT * FROM task WHERE project_id = ? ORDER BY id').all(id) as unknown as TaskRow[];
    this.db.prepare('DELETE FROM project WHERE id = ?').run(id);
    return { project, tasks };
  }

  // Annulation d'une suppression : réinsère le projet et ses tâches à
  // l'identique (mêmes id), tout ou rien.
  restoreProject({ project: p, tasks }: DeletedProject): DeletedProject {
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare('INSERT INTO project (id, name, created_at, archived_at, favorite_at, position) VALUES (?, ?, ?, ?, ?, ?)')
        .run(p.id, p.name, p.created_at, p.archived_at, p.favorite_at, p.position);
      for (const t of tasks) this.restoreTask(t);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return { project: this.project(p.id)!, tasks: tasks.map((t) => this.task(t.id)!) };
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
  // timer : chrono (un seul en marche à la fois ; une tâche faite l'arrête).
  updateTask(id: number, patch: TaskPatch) {
    const { title, doneAt, jira, jiraKey, jiraUrl, notes, timer, timeSpent, timerStartedAt } = patch;
    if (title !== undefined) this.db.prepare('UPDATE task SET title = ? WHERE id = ?').run(title, id);
    if (doneAt) this.db.prepare(`UPDATE task SET ${PAUSE} WHERE id = ? AND timer_started_at IS NOT NULL`).run(id);
    if (doneAt !== undefined) this.db.prepare('UPDATE task SET done_at = ? WHERE id = ?').run(doneAt, id);
    if (timer === 'start') {
      this.db.prepare(`UPDATE task SET ${PAUSE} WHERE timer_started_at IS NOT NULL AND id != ?`).run(id);
      this.db
        .prepare("UPDATE task SET timer_started_at = COALESCE(timer_started_at, datetime('now')) WHERE id = ? AND done_at IS NULL")
        .run(id);
    }
    if (timer === 'pause') this.db.prepare(`UPDATE task SET ${PAUSE} WHERE id = ? AND timer_started_at IS NOT NULL`).run(id);
    if (timer === 'reset') this.db.prepare('UPDATE task SET time_spent = 0, timer_started_at = NULL WHERE id = ?').run(id);
    if (timeSpent !== undefined) this.db.prepare('UPDATE task SET time_spent = ? WHERE id = ?').run(timeSpent, id);
    if (timerStartedAt !== undefined) this.db.prepare('UPDATE task SET timer_started_at = ? WHERE id = ?').run(timerStartedAt, id);
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

  // Place un projet à l'index donné parmi tous les projets (archivés compris) ;
  // les positions sont renumérotées. false si le projet n'existe pas.
  moveProject(id: number, index: number): boolean {
    if (!this.project(id)) return false;
    const ids = (
      this.db.prepare('SELECT id FROM project WHERE id != ? ORDER BY position, id').all(id) as { id: number }[]
    ).map((r) => r.id);
    ids.splice(Math.min(Math.max(index, 0), ids.length), 0, id);
    const update = this.db.prepare('UPDATE project SET position = ? WHERE id = ?');
    this.db.exec('BEGIN');
    try {
      ids.forEach((projectId, position) => update.run(position, projectId));
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return true;
  }

  // Renvoie la tâche supprimée (toutes ses colonnes), pour pouvoir l'annuler.
  deleteTask(id: number): TaskRow | undefined {
    const row = this.task(id);
    if (row) this.db.prepare('DELETE FROM task WHERE id = ?').run(id);
    return row;
  }

  // Annulation d'une suppression : réinsère la tâche à l'identique (même id).
  restoreTask(row: TaskRow): TaskRow {
    this.db
      .prepare(
        `INSERT INTO task (id, project_id, title, created_at, done_at, position, notes,
                           jira_wanted_at, jira_at, jira_key, jira_url, time_spent, timer_started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id, row.project_id, row.title, row.created_at, row.done_at, row.position, row.notes,
        row.jira_wanted_at, row.jira_at, row.jira_key, row.jira_url, row.time_spent, row.timer_started_at,
      );
    return this.task(row.id)!;
  }

  hasTask(id: number): boolean {
    return this.task(id) !== undefined;
  }

  // --- Import markdown -----------------------------------------------------

  // title null = projet seul. Réutilise les projets existants de même nom.
  importItems(items: ImportItem[]): ImportResult {
    const find = this.db.prepare('SELECT id FROM project WHERE lower(name) = lower(?)');
    const insertProject = this.db.prepare('INSERT INTO project (name, position) VALUES (?, (SELECT COALESCE(MAX(position) + 1, 0) FROM project))');
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
    ({ db: this.db, migration: this.migration } = openDb(this.file));
  }
}
