import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.ts';

const row = (page: Page, title: string) => page.locator('#projects li.task', { hasText: title });
const flag = (page: Page, title: string) => row(page, title).locator('button.priority');

test('clavier : 1 / 2 / 3 donnent la priorité, la même touche la retire, u annule', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  store.createTask(alpha.id, 'Deux');
  await page.goto('/');
  await expect(page.locator('.project')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown'); // sur « Une »

  await expect(flag(page, 'Une')).toHaveAttribute('aria-label', 'Priorité');
  await page.keyboard.press('1');
  await expect(flag(page, 'Une')).toHaveAttribute('aria-label', 'Priorité P1');
  await expect(flag(page, 'Une')).toHaveClass(/text-red-600/);
  await expect(flag(page, 'Une').locator('svg')).toHaveAttribute('fill', 'currentColor');
  await page.keyboard.press('2');
  await expect(flag(page, 'Une')).toHaveClass(/text-amber-500/);
  await page.keyboard.press('3');
  await expect(flag(page, 'Une')).toHaveClass(/text-sky-600/);
  // Même touche : retirée ; u : rétablie.
  await page.keyboard.press('3');
  await expect(flag(page, 'Une')).toHaveAttribute('aria-label', 'Priorité');
  await expect(flag(page, 'Une').locator('svg')).toHaveAttribute('fill', 'none');
  await page.keyboard.press('u');
  await expect(flag(page, 'Une')).toHaveAttribute('aria-label', 'Priorité P3');
  expect(store.db.prepare('SELECT priority FROM task WHERE id = ?').get(une.id)).toEqual({ priority: 3 });

  // À droite, visible sans survol quand elle est donnée ; sinon au survol seulement.
  await page.mouse.move(0, 0);
  await page.locator('#new-project').focus();
  await expect(flag(page, 'Une')).toBeVisible();
  await expect(flag(page, 'Deux')).toBeHidden();
  const rowBox = (await row(page, 'Une').boundingBox())!;
  const box = (await flag(page, 'Une').boundingBox())!;
  expect(rowBox.x + rowBox.width - (box.x + box.width)).toBeLessThan(10);
  await expect(row(page, 'Une')).toHaveText('Une');
});

test('souris : clic sur le drapeau, aucune → P1 → P2 → P3 → aucune', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  store.createTask(alpha.id, 'Une');
  await page.goto('/');
  await row(page, 'Une').hover();
  for (const label of ['Priorité P1', 'Priorité P2', 'Priorité P3', 'Priorité']) {
    await flag(page, 'Une').click();
    await expect(flag(page, 'Une')).toHaveAttribute('aria-label', label);
  }
});

test('fiche : même icône, mêmes touches', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  store.updateTask(une.id, { priority: 2 });
  await page.goto('/');
  await expect(page.locator('.project')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('o');
  const dialog = page.getByRole('dialog');
  const button = dialog.locator('button.priority');
  await expect(button).toHaveAttribute('aria-label', 'Priorité P2');
  await button.click();
  await expect(button).toHaveAttribute('aria-label', 'Priorité P3');

  await dialog.locator('.reader').focus();
  await page.keyboard.press('1');
  await expect(button).toHaveAttribute('aria-label', 'Priorité P1');

  // En édition, les chiffres s'écrivent dans le champ.
  await page.keyboard.press('e');
  await page.keyboard.press('End');
  await page.keyboard.press('3');
  await expect(dialog.getByLabel('Titre')).toHaveValue('Une3');
  await expect(button).toHaveAttribute('aria-label', 'Priorité P1');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(flag(page, 'Une3')).toHaveAttribute('aria-label', 'Priorité P1');
});

test('non-régression : priorité gardée dans le Log, chiffres sans effet dans un champ d’ajout', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  store.updateTask(une.id, { priority: 1, doneAt: '2026-09-25' });
  await page.goto('/');
  await expect(page.locator('.day li.task', { hasText: 'Une' }).locator('button.priority')).toHaveAttribute('aria-label', 'Priorité P1');

  await page.getByPlaceholder('+ Ajouter une tâche (n)').fill('Tâche 2');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Tâche 2')).toBeVisible();
  await row(page, 'Tâche 2').hover();
  await expect(flag(page, 'Tâche 2')).toHaveAttribute('aria-label', 'Priorité');
});
