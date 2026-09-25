import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/db.js';
import { createApp } from '../src/server.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-test-'));
const store = new Store(path.join(dir, 'tasks.db'));
let server;
let base;

before(async () => {
  server = http.createServer(createApp(store));
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});

after(() => {
  server.close();
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function call(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: body && typeof body !== 'string' && !(body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {},
    body: body && typeof body !== 'string' && !(body instanceof Uint8Array) ? JSON.stringify(body) : body,
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
  assert.deepEqual(state.projects[0].tasks.map((t) => t.title), ['Une bis', 'Deux']);

  await call('PATCH', `/api/tasks/${t1.id}`, { done: true, done_at: '2026-09-20' });
  await call('PATCH', `/api/tasks/${t2.id}`, { done: true, done_at: '2026-09-22' });

  ({ body: state } = await call('GET', '/api/state'));
  assert.equal(state.projects[0].tasks.length, 0);

  // Sans filtre : dernière journée seulement.
  let { body: j } = await call('GET', '/api/journal');
  assert.deepEqual(j.days.map((d) => d.date), ['2026-09-22']);

  // Par projet : toutes les dates, plus récente d'abord.
  ({ body: j } = await call('GET', `/api/journal?project=${p.id}`));
  assert.deepEqual(j.days.map((d) => d.date), ['2026-09-22', '2026-09-20']);

  ({ body: j } = await call('GET', '/api/journal?date=2026-09-20'));
  assert.equal(j.days[0].tasks[0].title, 'Une bis');

  // Décocher : retour dans le projet.
  await call('PATCH', `/api/tasks/${t1.id}`, { done: false });
  ({ body: state } = await call('GET', '/api/state'));
  assert.equal(state.projects[0].tasks[0].id, t1.id);
});

test('validations', async () => {
  assert.equal((await call('POST', '/api/projects', { name: '  ' })).status, 400);
  assert.equal((await call('POST', '/api/tasks', { project_id: 9999, title: 'x' })).status, 400);
  assert.equal((await call('PATCH', '/api/tasks/9999', { title: 'x' })).status, 404);
  assert.equal((await call('GET', '/api/journal?date=hier')).status, 400);
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

  assert.equal((await call('POST', '/api/import', 'pas une base')).status, 400);
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
  const { body: j } = await call('GET', '/api/journal?date=2026-09-24');
  assert.deepEqual(
    j.days[0].tasks.map((t) => [t.project_name, t.title]),
    [['Maison', 'Acheter peinture'], ['Sans projet', 'Tâche isolée']],
  );
});
