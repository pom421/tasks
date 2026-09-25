import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.ts';

// Tâches faites le 20, le 21 (×2) et le 23 septembre.
test.beforeEach(async ({ page, store }) => {
  const p = store.createProject('Alpha');
  const done = [['Vingt', '2026-09-20'], ['Vingt et un A', '2026-09-21'], ['Vingt et un B', '2026-09-21'], ['Vingt-trois', '2026-09-23']];
  for (const [title, doneAt] of done) store.updateTask(store.createTask(p.id, title).id, { doneAt });
  await page.goto('/');
  // Sans filtre : aujourd'hui (date figée au vendredi 25), même vide.
  await expect(page.locator('#journal .day h3')).toHaveText(['vendredi 25 septembre 2026']);
  await expect(page.locator('#journal .day .empty')).toHaveText('Rien de fait ce jour-là.');
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

test('Réinitialiser : retour à aujourd’hui', async ({ page }) => {
  await page.locator('#filter-from').fill('2026-09-20');
  await expect(days(page)).toHaveText(['dimanche 20 septembre 2026']);
  await page.locator('#filter-reset').click();
  await expect(days(page)).toHaveText(['vendredi 25 septembre 2026']);
  await expect(page.locator('#filter-from')).toHaveValue('');
  await expect(page.locator('#filter-to')).toHaveValue('');
});

test('< et > : jour précédent / suivant ayant des entrées, désactivés en bout de liste', async ({ page }) => {
  const prev = page.getByRole('button', { name: 'Jour précédent' });
  const next = page.getByRole('button', { name: 'Jour suivant' });
  // Aujourd'hui : rien après.
  await expect(next).toBeDisabled();
  await expect(prev).toBeEnabled();

  await prev.click(); // 23 (le 24 n'a rien : sauté)
  await expect(days(page)).toHaveText(['mercredi 23 septembre 2026']);
  await expect(page.locator('#journal .name')).toHaveText(['Vingt-trois']);
  await prev.click();
  await expect(days(page)).toHaveText(['lundi 21 septembre 2026']);
  await expect(page.locator('#journal .name')).toHaveText(['Vingt et un A', 'Vingt et un B']);
  await prev.click();
  await expect(days(page)).toHaveText(['dimanche 20 septembre 2026']);
  await expect(prev).toBeDisabled(); // plus rien avant
  await expect(next).toBeEnabled();

  await next.click();
  await expect(days(page)).toHaveText(['lundi 21 septembre 2026']);
  // Retour direct à aujourd'hui.
  const todayButton = page.getByRole('button', { name: 'Aujourd’hui' });
  await todayButton.click();
  await expect(days(page)).toHaveText(['vendredi 25 septembre 2026']);
  await expect(todayButton).toBeDisabled(); // déjà sur aujourd'hui, mais toujours visible
  // Tout à droite de la ligne de navigation.
  const right = async (loc: typeof todayButton) => (await loc.boundingBox())!.x + (await loc.boundingBox())!.width;
  const logRight = (await page.locator('#journal').boundingBox())!;
  expect(Math.abs((await right(todayButton)) - (logRight.x + logRight.width))).toBeLessThan(2);
});

test('navigation par jour : limitée au projet filtré, désactivée pendant une période', async ({ page, store }) => {
  const beta = store.createProject('Beta');
  store.updateTask(store.createTask(beta.id, 'Beta le 22').id, { doneAt: '2026-09-22' });
  await page.reload();
  await page.locator('#filter-project').selectOption({ label: 'Beta' });
  const prev = page.getByRole('button', { name: 'Jour précédent' });
  await prev.click();
  await expect(days(page)).toHaveText(['mardi 22 septembre 2026']);
  await expect(prev).toBeDisabled(); // Beta n'a rien avant le 22

  await page.locator('#filter-from').fill('2026-09-20');
  await page.locator('#filter-to').fill('2026-09-23');
  await expect(prev).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Jour suivant' })).toBeDisabled();
});
