import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.ts';

const row = (page: Page, title: string) => page.locator('#projects li.task', { hasText: title });

test('clavier : 1 / 2 / 3 donnent la priorité, la même touche la retire, u annule', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  store.createTask(alpha.id, 'Deux');
  await page.goto('/');
  await expect(page.locator('.project')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown'); // sur « Une »

  const badge = row(page, 'Une').locator('.priority');
  await expect(badge).toHaveCount(0);
  await page.keyboard.press('1');
  await expect(badge).toHaveText('Priorité P1');
  await expect(badge).toHaveClass(/text-red-600/);
  await page.keyboard.press('2');
  await expect(badge).toHaveText('Priorité P2');
  await expect(badge).toHaveClass(/text-amber-600/);
  await page.keyboard.press('3');
  await expect(badge).toHaveClass(/text-sky-600/);
  // Même touche : retirée ; u : rétablie.
  await page.keyboard.press('3');
  await expect(badge).toHaveCount(0);
  await page.keyboard.press('u');
  await expect(badge).toHaveText('Priorité P3');
  expect(store.db.prepare('SELECT priority FROM task WHERE id = ?').get(une.id)).toEqual({ priority: 3 });

  // Badge devant le titre ; l'autre tâche n'a rien.
  const title = await row(page, 'Une').locator('.name').boundingBox();
  expect((await badge.boundingBox())!.x).toBeLessThan(title!.x);
  await expect(row(page, 'Deux').locator('.priority')).toHaveCount(0);
});

test('fiche : boutons P1 P2 P3 (bascule) et mêmes touches', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  store.updateTask(une.id, { priority: 2 });
  await page.goto('/');
  await expect(page.locator('.project')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('o');
  const dialog = page.getByRole('dialog');
  const p1 = dialog.getByRole('button', { name: 'P1', exact: true });
  const p2 = dialog.getByRole('button', { name: 'P2', exact: true });
  await expect(p2).toHaveAttribute('aria-pressed', 'true');
  await expect(p1).toHaveAttribute('aria-pressed', 'false');

  await p1.click();
  await expect(p1).toHaveAttribute('aria-pressed', 'true');
  await expect(p2).toHaveAttribute('aria-pressed', 'false');
  await p1.click(); // bascule : retirée
  await expect(p1).toHaveAttribute('aria-pressed', 'false');

  await dialog.locator('.reader').focus();
  await page.keyboard.press('3');
  await expect(dialog.getByRole('button', { name: 'P3', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // En édition, les chiffres s'écrivent dans le champ.
  await page.keyboard.press('e');
  await page.keyboard.press('End');
  await page.keyboard.press('1');
  await expect(dialog.getByLabel('Titre')).toHaveValue('Une1');
  await expect(dialog.getByRole('button', { name: 'P3', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(row(page, 'Une1').locator('.priority')).toHaveText('Priorité P3');
});

test('non-régression : priorité gardée dans le Log, chiffres sans effet dans un champ d’ajout', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  store.updateTask(une.id, { priority: 1, doneAt: '2026-09-25' });
  await page.goto('/');
  await expect(page.locator('.day li.task', { hasText: 'Une' }).locator('.priority')).toHaveText('Priorité P1');

  await page.getByPlaceholder('+ Ajouter une tâche (n)').fill('Tâche 2');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Tâche 2')).toBeVisible();
  await expect(row(page, 'Tâche 2').locator('.priority')).toHaveCount(0);
});
