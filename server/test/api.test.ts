import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../db.ts';
import { createApp } from '../app.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-test-'));
const store = new Store(path.join(dir, 'tasks.db'));
// Faux front compilé, pour tester le service des fichiers statiques.
const staticDir = path.join(dir, 'dist');
fs.mkdirSync(staticDir);
fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>Tâches</title>');
let server: http.Server;
let base: string;

before(async () => {
  server = http.createServer(createApp(store, { staticDir }));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});

after(() => {
  server.close();
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function contentType(body: unknown) {
  if (body instanceof Uint8Array) return 'application/octet-stream';
  if (typeof body === 'string') return 'text/markdown';
  return 'application/json';
}

// body: any : réponses JSON lues librement dans les assertions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  const json = body !== undefined && contentType(body) === 'application/json';
  const res = await fetch(base + url, {
    method,
    headers: body === undefined ? headers : { 'Content-Type': contentType(body), ...headers },
    body: json ? JSON.stringify(body) : (body as BodyInit | undefined),
  });
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
}

test('projets et tâches : création, édition, complétion, journal', async () => {
  const { body: p } = await call('POST', '/api/projects', { name: 'Alpha' });
  const { body: t1 } = await call('POST', '/api/tasks', { project_id: p.id, title: 'Une' });
  const { body: t2 } = await call('POST', '/api/tasks', { project_id: p.id, title: 'Deux' });

  await call('PATCH', `/api/projects/${p.id}`, { name: 'Alpha bis' });
  await call('PATCH', `/api/tasks/${t1.id}`, { title: 'Une bis' });

  let { body: state } = await call('GET', '/api/state');
  assert.equal(state.projects[0].name, 'Alpha bis');
  assert.deepEqual(state.projects[0].tasks.map((t: any) => t.title), ['Une bis', 'Deux']);

  await call('PATCH', `/api/tasks/${t1.id}`, { done: true, done_at: '2026-09-20' });
  await call('PATCH', `/api/tasks/${t2.id}`, { done: true, done_at: '2026-09-22' });

  ({ body: state } = await call('GET', '/api/state'));
  assert.equal(state.projects[0].tasks.length, 0);

  // Sans filtre : dernière journée seulement.
  let { body: j } = await call('GET', '/api/journal');
  assert.deepEqual(j.days.map((d: any) => d.date), ['2026-09-22']);

  // Par projet : toutes les dates, plus récente d'abord.
  ({ body: j } = await call('GET', `/api/journal?project=${p.id}`));
  assert.deepEqual(j.days.map((d: any) => d.date), ['2026-09-22', '2026-09-20']);

  // Même date de début et de fin : toute la journée.
  ({ body: j } = await call('GET', '/api/journal?from=2026-09-20&to=2026-09-20'));
  assert.deepEqual(j.days.map((d: any) => d.date), ['2026-09-20']);
  assert.equal(j.days[0].tasks[0].title, 'Une bis');

  // Période : bornes incluses.
  ({ body: j } = await call('GET', '/api/journal?from=2026-09-20&to=2026-09-22'));
  assert.deepEqual(j.days.map((d: any) => d.date), ['2026-09-22', '2026-09-20']);
  ({ body: j } = await call('GET', '/api/journal?from=2026-09-21&to=2026-09-21'));
  assert.deepEqual(j.days, []);
  ({ body: j } = await call('GET', '/api/journal?from=2026-09-21'));
  assert.deepEqual(j.days.map((d: any) => d.date), ['2026-09-22']);

  // Décocher : retour dans le projet.
  await call('PATCH', `/api/tasks/${t1.id}`, { done: false });
  ({ body: state } = await call('GET', '/api/state'));
  assert.equal(state.projects[0].tasks[0].id, t1.id);
});

test('validations', async () => {
  assert.equal((await call('POST', '/api/projects', { name: '  ' })).status, 400);
  assert.equal((await call('POST', '/api/tasks', { project_id: 9999, title: 'x' })).status, 400);
  assert.equal((await call('PATCH', '/api/tasks/9999', { title: 'x' })).status, 404);
  assert.equal((await call('GET', '/api/journal?from=hier')).status, 400);
  assert.equal((await call('GET', '/api/journal?from=2026-09-22&to=2026-09-20')).status, 400);
});

test('archivage et suppression en cascade', async () => {
  const { body: p } = await call('POST', '/api/projects', { name: 'Éphémère' });
  const { body: t } = await call('POST', '/api/tasks', { project_id: p.id, title: 'x' });
  const { body: archived } = await call('PATCH', `/api/projects/${p.id}`, { archived: true });
  assert.ok(archived.archived_at);
  await call('DELETE', `/api/projects/${p.id}`);
  assert.equal((await call('PATCH', `/api/tasks/${t.id}`, { title: 'y' })).status, 404);
});

test('export puis import restaure la base', async () => {
  const before = (await call('GET', '/api/state')).body;
  const { status, body: file } = await call('GET', '/api/export');
  assert.equal(status, 200);
  assert.equal(file.subarray(0, 15).toString(), 'SQLite format 3');

  await call('POST', '/api/projects', { name: 'Ajout après export' });
  assert.equal((await call('POST', '/api/import', new Uint8Array(file))).status, 200);
  assert.deepEqual((await call('GET', '/api/state')).body, before);

  const garbage = new TextEncoder().encode('pas une base');
  assert.equal((await call('POST', '/api/import', garbage)).status, 400);
  assert.deepEqual((await call('GET', '/api/state')).body, before);
});

test('import markdown', async () => {
  const md = [
    '- Maison',
    '  - Peindre',
    '  - [ ] Ranger',
    '- Vide',
    '',
    '## 24/09/2026',
    '- Maison',
    '  - [x] Acheter peinture',
    '- Tâche isolée',
  ].join('\n');
  const { body } = await call('POST', '/api/import-markdown', md);
  assert.deepEqual(body, { projects: 3, tasks: 4 });
  const { body: j } = await call('GET', '/api/journal?from=2026-09-24&to=2026-09-24');
  assert.deepEqual(
    j.days[0].tasks.map((t: any) => [t.project_name, t.title]),
    [['Maison', 'Acheter peinture'], ['Sans projet', 'Tâche isolée']],
  );
});

test('sécurité : en-têtes, CSRF, DNS rebinding, Content-Type', async () => {
  const res = await fetch(`${base}/`);
  assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');

  // Formulaire HTML d'un autre site : Content-Type simple -> refusé.
  const form = await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ name: 'pirate' }),
  });
  assert.equal(form.status, 415);

  assert.equal((await call('POST', '/api/projects', { name: 'x' }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('POST', '/api/projects', { name: 'x' }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await call('POST', '/api/projects', { name: 'x' }, { Origin: 'null' })).status, 403);

  // Host forgé (DNS rebinding) : refusé, même en lecture.
  const rebinding = await new Promise((resolve) => {
    http.get(`${base}/api/export`, { headers: { Host: 'evil.example' } }, (r) => resolve(r.statusCode));
  });
  assert.equal(rebinding, 421);

  assert.equal((await fetch(`${base}/%E0%A4%A`)).status, 400);
  // Traversée de répertoire : jamais de fichier hors dist/ (repli SPA sur index.html).
  const traversal = await fetch(`${base}/../package.json`);
  assert.match(await traversal.text(), /<title>Tâches<\/title>/);
});

