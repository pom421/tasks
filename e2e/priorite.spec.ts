import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.ts';

const row = (page: Page, title: string) => page.locator('#projects li.task', { hasText: title });
const icon = (page: Page, title: string) => row(page, title).locator('button.priority');

test('clavier : p fait tourner la priorité (aucune → 1 → 2 → 3 → aucune), u annule', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  store.createTask(alpha.id, 'Deux');
  await page.goto('/');
  await expect(page.locator('.project')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown'); // sur « Une »

  await expect(icon(page, 'Une')).toHaveAttribute('aria-label', 'Priorité');
  for (const [label, color] of [['Priorité 1', /text-red-600/], ['Priorité 2', /text-amber-500/], ['Priorité 3', /text-sky-600/]] as const) {
    await page.keyboard.press('p');
    await expect(icon(page, 'Une')).toHaveAttribute('aria-label', label);
    await expect(icon(page, 'Une')).toHaveClass(color);
  }
  await expect(icon(page, 'Une').locator('text')).toHaveText('3');
  await page.keyboard.press('p');
  await expect(icon(page, 'Une')).toHaveAttribute('aria-label', 'Priorité');
  await expect(icon(page, 'Une').locator('text')).toHaveCount(0);
  await page.keyboard.press('u');
  await expect(icon(page, 'Une')).toHaveAttribute('aria-label', 'Priorité 3');
  expect(store.db.prepare('SELECT priority FROM task WHERE id = ?').get(une.id)).toEqual({ priority: 3 });
  // p sur une tâche ne crée pas de projet.
  await expect(page.locator('#new-project')).not.toBeFocused();

  // À droite, visible sans survol quand elle est donnée ; sinon au survol seulement.
  await page.mouse.move(0, 0);
  await page.locator('#new-project').focus();
  await expect(icon(page, 'Une')).toBeVisible();
  await expect(icon(page, 'Deux')).toBeHidden();
  const rowBox = (await row(page, 'Une').boundingBox())!;
  const box = (await icon(page, 'Une').boundingBox())!;
  expect(rowBox.x + rowBox.width - (box.x + box.width)).toBeLessThan(10);
  await expect(row(page, 'Une').locator('.name')).toHaveText('Une');
});

test('souris : clic sur l’icône, aucune → 1 → 2 → 3 → aucune', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  store.createTask(alpha.id, 'Une');
  await page.goto('/');
  await row(page, 'Une').hover();
  for (const label of ['Priorité 1', 'Priorité 2', 'Priorité 3', 'Priorité']) {
    await icon(page, 'Une').click();
    await expect(icon(page, 'Une')).toHaveAttribute('aria-label', label);
  }
});

test('fiche : même icône, même touche', async ({ page, store }) => {
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
  await expect(button).toHaveAttribute('aria-label', 'Priorité 2');
  await button.click();
  await expect(button).toHaveAttribute('aria-label', 'Priorité 3');

  await dialog.locator('.reader').focus();
  await page.keyboard.press('p');
  await expect(button).toHaveAttribute('aria-label', 'Priorité');

  // En édition, p s'écrit dans le champ.
  await page.keyboard.press('e');
  await page.keyboard.press('End');
  await page.keyboard.press('p');
  await expect(dialog.getByLabel('Titre')).toHaveValue('Unep');
  await expect(button).toHaveAttribute('aria-label', 'Priorité');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(row(page, 'Unep')).toBeVisible();
});

test('non-régression : priorité gardée dans le Log ; p hors tâche = nouveau projet', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  store.updateTask(une.id, { priority: 1, doneAt: '2026-09-25' });
  await page.goto('/');
  await expect(page.locator('.day li.task', { hasText: 'Une' }).locator('button.priority')).toHaveAttribute('aria-label', 'Priorité 1');
  await page.locator('body').press('p');
  await expect(page.locator('#new-project')).toBeFocused();
});
