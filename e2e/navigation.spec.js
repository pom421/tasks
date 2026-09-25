import { test as base, expect } from './fixtures.js';

// Deux projets : Alpha (Une, Deux) et Beta (Trois).
function seed(store) {
  const alpha = store.createProject('Alpha');
  const beta = store.createProject('Beta');
  const tasks = {
    une: store.createTask(alpha.id, 'Une'),
    deux: store.createTask(alpha.id, 'Deux'),
    trois: store.createTask(beta.id, 'Trois'),
  };
  return { alpha, beta, tasks };
}

// Clé de navigation de l'élément qui a le focus ("project:1", "task:2"…).
const current = (page) => page.evaluate(() => document.activeElement?.dataset.navKey ?? null);

async function pressDown(page, n) {
  for (let i = 0; i < n; i++) await page.keyboard.press('ArrowDown');
}

// `data` : jeu de données créé en base, page ouverte dessus.
const test = base.extend({
  data: async ({ page, store }, use) => {
    const data = seed(store);
    await page.goto('/');
    await expect(page.locator('.project')).toHaveCount(2);
    await use(data);
  },
});

test('↑/↓ parcourent projets, tâches et champs d’ajout ; Début/Fin', async ({ page, data }) => {
  const { alpha, beta, tasks } = data;
  const expected = [
    `project:${alpha.id}`, `task:${tasks.une.id}`, `task:${tasks.deux.id}`, `add:${alpha.id}`,
    `project:${beta.id}`, `task:${tasks.trois.id}`, `add:${beta.id}`, 'new-project',
  ];
  for (const key of expected) {
    await page.keyboard.press('ArrowDown');
    expect(await current(page)).toBe(key);
  }
  // Bas de liste : on reste sur le dernier élément.
  await page.keyboard.press('ArrowDown');
  expect(await current(page)).toBe('new-project');

  for (const key of expected.slice(0, -1).reverse()) {
    await page.keyboard.press('ArrowUp');
    expect(await current(page)).toBe(key);
  }

  // Début / Fin depuis un nom (dans un champ, ces touches déplacent le curseur).
  await page.keyboard.press('End');
  expect(await current(page)).toBe('new-project');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  expect(await current(page)).toBe(`task:${tasks.trois.id}`);
  await page.keyboard.press('Home');
  expect(await current(page)).toBe(`project:${alpha.id}`);
});

test('Entrée sur un projet : édition, Entrée enregistre et rend la navigation', async ({ page, store, data }) => {
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const input = page.locator('input.edit');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('Alpha');

  await page.keyboard.type('Alpha renommé');
  await page.keyboard.press('Enter');

  await expect(page.locator('.project-head .name').first()).toHaveText('Alpha renommé');
  expect(store.state().projects[0].name).toBe('Alpha renommé');
  expect(await current(page)).toBe(`project:${data.alpha.id}`);

  await page.keyboard.press('ArrowDown');
  expect(await current(page)).toBe(`task:${data.tasks.une.id}`);
});

test('Entrée sur une tâche puis Échap : annule, focus sur la tâche, navigation reprend', async ({ page, store, data }) => {
  await pressDown(page, 2);
  await page.keyboard.press('Enter');
  const input = page.locator('input.edit');
  await expect(input).toHaveValue('Une');

  // En édition, ↑/↓ ne quittent pas le champ.
  await page.keyboard.press('ArrowDown');
  await expect(input).toBeFocused();

  await page.keyboard.type('modifié');
  await page.keyboard.press('Escape');

  await expect(input).toHaveCount(0);
  expect(await current(page)).toBe(`task:${data.tasks.une.id}`);
  expect(store.state().projects[0].tasks[0].title).toBe('Une');

  await page.keyboard.press('ArrowDown');
  expect(await current(page)).toBe(`task:${data.tasks.deux.id}`);
});

test('Entrée sur une tâche : modification enregistrée', async ({ page, store, data }) => {
  await pressDown(page, 3);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Deux bis');
  await page.keyboard.press('Enter');
  await expect(page.locator('#projects .name', { hasText: 'Deux bis' })).toBeVisible();
  expect(store.state().projects[0].tasks[1].title).toBe('Deux bis');
  expect(await current(page)).toBe(`task:${data.tasks.deux.id}`);
});

test('Espace coche la tâche ; le focus reste à la même place', async ({ page, store, data }) => {
  await pressDown(page, 2);
  await page.keyboard.press(' ');
  await expect(page.locator('#journal .name', { hasText: 'Une' })).toBeVisible();
  expect(store.state().projects[0].tasks.map((t) => t.title)).toEqual(['Deux']);
  expect(await current(page)).toBe(`task:${data.tasks.deux.id}`);
});

test('Espace dans le journal décoche la tâche', async ({ page, store, data }) => {
  store.updateTask(data.tasks.trois.id, { doneAt: '2026-09-20' });
  await page.reload();
  await expect(page.locator('#journal .name', { hasText: 'Trois' })).toBeVisible();
  await page.keyboard.press('End');
  expect(await current(page)).toBe(`task:${data.tasks.trois.id}`);
  await page.keyboard.press(' ');
  await expect(page.locator('#projects .name', { hasText: 'Trois' })).toBeVisible();
  expect(store.state().projects[1].tasks[0].title).toBe('Trois');
});