test('import refuse une base contenant un trigger', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const file = path.join(dir, 'evil.sqlite');
  const evil = new DatabaseSync(file);
  evil.exec(`CREATE TABLE project (id INTEGER PRIMARY KEY, name TEXT);
             CREATE TABLE task (id INTEGER PRIMARY KEY, project_id INT, title TEXT);
             CREATE TRIGGER t AFTER INSERT ON task BEGIN DELETE FROM project; END;`);
  evil.close();
  const res = await call('POST', '/api/import', new Uint8Array(fs.readFileSync(file)));
  assert.equal(res.status, 400);
  assert.match(res.body.error, /trigger/);
});

test('report Jira : bascule, visible dans les projets et le journal', async () => {
  const { body: p } = await call('POST', '/api/projects', { name: 'Jira' });
  const { body: t } = await call('POST', '/api/tasks', { project_id: p.id, title: 'Ticket' });
  assert.equal(t.jira_at, null);

  const { body: on } = await call('PATCH', `/api/tasks/${t.id}`, { jira: 'done' });
  assert.ok(on.jira_at);
  let { body: state } = await call('GET', '/api/state');
  assert.ok(state.projects.find((x: any) => x.id === p.id).tasks[0].jira_at);

  await call('PATCH', `/api/tasks/${t.id}`, { done: true, done_at: '2026-09-01' });
  const { body: j } = await call('GET', `/api/journal?project=${p.id}`);
  assert.ok(j.days[0].tasks[0].jira_at);

  const { body: off } = await call('PATCH', `/api/tasks/${t.id}`, { jira: 'none' });
  assert.equal(off.jira_at, null);
});

