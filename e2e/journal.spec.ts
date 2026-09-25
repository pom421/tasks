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

const date = (page: Page) => page.locator('#filter-date');

test('journée : un seul champ date, le Log montre cette journée', async ({ page }) => {
  await expect(date(page)).toHaveValue('2026-09-25'); // aujourd'hui par défaut
  await expect(page.locator('#filter-from, #filter-to')).toHaveCount(0);
  await date(page).fill('2026-09-21');
  await expect(days(page)).toHaveText(['lundi 21 septembre 2026']);
  await expect(page.locator('#journal .name')).toHaveText(['Vingt et un A', 'Vingt et un B']);
  await date(page).fill('2026-09-22'); // rien ce jour-là
  await expect(days(page)).toHaveText(['mardi 22 septembre 2026']);
  await expect(page.locator('#journal .day .empty')).toHaveText('Rien de fait ce jour-là.');
});

test('d : focus sur la date ; saisie au clavier, année appliquée seulement complète', async ({ page }) => {
  await page.locator('#journal').click({ position: { x: 5, y: 5 } }); // hors champ
  await page.keyboard.press('d');
  await expect(date(page)).toBeFocused(); // premier segment (mois)
  await page.keyboard.type('0920'); // format mm/jj/aaaa du navigateur de test ; année 2026 gardée
  await expect(days(page)).toHaveText(['dimanche 20 septembre 2026']);
  // Année retapée : 0002, 0020, 0202 ignorées, 2026 appliquée.
  await page.keyboard.type('2026');
  await expect(days(page)).toHaveText(['dimanche 20 septembre 2026']);
  await expect(date(page)).toBeFocused();
});

test('titre et filtres (recherche, date, projet) sur la même ligne', async ({ page }) => {
  const middle = async (sel: string) => {
    const b = (await page.locator(sel).boundingBox())!;
    return b.y + b.height / 2;
  };
  const title = await middle('#journal h2');
  for (const sel of ['#log-search', '#filter-date', '#filter-project']) {
    expect(Math.abs((await middle(sel)) - title), sel).toBeLessThan(4);
  }
  // Réinitialiser (visible quand un filtre est actif) reste aussi sur la ligne.
  await date(page).fill('2026-09-20');
  expect(Math.abs((await middle('#filter-reset')) - title)).toBeLessThan(4);
});

test('Réinitialiser : retour à aujourd’hui', async ({ page }) => {
  await date(page).fill('2026-09-20');
  await expect(days(page)).toHaveText(['dimanche 20 septembre 2026']);
  await page.getByRole('button', { name: 'Réinitialiser les filtres du Log' }).click();
  await expect(days(page)).toHaveText(['vendredi 25 septembre 2026']);
  await expect(date(page)).toHaveValue('2026-09-25');
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
  await expect(date(page)).toHaveValue('2026-09-21'); // le champ date suit
  await todayButton.click();
  await expect(days(page)).toHaveText(['vendredi 25 septembre 2026']);
  await expect(date(page)).toHaveValue('2026-09-25');
  await expect(todayButton).toBeDisabled(); // déjà sur aujourd'hui, mais toujours visible
  // Tout à droite de la ligne de navigation.
  const right = async (loc: typeof todayButton) => (await loc.boundingBox())!.x + (await loc.boundingBox())!.width;
  const logRight = (await page.locator('#journal').boundingBox())!;
  expect(Math.abs((await right(todayButton)) - (logRight.x + logRight.width))).toBeLessThan(2);
});

test('navigation par jour : limitée au projet filtré, désactivée pendant une recherche', async ({ page, store }) => {
  const beta = store.createProject('Beta');
  store.updateTask(store.createTask(beta.id, 'Beta le 22').id, { doneAt: '2026-09-22' });
  await page.reload();
  await page.locator('#filter-project').selectOption({ label: 'Beta' });
  const prev = page.getByRole('button', { name: 'Jour précédent' });
  await prev.click();
  await expect(days(page)).toHaveText(['mardi 22 septembre 2026']);
  await expect(prev).toBeDisabled(); // Beta n'a rien avant le 22

  await page.locator('#log-search').fill('Beta');
  await expect(prev).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Jour suivant' })).toBeDisabled();
});

test('recherche : toutes les journées dont une tâche correspond (titre, contenu, ticket), avec compteur', async ({ page, store }) => {
  const p = store.createProject('Beta');
  store.updateTask(store.createTask(p.id, 'Déploiement').id, { doneAt: '2026-09-22', notes: 'Suite de la réunion **Vingt**' });
  store.updateTask(store.createTask(p.id, 'Ticket seul').id, { doneAt: '2026-09-24', jira: 'done', jiraKey: 'VING-1' });
  await page.reload();
  const count = page.locator('#log-count');
  await expect(count).toHaveText('Aucune tâche trouvée'); // aujourd'hui : rien

  await page.keyboard.press('/');
  await expect(page.locator('#log-search')).toBeFocused();
  await page.keyboard.type('VINGT'); // casse ignorée ; titre, contenu et ticket (VING-1 ne correspond pas)
  await expect(days(page)).toHaveText([
    'mercredi 23 septembre 2026',
    'mardi 22 septembre 2026', // trouvé par le contenu
    'lundi 21 septembre 2026',
    'dimanche 20 septembre 2026',
  ]);
  await expect(count).toHaveText('5 tâches trouvées dans 4 journées');
  await expect(page.getByRole('button', { name: 'Jour précédent' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Aujourd’hui' })).toBeDisabled();

  await page.locator('#log-search').fill('ving-1');
  await expect(days(page)).toHaveText(['jeudi 24 septembre 2026']);
  await expect(count).toHaveText('1 tâche trouvée dans 1 journée');

  // Accents ignorés : « deploiement » trouve « Déploiement ».
  await page.locator('#log-search').fill('deploiement');
  await expect(page.locator('#journal .name')).toHaveText(['Déploiement']);

  // Recherche + journée : limitée à cette journée ; date vidée : toutes les journées.
  await page.locator('#log-search').fill('vingt');
  await expect(count).toHaveText('5 tâches trouvées dans 4 journées');
  await expect(date(page)).toHaveValue(''); // pendant une recherche, vide = toutes
  await date(page).fill('2026-09-21');
  await expect(days(page)).toHaveText(['lundi 21 septembre 2026']);
  await expect(count).toHaveText('2 tâches trouvées dans 1 journée');
  await date(page).fill('');
  await expect(count).toHaveText('5 tâches trouvées dans 4 journées');

  // Échap vide la recherche : retour à aujourd'hui.
  await page.locator('#log-search').press('Escape');
  await expect(page.locator('#log-search')).toHaveValue('');
  await expect(days(page)).toHaveText(['vendredi 25 septembre 2026']);
});
