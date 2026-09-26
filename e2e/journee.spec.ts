import type { Page } from '@playwright/test';
import type { Store } from '../server/db.ts';
import { test as base, expect } from './fixtures.ts';

// Jour figé de la page (voir fixtures.ts).
const TODAY = '2026-09-25';

function seed(store: Store) {
  const alpha = store.createProject('Alpha');
  const beta = store.createProject('Beta');
  return {
    alpha,
    beta,
    une: store.createTask(alpha.id, 'Une'),
    deux: store.createTask(alpha.id, 'Deux'),
    trois: store.createTask(beta.id, 'Trois'),
  };
}

const test = base.extend<{ data: ReturnType<typeof seed> }>({
  data: async ({ store }, use) => use(seed(store)),
});

const row = (page: Page, title: string) => page.locator('li.task', { hasText: title });
const tab = (page: Page, name: string) => page.getByRole('tab', { name });
const open = async (page: Page, path = '/') => {
  await page.goto(path);
  await expect(page.getByRole('tablist')).toBeVisible();
};

test('☀ au survol : ajoute à ma journée (soleil plein, toujours visible), puis retire', async ({ page, store, data }) => {
  await open(page);
  const une = row(page, 'Une');
  await expect(une.getByRole('button', { name: 'Ma journée' })).toBeHidden();
  await une.hover();
  const sun = une.getByRole('button', { name: 'Ma journée' });
  await expect(sun).toHaveAttribute('aria-pressed', 'false');
  await expect(sun).toHaveAttribute('title', 'Ajouter à ma journée (s)');
  await sun.click();
  await expect(sun).toHaveAttribute('aria-pressed', 'true');
  await expect(sun.locator('svg')).toHaveAttribute('fill', 'currentColor');
  await page.mouse.move(0, 0);
  await expect(sun).toBeVisible();
  expect(store.db.prepare('SELECT day_at FROM task WHERE id = ?').get(data.une.id)).toEqual({ day_at: TODAY });

  await sun.click();
  await expect(sun).toHaveAttribute('aria-pressed', 'false');
});

test('onglet Ma journée : seulement les tâches choisies, par projet ; compteur 3/5 tâches', async ({ page, store, data }) => {
  store.updateTask(data.une.id, { dayAt: TODAY });
  store.updateTask(data.trois.id, { dayAt: TODAY });
  store.updateTask(data.deux.id, { dayAt: '2026-09-24' }); // choisie hier : plus dans ma journée
  await open(page);
  await expect(tab(page, 'Projets')).toHaveAttribute('aria-selected', 'true');
  await tab(page, 'Ma journée').click();
  await expect(tab(page, 'Ma journée')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/jour$/);

  const day = page.locator('#day');
  await expect(day.locator('.project-label')).toHaveText(['Alpha', 'Beta']);
  await expect(day.locator('li.task .name')).toHaveText(['Une', 'Trois']);
  await expect(day.locator('.day-count')).toHaveText('2/5 tâches');
  await expect(day.locator('.day-count')).not.toHaveClass(/text-destructive/);
  // Filtres de la zone des projets : sans effet ici, masqués.
  await expect(page.locator('#projects')).toHaveCount(0);

  // Cochée : part dans le Log, reste comptée.
  await row(page, 'Une').getByRole('checkbox').click();
  await expect(day.locator('li.task .name')).toHaveText(['Trois']);
  await expect(day.locator('.day-count')).toHaveText('2/5 tâches, dont 1 faite');
  await expect(page.locator('#journal li.task', { hasText: 'Une' })).toBeVisible();

  // Rechargement : l'onglet est dans l'adresse.
  await page.reload();
  await expect(tab(page, 'Ma journée')).toHaveAttribute('aria-selected', 'true');
});

test('au-delà du maximum : 6/5 tâches en rouge ; maximum réglable', async ({ page, store, data }) => {
  const extra = ['Quatre', 'Cinq', 'Six'].map((t) => store.createTask(data.beta.id, t));
  for (const t of [data.une, data.deux, data.trois, ...extra]) store.updateTask(t.id, { dayAt: TODAY });
  await open(page, '/jour');
  const count = page.locator('#day .day-count');
  await expect(count).toHaveText('6/5 tâches : au-delà du maximum');
  await expect(count).toHaveClass(/text-destructive/);

  store.updateSettings({ day_capacity: 6 });
  await page.reload();
  await expect(count).toHaveText('6/6 tâches');
  await expect(count).not.toHaveClass(/text-destructive/);
});

test('clavier : s ajoute / retire, v change d’onglet, u annule', async ({ page, store, data }) => {
  await open(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown'); // sur « Une »
  await page.keyboard.press('s');
  await expect(row(page, 'Une').getByRole('button', { name: 'Ma journée' })).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('v');
  await expect(tab(page, 'Ma journée')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#day li.task .name')).toHaveText(['Une']);

  // Retirée depuis l'onglet : elle disparaît ; u la remet.
  await page.locator('#day li.task .name').first().focus();
  await page.keyboard.press('s');
  await expect(page.locator('#day li.task')).toHaveCount(0);
  await expect(page.locator('#day .empty')).toHaveText('Aucune tâche pour aujourd’hui : s sur une tâche (ou ☀ au survol) pour l’ajouter.');
  await expect(page.locator('#day .day-count')).toHaveText('0/5 tâche');
  await page.keyboard.press('u');
  await expect(page.locator('#day li.task .name')).toHaveText(['Une']);

  await page.keyboard.press('v');
  await expect(tab(page, 'Projets')).toHaveAttribute('aria-selected', 'true');
  expect(store.db.prepare('SELECT day_at FROM task WHERE id = ?').get(data.une.id)).toEqual({ day_at: TODAY });
});

test('toutes faites : message exact', async ({ page, store, data }) => {
  store.updateTask(data.une.id, { dayAt: TODAY, doneAt: TODAY });
  await open(page, '/jour');
  await expect(page.locator('#day .empty')).toHaveText('Toutes les tâches de la journée sont faites.');
  await expect(page.locator('#day .day-count')).toHaveText('1/5 tâche, dont 1 faite');
});

test('Réglages : maximum de tâches par jour', async ({ page, store }) => {
  await page.goto('/admin');
  const field = page.getByLabel('Nombre de tâches maximum par jour');
  await expect(field).toHaveValue('5');
  await field.fill('8');
  await field.press('Enter');
  await expect(page.getByText('Réglages enregistrés.')).toBeVisible();
  expect(store.settings().day_capacity).toBe(8);
  await field.fill('0');
  await field.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('Maximum invalide : nombre de 1 à 50 attendu');
});

test('non-régression : Log sans ☀, filtres des projets inchangés dans l’onglet Projets', async ({ page, store, data }) => {
  store.updateProject(data.alpha.id, { favorite: true });
  store.updateTask(data.deux.id, { doneAt: TODAY });
  await open(page);
  await expect(page.locator('#favorites-only')).toBeVisible();
  const logged = page.locator('#journal li.task', { hasText: 'Deux' });
  await logged.hover();
  await expect(logged.getByRole('button', { name: 'Ma journée' })).toHaveCount(0);
  await page.keyboard.press('v');
  await expect(page.locator('#favorites-only')).toHaveCount(0);
  await page.keyboard.press('v');
  await expect(page.locator('#favorites-only')).toBeVisible();
});