test('migration : une base v1 (sans jira_at) est mise à niveau à l’ouverture', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const file = path.join(dir, 'v1.sqlite');
  const v1 = new DatabaseSync(file);
  v1.exec(`CREATE TABLE project (id INTEGER PRIMARY KEY, name TEXT NOT NULL,
             created_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT);
           CREATE TABLE task (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
             title TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), done_at TEXT);
           INSERT INTO project (name) VALUES ('Ancien');
           INSERT INTO task (project_id, title) VALUES (1, 'Tâche v1');
           PRAGMA user_version = 1;`);
  v1.close();
  const old = new Store(file);
  assert.deepEqual(old.state().projects[0].tasks[0], { id: 1, project_id: 1, title: 'Tâche v1', jira_wanted_at: null, jira_at: null, jira_key: null, jira_url: null, notes: null });
  assert.ok(old.updateTask(1, { jira: 'done' })?.jira_at);
  old.close();
});

test('déplacement : dans le projet, vers un autre projet (même vide), validations', async () => {
  const { body: a } = await call('POST', '/api/projects', { name: 'Ordre A' });
  const { body: b } = await call('POST', '/api/projects', { name: 'Ordre B' });
  const ids: Record<string, number> = {};
  for (const title of ['un', 'deux', 'trois']) ids[title] = (await call('POST', '/api/tasks', { project_id: a.id, title })).body.id;
  const titles = async (projectId: number) =>
    (await call('GET', '/api/state')).body.projects.find((p: any) => p.id === projectId).tasks.map((t: any) => t.title);

  // Monter « trois » d'un cran, puis en tête.
  assert.equal((await call('POST', `/api/tasks/${ids.trois}/move`, { project_id: a.id, index: 1 })).status, 200);
  assert.deepEqual(await titles(a.id), ['un', 'trois', 'deux']);
  await call('POST', `/api/tasks/${ids.trois}/move`, { project_id: a.id, index: 0 });
  assert.deepEqual(await titles(a.id), ['trois', 'un', 'deux']);

  // Vers le projet B, vide ; puis index trop grand = en fin.
  await call('POST', `/api/tasks/${ids.un}/move`, { project_id: b.id, index: 0 });
  await call('POST', `/api/tasks/${ids.deux}/move`, { project_id: b.id, index: 99 });
  assert.deepEqual(await titles(a.id), ['trois']);
  assert.deepEqual(await titles(b.id), ['un', 'deux']);

  // Une nouvelle tâche arrive en fin de liste.
  await call('POST', '/api/tasks', { project_id: b.id, title: 'quatre' });
  assert.deepEqual(await titles(b.id), ['un', 'deux', 'quatre']);

  assert.equal((await call('POST', `/api/tasks/${ids.un}/move`, { project_id: 9999, index: 0 })).status, 400);
  assert.equal((await call('POST', `/api/tasks/${ids.un}/move`, { project_id: b.id, index: -1 })).status, 400);
  assert.equal((await call('POST', '/api/tasks/9999/move', { project_id: b.id, index: 0 })).status, 404);
  // Une tâche faite ne se déplace pas.
  await call('PATCH', `/api/tasks/${ids.un}`, { done: true, done_at: '2026-09-01' });
  assert.equal((await call('POST', `/api/tasks/${ids.un}/move`, { project_id: a.id, index: 0 })).status, 404);
});

