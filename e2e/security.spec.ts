import { test, expect } from './fixtures.ts';

// Garde-fou : aucune erreur console (dont les violations de CSP) sur un parcours type.
test('aucune erreur console ni violation CSP', async ({ page, store }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  const p = store.createProject('Alpha');
  store.updateTask(store.createTask(p.id, 'Faite').id, { doneAt: '2026-09-20', jira: 'done' });
  store.createTask(p.id, 'À faire');

  await page.goto('/');
  await expect(page.locator('#journal .name')).toHaveText(['Faite']);
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});
