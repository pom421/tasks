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

test('bouton Chrono : lance (icône pause pleine, toujours visible) puis met en pause', async ({ page, store, data }) => {
  await open(page);
  const une = row(page, 'Une');
  // Sans chrono : ni temps ni bouton visible hors survol.
  await expect(une.locator('.time-spent')).toHaveCount(0);
  await expect(une.getByRole('button', { name: 'Chrono', exact: true })).toBeHidden();

  await une.hover();
  const chrono = une.getByRole('button', { name: 'Chrono', exact: true });
  await expect(chrono).toHaveAttribute('aria-pressed', 'false');
  await expect(chrono).toHaveAttribute('title', 'Lancer le chrono (t)');
  await chrono.click();
  await expect(chrono).toHaveAttribute('aria-pressed', 'true');
  await expect(chrono).toHaveAttribute('title', 'Mettre le chrono en pause (t)');
  await expect(chrono.locator('svg')).toHaveAttribute('fill', 'currentColor');
  await expect(une.locator('.time-spent')).toHaveText('0 min');

  // En marche : visible même sans survol.
  await page.mouse.move(0, 0);
  await expect(chrono).toBeVisible();
  expect(store.db.prepare('SELECT timer_started_at FROM task WHERE id = ?').get(data.une.id)).not.toEqual({ timer_started_at: null });

  await chrono.click();
  await expect(chrono).toHaveAttribute('aria-pressed', 'false');
  expect(store.db.prepare('SELECT timer_started_at FROM task WHERE id = ?').get(data.une.id)).toEqual({ timer_started_at: null });
});

test('temps passé : en minutes, puis 2h34 ; chrono en marche compté', async ({ page, store, data }) => {
  store.updateTask(data.une.id, { timeSpent: 12 * 60 + 30 });
  store.updateTask(data.deux.id, { timeSpent: 2 * 3600 + 29 * 60, timerStartedAt: sqlTime(NOW - 5 * 60_000) });
  await open(page);
  await expect(row(page, 'Une').locator('.time-spent')).toHaveText('12 min');
  await expect(row(page, 'Deux').locator('.time-spent')).toHaveText('2h34');
  await expect(row(page, 'Deux').getByRole('button', { name: 'Chrono', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('clavier : t lance / met en pause, T T remet à zéro, Échap annule, u rétablit', async ({ page, store, data }) => {
  store.updateTask(data.une.id, { timeSpent: 12 * 60 });
  await open(page);
  const une = row(page, 'Une');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown'); // sur « Une »

  await page.keyboard.press('t');
  await expect(une.getByRole('button', { name: 'Chrono', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('t');
  await expect(une.getByRole('button', { name: 'Chrono', exact: true })).toHaveAttribute('aria-pressed', 'false');

  // 1er T : message, rien n'est effacé ; Échap annule.
  await page.keyboard.press('T');
  await expect(une.getByRole('alert')).toHaveText('T ou ↻ pour remettre à zéro · Échap pour annuler');
  await page.keyboard.press('Escape');
  await expect(une.getByRole('alert')).toHaveCount(0);
  await expect(une.locator('.time-spent')).toHaveText('12 min');

  await page.keyboard.press('T');
  await page.keyboard.press('T');
  await expect(une.locator('.time-spent')).toHaveCount(0);
  expect(store.db.prepare('SELECT time_spent, timer_started_at FROM task WHERE id = ?').get(data.une.id)).toEqual({
    time_spent: 0,
    timer_started_at: null,
  });

  await page.keyboard.press('u');
  await expect(une.locator('.time-spent')).toHaveText('12 min');
});

test('souris : ↻ puis ↻ à nouveau remet à zéro', async ({ page, store, data }) => {
  store.updateTask(data.une.id, { timeSpent: 12 * 60 });
  await open(page);
  const une = row(page, 'Une');
  await une.hover();
  await une.getByRole('button', { name: 'Remettre le chrono à zéro' }).click();
  await expect(une.getByRole('alert')).toBeVisible();
  await une.getByRole('button', { name: 'Confirmer la remise à zéro du chrono' }).click();
  await expect(une.locator('.time-spent')).toHaveCount(0);
});

test('un seul chrono à la fois ; cocher la tâche arrête son chrono', async ({ page, store, data }) => {
  await open(page);
  await row(page, 'Une').hover();
  await row(page, 'Une').getByRole('button', { name: 'Chrono', exact: true }).click();
  await expect(row(page, 'Une').getByRole('button', { name: 'Chrono', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await row(page, 'Deux').hover();
  await row(page, 'Deux').getByRole('button', { name: 'Chrono', exact: true }).click();
  await expect(row(page, 'Deux').getByRole('button', { name: 'Chrono', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(row(page, 'Une').getByRole('button', { name: 'Chrono', exact: true })).toHaveAttribute('aria-pressed', 'false');

  await row(page, 'Deux').getByRole('checkbox').click();
  await expect(page.locator('#projects li.task', { hasText: 'Deux' })).toHaveCount(0);
  expect(store.db.prepare('SELECT timer_started_at FROM task WHERE id = ?').get(data.deux.id)).toEqual({ timer_started_at: null });
});

test('fiche : temps passé et mêmes boutons, mêmes touches', async ({ page, store, data }) => {
  store.updateTask(data.une.id, { timeSpent: 12 * 60 });
  await open(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('o');
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.timer-line')).toContainText('Temps passé :12 min');

  const chrono = dialog.getByRole('button', { name: 'Chrono', exact: true });
  await chrono.click();
  await expect(chrono).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('t');
  await expect(chrono).toHaveAttribute('aria-pressed', 'false');

  // T : message ; Échap l'annule sans fermer la fiche ; T T remet à zéro.
  await page.keyboard.press('T');
  await expect(dialog.getByRole('alert')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('T');
  await page.keyboard.press('T');
  await expect(dialog.locator('.time-spent')).toHaveText('0 min');

  // Fermeture : la ligne est à jour.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(row(page, 'Une').locator('.time-spent')).toHaveCount(0);
});

test('non-régression : Log sans bouton de chrono, temps passé conservé', async ({ page, store, data }) => {
  store.updateTask(data.une.id, { timeSpent: 90 * 60 });
  store.updateTask(data.une.id, { doneAt: '2026-09-25' });
  await open(page);
  const logged = page.locator('.day li.task', { hasText: 'Une' });
  await expect(logged.locator('.time-spent')).toHaveText('1h30');
  await logged.hover();
  await expect(logged.getByRole('button', { name: 'Chrono', exact: true })).toHaveCount(0);
  // Tâche sans chrono : ligne inchangée.
  await expect(row(page, 'Deux').locator('.time-spent')).toHaveCount(0);
});