test('Jira : à reporter puis reportée, lien, compteur et filtre du journal', async () => {
  const { body: p } = await call('POST', '/api/projects', { name: 'Suivi Jira' });
  const { body: t } = await call('POST', '/api/tasks', { project_id: p.id, title: 'À reporter' });
  const pending = async () => (await call('GET', '/api/state')).body.jiraPending;
  const before = await pending();

  const { body: wanted } = await call('PATCH', `/api/tasks/${t.id}`, { jira: 'wanted' });
  assert.ok(wanted.jira_wanted_at);
  assert.equal(wanted.jira_at, null);
  assert.equal(await pending(), before + 1);

  // Faite mais pas reportée : visible dans le journal filtré, quelle que soit la date.
  await call('PATCH', `/api/tasks/${t.id}`, { done: true, done_at: '2020-01-01' });
  const { body: j } = await call('GET', '/api/journal?jira=pending');
  assert.ok(j.days.some((d: any) => d.tasks.some((x: any) => x.id === t.id)));

  const { body: done } = await call('PATCH', `/api/tasks/${t.id}`, {
    jira: 'done',
    jira_ticket: 'https://exemple.atlassian.net/browse/PROJ-123',
  });
  assert.ok(done.jira_at);
  assert.equal(done.jira_wanted_at, wanted.jira_wanted_at); // date de demande conservée
  assert.equal(done.jira_url, 'https://exemple.atlassian.net/browse/PROJ-123');
  assert.equal(await pending(), before);
  const { body: j2 } = await call('GET', '/api/journal?jira=pending');
  assert.ok(!j2.days.some((d: any) => d.tasks.some((x: any) => x.id === t.id)));

  // Liens refusés : autre protocole (XSS via javascript:), texte libre.
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'pas un ticket', 42]) {
    assert.equal((await call('PATCH', `/api/tasks/${t.id}`, { jira_ticket: bad })).status, 400, String(bad));
  }
  assert.equal((await call('PATCH', `/api/tasks/${t.id}`, { jira: 'oui' })).status, 400);

  // Lien vidé ; retour à « rien » efface tout.
  assert.equal((await call('PATCH', `/api/tasks/${t.id}`, { jira_ticket: '' })).body.jira_url, null);
  await call('PATCH', `/api/tasks/${t.id}`, { jira_ticket: 'proj-9' });
  const { body: none } = await call('PATCH', `/api/tasks/${t.id}`, { jira: 'none' });
  assert.deepEqual([none.jira_wanted_at, none.jira_at, none.jira_key, none.jira_url], [null, null, null, null]);
});

test('migration 4 : une tâche déjà « reportée » (v3) garde son état', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const file = path.join(dir, 'v3.sqlite');
  const v3 = new DatabaseSync(file);
  v3.exec(`CREATE TABLE project (id INTEGER PRIMARY KEY, name TEXT NOT NULL,
             created_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT);
           CREATE TABLE task (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
             title TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), done_at TEXT,
             jira_at TEXT, position INTEGER NOT NULL DEFAULT 0);
           INSERT INTO project (name) VALUES ('P');
           INSERT INTO task (project_id, title, jira_at) VALUES (1, 'Reportée', '2026-09-01 10:00:00');
           PRAGMA user_version = 3;`);
  v3.close();
  const store3 = new Store(file);
  const task = store3.state().projects[0].tasks[0];
  assert.equal(task.jira_at, '2026-09-01 10:00:00');
  assert.equal(task.jira_wanted_at, '2026-09-01 10:00:00');
  store3.close();
});

