import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.ts';

// Tâches faites le 20, le 21 (×2) et le 23 septembre.
test.beforeEach(async ({ page, store }) => {
  const p = store.createProject('Alpha');
  const done = [['Vingt', '2026-09-20'], ['Vingt et un A', '2026-09-21'], ['Vingt et un B', '2026-09-21'], ['Vingt-trois', '2026-09-23']];
  for (const [title, doneAt] of done) store.updateTask(store.createTask(p.id, title).id, { doneAt });
  await page.goto('/');
  // Sans filtre : la dernière journée seulement.
  await expect(page.locator('#journal .day h3')).toHaveText(['mercredi 23 septembre 2026']);
});

// textContent : la majuscule initiale est ajoutée en CSS.
const days = (page: Page) => page.locator('#journal .day h3');

test('date de début : la date de fin prend la même valeur et reçoit le focus', async ({ page }) => {
  await page.locator('#filter-from').fill('2026-09-21');
  await expect(page.locator('#filter-to')).toBeFocused();
  await expect(page.locator('#filter-to')).toHaveValue('2026-09-21');
  // Début = fin : toute la journée.
  await expect(days(page)).toHaveText(['lundi 21 septembre 2026']);
  await expect(page.locator('#journal .name')).toHaveText(['Vingt et un A', 'Vingt et un B']);
});

test('période sur plusieurs jours, bornes incluses', async ({ page }) => {
  await page.locator('#filter-from').fill('2026-09-20');
  await page.locator('#filter-to').fill('2026-09-21');
  await expect(days(page)).toHaveText(['lundi 21 septembre 2026', 'dimanche 20 septembre 2026']);
});

test('date de fin avant la date de début : refusée', async ({ page }) => {
  await page.locator('#filter-from').fill('2026-09-21');
  await page.locator('#filter-to').fill('2026-09-20');
  await expect(page.locator('#toast')).toContainText('après la date de début');
  await expect(page.locator('#filter-to')).toHaveValue('2026-09-21');
  await expect(days(page)).toHaveText(['lundi 21 septembre 2026']);
});

test('saisie au clavier : le focus ne part qu’une fois l’année complète', async ({ page }) => {
  await page.locator('#filter-from').focus(); // premier segment (mois)
  await page.keyboard.type('0920202'); // format mm/jj/aaaa du navigateur de test, année incomplète
  await expect(page.locator('#filter-from')).toBeFocused();
  await page.keyboard.type('6');
  await expect(page.locator('#filter-to')).toBeFocused();
  await expect(page.locator('#filter-to')).toHaveValue('2026-09-20');
  await expect(days(page)).toHaveText(['dimanche 20 septembre 2026']);
});

test('Réinitialiser : retour à la dernière journée', async ({ page }) => {
  await page.locator('#filter-from').fill('2026-09-20');
  await expect(days(page)).toHaveText(['dimanche 20 septembre 2026']);
  await page.locator('#filter-reset').click();
  await expect(days(page)).toHaveText(['mercredi 23 septembre 2026']);
  await expect(page.locator('#filter-from')).toHaveValue('');
  await expect(page.locator('#filter-to')).toHaveValue('');
});
