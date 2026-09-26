import type { Page } from '@playwright/test';
import type { Store } from '../server/db.ts';
import { test as base, expect } from './fixtures.ts';

// Heure figée de la page (voir fixtures.ts), au format SQLite (UTC).
const NOW = new Date('2026-09-25T10:00:00').getTime();
const sqlTime = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

function seed(store: Store) {
  const alpha = store.createProject('Alpha');
  return { alpha, une: store.createTask(alpha.id, 'Une'), deux: store.createTask(alpha.id, 'Deux') };
}

const test = base.extend<{ data: ReturnType<typeof seed> }>({
  data: async ({ store }, use) => {
    const data = seed(store);
    await use(data);
  },
});

const row = (page: Page, title: string) => page.locator('li.task', { hasText: title });
const open = async (page: Page) => {
  await page.goto('/');
  await expect(page.locator('.project')).toHaveCount(1);
};

const toggle = (page: Page, title: string) => row(page, title).getByRole('button', { name: 'Chrono', exact: true });

test('bouton Chrono : lance (icône pause pleine, toujours visible) puis met en pause ; pas de temps sur la ligne', async ({ page, store, data }) => {
  await open(page);
  const une = row(page, 'Une');
  await expect(toggle(page, 'Une')).toBeHidden();

  await une.hover();
  const chrono = toggle(page, 'Une');
  await expect(chrono).toHaveAttribute('aria-pressed', 'false');
  await expect(chrono).toHaveAttribute('title', 'Lancer le chrono (c)');
  await chrono.click();
  await expect(chrono).toHaveAttribute('aria-pressed', 'true');
  await expect(chrono).toHaveAttribute('title', '0 min · Pause (c)');
  await expect(chrono.locator('svg')).toHaveAttribute('fill', 'currentColor');

  // En marche : visible même sans survol ; aucun texte ajouté à la ligne.
  await page.mouse.move(0, 0);
  await expect(chrono).toBeVisible();
  await expect(une).toHaveText('Une');
  expect(store.db.prepare('SELECT timer_started_at FROM task WHERE id = ?').get(data.une.id)).not.toEqual({ timer_started_at: null });

  await chrono.click();
  await expect(chrono).toHaveAttribute('aria-pressed', 'false');
  expect(store.db.prepare('SELECT timer_started_at FROM task WHERE id = ?').get(data.une.id)).toEqual({ timer_started_at: null });
});

test('temps passé en info-bulle : en minutes, puis 2h34 ; chrono en marche compté', async ({ page, store, data }) => {
  store.updateTask(data.une.id, { timeSpent: 12 * 60 + 30 });
  store.updateTask(data.deux.id, { timeSpent: 2 * 3600 + 29 * 60, timerStartedAt: sqlTime(NOW - 5 * 60_000) });
  await open(page);
  await row(page, 'Une').hover(); // arrêté : visible au survol seulement
  await expect(toggle(page, 'Une')).toHaveAttribute('title', '12 min · Lancer le chrono (c)');
  await expect(toggle(page, 'Deux')).toHaveAttribute('title', '2h34 · Pause (c)');
  await expect(toggle(page, 'Deux')).toHaveAttribute('aria-pressed', 'true');
});

test('clavier : c lance / met en pause, C remet à zéro sans message, u rétablit', async ({ page, store, data }) => {
  store.updateTask(data.une.id, { timeSpent: 12 * 60 });
  await open(page);
  const une = row(page, 'Une');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown'); // sur « Une »

  await page.keyboard.press('c');
  await expect(toggle(page, 'Une')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('c');
  await expect(toggle(page, 'Une')).toHaveAttribute('aria-pressed', 'false');

  await page.keyboard.press('C');
  await expect(toggle(page, 'Une')).toHaveAttribute('title', 'Lancer le chrono (c)');
  await expect(une.getByRole('alert')).toHaveCount(0);
  expect(store.db.prepare('SELECT time_spent, timer_started_at FROM task WHERE id = ?').get(data.une.id)).toEqual({
    time_spent: 0,
    timer_started_at: null,
  });

  await page.keyboard.press('u');
  await expect(toggle(page, 'Une')).toHaveAttribute('title', '12 min · Lancer le chrono (c)');
});

test('souris : ↻ remet à zéro ; absent sans temps passé', async ({ page, store, data }) => {
  store.updateTask(data.une.id, { timeSpent: 12 * 60 });
  await open(page);
  const une = row(page, 'Une');
  await une.hover();
  await une.getByRole('button', { name: 'Remettre le chrono à zéro' }).click();
  await expect(toggle(page, 'Une')).toHaveAttribute('title', 'Lancer le chrono (c)');
  await expect(une.getByRole('button', { name: 'Remettre le chrono à zéro' })).toHaveCount(0);
});

test('un seul chrono à la fois ; cocher la tâche arrête son chrono', async ({ page, store, data }) => {
  await open(page);
  await row(page, 'Une').hover();
  await toggle(page, 'Une').click();
  await expect(toggle(page, 'Une')).toHaveAttribute('aria-pressed', 'true');
  await row(page, 'Deux').hover();
  await toggle(page, 'Deux').click();
  await expect(toggle(page, 'Deux')).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle(page, 'Une')).toHaveAttribute('aria-pressed', 'false');

  await row(page, 'Deux').getByRole('checkbox').click();
  await expect(page.locator('#projects li.task', { hasText: 'Deux' })).toHaveCount(0);
  expect(store.db.prepare('SELECT timer_started_at FROM task WHERE id = ?').get(data.deux.id)).toEqual({ timer_started_at: null });
});

test('fiche : mêmes icônes, mêmes touches', async ({ page, store, data }) => {
  store.updateTask(data.une.id, { timeSpent: 12 * 60 });
  await open(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('o');
  const dialog = page.getByRole('dialog');
  const chrono = dialog.getByRole('button', { name: 'Chrono', exact: true });
  await expect(chrono).toHaveAttribute('title', '12 min · Lancer le chrono (c)');

  await chrono.click();
  await expect(chrono).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('c');
  await expect(chrono).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('C');
  await expect(chrono).toHaveAttribute('title', 'Lancer le chrono (c)');
  await expect(dialog.getByRole('button', { name: 'Remettre le chrono à zéro' })).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(toggle(page, 'Une')).toHaveAttribute('title', 'Lancer le chrono (c)');
});

test('non-régression : Log sans chrono ; ligne sans chrono inchangée', async ({ page, store, data }) => {
  store.updateTask(data.une.id, { timeSpent: 90 * 60 });
  store.updateTask(data.une.id, { doneAt: '2026-09-25' });
  await open(page);
  const logged = page.locator('.day li.task', { hasText: 'Une' });
  await logged.hover();
  await expect(logged.getByRole('button', { name: 'Chrono', exact: true })).toHaveCount(0);
  await expect(row(page, 'Deux')).toHaveText('Deux');
});