test('réglages : URL Jira d’entreprise conservée en base, validée', async () => {
  assert.deepEqual((await call('GET', '/api/settings')).body, { jira_base_url: null });
  const { body } = await call('PUT', '/api/settings', { jira_base_url: 'https://entreprise.atlassian.net/' });
  assert.equal(body.jira_base_url, 'https://entreprise.atlassian.net'); // sans « / » final
  assert.equal((await call('GET', '/api/state')).body.settings.jira_base_url, 'https://entreprise.atlassian.net');
  assert.equal((await call('PUT', '/api/settings', { jira_base_url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await call('PUT', '/api/settings', { jira_base_url: '' })).body.jira_base_url, null);
  // Formulaire d'un autre site : refusé comme le reste de l'API.
  assert.equal((await call('PUT', '/api/settings', { jira_base_url: 'https://x.io' }, { Origin: 'https://evil.example' })).status, 403);
});

test('détails de la tâche : notes (Markdown), ticket par sa clé', async () => {
  const { body: p } = await call('POST', '/api/projects', { name: 'Détails' });
  const { body: t } = await call('POST', '/api/tasks', { project_id: p.id, title: 'Avec détails' });

  const { body: d } = await call('PATCH', `/api/tasks/${t.id}`, {
    notes: '  Contexte : voir [la spec](https://docs.exemple.fr/specs).  ',
    jira_ticket: 'abc-42',
  });
  assert.equal(d.notes, 'Contexte : voir [la spec](https://docs.exemple.fr/specs).');
  assert.equal(d.jira_key, 'ABC-42'); // clé normalisée en majuscules
  assert.equal(d.jira_url, null);
  assert.ok(d.jira_at); // un ticket renseigné vaut « reportée »

  assert.equal((await call('PATCH', `/api/tasks/${t.id}`, { notes: 'x'.repeat(20_001) })).status, 400);
  const { body: cleared } = await call('PATCH', `/api/tasks/${t.id}`, { notes: '' });
  assert.equal(cleared.notes, null);
});

test('migration 6 : le lien d’une tâche (v5) rejoint ses notes', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const file = path.join(dir, 'v5.sqlite');
  const v5 = new DatabaseSync(file);
  v5.exec(`CREATE TABLE project (id INTEGER PRIMARY KEY, name TEXT NOT NULL,
             created_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT);
           CREATE TABLE task (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
             title TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), done_at TEXT, jira_at TEXT,
             position INTEGER NOT NULL DEFAULT 0, jira_wanted_at TEXT, jira_url TEXT, notes TEXT, link TEXT, jira_key TEXT);
           CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT);
           INSERT INTO project (name) VALUES ('P');
           INSERT INTO task (project_id, title, notes, link) VALUES (1, 'Les deux', 'Mes notes', 'https://a.fr');
           INSERT INTO task (project_id, title, link) VALUES (1, 'Lien seul', 'https://b.fr');
           PRAGMA user_version = 5;`);
  v5.close();
  const store5 = new Store(file);
  assert.deepEqual(
    store5.state().projects[0].tasks.map((t) => t.notes),
    ['Mes notes\n\nhttps://a.fr', 'https://b.fr'],
  );
  store5.close();
});

test('suppression annulable : DELETE renvoie la tâche, restore la réinsère à l’identique', async () => {
  const { body: p } = await call('POST', '/api/projects', { name: 'Annulation' });
  const { body: t } = await call('POST', '/api/tasks', { project_id: p.id, title: 'À restaurer' });
  await call('PATCH', `/api/tasks/${t.id}`, { notes: 'Mes notes', jira_ticket: 'ABC-1', done: true, done_at: '2026-09-01' });

  const { status, body: deleted } = await call('DELETE', `/api/tasks/${t.id}`);
  assert.equal(status, 200);
  assert.equal(deleted.notes, 'Mes notes');

  const { status: restored, body: back } = await call('POST', '/api/tasks/restore', deleted);
  assert.equal(restored, 201);
  assert.deepEqual(back, deleted); // même id, mêmes colonnes

  // Déjà présente : refus ; données invalides : refus.
  assert.equal((await call('POST', '/api/tasks/restore', deleted)).status, 409);
  await call('DELETE', `/api/tasks/${t.id}`);
  for (const bad of [
    { ...deleted, jira_url: 'javascript:alert(1)' },
    { ...deleted, jira_key: 'pas une clé' },
    { ...deleted, done_at: 'hier' },
    { ...deleted, title: '' },
    { ...deleted, id: -1 },
  ]) {
    assert.equal((await call('POST', '/api/tasks/restore', bad)).status, 400, JSON.stringify(bad).slice(0, 80));
  }
  assert.equal((await call('POST', '/api/tasks/restore', { ...deleted, project_id: 99999 })).status, 400);
});

test('journal : liste des jours ayant des entrées, filtrée par projet', async () => {
  const { body: a } = await call('POST', '/api/projects', { name: 'Jours A' });
  const { body: b } = await call('POST', '/api/projects', { name: 'Jours B' });
  for (const [p, d] of [[a.id, '2019-03-01'], [a.id, '2019-03-03'], [b.id, '2019-03-02']]) {
    const { body: t } = await call('POST', '/api/tasks', { project_id: p, title: `t ${d}` });
    await call('PATCH', `/api/tasks/${t.id}`, { done: true, done_at: d });
  }
  const { body: all } = await call('GET', '/api/journal?from=2019-03-01&to=2019-03-01');
  assert.ok(['2019-03-01', '2019-03-02', '2019-03-03'].every((d) => all.dates.includes(d)));
  const { body: onlyA } = await call('GET', `/api/journal?project=${a.id}`);
  assert.deepEqual(onlyA.dates, ['2019-03-01', '2019-03-03']);
});

test('versions du schéma : base neuve suivie dans schema_migration', async () => {
  const { MIGRATIONS, LATEST_VERSION } = await import('../migrations.ts');
  const fresh = new Store(path.join(dir, 'neuve.sqlite'));
  const rows = fresh.db.prepare('SELECT version, name, applied_at FROM schema_migration ORDER BY version').all() as {
    version: number;
    name: string;
    applied_at: string | null;
  }[];
  assert.deepEqual(rows.map((r) => r.version), MIGRATIONS.map((m) => m.version));
  assert.ok(rows.every((r) => r.applied_at));
  assert.equal(fresh.migration.from, 0);
  assert.equal(fresh.migration.backup, null); // rien à sauvegarder
  assert.equal((fresh.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, LATEST_VERSION);
  fresh.close();
});

test('versions du schéma : base v2 → dernière version (3, 4, 5, 6…), sauvegarde avant', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { LATEST_VERSION } = await import('../migrations.ts');
  const file = path.join(dir, 'v2.sqlite');
  const v2 = new DatabaseSync(file);
  v2.exec(`CREATE TABLE project (id INTEGER PRIMARY KEY, name TEXT NOT NULL,
             created_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT);
           CREATE TABLE task (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
             title TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), done_at TEXT, jira_at TEXT);
           INSERT INTO project (name) VALUES ('Ancien');
           INSERT INTO task (project_id, title, jira_at) VALUES (1, 'Reportée en v2', '2026-01-01 09:00:00');
           PRAGMA user_version = 2;`);
  v2.close();

  const store2 = new Store(file);
  const m = store2.migration;
  assert.equal(m.from, 2);
  assert.deepEqual(m.applied.map((x) => x.version), Array.from({ length: LATEST_VERSION - 2 }, (_, i) => i + 3));
  // Suivi : versions 1-2 connues (date inconnue), les suivantes datées.
  const rows = store2.db.prepare('SELECT version, applied_at FROM schema_migration ORDER BY version').all() as {
    version: number;
    applied_at: string | null;
  }[];
  assert.deepEqual(rows.filter((r) => !r.applied_at).map((r) => r.version), [1, 2]);
  // Données conservées et transformées par les migrations.
  assert.deepEqual(store2.state().projects[0].tasks[0], {
    id: 1, project_id: 1, title: 'Reportée en v2', jira_wanted_at: '2026-01-01 09:00:00',
    jira_at: '2026-01-01 09:00:00', jira_key: null, jira_url: null, notes: null,
  });
  store2.close();

  // La sauvegarde est la base v2 intacte.
  assert.equal(m.backup, `${file}.v2.bak`);
  const bak = new DatabaseSync(m.backup!, { readOnly: true });
  assert.equal((bak.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 2);
  bak.close();

  // Réouverture : plus rien à appliquer.
  const again = new Store(file);
  assert.deepEqual(again.migration.applied, []);
  again.close();
});

test('versions du schéma : base plus récente que l’outil refusée', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const file = path.join(dir, 'future.sqlite');
  const future = new DatabaseSync(file);
  future.exec('PRAGMA user_version = 999');
  future.close();
  assert.throws(() => new Store(file), /plus récente que l'outil/);
});