test('champ d’ajout : on tape directement, Entrée ajoute, Échap vide', async ({ page, store, data }) => {
  await pressDown(page, 4);
  expect(await current(page)).toBe(`add:${data.alpha.id}`);
  await page.keyboard.type('Quatre');
  await page.keyboard.press('Enter');
  await expect(page.locator('#projects .name', { hasText: 'Quatre' })).toBeVisible();
  expect(await current(page)).toBe(`add:${data.alpha.id}`);
  await expect(page.locator(`[data-nav-key="add:${data.alpha.id}"]`)).toHaveValue('');
  expect(store.state().projects[0].tasks.map((t) => t.title)).toEqual(['Une', 'Deux', 'Quatre']);

  await page.keyboard.type('brouillon');
  await page.keyboard.press('Escape');
  await expect(page.locator(`[data-nav-key="add:${data.alpha.id}"]`)).toHaveValue('');
  await page.keyboard.press('ArrowDown');
  expect(await current(page)).toBe(`project:${data.beta.id}`);
});

test('Suppr supprime la tâche après confirmation', async ({ page, store, data }) => {
  page.on('dialog', (d) => d.accept());
  await pressDown(page, 2);
  await page.keyboard.press('Delete');
  await expect(page.locator('#projects .name', { hasText: /^Une$/ })).toHaveCount(0);
  expect(store.state().projects[0].tasks.map((t) => t.title)).toEqual(['Deux']);
  expect(await current(page)).toBe(`task:${data.tasks.deux.id}`);
});

test('nouveau projet : le focus va sur la saisie de sa première tâche', async ({ page, store, data: _ }) => {
  await page.keyboard.press('p');
  await page.keyboard.type('Gamma');
  await page.keyboard.press('Enter');
  await expect(page.locator('.project-head .name', { hasText: 'Gamma' })).toBeVisible();
  const gamma = store.state().projects.find((p) => p.name === 'Gamma');
  await expect(page.locator(`[data-nav-key="add:${gamma.id}"]`)).toBeFocused();

  await page.keyboard.type('Première tâche');
  await page.keyboard.press('Enter');
  await expect(page.locator(`#project-${gamma.id} .name`, { hasText: 'Première tâche' })).toBeVisible();
  expect(store.state().projects.find((p) => p.id === gamma.id).tasks.map((t) => t.title)).toEqual(['Première tâche']);
  await expect(page.locator(`[data-nav-key="add:${gamma.id}"]`)).toBeFocused();
});

test('j bascule l’icône Jira après le texte de la tâche', async ({ page, store, data }) => {
  const icon = page.locator(`li.task:has([data-nav-key="task:${data.tasks.une.id}"]) svg.jira`);
  await pressDown(page, 2);
  await page.keyboard.press('j');
  await expect(icon).toBeVisible();
  expect(store.state().projects[0].tasks[0].jira_at).toBeTruthy();
  // Le focus reste sur la tâche : on peut rebasculer aussitôt.
  expect(await current(page)).toBe(`task:${data.tasks.une.id}`);

  await page.keyboard.press('j');
  await expect(icon).toHaveCount(0);
  expect(store.state().projects[0].tasks[0].jira_at).toBeNull();
});

test('j en édition : saisi comme une lettre, pas de bascule', async ({ page, store, data }) => {
  await pressDown(page, 2);
  await page.keyboard.press('Enter');
  await page.keyboard.press('End');
  await page.keyboard.type(' jj');
  await page.keyboard.press('Enter');
  await expect(page.locator('#projects .name', { hasText: 'Une jj' })).toBeVisible();
  expect(store.state().projects[0].tasks[0].jira_at).toBeNull();
  expect(await current(page)).toBe(`task:${data.tasks.une.id}`);
});

test('icône Jira conservée dans le journal, et j y fonctionne aussi', async ({ page, store, data }) => {
  store.updateTask(data.tasks.trois.id, { jira: true });
  await page.reload();
  const row = page.locator(`li.task:has([data-nav-key="task:${data.tasks.trois.id}"])`);
  await expect(row.locator('svg.jira')).toBeVisible();
  await pressDown(page, 6);
  await page.keyboard.press(' ');
  await expect(page.locator(`#journal li.task:has([data-nav-key="task:${data.tasks.trois.id}"]) svg.jira`)).toBeVisible();

  // Focus resté à la même place (champ d'ajout de Beta) : descendre jusqu'au journal.
  await pressDown(page, 2);
  expect(await current(page)).toBe(`task:${data.tasks.trois.id}`);
  await page.keyboard.press('j');
  await expect(row.locator('svg.jira')).toHaveCount(0);
  expect(store.journal({ projectId: data.beta.id }).days[0].tasks[0].jira_at).toBeNull();
});
