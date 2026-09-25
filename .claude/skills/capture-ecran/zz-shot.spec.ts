// Modèle de capture : copier dans e2e/, adapter, lancer, puis SUPPRIMER.
import { test, expect } from './fixtures.ts';

const OUT = process.env.SHOT_DIR ?? '/tmp';

test('capture', async ({ page, store }) => {
  // Données.
  const alpha = store.createProject('Alpha');
  store.updateTask(store.createTask(alpha.id, 'Une').id, { jira: 'wanted' });
  const beta = store.createProject('Beta');
  store.updateProject(beta.id, { archived: true, favorite: true });

  await page.goto('/');
  await page.setViewportSize({ width: 760, height: 400 });
  await expect(page.locator('.project').first()).toBeVisible();
  await page.screenshot({ path: `${OUT}/avant.png` });

  // Actions, puis seconde capture (souris écartée : pas d'état survol).
  await page.locator('#favorites-only').click();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${OUT}/apres.png` });
});
