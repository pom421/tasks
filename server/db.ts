import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { and, count, desc, eq, getColumns, gte, isNotNull, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import { drizzle, type NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';
import type { SQLiteUpdateSetSource } from 'drizzle-orm/sqlite-core';
import { project, setting, task, type ProjectRow, type TaskRow } from './schema.ts';
import type {
  DoneTask,
  ImportResult,
  BugtrackerState,
  Journal,
  JournalDay,
  JournalFilter,
  Priority,
  Project,
  Settings,
  SettingsPatch,
  State,
  TimerAction,
} from '../shared/types.ts';
import { DEFAULT_DAY_CAPACITY } from '../shared/types.ts';
import type { ImportItem } from './markdown.ts';
import { LATEST_VERSION, migrate, schemaVersion, type MigrationReport } from './migrations.ts';

export interface TaskPatch {
  title?: string;
  doneAt?: string | null;
  bugtracker?: BugtrackerState;
  bugtrackerKey?: string | null;
  bugtrackerUrl?: string | null;
  notes?: string | null;
  timer?: TimerAction;
  timeSpent?: number; // annulation : valeurs du chrono remises telles quelles
  timerStartedAt?: string | null;
  dayAt?: string | null;
  dueAt?: string | null;
  tags?: string[];
  priority?: Priority | null;
}

// À reporter dans le bugtracker : marquée mais pas encore reportée.
const BUGTRACKER_PENDING = and(isNotNull(task.bugtracker_wanted_at), isNull(task.bugtracker_at));

const NOW = sql`datetime('now')`;

// Chrono : secondes écoulées depuis le lancement (jamais négatif).
const ELAPSED = sql`MAX(0, CAST(ROUND((julianday('now') - julianday(${task.timer_started_at})) * 86400) AS INTEGER))`;
// Chrono mis en pause : la période en cours rejoint le temps cumulé.
const PAUSE = { time_spent: sql`${task.time_spent} + ${ELAPSED}`, timer_started_at: null };
const RUNNING = isNotNull(task.timer_started_at);

// Colonnes d'une tâche renvoyées par l'API (type Task).
const { done_at: _doneAt, position: _position, created_at: _createdAt, ...TASK } = getColumns(task);

// Projet supprimé avec toutes ses tâches (faites comprises), pour pouvoir l'annuler.
export interface DeletedProject {
  project: ProjectRow;
  tasks: TaskRow[];
}

export interface ProjectPatch {
  name?: string;
  archived?: boolean;
  favorite?: boolean;
  bugtrackerKey?: string | null; // ticket : clé ou lien complet (l'autre à null)
  bugtrackerUrl?: string | null;
  notes?: string | null; // contenu (Markdown)
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
function openDb(file: string): { db: DatabaseSync; orm: NodeSQLiteDatabase; migration: MigrationReport } {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  // Ne pas exécuter de fonctions SQL appelées depuis le schéma (vues, triggers) d'une base importée.
  db.exec('PRAGMA trusted_schema = OFF');
  // Recherche sans tenir compte de la casse ni des accents (« reunion » trouve « Réunion »).
  db.function('fold', { deterministic: true }, (value) => (typeof value === 'string' ? fold(value) : null));
  try {
    return { db, orm: drizzle({ client: db }), migration: migrate(db, file) };
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

// Position suivante : en fin de liste des projets, ou des tâches du projet.
const nextProjectPosition = () => sql`(SELECT COALESCE(MAX(${project.position}) + 1, 0) FROM ${project})`;
const nextTaskPosition = (projectId: number) =>
  sql`(SELECT COALESCE(MAX(${task.position}) + 1, 0) FROM ${task} WHERE ${task.project_id} = ${projectId})`;

export class Store {
  readonly file: string;
  db: DatabaseSync; // accès SQL brut (migrations, tests)
  orm: NodeSQLiteDatabase; // requêtes typées par le schéma (schema.ts)
  // Migrations appliquées à l'ouverture (vide si la base était à jour).
  migration: MigrationReport;

  constructor(file: string) {
    this.file = file;
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    ({ db: this.db, orm: this.orm, migration: this.migration } = openDb(file));
    if (file !== ':memory:') fs.chmodSync(file, 0o600);
  }

  close() {
    this.db.close();
  }

  // --- Lecture -------------------------------------------------------------

  // day : journée de « Plan journée » ('YYYY-MM-DD', celle du navigateur), pour
  // compter les tâches choisies déjà faites.
  state(day?: string): State {
    const { id, name, archived_at, favorite_at, bugtracker_key, bugtracker_url, notes } = getColumns(project);
    const projects = this.orm
      .select({ id, name, archived_at, favorite_at, bugtracker_key, bugtracker_url, notes })
      .from(project)
      .orderBy(project.position, project.id)
      .all();
    const tasks = this.orm.select(TASK).from(task).where(isNull(task.done_at)).orderBy(task.position, task.id).all();
    const byProject = new Map<number, Project>(projects.map((p) => [p.id, { ...p, tasks: [] }]));
    for (const t of tasks) byProject.get(t.project_id)?.tasks.push(t);
    // Tâches du plan faites ce jour-là, prévues pour ce jour ou avant (en retard).
    const dayDone = day ? this.count(and(eq(task.done_at, day), lte(task.day_at, day))) : 0;
    return { projects: [...byProject.values()], bugtrackerPending: this.count(BUGTRACKER_PENDING), dayDone, settings: this.settings() };
  }

  private count(where: SQL | undefined): number {
    return this.orm.select({ n: count() }).from(task).where(where).get()!.n;
  }

  // Période [from, to] incluse, bornes facultatives ('YYYY-MM-DD').
  // done_at n'a pas d'heure : from = to couvre toute la journée.
  // limit : les `limit` derniers jours ayant des entrées jusqu'à `to` (fenêtre du Log).
  // Sans aucun filtre : la dernière journée travaillée.
  // dates : tous les jours ayant des entrées qui correspondent aux filtres
  // (projet, report, recherche), quelle que soit la période : pour passer d'une
  // fenêtre à l'autre.
  // tags : seulement les tâches qui portent tous ces tags.
  // q : recherche dans le titre, le contenu et le ticket (casse et accents ignorés).
  journal({ from, to, projectId, bugtrackerPending, q, tags = [], limit }: JournalFilter = {}): Journal {
    const where: (SQL | undefined)[] = [isNotNull(task.done_at)];
    if (projectId) where.push(eq(task.project_id, projectId));
    if (bugtrackerPending) where.push(BUGTRACKER_PENDING);
    // tags : la tâche les porte tous (ET).
    for (const tag of tags) where.push(sql`EXISTS (SELECT 1 FROM json_each(${task.tags}) WHERE value = ${tag})`);
    if (q) {
      // % et _ saisis sont cherchés tels quels, pas comme jokers SQL.
      const pattern = '%' + fold(q).replace(/[\\%_]/g, (c) => '\\' + c) + '%';
      const cols = [task.title, task.notes, task.bugtracker_key, task.bugtracker_url];
      where.push(or(...cols.map((c) => sql`fold(${c}) LIKE ${pattern} ESCAPE '\\'`)));
    }
    const dates = this.orm
      .selectDistinct({ d: task.done_at })
      .from(task)
      .where(and(...where))
      .orderBy(task.done_at)
      .all()
      .map((r) => r.d!);
    if (limit) {
      const window = dates.filter((d) => (!from || d >= from) && (!to || d <= to)).slice(-limit);
      if (!window.length) return { days: [], dates, tags: this.doneTags() };
      [from, to] = [window[0], window.at(-1)];
    }
    if (from) where.push(gte(task.done_at, from));
    if (to) where.push(lte(task.done_at, to));
    if (!from && !to && !projectId && !bugtrackerPending && !q && !tags.length) {
      const last = dates.at(-1);
      if (!last) return { days: [], dates, tags: this.doneTags() };
      where.push(eq(task.done_at, last));
    }
    // done_at jamais NULL ici (filtré plus haut).
    const rows = this.orm
      .select({ ...TASK, done_at: task.done_at, project_name: project.name })
      .from(task)
      .innerJoin(project, eq(project.id, task.project_id))
      .where(and(...where))
      .orderBy(desc(task.done_at), project.id, task.id)
      .all() as DoneTask[];
    const days: JournalDay[] = [];
    for (const r of rows) {
      let day = days.at(-1);
      if (day?.date !== r.done_at) days.push((day = { date: r.done_at, tasks: [] }));
      day.tasks.push(r);
    }
    return { days, dates, tags: this.doneTags() };
  }

  // Tags des tâches faites, triés : propositions du filtre du Log.
  private doneTags(): string[] {
    return this.orm
      .all<{ tag: string }>(sql`SELECT DISTINCT j.value AS tag FROM ${task}, json_each(${task.tags}) AS j WHERE ${task.done_at} IS NOT NULL ORDER BY 1`)
      .map((r) => r.tag);
  }

  // --- Projets -------------------------------------------------------------

  private project(id: number): ProjectRow | undefined {
    return this.orm.select().from(project).where(eq(project.id, id)).get();
  }

  private task(id: number): TaskRow | undefined {
    return this.orm.select().from(task).where(eq(task.id, id)).get();
  }

  hasProject(id: number): boolean {
    return this.project(id) !== undefined;
  }

  createProject(name: string): ProjectRow {
    return this.orm.insert(project).values({ name, position: nextProjectPosition() }).returning().get();
  }

  updateProject(id: number, { name, archived, favorite, bugtrackerKey, bugtrackerUrl, notes }: ProjectPatch) {
    const set: SQLiteUpdateSetSource<typeof project> = {};
    if (name !== undefined) set.name = name;
    if (notes !== undefined) set.notes = notes;
    if (bugtrackerKey !== undefined) set.bugtracker_key = bugtrackerKey;
    if (bugtrackerUrl !== undefined) set.bugtracker_url = bugtrackerUrl;
    if (archived !== undefined) set.archived_at = archived ? NOW : null;
    if (favorite !== undefined) set.favorite_at = favorite ? NOW : null;
    if (Object.keys(set).length) this.orm.update(project).set(set).where(eq(project.id, id)).run();
    return this.project(id);
  }

  // Renvoie le projet supprimé et ses tâches, pour pouvoir l'annuler.
  deleteProject(id: number): DeletedProject | undefined {
    const row = this.project(id);
    if (!row) return undefined;
    const tasks = this.orm.select().from(task).where(eq(task.project_id, id)).orderBy(task.id).all();
    this.orm.delete(project).where(eq(project.id, id)).run();
    return { project: row, tasks };
  }

  // Annulation d'une suppression : réinsère le projet et ses tâches à
  // l'identique (mêmes id), tout ou rien.
  restoreProject({ project: p, tasks }: DeletedProject): DeletedProject {
    this.orm.transaction((tx) => {
      tx.insert(project).values(p).run();
      for (const t of tasks) tx.insert(task).values(t).run();
    });
    return { project: this.project(p.id)!, tasks: tasks.map((t) => this.task(t.id)!) };
  }

  // --- Tâches --------------------------------------------------------------

  createTask(projectId: number, title: string): TaskRow {
    return this.orm
      .insert(task)
      .values({ project_id: projectId, title, position: nextTaskPosition(projectId) })
      .returning()
      .get();
  }

  // doneAt : 'YYYY-MM-DD' pour marquer faite, null pour remettre à faire.
  // bugtracker : état du suivi du bugtracker ('none' efface aussi le ticket) ;
  // bugtrackerKey / bugtrackerUrl : ticket (clé ou lien complet) ; notes : détails (Markdown).
  // timer : chrono (un seul en marche à la fois ; une tâche faite l'arrête) ;
  // dayAt : date prévue (Aujourd'hui si c'est ce jour), null = aucune ;
  // dueAt : échéance, null = aucune ; tags : liste complète (remplace l'ancienne) ;
  // priority : 1 à 3, null = aucune.
  updateTask(id: number, patch: TaskPatch) {
    const { title, doneAt, bugtracker, bugtrackerKey, bugtrackerUrl, notes, timer, timeSpent, timerStartedAt, dayAt, dueAt, tags, priority } = patch;
    const update = (set: SQLiteUpdateSetSource<typeof task>, where: SQL | undefined = undefined) =>
      this.orm.update(task).set(set).where(and(eq(task.id, id), where)).run();
    if (doneAt) update(PAUSE, RUNNING);
    if (doneAt !== undefined) update({ done_at: doneAt });
    if (timer === 'start') {
      this.orm.update(task).set(PAUSE).where(and(RUNNING, ne(task.id, id))).run();
      update({ timer_started_at: sql`COALESCE(${task.timer_started_at}, ${NOW})` }, isNull(task.done_at));
    }
    if (timer === 'pause') update(PAUSE, RUNNING);
    if (timer === 'reset') update({ time_spent: 0, timer_started_at: null });
    // Le reste en une seule écriture ; l'ordre compte : bugtracker 'none' efface le
    // ticket, bugtrackerKey / bugtrackerUrl le remplacent ensuite.
    const set: SQLiteUpdateSetSource<typeof task> = {};
    if (title !== undefined) set.title = title;
    if (timeSpent !== undefined) set.time_spent = timeSpent;
    if (timerStartedAt !== undefined) set.timer_started_at = timerStartedAt;
    if (bugtracker === 'none') Object.assign(set, { bugtracker_wanted_at: null, bugtracker_at: null, bugtracker_key: null, bugtracker_url: null });
    if (bugtracker === 'wanted' || bugtracker === 'done') set.bugtracker_wanted_at = sql`COALESCE(${task.bugtracker_wanted_at}, ${NOW})`;
    if (bugtracker === 'wanted') set.bugtracker_at = null;
    if (bugtracker === 'done') set.bugtracker_at = sql`COALESCE(${task.bugtracker_at}, ${NOW})`;
    if (bugtrackerKey !== undefined) set.bugtracker_key = bugtrackerKey;
    if (bugtrackerUrl !== undefined) set.bugtracker_url = bugtrackerUrl;
    if (notes !== undefined) set.notes = notes;
    if (dayAt !== undefined) set.day_at = dayAt;
    if (dueAt !== undefined) set.due_at = dueAt;
    if (tags !== undefined) set.tags = tags;
    if (priority !== undefined) set.priority = priority;
    if (Object.keys(set).length) update(set);
    return this.task(id);
  }

  // Place une tâche à faire à l'index donné parmi les tâches à faire du projet
  // cible (qui peut être un autre projet). Renvoie false si la tâche n'existe
  // pas ou est déjà faite. Les positions du projet cible sont renumérotées.
  moveTask(id: number, projectId: number, index: number): boolean {
    const row = this.task(id);
    if (!row || row.done_at !== null) return false;
    const ids = this.orm
      .select({ id: task.id })
      .from(task)
      .where(and(eq(task.project_id, projectId), isNull(task.done_at), ne(task.id, id)))
      .orderBy(task.position, task.id)
      .all()
      .map((r) => r.id);
    ids.splice(Math.min(Math.max(index, 0), ids.length), 0, id);
    this.orm.transaction((tx) => {
      ids.forEach((taskId, position) =>
        tx.update(task).set({ project_id: projectId, position }).where(eq(task.id, taskId)).run(),
      );
    });
    return true;
  }

  // Place un projet à l'index donné parmi tous les projets (archivés compris) ;
  // les positions sont renumérotées. false si le projet n'existe pas.
  moveProject(id: number, index: number): boolean {
    if (!this.project(id)) return false;
    const ids = this.orm
      .select({ id: project.id })
      .from(project)
      .where(ne(project.id, id))
      .orderBy(project.position, project.id)
      .all()
      .map((r) => r.id);
    ids.splice(Math.min(Math.max(index, 0), ids.length), 0, id);
    this.orm.transaction((tx) => {
      ids.forEach((projectId, position) => tx.update(project).set({ position }).where(eq(project.id, projectId)).run());
    });
    return true;
  }

  // Renvoie la tâche supprimée (toutes ses colonnes), pour pouvoir l'annuler.
  deleteTask(id: number): TaskRow | undefined {
    return this.orm.delete(task).where(eq(task.id, id)).returning().get();
  }

  // Annulation d'une suppression : réinsère la tâche à l'identique (même id).
  restoreTask(row: TaskRow): TaskRow {
    return this.orm.insert(task).values(row).returning().get();
  }

  hasTask(id: number): boolean {
    return this.task(id) !== undefined;
  }

  // --- Import markdown -----------------------------------------------------

  // title null = projet seul. Réutilise les projets existants de même nom.
  importItems(items: ImportItem[]): ImportResult {
    const ids = new Map<string, number>();
    let projects = 0;
    let tasks = 0;
    this.orm.transaction((tx) => {
      for (const { project: name, title, doneAt } of items) {
        const key = name.toLowerCase();
        let projectId = ids.get(key);
        if (projectId === undefined) {
          projectId = tx
            .select({ id: project.id })
            .from(project)
            .where(sql`lower(${project.name}) = lower(${name})`)
            .get()?.id;
          if (projectId === undefined) {
            projectId = tx.insert(project).values({ name, position: nextProjectPosition() }).returning().get().id;
            projects++;
          }
          ids.set(key, projectId);
        }
        if (title) {
          tx.insert(task)
            .values({ project_id: projectId, title, done_at: doneAt ?? null, position: nextTaskPosition(projectId) })
            .run();
          tasks++;
        }
      }
    });
    return { projects, tasks };
  }

  // --- Réglages ------------------------------------------------------------

  settings(): Settings {
    const rows = this.orm.select().from(setting).all();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      bugtracker_base_url: map.get('bugtracker_base_url') ?? null,
      day_capacity: Number(map.get('day_capacity')) || DEFAULT_DAY_CAPACITY,
      jira_pat_set: Boolean(map.get('jira_pat')),
    };
  }

  // PAT Jira : lu seulement par le serveur, jamais renvoyé au navigateur.
  jiraPat(): string | null {
    return this.orm.select().from(setting).where(eq(setting.key, 'jira_pat')).get()?.value ?? null;
  }

  updateSettings(patch: SettingsPatch): Settings {
    for (const [key, v] of Object.entries(patch)) {
      const value = v === null || v === undefined ? null : String(v);
      this.orm.insert(setting).values({ key, value }).onConflictDoUpdate({ target: setting.key, set: { value } }).run();
    }
    return this.settings();
  }

  // --- Export / import de la base -----------------------------------------

  exportTo(file: string) {
    this.db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
    // Le PAT Jira reste sur ce poste : il ne part pas dans le fichier exporté.
    const copy = new DatabaseSync(file);
    copy.exec("DELETE FROM setting WHERE key = 'jira_pat'; VACUUM");
    copy.close();
  }

  replaceWith(file: string) {
    validateDbFile(file);
    this.db.close();
    for (const suffix of ['-wal', '-shm']) fs.rmSync(this.file + suffix, { force: true });
    fs.copyFileSync(file, this.file);
    fs.chmodSync(this.file, 0o600);
    ({ db: this.db, orm: this.orm, migration: this.migration } = openDb(this.file));
  }
}
